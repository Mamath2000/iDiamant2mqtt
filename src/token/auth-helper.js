#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const qs = require('querystring');
const logger = require('../utils/logger');
const config = require('../config/config');

class NetatmoAuthHelper {
    constructor() {
        // Chemin absolu depuis la racine du projet
        this.tokenPath = path.join(process.cwd(), 'temp', '.netatmo-tokens.json');
    }

    getTokenData() {
        if (fs.existsSync(this.tokenPath)) {
            try {
                return JSON.parse(fs.readFileSync(this.tokenPath, 'utf8'));
            } catch (err) {
                logger.warn('⚠️ Impossible de lire le fichier de token, il semble corrompu.');
                return null;
            }
        }
        return null;
    }

    isTokenValid(tokenData) {
        if (!tokenData || !tokenData.timestamp || !tokenData.expires_in) return false;
        const nowMs = Date.now();
        const expireMs = tokenData.timestamp + (tokenData.expires_in * 1000);
        const expireDate = new Date(expireMs);
        logger.info(`Le token Netatmo expire le : ${expireDate.toLocaleString()}`);
        return expireMs > nowMs;
    }

    startTokenAutoRefresh(tokenData, force = false) {
        if (tokenData && tokenData.refresh_token && tokenData.expires_in && tokenData.timestamp) {
            if (force) {
                logger.debug('Mode forcé : le token est rafraîchi immédiatement.');
                setTimeout(() => this.refreshToken(tokenData), 1000);
            } else {
                // expire_in = durée de vie en secondes depuis le timestamp
                const expireMs = tokenData.timestamp + (tokenData.expires_in * 1000);
                const nowMs = Date.now();
                let delayMs = expireMs - nowMs - (5 * 60 * 1000); // rafraîchir 5 min avant expiration
                if (delayMs < 1000) delayMs = 1000;
                logger.debug(`Le token sera rafraîchi dans ${Math.round(delayMs / 1000)} secondes.`);
                setTimeout(() => this.refreshToken(tokenData), delayMs);
            }
        }
    }

    async refreshToken(tokenData) {
        try {
            logger.info('🔄 Rafraîchissement du token Netatmo...');
            const response = await axios.post('https://api.netatmo.com/oauth2/token',
                qs.stringify({
                    grant_type: 'refresh_token',
                    refresh_token: tokenData.refresh_token,
                    client_id: config.IDIAMANT_CLIENT_ID,
                    client_secret: config.IDIAMANT_CLIENT_SECRET
                }),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );
            const newToken = response.data;
            newToken.timestamp = Date.now();

            fs.writeFileSync(this.tokenPath, JSON.stringify(newToken, null, 2));
            logger.info('✅ Token Netatmo rafraîchi avec succès.');
            // Relance le refresh automatique avec le nouveau token pour garantir la récursivité
            this.startTokenAutoRefresh(newToken);
        } catch (err) {
            logger.error('❌ Échec du rafraîchissement du token Netatmo:', err);
        }
    }


    // --- Assistant CLI (conserve la logique existante) ---
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

    // checkExistingTokens() {
    //   logger.debug('🔍 Vérification des tokens existants...');
    //   // Ici on pourrait utiliser getTokenData/isTokenValid pour vérifier
    //   const tokenData = this.getTokenData();
    //   return this.isTokenValid(tokenData);
    // }

    // run() {
    //     logger.info('🔧 ASSISTANT D\'AUTHENTIFICATION NETATMO');
    //     const configValid = this.checkConfiguration();
    //     if (!configValid) {
    //         this.displayInstructions();
    //         return;
    //     }
    //     const tokensValid = this.checkExistingTokens();
    //     if (tokensValid) {
    //         logger.info('🎉 Tout est prêt ! Vous pouvez démarrer l\'application avec: make start');
    //         NetatmoAuthHelper.removeAuthStateFile();
    //     } else {
    //         logger.info('🚀 Commandes à exécuter:');
    //         logger.info('   1. make auth-url');
    //         logger.info('   2. Ouvrir l\'URL générée dans votre navigateur');
    //     }
    // }

    // Suppression du fichier .auth-state après la première authentification
    static removeAuthStateFile() {
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

    displayInstructions() {
        logger.info('👉 Veuillez compléter la configuration dans le fichier .env avant de poursuivre.');
    }
}

// // Exécution si appelé directement
// if (require.main === module) {
//   const helper = new NetatmoAuthHelper();
//   helper.run();
// }

module.exports = NetatmoAuthHelper;
