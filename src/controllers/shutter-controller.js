const logger = require('../utils/logger');
const { translate, getTransition } = require('../utils/utils');

// const CMD_MAP = {
//     open: 100,
//     close: 0,
//     half_open: -2,
//     stop: -1
// };

class ShutterController {
    constructor(config, mqttClient, devicesHandler) {
        this.devicesHandler = devicesHandler;
        this.mqttClient = mqttClient;
        this.config = config;
        this.timers = new Map(); // deviceId -> timer
    }
    checkDevices() {
        logger.info('🔍 Vérification des appareils Netatmo...');
        this.devicesHandler.getDevices().forEach(device => {
            const deviceState = this.devicesHandler.persistedStates.get(device.id);
            if (!deviceState || deviceState.state == '' || parseInt(deviceState.position) < 0 || isNaN(parseInt(deviceState.position))) {
                logger.warn(`⚠️ Appareil ${device.name} (ID: ${device.id}) n'a pas d'état ou de position définie. On va fermer le volet.`);
                this.handleCommand(device.id, 'close');
            } else {
                logger.info(`✅ Appareil ${device.name} (ID: ${device.id}) est prêt avec l'état "${deviceState.state}" et la position ${deviceState.position}`);
            }
        });
    }

    listenCommands() {
        // Abonnement au topic de commande

        let topic = `${this.config.MQTT_TOPIC_PREFIX}/+/cmd`;
        this.mqttClient.subscribe(topic, (err) => {
            if (err) {
                logger.error('Erreur abonnement au topic de commande:', err);
                return;
            }
            logger.info(`Abonnement réussi au topic de commande: ${topic}`);
        });
        this.mqttClient.setCommandHandler(async (deviceId, topic, message) => {
            if (parseInt(deviceId) > 0 && this.devicesHandler.isCommandValid(message)) {
                try {
                    await this.handleCommand(deviceId, message);
                } catch (err) {
                    logger.error(`Erreur lors du traitement de la commande ${message} pour ${deviceId}:`, err);
                }
            } else {
                logger.warn(`Commande reçue: device ${deviceId}, ou commande ${message} invalide.`);
            }
        });
    }

    async handleCommand(deviceId, cmd) {
        const device = this.devicesHandler.getDevice(deviceId);
        if (!device) {
            logger.error(`Volet ${deviceId} introuvable`);
            return;
        }

        let current_position = device.current_position || 0;
        // Annule toute transition en cours
        if (this.timers.has(deviceId)) {
            const timerObj = this.timers.get(deviceId);
            current_position = Math.min(100, Math.round(((Date.now() - timerObj.start) / timerObj.delay) * 100));
            clearTimeout(timerObj.timeout);
            this.timers.delete(deviceId);
        }

        // 1. Envoi commande API Netatmo
        if (!await this.devicesHandler.sendNetatmoCommand(deviceId, cmd)) {
            logger.error(`❌ Échec de l'envoi de la commande ${cmd} pour ${deviceId}`);
            return;
        }

        // 2. Gestion de l'état intermédiaire et publication
        if (cmd === 'stop') {
            this.publishState(deviceId, 'stopped', current_position);
            return;
        }

        let targetState = getTransition(device.state, current_position, cmd);

        // Publication état intermédiaire
        this.publishState(deviceId, targetState.transition_state, current_position);

        if (targetState.delay > 0) {
            const now = Date.now();
            const delay = targetState.delay; // en ms
            this.timers.set(deviceId, {
                timeout: setTimeout(() => {
                    this.publishState(deviceId, targetState.to_state, targetState.target_position);
                    device.state = targetState.to_state;
                    this.timers.delete(deviceId);
                }, delay),
                start: now,
                delay: delay
            });
            logger.info(`⏳ Transition programmée pour ${deviceId} vers ${targetState.to_state}`);
        } else {
            // Publication immédiate si pas de durée
            this.publishState(deviceId, targetState.to_state, targetState.target_position);
            // device.state = targetState.to_state;
        }
    }

    // async _sendNetatmoCommand(deviceId, cmd) {
    //     const payload = {
    //         home: {
    //             id: this.devicesHandler.homeId,
    //             modules: [
    //                 {
    //                     id: deviceId,
    //                     target_position: CMD_MAP[cmd],
    //                     bridge: this.devicesHandler.bridgeId
    //                 }]
    //         }
    //     };
    //     try {
    //         logger.debug(`Envoi commande Netatmo pour ${deviceId}: ${JSON.stringify(payload)}`);
    //         await this.apiHelper.post("/setstate", payload);
    //         logger.info(`Commande Netatmo envoyée pour ${deviceId}: ${cmd}`);
    //         return true;
    //     } catch (err) {
    //         logger.error(`Erreur commande Netatmo pour ${deviceId}:`, err);
    //         return false;
    //     }
    // }

    publishState(deviceId, state, current_position) {
        const baseTopic = `${this.config.MQTT_TOPIC_PREFIX}/${deviceId}`;
        // Publications en mode "fire and forget" - pas d'await
        this.mqttClient.publish(`${baseTopic}/state`, JSON.stringify({ state: state, position: current_position }), { retain: true });
        this.mqttClient.publish(`${baseTopic}/state_fr`, translate(state), { retain: true });
        // this.mqttClient.publish(`${baseTopic}/current_position`, String(current_position), { retain: true });
        this.mqttClient.publish(`${baseTopic}/cover_state`, state == 'half_open' ? 'stopped' : state, { retain: true });

        logger.debug(`État publié pour ${deviceId}: ${state} (${translate(state)})`);

        this.devicesHandler.updateDeviceState(deviceId, state, current_position);
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




module.exports = ShutterController;
