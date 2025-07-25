const axios = require('axios');
const logger = require('../utils/logger');

class IDiamantDevicesHandler {
    constructor(config, tokenData, mqttClient = null) {
        this.tokenData = tokenData;
        this.homeId = null;
        this.bridgeId = null;
        this.devices = new Map();
        this.apiBase = 'https://api.netatmo.com';
        this.mqttClient = mqttClient;
        this.config = config;
    }

    async initialize() {
        // Récupération des home_id et bridge_id
        return axios.get(`${this.apiBase}/api/homesdata`, {
            headers: {
                'Authorization': `Bearer ${this.tokenData.access_token}`,
                'Content-Type': 'application/json'
            }
        }).then(response => {
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

    getDevices() {
        return Array.from(this.devices.values());
    }

    getDevice(deviceId) {
        return this.devices.get(deviceId);
    }

    async updateShutterStatus() {
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

            // Mise à jour des statuts
            nbsModules.forEach(module => {
                const device = this.devices.get(module.id);
                const state = (device.state || (module.current_position === 100) ? 'open' : 'closed');
                if (device) {
                    device.reachable = module.reachable;
                    device.last_seen = module.last_seen;
                    device.is_close = module.current_position === 0;
                    device.is_open = module.current_position === 100;
                    device.state = state;
                    this.devices.set(module.id, device);
                }
            });
            // Mise à jour du statut du bridge
            const bridgeModule = modules.find(module => module.type === 'NBG' && module.id === this.bridgeId);
            if (bridgeModule) {
                this.bridgeReachable = bridgeModule.reachable;
            }
            logger.info('✅ Statuts des volets synchronisés et mis à jour');
            // Publication sur MQTT si le client est initialisé
            if (this.mqttClient) {
                this.publishShutterStatusToMqtt();
            }
            return true;
        }).catch(err => {
            logger.error('❌ Erreur lors de la récupération du statut des volets:', err);
            return false;
        });
    }

    async publishShutterStatusToMqtt() {
        const publishAsync = (topic, message, options) => {
            return new Promise((resolve, reject) => {
                this.mqttClient.publish(topic, message, options, (err) => {
                    if (err) {
                        logger.error(`Erreur publication MQTT sur ${topic}:`, err);
                        reject(err);
                    } else {
                        logger.debug(`MQTT publié: ${topic} => ${message}`);
                        resolve();
                    }
                });
            });
        };

        const tasks = [];
        this.devices.forEach(device => {
            const baseTopic = `${this.config.MQTT_TOPIC_PREFIX}/${device.id}`;
            const attributes = JSON.stringify({
                id: device.id,
                name: device.name,
                reachable: device.reachable,
                last_seen: device.last_seen,
                current_position: device.current_position,
                is_close: device.is_close,
                is_open: device.is_open
            });
            tasks.push(publishAsync(`${baseTopic}/lwt`, (device.reachable ? 'online' : 'offline'), { retain: true }));
            tasks.push(publishAsync(`${baseTopic}/state`, device.state, { retain: true }));
            tasks.push(publishAsync(`${baseTopic}/state_fr`, translate(device.state), { retain: true }));
            tasks.push(publishAsync(`${baseTopic}/name`, translate(device.name), { retain: true }));
            tasks.push(publishAsync(`${baseTopic}/attribute`, attributes, { retain: false }));
        });
        await Promise.all(tasks);
    }


    // Ajoute ici d'autres méthodes pour manipuler les volets

}

translate = (state) => {
    switch (state) {
        case 'open':
            return 'Ouvert';
        case 'closed':
            return 'Fermé';
        case 'opening':
            return 'Ouverture';
        case 'closing':
            return 'Fermeture';
        case 'half':
            return 'Mi-ouvert';
        case 'stopped':
            return 'Arrêté';
        default:
            return 'Inconnu';
    }
}

module.exports = IDiamantDevicesHandler;
