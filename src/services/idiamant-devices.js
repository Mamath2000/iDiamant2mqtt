const crypto = require('crypto');
const axios = require('axios');
const logger = require('../utils/logger');
const NetatmoAuthHelper = require('../token/auth-helper');
const haDiscoveryHelper = require('./ha-discovery-helper');
const { formatDate } = require('../utils/date');

class IDiamantDevicesHandler {
    constructor(config, tokenData, mqttClient = null) {
        this.tokenData = tokenData;
        this.homeId = null;
        this.bridgeId = null;
        this.devices = new Map();
        this.persistedStates = new Map(); // États récupérés depuis MQTT
        this.apiBase = 'https://api.netatmo.com';
        this.mqttClient = mqttClient;
        this.config = config;
        this.statusInterval = null;
        this.haDiscoveryInterval = null;
        this.HADiscoveryHelper = new haDiscoveryHelper(this.mqttClient, this.config);
        this.authHelper = new NetatmoAuthHelper();
        this.authHelper.setTokenRefreshHandler(this.tokenRefreshHandler.bind(this));
    }

    async initialize() {
        // Récupération des home_id et bridge_id
        return axios.get(`${this.apiBase}/api/homesdata`, {
            headers: {
                'Authorization': `Bearer ${this.tokenData.access_token}`,
                'Content-Type': 'application/json'
            }
        }).then(async (response) => {
            const homes = response.data.body.homes;
            if (!homes || homes.length === 0) {
                logger.error('Aucune maison Netatmo trouvée.');
                return false;
            }
            this.homeId = homes[0].id;
            this.bridgeId = homes[0].modules && homes[0].modules.length > 0 ? homes[0].modules[0].id : null;
            logger.debug(`🏠 home_id: ${this.homeId}`);
            logger.debug(`🔗 bridge_id: ${this.bridgeId}`);
            // Découverte des volets (modules de type "Bubendorff")
            this.devices.clear();
            homes[0].modules.forEach(module => {
                if (module.type && module.type === 'NBS') {
                    this.devices.set(module.id, {
                        id: module.id,
                        name: module.name.toLowerCase().replace(/volet/g, '').trim(),
                        type: module.type,
                        room_id: module.room_id
                    });
                }
            });
            logger.info(`🔍 ${this.devices.size} volets Bubendorff découverts`);

            // Récupération des états persistés depuis MQTT si disponible
            if (this.mqttClient) {
                await this.loadPersistedStates();
            } else {
                logger.warn('⚠️ Client MQTT non initialisé, les états persistés ne seront pas chargés');
            }

            // Démarre le timer de publication régulière du statut LWT/volets
            if (this.statusInterval) {
                clearInterval(this.statusInterval);
            }
            this.statusInterval = setInterval(() => {
                if (this.mqttClient) {
                    this.updateShutterStatus();
                }
            }, 20000); // 20 secondes

            // Publication des composants Home Assistant
            if (this.haDiscoveryInterval) {
                clearInterval(this.haDiscoveryInterval);
            }
            if (this.mqttClient && this.bridgeId) {
                await this.publishHADiscoveryComponents(this.bridgeId);
            }
            this.haDiscoveryInterval = setInterval(() => {
                if (this.mqttClient && this.bridgeId) {
                    this.publishHADiscoveryComponents(this.bridgeId);
                }
            }, 600000); // 10 minutes

            return this.updateShutterStatus()
                .then(() => {
                    logger.debug(`🔍 ${this.devices.size} l'état des volets Bubendorff découverts`);
                    return true;
                }).catch(err => {
                    logger.error('Erreur lors de la mise à jour de l\'état des volets:', err);
                    return false;
                });
        }).catch(err => {
            logger.error('❌ Erreur lors de l\'initialisation des devices Netatmo:', err);
            return false;
        });
    }

    async publishHADiscoveryComponents(bridgeId) {
        if (!this.mqttClient) {
            logger.warn('⚠️ Client MQTT non initialisé ou découverte Home Assistant désactivée');
            return;
        } 
        if (!this.config.HA_DISCOVERY) return;
        
        logger.info('📡 Publication des composants Home Assistant pour le pont Idéamant...');
        this.HADiscoveryHelper.publishGatewayComponents(bridgeId)
        logger.info('📡 Publication des composants Home Assistant pour les volets...');
        this.devices.forEach(device => {
            this.HADiscoveryHelper.publishShutterComponents(device, bridgeId);
        });
    }

    async loadPersistedStates() {
        if (!this.mqttClient) return;

        logger.info('🔄 Chargement des états persistés depuis MQTT...');

        // Configuration du handler pour recevoir les états
        this.mqttClient.setStateHandler((deviceId, state) => {
            if (this.devices.has(deviceId)) {
                this.persistedStates.set(deviceId, state);
                logger.debug(`📥 État persisté récupéré pour ${deviceId}: ${state}`);
            }
        });

        // Souscription aux topics d'état
        const deviceIds = Array.from(this.devices.keys());
        if (deviceIds.length > 0) {
            try {
                await this.mqttClient.subscribeToPersistedStates(deviceIds);
                logger.info(`✅ ${this.persistedStates.size} états persistés récupérés`);
            } catch (error) {
                logger.warn('⚠️ Erreur lors de la récupération des états persistés:', error);
            }
        }
    }

    getDevices() {
        return Array.from(this.devices.values());
    }

    getDevice(deviceId) {
        return this.devices.get(deviceId);
    }

