const mqtt = require('mqtt');
const logger = require('../utils/logger');

class MQTTClient {
    constructor(config) {
        this.config = { ...config };
        this.client = null;
        this.isConnected = false;
        this.subscriptions = new Map();
        this.publishedDevices = new Set();

        // Génère un suffixe numérique aléatoire pour rendre le clientId unique
        const randomSuffix = Math.floor(Math.random() * 1000000);
        if (this.config.MQTT_CLIENT_ID) {
            this.config.MQTT_CLIENT_ID = `${this.config.MQTT_CLIENT_ID}-${randomSuffix}`;
        } else {
            this.config.MQTT_CLIENT_ID = `idiamant2mqtt-${randomSuffix}`;
        }
    }

    async connect() {
        return new Promise((resolve, reject) => {
            try {
                logger.info('🔌 Connexion au broker MQTT...');

                const options = {
                    clientId: this.config.MQTT_CLIENT_ID,
                    keepalive: this.config.MQTT_KEEPALIVE,
                    clean: false, // Changé à false pour garder les souscriptions
                    reconnectPeriod: 5000,
                    connectTimeout: 300000, // 5 minutes
                    protocolVersion: 4 // Force MQTT 3.1.1
                };

                // Authentification si configurée
                if (this.config.MQTT_USERNAME) {
                    options.username = this.config.MQTT_USERNAME;
                    options.password = this.config.MQTT_PASSWORD;
                }

                // Will message pour signaler la déconnexion
                options.will = {
                    topic: `${this.config.MQTT_TOPIC_PREFIX}/lwt`,
                    payload: 'offline',
                    qos: 1,
                    retain: true
                };

                this.client = mqtt.connect(this.config.MQTT_BROKER_URL, options);

                this.client.on('connect', () => {
                    this.isConnected = true;
                    logger.info('✅ Connexion MQTT établie');

                    // Publication du statut en ligne
                    this.publish(`${this.config.MQTT_TOPIC_PREFIX}/lwt`, 'online', { retain: true });

                    resolve();
                });

                this.client.on('error', (error) => {
                    logger.error('❌ Erreur MQTT:', error);
                    if (!this.isConnected) {
                        reject(error);
                    }
                });

                this.client.on('close', () => {
                    this.isConnected = false;
                    logger.warn('⚠️ Connexion MQTT fermée');
                    // Log détaillé pour diagnostiquer
                    logger.debug('Détails fermeture MQTT - subscriptions actives:', Array.from(this.subscriptions.keys()));
                });

                this.client.on('reconnect', () => {
                    logger.info('🔄 Reconnexion MQTT...');
                });

                this.client.on('disconnect', (packet) => {
                    logger.warn('⚠️ Déconnexion MQTT reçue:', packet);
                });

                this.client.on('offline', () => {
                    logger.warn('⚠️ Client MQTT hors ligne');
                });

                this.client.on('message', (topic, message, packet) => {
                    this.handleMessage(topic, message, packet);
                });

            } catch (error) {
                logger.error('❌ Erreur de connexion MQTT:', error);
                reject(error);
            }
        });
    }

    handleMessage(topic, message, packet) {

        const messageStr = message.toString();
        logger.debug(`📥 Message MQTT reçu sur ${topic}: ${messageStr}`);

        // Traitement des messages de commande pour /set et /cmd
        const [, deviceId, last] = topic.split('/');
        if (last === 'cmd' && deviceId) {
            this.handleDeviceCommand(deviceId, topic, messageStr);
        } else if (last === 'state' && deviceId) {
            // Message d'état récupéré lors de la souscription (état persisté)
            this.handleStateMessage(deviceId, messageStr, packet);
        } else {
            logger.debug(`Message MQTT ignoré sur ${topic}`);
        }
    }

    handleDeviceCommand(deviceId, topic, message) {
        // Émission d'un événement pour que le contrôleur puisse traiter la commande
        if (this.commandHandler) {
            this.commandHandler(deviceId, topic, message);
        }
    }

    handleStateMessage(deviceId, state, packet) {
        // Traitement des messages d'état récupérés (pour la persistance)
        if (this.stateHandler && packet.retain) {
            this.stateHandler(deviceId, state);
        }
    }

