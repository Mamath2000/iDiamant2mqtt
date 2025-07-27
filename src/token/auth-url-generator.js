#!/usr/bin/env node

const crypto = require('crypto');
const config = require('../config/config');
const NetatmoAuthHelper = require('./auth-helper');
const logger = require('../utils/logger');
const path = require('path');

/**
 * Générateur d'URL d'autorisation OAuth2 pour Netatmo
 * Basé sur le processus Node-RED fourni
 */
class NetatmoAuthUrlGenerator {
  constructor() {
    this.clientId = config.IDIAMANT_CLIENT_ID;
    this.redirectUri = process.env.NETATMO_REDIRECT_URI || 'http://localhost:3001/netatmo/callback';
    this.scope = 'read_bubendorff write_bubendorff';
    this.state = this.generateState();
    this.authHelper = new NetatmoAuthHelper();
  }


  generateState() {
    // Génération d'un état aléatoire pour la sécurité OAuth2
    return crypto.randomBytes(32).toString('hex');
  }

  generateAuthUrl() {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: this.scope,
      response_type: 'code',
      state: this.state
    });

    const authUrl = `https://api.netatmo.com/oauth2/authorize?${params.toString()}`;
    
    return {
      url: authUrl,
      state: this.state,
      redirectUri: this.redirectUri
    };
  }

  async displayInstructions() {
    if (!this.authHelper.checkConfiguration(true)) {
      logger.error('❌ Configuration incomplète. Vérifiez votre fichier .env.');
      process.exit(1);
    }

    const auth = this.generateAuthUrl();

    logger.info('Ouvrez cette URL dans votre navigateur pour autoriser l\'application :');
    logger.info(`${auth.url}`);
    logger.info('Après autorisation, le serveur webhook démarre automatiquement et le token sera sauvegardé.');

    // Sauvegarde de l'état pour vérification
    const statePath = path.join(process.cwd(), 'temp', '.auth-state');

    require('fs').writeFileSync(
      statePath,
      JSON.stringify({ state: auth.state, timestamp: Date.now() })
    );

    logger.info('Démarrage du serveur webhook...');
    try {
      const NetatmoAuthServer = require('./auth-server');
      const server = new NetatmoAuthServer();
      await server.start();
    } catch (err) {
      logger.error('Erreur serveur webhook:', err.message);
    }
  }
}

// Exécution si appelé directement
if (require.main === module) {
  const generator = new NetatmoAuthUrlGenerator();
  generator.displayInstructions();
}

module.exports = NetatmoAuthUrlGenerator;
