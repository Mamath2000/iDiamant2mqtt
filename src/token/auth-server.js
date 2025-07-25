  async publishAuthStatusToHA(tokens) {
    if (!config.HA_DISCOVERY || config.HA_DISCOVERY.toString().toLowerCase() !== 'true') return;
    if (!this.mqttClient) return;

    // Sensor: état d'authentification
    const authStatusTopic = `${config.HA_DISCOVERY_PREFIX}/binary_sensor/idiamant_auth_status/config`;
    const authStatusPayload = JSON.stringify({
      name: 'iDiamant Auth Status',
      unique_id: 'idiamant_auth_status',
      device_class: 'connectivity',
      state_topic: `${config.HA_DISCOVERY_PREFIX}/binary_sensor/idiamant_auth_status/state`,
      availability_topic: `${config.HA_DISCOVERY_PREFIX}/bridge/availability`,
      device: { name: config.HA_DEVICE_NAME, identifiers: ['idiamant_bridge'] }
    });
    this.mqttClient.publish(authStatusTopic, authStatusPayload, { retain: true });
    this.mqttClient.publish(`${config.HA_DISCOVERY_PREFIX}/binary_sensor/idiamant_auth_status/state`, 'ON', { retain: true });

    // Sensor: temps de validité du token
    const validityTopic = `${config.HA_DISCOVERY_PREFIX}/sensor/idiamant_token_validity/config`;
    const validityPayload = JSON.stringify({
      name: 'iDiamant Token Validity',
      unique_id: 'idiamant_token_validity',
      device_class: 'duration',
      unit_of_measurement: 's',
      state_topic: `${config.HA_DISCOVERY_PREFIX}/sensor/idiamant_token_validity/state`,
      availability_topic: `${config.HA_DISCOVERY_PREFIX}/bridge/availability`,
      device: { name: config.HA_DEVICE_NAME, identifiers: ['idiamant_bridge'] }
    });
    this.mqttClient.publish(validityTopic, validityPayload, { retain: true });
    this.mqttClient.publish(`${config.HA_DISCOVERY_PREFIX}/sensor/idiamant_token_validity/state`, tokens.expires_in.toString(), { retain: true });
  }
#!/usr/bin/env node

const http = require('http');
const url = require('url');
const axios = require('axios');
const mqtt = require('mqtt');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const NetatmoAuthHelper = require('./auth-helper');

/**
 * Serveur webhook pour recevoir le callback OAuth2 de Netatmo
 * Basé sur le processus Node-RED fourni
 */
class NetatmoAuthServer {
  constructor() {
    this.port = 3001;
    this.server = null;
    this.mqttClient = null;
    this.redirectUri = config.NETATMO_REDIRECT_URI || `http://localhost:${this.port}/netatmo/callback`;
    // Chargement de l'état sauvegardé
    this.loadAuthState();
  }

  loadAuthState() {
    try {
      const statePath = '/root/iDiamant/temp/.auth-state';
      if (fs.existsSync(statePath)) {
        const data = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        this.expectedState = data.state;
        console.log('✅ État d\'authentification chargé');
      }
    } catch (error) {
      console.warn('⚠️  Impossible de charger l\'état d\'authentification');
    }
  }

  async connectMQTT() {
    try {
      console.log('🔌 Connexion au broker MQTT...');
      
      const options = {
        clientId: 'idiamant_auth_server',
        clean: true
      };

      if (config.MQTT_USERNAME) {
        options.username = config.MQTT_USERNAME;
        options.password = config.MQTT_PASSWORD;
      }

      this.mqttClient = mqtt.connect(config.MQTT_BROKER_URL, options);
      
      return new Promise((resolve, reject) => {
        this.mqttClient.on('connect', () => {
          console.log('✅ Connecté au broker MQTT');
          resolve();
        });

        this.mqttClient.on('error', (error) => {
          console.error('❌ Erreur MQTT:', error.message);
          reject(error);
        });
      });
    } catch (error) {
      console.error('❌ Erreur connexion MQTT:', error);
      throw error;
    }
  }


