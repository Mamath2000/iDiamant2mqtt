const mqtt = require('mqtt');
const logger = require('../utils/logger');

class MQTTClient {
    constructor(config) {
        this.config = config;
        this.client = null;
        this.isConnected = false;
        this.subscriptions = new Map();
        this.publishedDevices = new Set();
    }

    async connect() {
        return new Promise((resolve, reject) => {
            try {
                logger.info('🔌 Connexion au broker MQTT...');

                const options = {
                    clientId: this.config.MQTT_CLIENT_ID,
                    keepalive: this.config.MQTT_KEEPALIVE,
                    clean: true,
                    reconnectPeriod: 5000,
                    connectTimeout: 30000
                };

                // Authentification si configurée
                if (this.config.MQTT_USERNAME) {
                    options.username = this.config.MQTT_USERNAME;
                    options.password = this.config.MQTT_PASSWORD;
                }

                // Will message pour signaler la déconnexion
                options.will = {
                    topic: `${this.config.MQTT_TOPIC_PREFIX}/bridge/lwt`,
                    payload: 'offline',
                    qos: 1,
                    retain: true
                };

                this.client = mqtt.connect(this.config.MQTT_BROKER_URL, options);

                this.client.on('connect', () => {
                    this.isConnected = true;
                    logger.info('✅ Connexion MQTT établie');

                    // Publication du statut en ligne
                    this.publish(`${this.config.MQTT_TOPIC_PREFIX}/bridge/lwt`, 'online', { retain: true });

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
                });

                this.client.on('reconnect', () => {
                    logger.info('🔄 Reconnexion MQTT...');
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
        } else {
            logger.error('❌ Erreur traitement message MQTT:', error);
        }
    }

    handleDeviceCommand(deviceId, topic, message) {
        // Émission d'un événement pour que le contrôleur puisse traiter la commande
        if (this.commandHandler) {
            this.commandHandler(deviceId, topic, message);
        }
    }

    setCommandHandler(handler) {
        this.commandHandler = handler;
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

    // Publication de la configuration Home Assistant Discovery
    async publishHomeAssistantDiscovery(device) {
        try {
            const deviceConfig = {
                name: device.name,
                unique_id: `idiamant_${device.id}`,
                device_class: 'shutter',
                command_topic: `${this.config.MQTT_TOPIC_PREFIX}/${device.id}/set`,
                state_topic: `${this.config.MQTT_TOPIC_PREFIX}/${device.id}/state`,
                position_topic: `${this.config.MQTT_TOPIC_PREFIX}/${device.id}/position`,
                set_position_topic: `${this.config.MQTT_TOPIC_PREFIX}/${device.id}/set_position`,
                payload_open: 'OPEN',
                payload_close: 'CLOSE',
                payload_stop: 'STOP',
                state_open: 'open',
                state_closed: 'closed',
                position_open: 100,
                position_closed: 0,
                optimistic: false,
                retain: true,
                device: {
                    identifiers: [`idiamant_${device.id}`],
                    name: device.name,
                    model: 'iDiamant Shutter',
                    manufacturer: 'Bubendorff',
                    via_device: this.config.HA_DEVICE_NAME
                }
            };

            const discoveryTopic = `${this.config.HA_DISCOVERY_PREFIX}/cover/idiamant_${device.id}/config`;

            await this.publish(discoveryTopic, JSON.stringify(deviceConfig), { retain: true });

            this.publishedDevices.add(device.id);
            logger.info(`🏠 Configuration Home Assistant publiée pour ${device.name}`);

        } catch (error) {
            logger.error(`❌ Erreur publication HA Discovery pour ${device.name}:`, error);
            throw error;
        }
    }

    // Publication du statut d'un volet
    async publishShutterState(deviceId, state, position) {
        try {
            const baseTopic = `${this.config.MQTT_TOPIC_PREFIX}/${deviceId}`;

            await Promise.all([
                this.publish(`${baseTopic}/state`, state, { retain: true }),
                this.publish(`${baseTopic}/position`, position.toString(), { retain: true })
            ]);

            logger.debug(`📡 Statut volet ${deviceId} publié: ${state} (${position}%)`);

        } catch (error) {
            logger.error(`❌ Erreur publication statut volet ${deviceId}:`, error);
            throw error;
        }
    }

    async disconnect() {
        if (this.client && this.isConnected) {
            logger.info('🔌 Déconnexion du client MQTT');

            // Publication du statut hors ligne
            await this.publish(`${this.config.MQTT_TOPIC_PREFIX}/bridge/state`, 'offline', { retain: true });

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
