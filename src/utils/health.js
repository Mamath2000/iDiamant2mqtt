const logger = require('./logger');

class HealthMonitor {
    constructor(app) {
        this.app = app;
        this.healthCheckInterval = null;
        this.bridgeTopic = `${this.app.config.MQTT_TOPIC_PREFIX}/bridge`;
    }

    start() {
        this.healthCheckInterval = setInterval(() => {
            this._performHealthCheck();
        }, 60000); // Toutes les minutes
        
        // Health check initial
        setTimeout(() => this._performHealthCheck(), 5000);
    }

    async _performHealthCheck() {
        try {
            const healthStatus = {
                timestamp: new Date().toISOString(),
                bridge: {
                    status: 'online',
                    uptime: process.uptime(),
                    memory: process.memoryUsage(),
                    version: process.env.npm_package_version || 'unknown'
                },
                components: {}
            };

            // ✅ Vérifier MQTT
            const mqttStatus = await this._checkMqtt();
            healthStatus.components.mqtt = mqttStatus;

            // ✅ Vérifier token
            const tokenStatus = this._checkToken();
            healthStatus.components.token = tokenStatus;

            // ✅ Vérifier API Netatmo
            const apiStatus = await this._checkApi();
            healthStatus.components.api = apiStatus;

            // ✅ Calculer l'état général
            const overallStatus = this._calculateOverallStatus(healthStatus.components);
            healthStatus.overall = overallStatus;

            // ✅ Publier sur MQTT
            await this._publishHealthStatus(healthStatus);

            // Log selon la criticité
            if (overallStatus.status === 'healthy') {
                logger.debug('🏥 Health check: Tous les composants sont OK');
            } else if (overallStatus.status === 'degraded') {
                logger.warn('🏥 Health check: Fonctionnement dégradé');
            } else {
                logger.error('🏥 Health check: Problèmes critiques détectés');
            }

        } catch (error) {
            logger.error('🏥 Health check échoué:', error.message);
            
            // Publier l'état d'erreur
            await this._publishErrorStatus(error);
        }
    }

    async _checkMqtt() {
        try {
            const isConnected = this.app.mqttClient?.isConnected || false;
            logger.debug(`🏥 Vérification de l'état MQTT: ${isConnected ? 'connecté' : 'déconnecté'}`);
            if (!isConnected) {
                logger.warn('🏥 MQTT déconnecté, tentative de reconnexion...');
                // Ne pas faire connect() ici pour éviter les boucles, juste reporter l'état
            }

            return {
                status: isConnected ? 'healthy' : 'unhealthy',
                connected: isConnected,
                lastError: isConnected ? null : 'Connexion fermée',
                details: {
                    broker: this.app.config.MQTT_BROKER,
                    clientId: this.app.mqttClient?.options?.clientId
                }
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                connected: false,
                lastError: error.message,
                details: null
            };
        }
    }

    _checkToken() {
        try {
            const hasToken = !!this.app.authHelper?.tokenData;
            let tokenStatus = 'unknown';
            let expiresIn = null;
            let lastRefresh = null;

            if (hasToken) {
                const token = this.app.authHelper.tokenData;
                const now = Date.now();
                const tokenAge = now - (token.timestamp || 0);
                const expiresAt = (token.timestamp || 0) + (token.expires_in * 1000);
                expiresIn = Math.max(0, expiresAt - now);

                if (expiresIn > 5 * 60 * 1000) { // Plus de 5 minutes
                    tokenStatus = 'healthy';
                } else if (expiresIn > 0) {
                    tokenStatus = 'degraded'; // Expire bientôt
                } else {
                    tokenStatus = 'unhealthy'; // Expiré
                }

                lastRefresh = new Date(token.timestamp).toISOString();
            } else {
                tokenStatus = 'unhealthy';
            }

            return {
                status: tokenStatus,
                hasToken,
                expiresIn: expiresIn ? Math.round(expiresIn / 1000) : null,
                lastRefresh,
                details: hasToken ? {
                    scope: this.app.authHelper.tokenData.scope,
                    tokenType: this.app.authHelper.tokenData.token_type
                } : null
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                hasToken: false,
                lastError: error.message,
                expiresIn: null,
                lastRefresh: null
            };
        }
    }

