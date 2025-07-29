#!/usr/bin/env node
// const MQTTClient = require('../services/mqtt-client');
const axios = require('axios');
const qs = require('querystring');
const logger = require('../utils/logger');
const config = require('../config/config');
const { formatDate } = require('../utils/utils');

class NetatmoAuthHelper {
    constructor(mqttClient) {
        // Chemin absolu depuis la racine du projet
        this.bridgeTopic = `${config.MQTT_TOPIC_PREFIX}/bridge`;
        this.mqttClient = mqttClient;
        this.tokenData = null; // Stocke le token récupéré
        this.refreshTimer = null; // Timer pour le rafraîchissement automatique

        // On n'abonne pas tout de suite le handler permanent, voir waitForInitialToken
    }
    // /**
    //  * Attend le premier message retain sur le topic token, puis installe le handler permanent.
    //  * Usage : await instance.waitForInitialToken();
    //  */
    // async waitForInitialToken(timeoutMs = 5 * 60 * 1000) {
    //     return new Promise((resolve, reject) => {
    //         const topic = `${this.bridgeTopic}/token`;
    //         let isResolved = false; // Flag pour éviter les doubles appels

    //         const tempHandler = (deviceId, message) => {
    //             if (deviceId === "bridge" && !isResolved) {
    //                 isResolved = true;
    //                 logger.debug(`🔍 Message reçu sur ${topic}: ${message.toString()}`);

    //                 this.mqttClient.setTokenHandler(null);
    //                 this.mqttClient.unsubscribe(topic);

    //                 try {
    //                     const token = JSON.parse(message.toString());
    //                     if (this.checkTokenValidity(token)) {
    //                         resolve(token);
    //                     } else {
    //                         reject(new Error("Token invalide"));
    //                     }
    //                 } catch (err) {
    //                     reject(err);
    //                 }
    //             }
    //         };

    //         // Installe le handler temporaire
    //         this.mqttClient.setTokenHandler(tempHandler);
    //         this.mqttClient.subscribe(topic);

    //         // Timeout
    //         setTimeout(() => {
    //             if (!isResolved) {
    //                 isResolved = true;
    //                 this.mqttClient.setTokenHandler(null); // Nettoie le handler temporaire
    //                 this.mqttClient.unsubscribe(topic);
    //                 reject(new Error("Timeout: aucun token reçu"));
    //             }
    //         }, timeoutMs);
    //     });
    // }

    async checkTokenValidity(token) {
        logger.debug(`🔍 Token reçu via MQTT: ${JSON.stringify(token)}`);
        if (!token || !token.timestamp || !token.expires_in) return false;

        const nowMs = Date.now();
        const expireMs = token.timestamp + (token.expires_in * 1000);
        const expireDate = new Date(expireMs);
        logger.info(`Le token Netatmo expire le : ${expireDate.toLocaleString()}`);

        if (expireMs <= nowMs) {
            logger.warn('⚠️ Le token Netatmo a expiré');
            return false;
        }

        logger.info('✅ Token Netatmo valide reçu via MQTT');

        try {
            const options = {
                method: 'GET',
                url: `${config.IDIAMANT_API_URL}/api/homesdata`,
                headers: {
                    'Authorization': `Bearer ${token.access_token}`,
                    'Content-Type': 'application/json'
                }
            };
            
            const response = await axios(options); // ✅ AWAIT
            
            if (response.status === 200) {
                const homeData = response.data.body;
                if (homeData && homeData.homes[0]?.id) {
                    token.homeId = homeData.homes[0].id;
                    this.tokenData = token;
                    this.mqttClient.publish(`${this.bridgeTopic}/expire_date`, formatDate(expireMs), { retain: true });
                    this.mqttClient.publish(`${this.bridgeTopic}/expire_at_ts`, String(expireMs), { retain: true });
                    this.mqttClient.publish(`${this.bridgeTopic}/home_id`, String(token.homeId), { retain: true });
                }
                return expireMs > nowMs;
            } else {
                logger.error(`❌ Échec de la récupération des données du HomeId: ${response.status} ${response.statusText}`);
                return false;
            }

        } catch (error) {
            logger.error('❌ Échec de la récupération des données du HomeId:', error);
            return false;
        }
    }

