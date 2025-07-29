#!/usr/bin/env node

const http = require('http');
const url = require('url');
const axios = require('axios');
const mqtt = require('mqtt');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const logger = require('../utils/logger');

/**
 * Serveur webhook pour recevoir le callback OAuth2 de Netatmo
 * Basé sur le processus Node-RED fourni
 */
class NetatmoAuthServer {
  constructor() {
    this.port = 3001;
    this.server = null;
    this.mqttClient = null;
    this.redirectUri = config.NETATMO_REDIRECT_URI;
    // Chargement de l'état sauvegardé
    this.loadAuthState();
  }

  loadAuthState() {
    try {
      const statePath = path.join(process.cwd(), '.auth-state');

      if (fs.existsSync(statePath)) {
        const data = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        this.expectedState = data.state;
      }
    } catch (error) {
      // Silencieux
    }
  }

  // Suppression du fichier .auth-state après la première authentification
  removeAuthStateFile() {
    const authStatePath = path.join(process.cwd(), 'temp', '.auth-state');
    if (fs.existsSync(authStatePath)) {
      try {
        fs.unlinkSync(authStatePath);
        logger.info('🗑️ Fichier .auth-state supprimé après authentification.');
      } catch (err) {
        logger.warn('⚠️ Impossible de supprimer .auth-state:', err);
      }
    }
  }

  // --- Assistant CLI (conserve la logique existante) ---
  checkConfiguration() {
    const logLevel = (config.LOG_LEVEL || 'info').toLowerCase();
    let checks = [
      {
        name: 'IDIAMANT_CLIENT_ID',
        value: config.IDIAMANT_CLIENT_ID,
        valid: config.IDIAMANT_CLIENT_ID && config.IDIAMANT_CLIENT_ID !== 'your_client_id_here'
      },
      {
        name: 'IDIAMANT_CLIENT_SECRET',
        value: config.IDIAMANT_CLIENT_SECRET,
        valid: config.IDIAMANT_CLIENT_SECRET && config.IDIAMANT_CLIENT_SECRET !== 'your_client_secret_here'
      },
      {
        name: 'MQTT_BROKER_URL',
        value: config.MQTT_BROKER_URL,
        valid: config.MQTT_BROKER_URL && config.MQTT_BROKER_URL !== ''
      },
      {
        name: 'NETATMO_REDIRECT_URI',
        value: config.NETATMO_REDIRECT_URI,
        valid: config.NETATMO_REDIRECT_URI && config.NETATMO_REDIRECT_URI !== ''
      }
    ];
    let allValid = true;
    checks.forEach(check => {
      const status = check.valid ? '✅' : '❌';
      const value = check.valid ?
        (check.value.length > 30 ? check.value.substring(0, 30) + '...' : check.value) :
        'NON CONFIGURÉ';
      if (logLevel === 'debug') {
        logger.debug(`${status} ${check.name}: ${value}`);
      }
      if (!check.valid) {
        allValid = false;
      }
    });
    if (allValid) {
      if (logLevel === 'debug') logger.debug('');
      logger.info('✅ Configuration valide pour l\'authentification');
    } else {
      logger.error('❌ Configuration incomplète. Éditez le fichier .env');
      return false;
    }
    return true;
  }

  async connectMQTT() {
    try {
      logger.info('Connexion au broker MQTT...');

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
          logger.info('Connecté au broker MQTT');
          resolve();
        });