    async _checkApi() {
        try {
            if (!this.app.apiHelper) {
                return {
                    status: 'unhealthy',
                    lastError: 'API client non initialisé',
                    responseTime: null,
                    lastCheck: new Date().toISOString()
                };
            }

            const startTime = Date.now();
            const response = await this.app.apiHelper.get('/homesdata', {
                retryOptions: { retries: 1, baseDelay: 2000 }
            });
            const responseTime = Date.now() - startTime;

            const status = response.status === 200 ? 'healthy' : 'degraded';

            return {
                status,
                responseTime,
                httpStatus: response.status,
                lastCheck: new Date().toISOString(),
                details: response.status === 200 ? {
                    homesCount: response.data?.body?.homes?.length || 0
                } : null
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                lastError: error.message,
                responseTime: null,
                lastCheck: new Date().toISOString()
            };
        }
    }

    _calculateOverallStatus(components) {
        const statuses = Object.values(components).map(c => c.status);
        
        if (statuses.every(s => s === 'healthy')) {
            return {
                status: 'healthy',
                message: 'Tous les composants fonctionnent normalement'
            };
        } else if (statuses.some(s => s === 'unhealthy')) {
            const unhealthyComponents = Object.entries(components)
                .filter(([_, comp]) => comp.status === 'unhealthy')
                .map(([name]) => name);
            
            return {
                status: 'unhealthy',
                message: `Composants en échec: ${unhealthyComponents.join(', ')}`,
                unhealthyComponents
            };
        } else {
            return {
                status: 'degraded',
                message: 'Fonctionnement dégradé détecté'
            };
        }
    }

    async _publishHealthStatus(healthStatus) {
        try {
            if (!this.app.mqttClient?.connected) {
                return; // Ne pas essayer de publier si MQTT est down
            }

            // ✅ Publier l'état général
            await this.app.mqttClient.publish(
                `${this.bridgeTopic}/health/status`, 
                JSON.stringify(healthStatus.overall), 
                { retain: true }
            );

            // ✅ Publier chaque composant
            for (const [componentName, componentStatus] of Object.entries(healthStatus.components)) {
                await this.app.mqttClient.publish(
                    `${this.bridgeTopic}/health/${componentName}`, 
                    JSON.stringify(componentStatus), 
                    { retain: true }
                );
            }

            // ✅ Publier l'état complet
            await this.app.mqttClient.publish(
                `${this.bridgeTopic}/health/full`, 
                JSON.stringify(healthStatus), 
                { retain: true }
            );

            // ✅ Publier les métriques si ApiHelper disponible
            if (this.app.api && typeof this.app.api.getMetrics === 'function') {
                const metrics = this.app.api.getMetrics();
                await this.app.mqttClient.publish(
                    `${this.bridgeTopic}/metrics`, 
                    JSON.stringify(metrics), 
                    { retain: true }
                );
            }

        } catch (error) {
            logger.error('❌ Erreur lors de la publication health status:', error.message);
        }
    }

    async _publishErrorStatus(error) {
        try {
            const errorStatus = {
                status: 'error',
                message: 'Health check échoué',
                error: error.message,
                timestamp: new Date().toISOString()
            };

            if (this.app.mqttClient?.connected) {
                await this.app.mqttClient.publish(
                    `${this.bridgeTopic}/health/status`, 
                    JSON.stringify(errorStatus), 
                    { retain: true }
                );
            }
        } catch (publishError) {
            logger.error('❌ Impossible de publier l\'erreur health:', publishError.message);
        }
    }

    stop() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }
}

module.exports = HealthMonitor;