    async updateShutterStatus() {
        const getHash = (stateObj) => {
            const stateStr = JSON.stringify(stateObj);
            const hash = crypto.createHash('sha1').update(stateStr).digest('hex');
            return hash;
        };

        if (!this.homeId) {
            logger.error('homeId non initialisé, impossible de récupérer le statut des volets.');
            return Promise.resolve(false);
        }
        return axios.get(`${this.apiBase}/api/homestatus?home_id=${this.homeId}`, {
            headers: {
                'Authorization': `Bearer ${this.tokenData.access_token}`,
                'Content-Type': 'application/json'
            }
        }).then(response => {
            const modules = response.data.body?.home?.modules || [];
            // Synchronisation de la liste des volets (NBS)
            const nbsModules = modules.filter(module => module.type === 'NBS');
            let devicesUpdated = false;

            // Mise à jour des statuts
            nbsModules.forEach(module => {
                const device = this.devices.get(module.id);
                const oldHash = getHash(device);
                if (device) {
                    device.reachable = module.reachable;
                    device.last_seen = module.last_seen;
                    device.is_close = module.current_position === 0;
                    device.is_open = module.current_position === 100;
                    device.current_position = module.current_position;
                    device.state = this.persistedStates.get(module.id);

                    if (oldHash !== getHash(device)) {
                        devicesUpdated = true;
                        this.devices.set(module.id, device);
                    }
                }
            });
            // Mise à jour du statut du bridge
            const bridgeModule = modules.find(module => module.type === 'NBG' && module.id === this.bridgeId);
            if (bridgeModule && bridgeModule.reachable !== this.bridgeReachable) {
                this.bridgeReachable = bridgeModule.reachable;
                devicesUpdated = true;
            }

            if (devicesUpdated) {
                logger.info('✅ Statuts des volets synchronisés et mis à jour (diff détectée, publication MQTT)');
                if (this.mqttClient) {
                    this.publishShutterStatusToMqtt();
                }
            } else {
                logger.debug('Aucun changement d\'état détecté, pas de publication MQTT');
            }
            return true;
        }).catch(err => {
            logger.error('❌ Erreur lors de la récupération du statut des volets:', err);
            return false;
        });
    }
    startTokenAutoRefresh(force = false) {
        if (this.tokenData && this.tokenData.refresh_token && this.tokenData.expires_in && this.tokenData.timestamp) {
            this.authHelper.startTokenAutoRefresh(this.tokenData, force);
            logger.info('🔄 Redémarrage du rafraîchissement automatique du token Netatmo...');
        }
    }

    tokenRefreshHandler(newTokenData) {
        this.tokenData = newTokenData;
        logger.info('🔄 Token Netatmo mis à jour dans devicesHandler via callback.');
        if (this.mqttClient) {
            this.mqttClient.publish(`${this.config.MQTT_TOPIC_PREFIX}/bridge/expire_date`, formatDate(this.tokenData.timestamp + (this.tokenData.expires_in * 1000)), { retain: true });
            this.mqttClient.publish(`${this.config.MQTT_TOPIC_PREFIX}/bridge/expire_at_ts`, String(this.tokenData.timestamp + (this.tokenData.expires_in * 1000)), { retain: true });
        }
    }

    publishShutterStatusToMqtt() {
        const publishAsync = (topic, message, options) => {
            this.mqttClient.publish(topic, message, options, (err) => {
                if (err) {
                    logger.error(`Erreur publication MQTT sur ${topic}:`, err);
                } else {
                    logger.debug(`MQTT publié: ${topic} => ${message}`);
                }
            });
        };

        // Publication des états des volets (send and forget)
        publishAsync(`${this.config.MQTT_TOPIC_PREFIX}/bridge/lwt`, (this.bridgeReachable ? 'online' : 'offline'), { retain: true });
        this.mqttClient.publish(`${this.config.MQTT_TOPIC_PREFIX}/bridge/expire_date`, formatDate(this.tokenData.timestamp + (this.tokenData.expires_in * 1000)), { retain: true });
        this.mqttClient.publish(`${this.config.MQTT_TOPIC_PREFIX}/bridge/expire_at_ts`, String(this.tokenData.timestamp + (this.tokenData.expires_in * 1000)), { retain: true });

        this.devices.forEach(device => {
            const baseTopic = `${this.config.MQTT_TOPIC_PREFIX}/${device.id}`;
            publishAsync(`${baseTopic}/lwt`, (device.reachable ? 'online' : 'offline'), { retain: true });
            publishAsync(`${baseTopic}/name`, String(device.name.charAt(0).toUpperCase() + device.name.slice(1)), { retain: true });
            // publishAsync(`${baseTopic}/state`, String(device.state), { retain: true });
            publishAsync(`${baseTopic}/state_fr`, String(translate(device.state)), { retain: true });
            publishAsync(`${baseTopic}/reachable`, String(device.reachable), { retain: false });
            publishAsync(`${baseTopic}/last_seen`, String(device.last_seen), { retain: true });
            publishAsync(`${baseTopic}/is_close`, String(device.is_close), { retain: true });
            publishAsync(`${baseTopic}/is_open`, String(device.is_open), { retain: true });
            publishAsync(`${baseTopic}/current_position`, String(device.current_position), { retain: true });
        });
    }

    updateDeviceState(deviceId, newState) {
        const device = this.devices.get(deviceId);
        if (device) {
            device.state = newState;
            this.devices.set(deviceId, device);
            // Mettre à jour également l'état persisté
            this.persistedStates.set(deviceId, newState);
            logger.debug(`État du device ${deviceId} mis à jour: ${newState}`);
        }
    }

}


const translate = (state) => {
    switch (state) {
        case 'open':
            return 'Ouvert';
        case 'closed':
            return 'Fermé';
        case 'opening':
            return 'Ouverture';
        case 'closing':
            return 'Fermeture';
        case 'half_open':
            return 'Mi-ouvert';
        case 'stopped':
            return 'Arrêté';
        default:
            return 'Inconnu';
    }
}

module.exports = IDiamantDevicesHandler;