    // Handler permanent pour les mises à jour de token (rafraîchissements automatiques)
    async tokenRefreshHandler(deviceId, message) {
        if (deviceId === "bridge") {
            try {
                const token = JSON.parse(message.toString());
                await this.checkTokenValidity(token);
                // ✅ Relance le timer avec le nouveau token
                this.startTokenAutoRefresh();

            } catch (err) {
                logger.warn('⚠️ Impossible de parser le token depuis MQTT:', err);

            }
        }
    }

    setupPermanentTokenListener() {
        // Installe le handler permanent pour les mises à jour de token
        this.mqttClient.setTokenHandler(this.tokenRefreshHandler.bind(this));
        this.mqttClient.subscribe(`${this.bridgeTopic}/token`);
        logger.info('🔄 Handler permanent pour les mises à jour de token installé');
    }
    // isTokenValid(newTokenData) {
    //     if (!newTokenData || !newTokenData.timestamp || !newTokenData.expires_in) return false;
    //     const nowMs = Date.now();
    //     const expireMs = newTokenData.timestamp + (newTokenData.expires_in * 1000);
    //     const expireDate = new Date(expireMs);
    //     logger.info(`Le token Netatmo expire le : ${expireDate.toLocaleString()}`);
    //     this.tokenData = newTokenData; // Met à jour le tokenData
    //     // publie les infos du token sur MQTT
    //     return expireMs > nowMs;
    // }

    startTokenAutoRefresh(force = false) {
        // Nettoie l'ancien timer s'il existe
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }

        if (force) {
            logger.debug('Mode forcé : le token est rafraîchi immédiatement.');
            this.refreshTimer = setTimeout(() => this.refreshToken(), 1000);
        } else {
            // expire_in = durée de vie en secondes depuis le timestamp
            const expireMs = this.tokenData.timestamp + (this.tokenData.expires_in * 1000);
            const nowMs = Date.now();
            let delayMs = expireMs - nowMs - (5 * 60 * 1000); // rafraîchir 5 min avant expiration
            if (delayMs < 1000) delayMs = 1000;
            logger.debug(`Le token sera rafraîchi dans ${Math.round(delayMs / 1000)} secondes.`);
            this.refreshTimer = setTimeout(() => this.refreshToken(), delayMs);
        }
    }
    refreshToken() {
        try {
            logger.info('🔄 Rafraîchissement du token Netatmo...');
            let options = {
                method: 'POST',
                url: `${config.IDIAMANT_API_URL}/oauth2/token`,
                data: qs.stringify({
                    grant_type: 'refresh_token',
                    refresh_token: this.tokenData.refresh_token,
                    client_id: config.IDIAMANT_CLIENT_ID,
                    client_secret: config.IDIAMANT_CLIENT_SECRET
                }),
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            };
            axios(options)
                .then((response) => {
                    if (response.status === 200) {
                        const newToken = response.data;
                        newToken.timestamp = Date.now();

                        // Publie le token sur MQTT
                        // this.tokenData = newToken; // Met à jour le tokenData
                        this.mqttClient.publish(`${this.bridgeTopic}/token`, JSON.stringify(newToken), { retain: true });
                        logger.info('✅ Token Netatmo rafraîchi avec succès');

                        // Relance le refresh automatique avec le nouveau token pour garantir la récursivité
                        this.startTokenAutoRefresh();
                    }
                })
                .catch((error) => {
                    logger.error('❌ Échec du rafraîchissement du token Netatmo:', error);
                    setTimeout(() => this.refreshToken(), 30 * 1000); // Réessaie après 30 secondes
                });
        } catch (err) {
            logger.error('❌ Échec du rafraîchissement du token Netatmo:', err);
            setTimeout(() => this.refreshToken(), 30 * 1000); // Réessaie après 30 secondes
        }
    }

}

module.exports = NetatmoAuthHelper;