    setCommandHandler(handler) {
        this.commandHandler = handler;
    }

    setStateHandler(handler) {
        this.stateHandler = handler;
    }

    async publish(topic, payload, options = {}) {
        if (!this.isConnected) {
            logger.error('❌ Client MQTT non connecté, impossible de publier sur', topic);
            return Promise.reject(new Error('Client MQTT non connecté'));
        }

        const publishOptions = {
            qos: options.qos || 0,
            retain: options.retain || false
        };

        return new Promise((resolve, reject) => {
            this.client.publish(topic, payload, publishOptions, (error) => {
                if (error) {
                    logger.error(`❌ Erreur publication MQTT sur ${topic}:`, error);
                    reject(error);
                } else {
                    logger.debug(`📤 Message MQTT publié sur ${topic}: ${payload}`);
                    resolve();
                }
            });
        });
    }

    async subscribe(topic, options = {}) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                reject(new Error('Client MQTT non connecté'));
                return;
            }

            const subscribeOptions = {
                qos: options.qos || 0
            };

            this.client.subscribe(topic, subscribeOptions, (error, granted) => {
                if (error) {
                    logger.error(`❌ Erreur souscription MQTT à ${topic}:`, error);
                    reject(error);
                } else {
                    logger.info(`📥 Souscription MQTT à ${topic} réussie`);
                    this.subscriptions.set(topic, subscribeOptions);
                    resolve(granted);
                }
            });
        });
    }

    async unsubscribe(topic) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                reject(new Error('Client MQTT non connecté'));
                return;
            }

            this.client.unsubscribe(topic, (error) => {
                if (error) {
                    logger.error(`❌ Erreur désouscription MQTT de ${topic}:`, error);
                    reject(error);
                } else {
                    logger.info(`📤 Désouscription MQTT de ${topic} réussie`);
                    this.subscriptions.delete(topic);
                    resolve();
                }
            });
        });
    }

    async subscribeToPersistedStates(deviceIds) {
        logger.info('📥 Récupération des états persistés depuis MQTT...');
        const subscribePromises = [];
        
        for (const deviceId of deviceIds) {
            const stateTopic = `${this.config.MQTT_TOPIC_PREFIX}/${deviceId}/state`;
            subscribePromises.push(this.subscribe(stateTopic));
        }
        
        try {
            await Promise.all(subscribePromises);
            
            // Attendre un délai plus long pour recevoir les messages retained
            return new Promise(resolve => {
                setTimeout(() => {
                    logger.info('📥 Récupération des états persistés terminée');
                    // Ne plus se désabonner automatiquement - garder les souscriptions actives
                    resolve();
                }, 3000); // Augmenté à 3 secondes
            });
        } catch (error) {
            logger.error('❌ Erreur lors de la souscription aux états persistés:', error);
            throw error;
        }
    }

    async unsubscribeFromStates(deviceIds) {
        for (const deviceId of deviceIds) {
            const stateTopic = `${this.config.MQTT_TOPIC_PREFIX}/${deviceId}/state`;
            try {
                await this.unsubscribe(stateTopic);
            } catch (error) {
                logger.warn(`⚠️ Erreur lors de la désouscription de ${stateTopic}:`, error);
            }
        }
    }

    async disconnect() {
        if (this.client && this.isConnected) {
            logger.info('🔌 Déconnexion du client MQTT');

            // Publication du statut hors ligne
            await this.publish(`${this.config.MQTT_TOPIC_PREFIX}/bridge/state`, 'offline', { retain: true });

            // Désouscription de tous les topics souscrits
            for (const topic of this.subscriptions.keys()) {
                try {
                    await this.unsubscribe(topic);
                } catch (error) {
                    logger.warn(`⚠️ Erreur lors de la désouscription de ${topic}:`, error);
                }
            }

            return new Promise((resolve) => {
                this.client.end(false, {}, () => {
                    this.isConnected = false;
                    logger.info('✅ Déconnexion MQTT terminée');
                    resolve();
                });
            });
        }
    }
}

module.exports = MQTTClient;
