const axios = require('axios');
const logger = require('../utils/logger');

const CMD_MAP = {
    open: 100,
    close: 0,
    half_open: -2,
    stop: -1
};

class ShutterController {
    constructor(devicesHandler, mqttClient, config) {
        this.devicesHandler = devicesHandler;
        this.mqttClient = mqttClient;
        this.config = config;
        this.timers = new Map(); // deviceId -> timer
    }

    listenCommands() {
        const topic = `${this.config.MQTT_TOPIC_PREFIX}/+/cmd`;
        this.mqttClient.subscribe(topic, (err) => {
            if (err) {
                logger.error('Erreur abonnement au topic de commande:', err);
                return;
            }
            logger.info(`Abonnement réussi au topic de commande: ${topic}`);
        });
        this.mqttClient.setCommandHandler(async (deviceId, topic, message) => {
            try {
                await this.handleCommand(deviceId, message);
            } catch (err) {
                logger.error(`Erreur lors du traitement de la commande ${message} pour ${deviceId}:`, err);
            }
        });
    }

    async handleCommand(deviceId, cmd) {
        const device = this.devicesHandler.getDevice(deviceId);
        if (!device) {
            logger.error(`Volet ${deviceId} introuvable`);
            return;
        }
        if (!Object.prototype.hasOwnProperty.call(CMD_MAP, cmd)) return;

        // Annule toute transition en cours
        if (this.timers.has(deviceId)) {
            clearTimeout(this.timers.get(deviceId));
            this.timers.delete(deviceId);
        }

        // 1. Envoi commande API Netatmo
        await this.sendNetatmoCommand(deviceId, cmd);

        // 2. Gestion de l'état intermédiaire et publication
        if (cmd === 'stop') {
            this.publishState(deviceId, 'stopped');
            return;
        }

        let targetState = getTransition(device.state, cmd);

        // Publication état intermédiaire
        this.publishState(deviceId, targetState.transition_state);

        if (targetState.delay > 0) {
            this.timers.set(deviceId, setTimeout(() => {
                this.publishState(deviceId, targetState.to_state);
                // Mise à jour de l'état du device dans le handler
                device.state = targetState.to_state;
                this.timers.delete(deviceId);
            }, targetState.delay)); // Convertit en millisecondes
            logger.info(`⏳ Transition programmée pour ${deviceId} vers ${targetState.to_state}`);
        } else {
            // Publication immédiate si pas de durée
            this.publishState(deviceId, targetState.to_state);
            device.state = targetState.to_state;
        }
    }

    async sendNetatmoCommand(deviceId, cmd) {
        const payload = {
            home: {
                id: this.devicesHandler.homeId,
                modules: [
                    {
                        id: deviceId,
                        target_position: CMD_MAP[cmd],
                        bridge: this.devicesHandler.bridgeId
                    }
                ]
            }
        };
        try {
            logger.debug(`Envoi commande Netatmo pour ${deviceId}: ${JSON.stringify(payload)}`);
            await axios.post(`${this.devicesHandler.apiBase}/api/setstate`, payload, {
                headers: {
                    'Authorization': `Bearer ${this.devicesHandler.tokenData.access_token}`,
                    'Content-Type': 'application/json'
                }
            });
            logger.info(`Commande Netatmo envoyée pour ${deviceId}: ${cmd}`);
        } catch (err) {
            logger.error(`Erreur commande Netatmo pour ${deviceId}:`, err);
        }
    }

    publishState(deviceId, state) {
        const baseTopic = `${this.config.MQTT_TOPIC_PREFIX}/${deviceId}`;
        // Publications en mode "fire and forget" - pas d'await
        this.mqttClient.publish(`${baseTopic}/state`, state, { retain: true });
        this.mqttClient.publish(`${baseTopic}/state_fr`, translate(state), { retain: true });
        logger.debug(`État publié pour ${deviceId}: ${state} (${translate(state)})`);
        
        this.devicesHandler.updateDeviceState(deviceId, state);
        logger.debug(`État mis à jour pour ${deviceId}: ${state}`);
    }
}

const translate = (state) =>  {
    switch (state) {
        case 'open': return 'Ouvert';
        case 'closed': return 'Fermé';
        case 'opening': return 'Ouverture';
        case 'closing': return 'Fermeture';
        case 'half_open': return 'Mi-ouvert';
        case 'stopped': return 'Arrêté';
        default: return 'Inconnu';
    }
}


const getTransition = (from_state, cmd) => {
    if (from_state === 'closed' || from_state === 'closing') {
        switch (cmd) {
            case "open":
                return { delay: 42000, from_state, transition_state: "opening", to_state: "open" };
            case "close":
                return { delay: 0, from_state, transition_state: "closing", to_state: "closed" };
            case "half_open":
                return { delay: 3000, from_state, transition_state: "opening", to_state: "half_open" };
            case "stop":
                return { delay: 0, from_state, transition_state: "stopped", to_state: "stopped" };
        }
    } else if (from_state === 'open' || from_state === 'opening') {
        switch (cmd) {
            case "open":
                return { delay: 0, from_state, transition_state: "opening", to_state: "open" };
            case "close":
                return { delay: 42000, from_state, transition_state: "closing", to_state: "closed" };
            case "half_open":
                return { delay: 48000, from_state, transition_state: "opening", to_state: "half_open" };
            case "stop":
                return { delay: 0, from_state, transition_state: "stopped", to_state: "stopped" };
        }
    } else if (from_state === 'half_open') {
        switch (cmd) {
            case "open":
                return { delay: 38000, from_state, transition_state: "opening", to_state: "open" };
            case "close":
                return { delay: 7000, from_state, transition_state: "closing", to_state: "closed" };
            case "half_open":
                return { delay: 0, from_state, transition_state: "opening", to_state: "half_open" };
            case "stop":
                return { delay: 0, from_state, transition_state: "stopped", to_state: "stopped" };
        }
    } else {
        switch (cmd) {
            case "open":
                return { delay: 42000, from_state, transition_state: "opening", to_state: "open" };
            case "close":
                return { delay: 42000, from_state, transition_state: "closing", to_state: "closed" };
            case "half_open":
                return { delay: 48000, from_state, transition_state: "opening", to_state: "half_open" };
            case "stop":
                return { delay: 0, from_state, transition_state: "stopped", to_state: "stopped" };
        }
    }
    // Default fallback
    return { delay: 0, from_state, transition_state: "unknown", to_state: "unknown" };
};

module.exports = ShutterController;
