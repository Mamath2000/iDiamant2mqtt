#!/usr/bin/env node
// const MQTTClient = require('../services/mqtt-client');
const axios = require('axios');
const qs = require('querystring');
const logger = require('../utils/logger');
const config = require('../config/config');
const {  formatDate } = require('../utils/utils');

class NetatmoAuthHelper {
    constructor(mqttClient) {
        // Chemin absolu depuis la racine du projet
        // this.tokenPath = path.join(process.cwd(), 'temp', '.netatmo-tokens.json');
        this.bridgeTopic = `${config.MQTT_TOPIC_PREFIX}/bridge`;
        this.tokenRefreshHandler = null;
        this.mqttClient = mqttClient;
        this.tokenData = null; // Stocke le token récupéré
    }

    // Méthode pour récupérer le token depuis MQTT (attend le message retain)
    async getTokenData() {
        const topic = `${this.bridgeTopic}/token`;
        
        return new Promise(async (resolve, reject) => {
            try {
                // Handler temporaire pour capturer le message retain
                const tempHandler = (deviceId, message) => {
                    if (deviceId === "bridge") {
                        try {
                            const token = JSON.parse(message.toString());
                            // token.timestamp = Date.now(); // Ajoute le timestamp actuel
                            this.tokenData = token;
                            logger.info('✅ Token Netatmo récupéré via MQTT (retain)');
                            // Supprimer le handler temporaire
                            // this.mqttClient.setTokenHandler(null);
                            if (!this.isTokenValid(token)) {
                                logger.error('❌ Token Netatmo absent ou expiré. Veuillez relancer l\'authentification avec : make auth-url');
                                resolve(null);
                            } else {
                                resolve(token);
                            }
                        } catch (err) {
                            logger.warn('⚠️ Impossible de parser le token depuis MQTT.');
                            // this.mqttClient.setTokenHandler(null);
                            resolve(null);
                        }
                    }
                };

                // Définir le handler avant de s'abonner
                this.mqttClient.setTokenHandler(tempHandler);
                
                // S'abonner au topic pour recevoir le message retain
                await this.mqttClient.subscribe(topic);
                
                // // Timeout de sécurité (5 secondes)
                // setTimeout(() => {
                //     this.mqttClient.setTokenHandler(null);
                //     resolve(null);
                // }, 5000);
                
            } catch (err) {
                logger.error('❌ Erreur lors de la récupération du token:', err);
                reject(err);
            }
        });
    }

    isTokenValid(newTokenData) {
        if (!newTokenData || !newTokenData.timestamp || !newTokenData.expires_in) return false;
        const nowMs = Date.now();
        const expireMs = newTokenData.timestamp + (newTokenData.expires_in * 1000);
        const expireDate = new Date(expireMs);
        logger.info(`Le token Netatmo expire le : ${expireDate.toLocaleString()}`);
        this.tokenData = newTokenData; // Met à jour le tokenData
        // publie les infos du token sur MQTT
        this.mqttClient.publish(`${this.bridgeTopic}/expire_date`, formatDate(this.tokenData.timestamp + (this.tokenData.expires_in * 1000)), { retain: true });
        this.mqttClient.publish(`${this.bridgeTopic}/expire_at_ts`, String(this.tokenData.timestamp + (this.tokenData.expires_in * 1000)), { retain: true });
        return expireMs > nowMs;
    }

    startTokenAutoRefresh(force = false) {
        if (this.tokenData && this.tokenData.refresh_token && this.tokenData.expires_in && this.tokenData.timestamp) {
            if (force) {
                logger.debug('Mode forcé : le token est rafraîchi immédiatement.');
                setTimeout(() => this.refreshToken(), 1000);
            } else {
                // expire_in = durée de vie en secondes depuis le timestamp
                const expireMs = this.tokenData.timestamp + (this.tokenData.expires_in * 1000);
                const nowMs = Date.now();
                let delayMs = expireMs - nowMs - (5 * 60 * 1000); // rafraîchir 5 min avant expiration
                if (delayMs < 1000) delayMs = 1000;
                logger.debug(`Le token sera rafraîchi dans ${Math.round(delayMs / 1000)} secondes.`);
                setTimeout(() => this.refreshToken(), delayMs);
            }
        }
    }

