const axios = require('axios');
const logger = require('../utils/logger');

class IDiamantClient {
  constructor(config) {
    this.config = config;
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiresAt = null;
    this.devices = new Map();
    
    // Configuration axios
    this.httpClient = axios.create({
      baseURL: config.IDIAMANT_API_URL,
      timeout: config.HTTP_TIMEOUT,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
  }

  async connect() {
    try {
      logger.info('🔌 Connexion à l\'API iDiamant/Netatmo...');
      await this.authenticate();
      await this.discoverDevices();
      logger.info('✅ Connexion iDiamant établie');
    } catch (error) {
      logger.error('❌ Erreur de connexion iDiamant:', error);
      throw error;
    }
  }

  async authenticate() {
    try {
      const params = new URLSearchParams({
        grant_type: 'password',
        client_id: this.config.IDIAMANT_CLIENT_ID,
        client_secret: this.config.IDIAMANT_CLIENT_SECRET,
        username: this.config.IDIAMANT_USERNAME,
        password: this.config.IDIAMANT_PASSWORD,
        scope: 'read_bubendorff'
      });

      const response = await this.httpClient.post('/oauth2/token', params);
      
      this.accessToken = response.data.access_token;
      this.refreshToken = response.data.refresh_token;
      this.tokenExpiresAt = Date.now() + (response.data.expires_in * 1000);
      
      // Mise à jour de l'en-tête d'autorisation
      this.httpClient.defaults.headers.common['Authorization'] = `Bearer ${this.accessToken}`;
      
      logger.info('🔑 Authentification iDiamant réussie');
    } catch (error) {
      logger.error('❌ Erreur d\'authentification iDiamant:', error.response?.data || error.message);
      throw new Error('Échec de l\'authentification iDiamant');
    }
  }

  async refreshAccessToken() {
    try {
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
        client_id: this.config.IDIAMANT_CLIENT_ID,
        client_secret: this.config.IDIAMANT_CLIENT_SECRET
      });

      const response = await this.httpClient.post('/oauth2/token', params);
      
      this.accessToken = response.data.access_token;
      this.refreshToken = response.data.refresh_token;
      this.tokenExpiresAt = Date.now() + (response.data.expires_in * 1000);
      
      this.httpClient.defaults.headers.common['Authorization'] = `Bearer ${this.accessToken}`;
      
      logger.info('🔄 Token iDiamant rafraîchi');
    } catch (error) {
      logger.error('❌ Erreur de rafraîchissement du token:', error);
      throw error;
    }
  }

  async ensureValidToken() {
    if (!this.accessToken || Date.now() >= this.tokenExpiresAt - 60000) { // 1 minute avant expiration
      await this.refreshAccessToken();
    }
  }

  async discoverDevices() {
    try {
      await this.ensureValidToken();
      
      const response = await this.httpClient.get('/api/getpublicdata', {
        params: {
          device_id: 'all'
        }
      });
      
      // Traitement des dispositifs (adapté selon l'API réelle)
      if (response.data && response.data.body && response.data.body.devices) {
        response.data.body.devices.forEach(device => {
          if (device.type === 'NATherm1' || device.modules) { // Exemple pour les volets
            this.devices.set(device._id, {
              id: device._id,
              name: device.station_name || device.module_name,
              type: device.type,
              modules: device.modules || []
            });
          }
        });
      }
      
      logger.info(`🔍 ${this.devices.size} dispositifs iDiamant découverts`);
    } catch (error) {
      logger.error('❌ Erreur de découverte des dispositifs:', error);
      throw error;
    }
  }

  async getShutterStatus(deviceId) {
    try {
      await this.ensureValidToken();
      
      // Appel API pour obtenir le statut du volet
      const response = await this.httpClient.get('/api/getmeasure', {
        params: {
          device_id: deviceId,
          scale: 'max',
          type: 'sum_boiler'
        }
      });
      
      // Traitement de la réponse (à adapter selon l'API réelle)
      return {
        position: response.data.body?.position || 0,
        state: response.data.body?.state || 'unknown',
        lastUpdate: Date.now()
      };
    } catch (error) {
      logger.error(`❌ Erreur obtention statut volet ${deviceId}:`, error);
      throw error;
    }
  }

  async controlShutter(deviceId, action, position = null) {
    try {
      await this.ensureValidToken();
      
      const params = {
        device_id: deviceId,
        action: action
      };
      
      if (position !== null) {
        params.position = position;
      }
      
      const response = await this.httpClient.post('/api/setthermmode', params);
      
      logger.info(`🎛️ Commande volet ${deviceId}: ${action}${position !== null ? ` (position: ${position})` : ''}`);
      
      return response.data;
    } catch (error) {
      logger.error(`❌ Erreur contrôle volet ${deviceId}:`, error);
      throw error;
    }
  }

  getDevices() {
    return Array.from(this.devices.values());
  }

  getDevice(deviceId) {
    return this.devices.get(deviceId);
  }

  async disconnect() {
    logger.info('🔌 Déconnexion du client iDiamant');
    this.accessToken = null;
    this.refreshToken = null;
    this.devices.clear();
  }
}

module.exports = IDiamantClient;
