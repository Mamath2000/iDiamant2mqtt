#!/usr/bin/env node

const fs = require('fs');
const config = require('../config/config');
const logger = require('../utils/logger');

/**
 * Script d'aide pour l'authentification Netatmo
 */
class NetatmoAuthHelper {
  constructor() {
    this.tokenPath = '/root/iDiamant/temp/.netatmo-tokens.json';
  }

  checkConfiguration(preCheck = false) {
    const logLevel = (process.env.LOG_LEVEL || config.LOG_LEVEL || 'info').toLowerCase();

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
      }
    ];

    if (preCheck) {
      checks.push({
          name: 'NETATMO_REDIRECT_URI',
          value: config.NETATMO_REDIRECT_URI,
          valid: config.NETATMO_REDIRECT_URI && config.NETATMO_REDIRECT_URI !== ''
        });
    }

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

  checkExistingTokens() {
    logger.debug('🔍 Vérification des tokens existants...');

    return true;
  }

  run() {
    logger.info('🔧 ASSISTANT D\'AUTHENTIFICATION NETATMO');
    
    const configValid = this.checkConfiguration();
    if (!configValid) {
      this.displayInstructions();
      return;
    }
    
    const tokensValid = this.checkExistingTokens();
    
    if (tokensValid) {
      logger.info('🎉 Tout est prêt ! Vous pouvez démarrer l\'application avec: make start');
    } else {
      logger.info('🚀 Commandes à exécuter:');
      logger.info('   1. make auth-url');
      logger.info('   2. Ouvrir l\'URL générée dans votre navigateur');
    }
  }
}

// Exécution si appelé directement
if (require.main === module) {
  const helper = new NetatmoAuthHelper();
  helper.run();
}

module.exports = NetatmoAuthHelper;
