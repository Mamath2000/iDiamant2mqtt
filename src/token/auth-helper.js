#!/usr/bin/env node

const fs = require('fs');
const config = require('../config/config');

/**
 * Script d'aide pour l'authentification Netatmo
 */
class NetatmoAuthHelper {
  constructor() {
    this.tokenPath = '/root/iDiamant/temp/.netatmo-tokens.json';
  }

  checkConfiguration(preCheck = false) {
    console.log('🔍 Vérification de la configuration...\n');

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
      
      console.log(`${status} ${check.name}: ${value}`);
      
      if (!check.valid) {
        allValid = false;
      }
    });

    console.log('');
    
    if (allValid) {
      console.log('✅ Configuration valide pour l\'authentification\n');
    } else {
      console.log('❌ Configuration incomplète. Éditez le fichier .env\n');
      return false;
    }
    
    return true;
  }

  checkExistingTokens() {
    console.log('🔑 Vérification des tokens existants...\n');
    
    if (!fs.existsSync(this.tokenPath)) {
      console.log('📄 Aucun token trouvé localement');
      console.log('🚀 Lancez le processus d\'authentification avec: make auth-url\n');
      return false;
    }

    try {
      const tokenData = JSON.parse(fs.readFileSync(this.tokenPath, 'utf8'));
      const now = Date.now();
      const tokenAge = now - tokenData.timestamp;
      const expiresAt = tokenData.timestamp + (tokenData.expires_in * 1000);
      const isExpired = now > expiresAt;
      
      console.log('📄 Tokens trouvés:');
      console.log(`   Access Token: ${tokenData.access_token.substring(0, 30)}...`);
      console.log(`   Refresh Token: ${tokenData.refresh_token.substring(0, 30)}...`);
      console.log(`   Âge: ${Math.floor(tokenAge / 1000 / 60)} minutes`);
      console.log(`   Statut: ${isExpired ? '❌ EXPIRÉ' : '✅ VALIDE'}`);
      
      if (isExpired) {
        console.log('\n⚠️  Les tokens ont expiré. Relancez l\'authentification.');
        return false;
      } else {
        console.log('\n✅ Tokens valides et utilisables');
        return true;
      }
      
    } catch (error) {
      console.log('❌ Erreur lecture tokens:', error.message);
      return false;
    }
  }

  displayInstructions() {
    console.log('\n📖 INSTRUCTIONS D\'AUTHENTIFICATION NETATMO');
    console.log('=============================================\n');
    
    console.log('📋 Prérequis:');
    console.log('   1. Compte développeur Netatmo: https://dev.netatmo.com');
    console.log('   2. Application créée avec les scopes: read_bubendorff write_bubendorff');
    console.log('   3. Client ID, Client Secret et auth2 webhook url dans .env\n');
    
    console.log('🔧 Processus d\'authentification:');
    console.log('   1. make auth-url     - Générer l\'URL d\'autorisation');
    console.log('   2. make auth-server  - Démarrer le serveur de callback');
    console.log('   3. Ouvrir l\'URL dans le navigateur');
    console.log('   4. Autoriser l\'application');
    console.log('   5. Les tokens seront automatiquement sauvegardés\n');
    
    console.log('🛠️  Dépannage:');
    console.log('   - Vérifiez que le broker MQTT fonctionne: mosquitto_pub -h localhost -t test -m hello');
    console.log('   - Vérifiez les logs: tail -f logs/combined.log');
    console.log('   - Port 3001 libre pour le callback');
    console.log('   - URL de redirection correcte dans l\'app Netatmo\n');
  }

  run() {
    console.log('🔧 ASSISTANT D\'AUTHENTIFICATION NETATMO\n');
    
    const configValid = this.checkConfiguration();
    if (!configValid) {
      this.displayInstructions();
      return;
    }
    
    const tokensValid = this.checkExistingTokens();
    
    if (tokensValid) {
      console.log('🎉 Tout est prêt ! Vous pouvez démarrer l\'application avec: make start\n');
    } else {
      console.log('🚀 Commandes à exécuter:');
      console.log('   1. make auth-url');
      console.log('   2. make auth-server (dans un autre terminal)');
      console.log('   3. Ouvrir l\'URL générée dans votre navigateur\n');
    }
  }
}

// Exécution si appelé directement
if (require.main === module) {
  const helper = new NetatmoAuthHelper();
  helper.run();
}

module.exports = NetatmoAuthHelper;