    async refreshToken() {
        try {
            logger.info('🔄 Rafraîchissement du token Netatmo...');
            const response = await axios.post('https://api.netatmo.com/oauth2/token',
                qs.stringify({
                    grant_type: 'refresh_token',
                    refresh_token: this.tokenData.refresh_token,
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

            // Publie le token sur MQTT
            this.tokenData = newToken; // Met à jour le tokenData
            await this.mqttClient.publish(`${this.bridgeTopic}/token`, JSON.stringify(this.tokenData), { retain: true });
            // await this.mqttClient.publish(`${this.bridgeTopic}/expire_date`, formatDate(this.tokenData.timestamp + (this.tokenData.expires_in * 1000)), { retain: true });
            // await this.mqttClient.publish(`${this.bridgeTopic}/expire_at_ts`, String(this.tokenData.timestamp + (this.tokenData.expires_in * 1000)), { retain: true });
            logger.info('✅ Token Netatmo rafraîchi et publié sur MQTT.');

            // // publication de l'état du token
            // this.publishTokenState(newToken);

            // Relance le refresh automatique avec le nouveau token pour garantir la récursivité
            this.startTokenAutoRefresh();
        } catch (err) {
            logger.error('❌ Échec du rafraîchissement du token Netatmo:', err);
        }
    }

    // // --- Assistant CLI (conserve la logique existante) ---
    // checkConfiguration(preCheck = false) {
    //     const logLevel = (process.env.LOG_LEVEL || config.LOG_LEVEL || 'info').toLowerCase();
    //     let checks = [
    //         {
    //             name: 'IDIAMANT_CLIENT_ID',
    //             value: config.IDIAMANT_CLIENT_ID,
    //             valid: config.IDIAMANT_CLIENT_ID && config.IDIAMANT_CLIENT_ID !== 'your_client_id_here'
    //         },
    //         {
    //             name: 'IDIAMANT_CLIENT_SECRET',
    //             value: config.IDIAMANT_CLIENT_SECRET,
    //             valid: config.IDIAMANT_CLIENT_SECRET && config.IDIAMANT_CLIENT_SECRET !== 'your_client_secret_here'
    //         },
    //         {
    //             name: 'MQTT_BROKER_URL',
    //             value: config.MQTT_BROKER_URL,
    //             valid: config.MQTT_BROKER_URL && config.MQTT_BROKER_URL !== ''
    //         }
    //     ];
    //     if (preCheck) {
    //         checks.push({
    //             name: 'NETATMO_REDIRECT_URI',
    //             value: config.NETATMO_REDIRECT_URI,
    //             valid: config.NETATMO_REDIRECT_URI && config.NETATMO_REDIRECT_URI !== ''
    //         });
    //     }
    //     let allValid = true;
    //     checks.forEach(check => {
    //         const status = check.valid ? '✅' : '❌';
    //         const value = check.valid ?
    //             (check.value.length > 30 ? check.value.substring(0, 30) + '...' : check.value) :
    //             'NON CONFIGURÉ';
    //         if (logLevel === 'debug') {
    //             logger.debug(`${status} ${check.name}: ${value}`);
    //         }
    //         if (!check.valid) {
    //             allValid = false;
    //         }
    //     });
    //     if (allValid) {
    //         if (logLevel === 'debug') logger.debug('');
    //         logger.info('✅ Configuration valide pour l\'authentification');
    //     } else {
    //         logger.error('❌ Configuration incomplète. Éditez le fichier .env');
    //         return false;
    //     }
    //     return true;
    // }

    // setTokenRefreshHandler(handler) {
    //     this.tokenRefreshHandler = handler;
    // }

    // publishTokenState(tokenData) {
    //     if (this.tokenRefreshHandler) {
    //         this.tokenRefreshHandler(tokenData);
    //     }
    //     // Tu peux aussi publier sur MQTT ici si besoin
    // }

    // // Suppression du fichier .auth-state après la première authentification
    // static removeAuthStateFile() {
    //     const authStatePath = path.join(process.cwd(), 'temp', '.auth-state');
    //     if (fs.existsSync(authStatePath)) {
    //         try {
    //             fs.unlinkSync(authStatePath);
    //             logger.info('🗑️ Fichier .auth-state supprimé après authentification.');
    //         } catch (err) {
    //             logger.warn('⚠️ Impossible de supprimer .auth-state:', err);
    //         }
    //     }
    // }

    // displayInstructions() {
    //     logger.info('👉 Veuillez compléter la configuration dans le fichier .env avant de poursuivre.');
    // }
}

module.exports = NetatmoAuthHelper;
