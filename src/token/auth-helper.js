#!/usr/bin/env node
const qs = require('querystring');
const logger = require('../utils/logger');
const config = require('../config/config');
const { formatDate } = require('../utils/utils');
const ApiHelper = require('../utils/api-helper'); 

class NetatmoAuthHelper {
    constructor(mqttClient, appApiHelper) {
        // Chemin absolu depuis la racine du projet
        this.bridgeTopic = `${config.MQTT_TOPIC_PREFIX}/bridge`;
        this.mqttClient = mqttClient;
        this.tokenData = null; // Stocke le token récupéré
        this.refreshTimer = null; // Timer pour le rafraîchissement automatique
        this.tokenApiHelper = new ApiHelper(`${config.IDIAMANT_API_URL}`, 5000); // Timeout de 5 secondes
        this.appApiHelper = appApiHelper;
    }

    async checkTokenValidity(token) {
        logger.debug('auth', `🔍 Token reçu via MQTT: ${JSON.stringify(token)}`);
        if (!token || !token.timestamp || !token.expires_in) return false;

        const nowMs = Date.now();
        const expireMs = token.timestamp + (token.expires_in * 1000);
        const expireDate = new Date(expireMs);
        logger.info('auth', `Le token Netatmo expire le : ${expireDate.toLocaleString()}`);

        if (expireMs <= nowMs) {
            logger.warn('auth', '⚠️ Le token Netatmo a expiré');
            return false;
        }

        logger.info('auth', '✅ Token Netatmo valide reçu via MQTT');

        try {
            this.appApiHelper.setAccessToken(token.access_token);
            const response = await this.appApiHelper.get('/homesdata'); // ✅ AWAIT
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
                logger.error('auth', `❌ Échec de la récupération des données du HomeId: ${response.status} ${response.statusText}`);
                return false;
            }

        } catch (error) {
            logger.error('auth', '❌ Échec de la récupération des données du HomeId:', error);
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
                logger.warn('auth', '⚠️ Impossible de parser le token depuis MQTT:', err);

            }
        }
    }

    setupPermanentTokenListener() {
        // Installe le handler permanent pour les mises à jour de token
        this.mqttClient.setTokenHandler(this.tokenRefreshHandler.bind(this));
        this.mqttClient.subscribe(`${this.bridgeTopic}/token`);
        logger.info('auth', '🔄 Handler permanent pour les mises à jour de token installé');
    }

    refreshTokenCommandHandler(deviceId, topic, message) {
        if (deviceId === 'bridge' && message === 'refreshToken') {
            logger.info('auth', '🔄 Commande de rafraîchissement du token reçue via MQTT');
            this.startTokenAutoRefresh(true);
        }
    }

    startTokenAutoRefresh(force = false) {
        // Nettoie l'ancien timer s'il existe
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }

        if (force) {
            logger.debug('auth', 'Mode forcé : le token est rafraîchi immédiatement.');
            this.refreshTimer = setTimeout(() => this.refreshToken(), 1000);
        } else {
            // expire_in = durée de vie en secondes depuis le timestamp
            const expireMs = this.tokenData.timestamp + (this.tokenData.expires_in * 1000);
            const nowMs = Date.now();
            let delayMs = expireMs - nowMs - (30 * 60 * 1000); // rafraîchir 30 min avant expiration
            if (delayMs < 1000) delayMs = 1000;
            logger.debug('auth', `Le token sera rafraîchi dans ${Math.round(delayMs / 1000)} secondes.`);
            this.refreshTimer = setTimeout(() => this.refreshToken(), delayMs);
        }
    }

    async refreshToken() {
        try {
            logger.info('auth', '🔄 Rafraîchissement du token Netatmo...');
            const data = qs.stringify({
                grant_type: 'refresh_token',
                refresh_token: this.tokenData.refresh_token,
                client_id: config.IDIAMANT_CLIENT_ID,
                client_secret: config.IDIAMANT_CLIENT_SECRET
            });
            const response = await this.tokenApiHelper.post('/oauth2/token', data, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }); 

            if (response.status === 200) {

                const newToken = response.data;
                newToken.timestamp = Date.now();

                // Publie le token sur MQTT
                this.mqttClient.publish(`${this.bridgeTopic}/token`, JSON.stringify(newToken), { retain: true });
                logger.info('auth', '✅ Token Netatmo rafraîchi avec succès');

                // Relance le refresh automatique avec le nouveau token pour garantir la récursivité
                this.startTokenAutoRefresh();
            } else {
                logger.error('auth', '❌ Échec du rafraîchissement du token Netatmo:', response.data);
                if (this.refreshTimer) {
                    clearTimeout(this.refreshTimer);
                }
                // Réessaie après un délai
                logger.warn('auth', '🔄 Réessaie du rafraîchissement du token dans 30 secondes');
                this.refreshTimer = setTimeout(() => this.refreshToken(), 30 * 1000); // Réessaie après 30 secondes
            }
        } 
        catch (err) {
            logger.error('auth', '❌ Échec du rafraîchissement du token Netatmo:', err);
                if (this.refreshTimer) {
                    clearTimeout(this.refreshTimer);
                }
                // Réessaie après un délai
                logger.warn('auth', '🔄 Réessaie du rafraîchissement du token dans 30 secondes');
                this.refreshTimer = setTimeout(() => this.refreshToken(), 30 * 1000); // Réessaie après 30 secondes
        }
    }

    stop() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
    }
}

module.exports = NetatmoAuthHelper;
