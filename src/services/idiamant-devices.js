const crypto = require('crypto');
const logger = require('../utils/logger');
const NetatmoAuthHelper = require('../token/auth-helper');
const haDiscoveryHelper = require('./ha-discovery-helper');
const { translate, formatDate } = require('../utils/utils');



class IDiamantDevicesHandler {
    constructor(config, mqttClient, apiHelper) {
        this.apiHelper = apiHelper;
        this.homeId = null;
        this.bridgeId = null;
        this.devices = new Map();
        this.persistedStates = new Map(); // États récupérés depuis MQTT
        this.mqttClient = mqttClient;
        this.config = config;
        this.statusInterval = null;
        this.haDiscoveryInterval = null;
        this.HADiscoveryHelper = new haDiscoveryHelper(this.mqttClient, this.config);
        this.authHelper = new NetatmoAuthHelper();
        this.syncInterval = parseInt(config.SYNC_INTERVAL) || 30000;  // 30 secondes par défaut
        this.CMD_MAP = {
            open: 100,
            close: 0,
            half_open: -2,
            stop: -1
        };

    }

    async initialize() {
        logger.info('🔄 Initialisation des appareils iDiamant...');
        // Vérification de la configuration
        const response = await this.apiHelper.get("/homesdata");
        if (response.status !== 200) {
            logger.error('❌ Détails de l\'erreur API:', {
                status: response.error?.status,
                statusText: response.error?.statusText,
                data: response.error?.data,
                url: response.config?.url,
                headers: response.config?.headers
            });
            logger.error('❌ Erreur lors de l\'initialisation des devices Netatmo:', response);
            return false;
        }
        try {
            const homes = response.data.body.homes;
            this.homeId = homes[0].id;
            this.bridgeId = homes[0].modules[0].id;
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
            await this._loadPersistedStates();

            await this.startDiscoveryProcess();
            return true;
        } catch (error) {
            logger.error('❌ Erreur lors de l\'initialisation des appareils iDiamant:', error);
            return false;
        }
    }

    async startDiscoveryProcess() {
        // Publication des composants Home Assistant
        await this._publishHADiscoveryComponents(this.bridgeId);

        if (this.haDiscoveryInterval) {
            clearInterval(this.haDiscoveryInterval);
        }
        this.haDiscoveryInterval = setInterval(() => {
            this._publishHADiscoveryComponents(this.bridgeId);
        }, 6 * 60 * 60 * 1000); // Toutes les 6 heures
    }

    async startShutterStatusUpdate() {
        logger.info('🔄 Démarrage de la mise à jour des volets...');
        // Démarre le timer de publication régulière du statut LWT/volets
        await this._updateShutterStatus();

        if (this.statusInterval) {
            clearInterval(this.statusInterval);
        }
        this.statusInterval = setInterval(() => {
            this._updateShutterStatus();
        }, this.syncInterval); // Utilisation ici au lieu de 20000
    }

    async _publishHADiscoveryComponents(bridgeId) {
        if (!this.config.HA_DISCOVERY) return;
        if (!this.mqttClient) {
            logger.warn('⚠️ Client MQTT non initialisé ou découverte Home Assistant désactivée');
            return;
        }
        if (!bridgeId) {
            logger.warn('⚠️ bridgeId non défini, impossible de publier les composants Home Assistant');
            return;
        }

        logger.info('📡 Publication des composants Home Assistant pour le pont iDiamant...');
        this.HADiscoveryHelper.publishGatewayComponents(bridgeId)
        logger.info('📡 Publication des composants Home Assistant pour les volets...');
        this.devices.forEach(device => {
            this.HADiscoveryHelper.publishShutterComponents(device, bridgeId);
        });
    }