        this.mqttClient.on('error', (error) => {
          logger.error('Erreur MQTT:', error.message);
          reject(error);
        });
      });
    } catch (error) {
      logger.error('Erreur connexion MQTT:', error);
      throw error;
    }
  }

  async exchangeCodeForTokens(code) {
    try {
      logger.info('Échange du code d\'autorisation...');

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
        logger.info('Token Netatmo obtenu avec succès');

        this.removeAuthStateFile();

        const tokenData = response.data;
        tokenData.timestamp = Date.now();

        try {
          const homesData = await this.checkTokenAndGetHomesData(tokenData.access_token);
          tokenData.homeId = homesData.body.homes[0].id;
          logger.info(`🏠 Données des maisons récupérées : ${homesData.body.homes.length ? `${homesData.body.homes.length} maison(s) trouvée(s)` : 'Aucune maison trouvée'}`);

          // Publie le token sur MQTT au bon topic
          const MQTTClient = require('../services/mqtt-client');
          const mqttClient = new MQTTClient(config);
          await mqttClient.connect();
          const topic = `${config.MQTT_TOPIC_PREFIX}/bridge/token`;
          try {
            await mqttClient.publish(
              topic,
              JSON.stringify(tokenData),
              { retain: true }
            );
            logger.info(`✅ Token Netatmo publié sur le topic MQTT : ${topic}`);
          } catch (err) {
            logger.error('Erreur lors de la publication MQTT:', err);
            throw err;
          }
          await mqttClient.disconnect();
          return tokenData;

        } catch (err) {
          logger.error('❌ Échec de la récupération des données des maisons:', err);
          throw err;
        }
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

    } catch (error) {
      logger.error('Erreur échange token:', error);
      throw error;
    }
  }

  checkTokenAndGetHomesData(token) {
    return new Promise((resolve, reject) => {
      const api = axios.create({
          baseURL: `${config.IDIAMANT_API_URL}`,
          headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
          }
      });
      logger.info('Récupération des données des maisons...');
      // Utilisation de l'API Netatmo pour récupérer les données des maisons
      api.get('/api/homesdata')
        .then((response) => {
          if (response.status === 200) {
            resolve(response.data);
          } else {
            reject(new Error(`HTTP ${response.status}: ${response.statusText}`));
          }
        })
        .catch((error) => {
          logger.error('Erreur lors de la récupération des données des maisons:', error);
          reject(error);
        });
    });
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
      logger.error('❌ État OAuth2 invalide');
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>❌ Erreur de sécurité OAuth2</h1><p>État invalide</p>');
      return;
    }

    if (error) {
      logger.error('❌ Erreur OAuth2:', error);
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h1>❌ Erreur d'autorisation</h1><p>${error}</p>`);
      return;
    }

    if (!code) {
      logger.error('❌ Code d\'autorisation manquant');
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>❌ Code d\'autorisation manquant</h1>');
      return;
    }

    logger.info('Code d\'autorisation reçu');

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
                  <li><strong>Home ID:</strong> ${tokens.homeId.substring(0, 30)}...</li>
                  <li><strong>Expire dans:</strong> ${tokens.expires_in} secondes</li>
                </ul>
              </div>
              <p>🚀 Vous pouvez maintenant fermer cette fenêtre et arrêter le serveur d'authentification.</p>
              <p>📡 Les tokens ont été automatiquement publiés sur MQTT.</p>
            </body>
          </html>
        `);

        // Arrêt automatique du serveur après succès
        setTimeout(() => {
          logger.info('Authentification terminée. Arrêt du serveur.');
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
      // Validation
      if (!this.checkConfiguration()) {
        logger.error('Configuration incomplète. Vérifiez votre fichier .env.');
        process.exit(1);
      }

      await this.connectMQTT();

      this.server = http.createServer((req, res) => {
        this.handleCallback(req, res);
      });

      await new Promise((resolve, reject) => {
        this.server.listen(this.port, (error) => {
          if (error) {
            reject(error);
          } else {
            logger.info(`Serveur d'authentification démarré sur http://localhost:${this.port}`);
            logger.info(`Callback : ${this.redirectUri}`);
            logger.info('En attente du callback OAuth2...');
            resolve();
          }
        });
      });

    } catch (error) {
      logger.error('Erreur démarrage serveur:', error.message);
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
  logger.warn('🛑 Arrêt du serveur d\'authentification...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.warn('🛑 Arrêt du serveur d\'authentification...');
  process.exit(0);
});

// Exécution si appelé directement
if (require.main === module) {
  const server = new NetatmoAuthServer();
  server.start();
}

module.exports = NetatmoAuthServer;
