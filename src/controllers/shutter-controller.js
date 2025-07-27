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

        const getTimerProgress = (deviceId) => {
            const timerObj = this.timers.get(deviceId);
            if (!timerObj) return null;
            const elapsed = Date.now() - timerObj.start;
            const percent = Math.min(100, Math.round((elapsed / timerObj.delay) * 100));
            return percent; // 0 à 100
        }

        if (deviceId === 'bridge') {
            logger.info(`Commande reçue pour le bridge : ${cmd}.`);
            if (cmd === 'refreshToken') {
                await this.devicesHandler.startTokenAutoRefresh(true);
            }
            return;
        }
        const device = this.devicesHandler.getDevice(deviceId);
        if (!device) {
            logger.error(`Volet ${deviceId} introuvable`);
            return;
        }
        if (!Object.prototype.hasOwnProperty.call(CMD_MAP, cmd)) return;

        let current_position = 0;
        // Annule toute transition en cours
        if (this.timers.has(deviceId)) {
            current_position = getTimerProgress(deviceId);
            clearTimeout(this.timers.get(deviceId));
            this.timers.delete(deviceId);
        }

        // 1. Envoi commande API Netatmo
        await this.sendNetatmoCommand(deviceId, cmd);

        // 2. Gestion de l'état intermédiaire et publication
        if (cmd === 'stop') {
            this.publishState(deviceId, 'stopped', current_position);
            return;
        }

        let targetState = getTransition(device.state, cmd);

        // Publication état intermédiaire
        this.publishState(deviceId, targetState.transition_state, current_position);

        if (targetState.delay > 0) {
            const now = Date.now();
            const delay = targetState.delay; // en ms
            this.timers.set(deviceId, {
                timeout: setTimeout(() => {
                    this.publishState(deviceId, targetState.to_state, targetState.courent_position);
                    device.state = targetState.to_state;
                    this.timers.delete(deviceId);
                }, delay),
                start: now,
                delay: delay
            });
            logger.info(`⏳ Transition programmée pour ${deviceId} vers ${targetState.to_state}`);
        } else {
            // Publication immédiate si pas de durée
            this.publishState(deviceId, targetState.to_state, targetState.courent_position);
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

    publishState(deviceId, state, current_position) {
        const baseTopic = `${this.config.MQTT_TOPIC_PREFIX}/${deviceId}`;
        // Publications en mode "fire and forget" - pas d'await
        this.mqttClient.publish(`${baseTopic}/state`, state, { retain: true });
        this.mqttClient.publish(`${baseTopic}/state_fr`, translate(state), { retain: true });
        this.mqttClient.publish(`${baseTopic}/current_position`, current_position, { retain: true });
        this.mqttClient.publish(`${baseTopic}/cover_state`, state == 'half_open' ? 'stopped' : state, { retain: true });

        logger.debug(`État publié pour ${deviceId}: ${state} (${translate(state)})`);

        this.devicesHandler.updateDeviceState(deviceId, state);
        logger.debug(`État mis à jour pour ${deviceId}: ${state}`);
    }

    stop() {
        this.timers.forEach((timer, deviceId) => {
            clearTimeout(timer.timeout);
            this.timers.delete(deviceId);
            logger.info(`Timer pour ${deviceId} arrêté`);
        });
    }
}

const translate = (state) => {
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
                return { delay: 42000, from_state, transition_state: "opening", to_state: "open", current_position: 100 };
            case "close":
                return { delay: 0, from_state, transition_state: "closing", to_state: "closed", current_position: 0 };
            case "half_open":
                return { delay: 3000, from_state, transition_state: "opening", to_state: "half_open", current_position: 20 };
            case "stop":
                return { delay: 0, from_state, transition_state: "stopped", to_state: "stopped", current_position: 20 };
        }
    } else if (from_state === 'open' || from_state === 'opening') {
        switch (cmd) {
            case "open":
                return { delay: 0, from_state, transition_state: "opening", to_state: "open", current_position: 100 };
            case "close":
                return { delay: 42000, from_state, transition_state: "closing", to_state: "closed", current_position: 0 };
            case "half_open":
                return { delay: 48000, from_state, transition_state: "opening", to_state: "half_open", current_position: 20 };
            case "stop":
                return { delay: 0, from_state, transition_state: "stopped", to_state: "stopped", current_position: 20 };
        }
    } else if (from_state === 'half_open') {
        switch (cmd) {
            case "open":
                return { delay: 38000, from_state, transition_state: "opening", to_state: "open", current_position: 100 };
            case "close":
                return { delay: 7000, from_state, transition_state: "closing", to_state: "closed", current_position: 0 };
            case "half_open":
                return { delay: 0, from_state, transition_state: "opening", to_state: "half_open", current_position: 20 };
            case "stop":
                return { delay: 0, from_state, transition_state: "stopped", to_state: "stopped", current_position: 20 };
        }
    } else {
        switch (cmd) {
            case "open":
                return { delay: 42000, from_state, transition_state: "opening", to_state: "open", current_position: 100 };
            case "close":
                return { delay: 42000, from_state, transition_state: "closing", to_state: "closed", current_position: 0 };
            case "half_open":
                return { delay: 48000, from_state, transition_state: "opening", to_state: "half_open", current_position: 20 };
            case "stop":
                return { delay: 0, from_state, transition_state: "stopped", to_state: "stopped", current_position: 20 };
        }
    }
    // Default fallback
    return { delay: 0, from_state, transition_state: "unknown", to_state: "unknown" };
};

module.exports = ShutterController;