  async saveTokens(tokens) {
    try {
      const tokenData = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in,
        timestamp: Date.now()
      };

      const tokenPath = '/root/iDiamant/temp/.netatmo-tokens.json';
      fs.writeFileSync(tokenPath, JSON.stringify(tokenData, null, 2));
      console.log('💾 Tokens sauvegardés localement');
    } catch (error) {
      console.error('❌ Erreur sauvegarde tokens:', error);
    }
  }

  async exchangeCodeForTokens(code) {
    try {
      console.log('🔄 Échange du code d\'autorisation...');
      
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.IDIAMANT_CLIENT_ID,
        client_secret: config.IDIAMANT_CLIENT_SECRET,
        code: code,
        redirect_uri: this.redirectUri,
        scope: 'read_bubendorff write_bubendorff'
      });

      const response = await axios.post(
        'https://api.netatmo.com/oauth2/token',
        params,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      if (response.status === 200) {
        console.log('✅ Tokens obtenus avec succès');
        console.log(`   Access token: ${response.data.access_token.substring(0, 20)}...`);
        console.log(`   Refresh token: ${response.data.refresh_token.substring(0, 20)}...`);
        console.log(`   Expire dans: ${response.data.expires_in} secondes`);
        
        // Sauvegarde locale uniquement
        await this.saveTokens(response.data);
        // Publication Home Assistant Discovery (état + validité)
        const HaDiscoveryPublisher = require('./ha-discovery');
        const haPublisher = new HaDiscoveryPublisher(this.mqttClient);
        haPublisher.publishAuthStatus(response.data);
        return response.data;
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('❌ Erreur échange token:', error.response?.data || error.message);
      throw error;
    }
  }

  handleCallback(req, res) {
    const parsedUrl = url.parse(req.url, true);
    
    if (parsedUrl.pathname !== '/netatmo/callback') {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404 - Page non trouvée</h1>');
      return;
    }

    const { code, state, error } = parsedUrl.query;

    // Vérification de l'état pour la sécurité
    if (this.expectedState && state !== this.expectedState) {
      console.error('❌ État OAuth2 invalide');
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>❌ Erreur de sécurité OAuth2</h1><p>État invalide</p>');
      return;
    }

    if (error) {
      console.error('❌ Erreur OAuth2:', error);
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h1>❌ Erreur d'autorisation</h1><p>${error}</p>`);
      return;
    }

    if (!code) {
      console.error('❌ Code d\'autorisation manquant');
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>❌ Code d\'autorisation manquant</h1>');
      return;
    }

    console.log('✅ Code d\'autorisation reçu:', code.substring(0, 20) + '...');

    // Échange asynchrone du code contre des tokens
    this.exchangeCodeForTokens(code)
      .then((tokens) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <html>
            <head>
              <title>✅ Authentification réussie</title>
              <style>
                body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
                .success { color: #28a745; }
                .info { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 10px 0; }
              </style>
            </head>
            <body>
              <h1 class="success">✅ Authentification Netatmo réussie !</h1>
              <div class="info">
                <h3>🔑 Tokens obtenus:</h3>
                <ul>
                  <li><strong>Access Token:</strong> ${tokens.access_token.substring(0, 30)}...</li>
                  <li><strong>Refresh Token:</strong> ${tokens.refresh_token.substring(0, 30)}...</li>
                  <li><strong>Expire dans:</strong> ${tokens.expires_in} secondes</li>
                </ul>
              </div>
              <p>🚀 Vous pouvez maintenant fermer cette fenêtre et arrêter le serveur d'authentification.</p>
              <p>📡 Les tokens ont été automatiquement publiés sur MQTT et sauvegardés localement.</p>
            </body>
          </html>
        `);
        
        // Arrêt automatique du serveur après succès
        setTimeout(() => {
          console.log('\n🎉 Authentification terminée avec succès !');
          console.log('🛑 Arrêt du serveur d\'authentification...');
          this.stop();
        }, 2000);
      })
      .catch((error) => {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <html>
            <head><title>❌ Erreur</title></head>
            <body>
              <h1>❌ Erreur lors de l'échange des tokens</h1>
              <p>${error.message}</p>
            </body>
          </html>
        `);
      });
  }

  async start() {
    try {
      // Validation centralisée via NetatmoAuthHelper
      const helper = new NetatmoAuthHelper();
      if (!helper.checkConfiguration(true)) {
        helper.displayInstructions();
        process.exit(1);
      }

      // Connexion MQTT
      await this.connectMQTT();

      // Création du serveur HTTP
      this.server = http.createServer((req, res) => {
        this.handleCallback(req, res);
      });

      // Démarrage du serveur
      await new Promise((resolve, reject) => {
        this.server.listen(this.port, (error) => {
          if (error) {
            reject(error);
          } else {
            console.log(`\n🌐 Serveur d'authentification démarré sur http://localhost:${this.port}`);
            console.log(`📡 Endpoint de callback: ${this.redirectUri}`);
            console.log('\n⏳ En attente du callback OAuth2...');
            console.log('💡 Utilisez Ctrl+C pour arrêter le serveur\n');
            resolve();
          }
        });
      });

    } catch (error) {
      console.error('❌ Erreur démarrage serveur:', error.message);
      process.exit(1);
    }
  }

  stop() {
    if (this.server) {
      this.server.close();
    }
    if (this.mqttClient) {
      this.mqttClient.end();
    }
    process.exit(0);
  }
}

// Gestion propre de l'arrêt
process.on('SIGINT', () => {
  console.log('\n\n🛑 Arrêt du serveur d\'authentification...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 Arrêt du serveur d\'authentification...');
  process.exit(0);
});

// Exécution si appelé directement
if (require.main === module) {
  const server = new NetatmoAuthServer();
  server.start();
}

module.exports = NetatmoAuthServer;