    async _loadPersistedStates() {
        if (!this.mqttClient) {
            logger.warn('⚠️ Client MQTT non initialisé, les états persistés ne seront pas chargés');
            return;
        }

        logger.info('🔄 Chargement des états persistés depuis MQTT...');

        // Configuration du handler pour recevoir les états
        this.mqttClient.setStateHandler((deviceId, state_position) => {
            if (this.devices.has(deviceId)) {
                // state_position doit être un objet {state: ..., position: ...}
                let parsedState = state_position;
                if (typeof state_position === 'string') {
                    try {
                        parsedState = JSON.parse(state_position);
                    } catch (e) {
                        parsedState = {};
                        logger.warn(`⚠️ Impossible de parser l'état persistant pour ${deviceId}: ${state_position}`);
                    }
                }
                if (typeof parsedState === 'object' && parsedState !== null && 'state' in parsedState && 'position' in parsedState) {
                    this.persistedStates.set(deviceId, parsedState);
                    logger.debug(`📥 État persisté récupéré pour ${deviceId}: ${JSON.stringify(parsedState)}`);
                } else {
                    logger.warn(`⚠️ Format d'état persistant invalide pour ${deviceId}: ${JSON.stringify(parsedState)}`);
                }
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

    async sendNetatmoCommand(deviceId, cmd) {
        // Vérifie que le deviceId est valide
        if (!this.devices.has(deviceId)) {
            logger.error(`❌ Device ID ${deviceId} inconnu, impossible d'envoyer la commande`);
            return false;
        }
        const payload = {
            home: {
                id: this.homeId,
                modules: [
                    {
                        id: deviceId,
                        target_position: this.CMD_MAP[cmd],
                        bridge: this.bridgeId
                    }]
            }
        };
        try {
            logger.debug(`Envoi commande Netatmo pour ${deviceId}: ${JSON.stringify(payload)}`);
            await this.apiHelper.post("/setstate", payload);
            logger.info(`Commande Netatmo envoyée pour ${deviceId}: ${cmd}`);
            return true;
        } catch (err) {
            logger.error(`Erreur commande Netatmo pour ${deviceId}:`, err);
            return false;
        }
    }

    async _updateShutterStatus() {
        const getHash = (stateObj) => {
            const stateStr = JSON.stringify(stateObj);
            const hash = crypto.createHash('sha1').update(stateStr).digest('hex');
            return hash;
        };
        const response = await this.apiHelper.get(`/homestatus?home_id=${this.homeId}`);

        if (response.status !== 200 || !response.data) {
            logger.error('❌ Erreur lors de la récupération du statut des devices');
            return false;
        }

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
                if (this.persistedStates.has(module.id)) {
                    const persistedState = this.persistedStates.get(module.id);
                    device.state = persistedState.state || 'stopped';
                    device.current_position = persistedState.position || 50;
                }
                else {
                    device.state = 'stopped';
                    device.current_position = 50;
                }

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
            this._publishShutterStatusToMqtt();
        } else {
            logger.debug('Aucun changement d\'état détecté, pas de publication MQTT');
        }
        return true;
    }

    _publishShutterStatusToMqtt() {
        if (!this.mqttClient) {
            logger.warn('⚠️ Client MQTT non initialisé, impossible de publier les statuts des volets');
            return;
        }
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

        this.devices.forEach(device => {
            const baseTopic = `${this.config.MQTT_TOPIC_PREFIX}/${device.id}`;
            publishAsync(`${baseTopic}/lwt`, (device.reachable ? 'online' : 'offline'), { retain: true });
            publishAsync(`${baseTopic}/name`, String(device.name.charAt(0).toUpperCase() + device.name.slice(1)), { retain: true });
            publishAsync(`${baseTopic}/state_fr`, String(translate(device.state)), { retain: true });
            publishAsync(`${baseTopic}/reachable`, String(device.reachable), { retain: false });
            publishAsync(`${baseTopic}/last_seen`, String(device.last_seen), { retain: true });
            publishAsync(`${baseTopic}/cover_state`, String(device.state == 'half_open' ? 'stopped' : device.state), { retain: true });
        });
    }

    updateDeviceState(deviceId, newState, newPosition) {
        const device = this.devices.get(deviceId);
        if (device) {
            device.state = newState;
            device.position = newPosition;
            this.devices.set(deviceId, device);
            // Mettre à jour également l'état persisté
            this.persistedStates.set(deviceId, { state: newState, position: newPosition });
            logger.debug(`État du device ${deviceId} mis à jour: ${newState}`);
        }
    }

    isCommandValid(command) {
        return Object.prototype.hasOwnProperty.call(this.CMD_MAP, command);
    }

    stop() {
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
            this.statusInterval = null;
        }
        if (this.haDiscoveryInterval) {
            clearInterval(this.haDiscoveryInterval);
            this.haDiscoveryInterval = null;
        }
        // Ajoute ici tout autre timer ou ressource à nettoyer
    }
}

module.exports = IDiamantDevicesHandler;
