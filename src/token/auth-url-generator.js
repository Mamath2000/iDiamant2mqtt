#!/usr/bin/env node

const crypto = require('crypto');
const config = require('../config/config');
const NetatmoAuthHelper = require('./auth-helper');

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
      process.exit(1);
    }

    const auth = this.generateAuthUrl();

    console.log('\n🔑 PROCESSUS D\'AUTHENTIFICATION NETATMO');
    console.log('=========================================\n');

    console.log('📋 Informations:');
    console.log(`   Client ID: ${this.clientId}`);
    console.log(`   Redirect URI: ${auth.redirectUri}`);
    console.log(`   Scope: ${this.scope}`);
    console.log(`   State: ${auth.state}\n`);

    console.log('🌐 URL d\'autorisation:');
    console.log(`   ${auth.url}\n`);

    console.log('📝 Instructions:');
    console.log('   1. Le serveur webhook va démarrer automatiquement...');
    console.log('   2. Ouvrez l\'URL ci-dessus dans votre navigateur');
    console.log('   3. Connectez-vous à votre compte Netatmo');
    console.log('   4. Autorisez l\'application');
    console.log('   5. Le token sera automatiquement sauvegardé\n');

    // Sauvegarde de l'état pour vérification
    require('fs').writeFileSync(
      '/root/iDiamant/temp/.auth-state',
      JSON.stringify({ state: auth.state, timestamp: Date.now() })
    );

    // Démarrage automatique du serveur webhook
    console.log('\n🚀 Démarrage du serveur webhook...\n');
    try {
      const NetatmoAuthServer = require('./auth-server');
      const server = new NetatmoAuthServer();
      await server.start();
    } catch (err) {
      console.error('❌ Impossible de démarrer le serveur webhook:', err.message);
    }
  }
}

// Exécution si appelé directement
if (require.main === module) {
  const generator = new NetatmoAuthUrlGenerator();
  generator.displayInstructions();
}

module.exports = NetatmoAuthUrlGenerator;
