const logger = require('../utils/logger');
const cron = require('node-cron');

class ShutterController {
  constructor(idiamantClient, mqttClient, config) {
    this.idiamantClient = idiamantClient;
    this.mqttClient = mqttClient;
    this.config = config;
    this.deviceStates = new Map();
    this.syncTask = null;
    this.isRunning = false;
  }

  async start() {
    try {
      logger.info('🎛️ Démarrage du contrôleur de volets...');
      
      // Configuration du gestionnaire de commandes MQTT
      this.mqttClient.setCommandHandler(this.handleMQTTCommand.bind(this));
      
      // Découverte et configuration des dispositifs
      await this.setupDevices();
      
      // Démarrage de la synchronisation périodique
      this.startPeriodicSync();
      
      this.isRunning = true;
      logger.info('✅ Contrôleur de volets démarré');
      
    } catch (error) {
      logger.error('❌ Erreur démarrage contrôleur:', error);
      throw error;
    }
  }

  async setupDevices() {
    try {
      const devices = this.idiamantClient.getDevices();
      logger.info(`🔧 Configuration de ${devices.length} dispositifs...`);
      
      for (const device of devices) {
        // Publication de la configuration Home Assistant
        await this.mqttClient.publishHomeAssistantDiscovery(device);
        
        // Souscription aux commandes pour ce dispositif
        await this.subscribeToDeviceCommands(device.id);
        
        // Synchronisation initiale de l'état
        await this.syncDeviceState(device.id);
        
        logger.info(`✅ Dispositif ${device.name} configuré`);
      }
      
    } catch (error) {
      logger.error('❌ Erreur configuration dispositifs:', error);
      throw error;
    }
  }

  async subscribeToDeviceCommands(deviceId) {
    try {
      const baseTopic = `${this.config.MQTT_TOPIC_PREFIX}/${deviceId}`;
      
      // Souscription aux commandes de base (OPEN, CLOSE, STOP)
      await this.mqttClient.subscribe(`${baseTopic}/set`);
      
      // Souscription aux commandes de position
      await this.mqttClient.subscribe(`${baseTopic}/set_position`);
      
      logger.debug(`📥 Souscriptions MQTT configurées pour ${deviceId}`);
      
    } catch (error) {
      logger.error(`❌ Erreur souscription dispositif ${deviceId}:`, error);
      throw error;
    }
  }

  async handleMQTTCommand(deviceId, topic, message) {
    try {
      logger.info(`🎛️ Commande reçue pour ${deviceId}: ${message}`);
      
      const device = this.idiamantClient.getDevice(deviceId);
      if (!device) {
        logger.warn(`⚠️ Dispositif inconnu: ${deviceId}`);
        return;
      }
      
      if (topic.includes('/set_position')) {
        // Commande de position
        const position = parseInt(message);
        if (isNaN(position) || position < 0 || position > 100) {
          logger.warn(`⚠️ Position invalide pour ${deviceId}: ${message}`);
          return;
        }
        
        await this.setShutterPosition(deviceId, position);
        
      } else if (topic.includes('/set')) {
        // Commandes de base
        switch (message.toUpperCase()) {
          case 'OPEN':
            await this.openShutter(deviceId);
            break;
          case 'CLOSE':
            await this.closeShutter(deviceId);
            break;
          case 'STOP':
            await this.stopShutter(deviceId);
            break;
          default:
            logger.warn(`⚠️ Commande inconnue pour ${deviceId}: ${message}`);
        }
      }
      
    } catch (error) {
      logger.error(`❌ Erreur traitement commande ${deviceId}:`, error);
    }
  }

  async openShutter(deviceId) {
    try {
      logger.info(`🔼 Ouverture du volet ${deviceId}`);
      
      await this.idiamantClient.controlShutter(deviceId, 'open');
      
      // Mise à jour immédiate de l'état (optimiste)
      await this.updateDeviceState(deviceId, 'opening', null);
      
      // Synchronisation différée pour obtenir l'état réel
      setTimeout(() => this.syncDeviceState(deviceId), 2000);
      
    } catch (error) {
      logger.error(`❌ Erreur ouverture volet ${deviceId}:`, error);
      throw error;
    }
  }

  async closeShutter(deviceId) {
    try {
      logger.info(`🔽 Fermeture du volet ${deviceId}`);
      
      await this.idiamantClient.controlShutter(deviceId, 'close');
      
      // Mise à jour immédiate de l'état (optimiste)
      await this.updateDeviceState(deviceId, 'closing', null);
      
      // Synchronisation différée pour obtenir l'état réel
      setTimeout(() => this.syncDeviceState(deviceId), 2000);
      
    } catch (error) {
      logger.error(`❌ Erreur fermeture volet ${deviceId}:`, error);
      throw error;
    }
  }

  async stopShutter(deviceId) {
    try {
      logger.info(`⏹️ Arrêt du volet ${deviceId}`);
      
      await this.idiamantClient.controlShutter(deviceId, 'stop');
      
      // Synchronisation immédiate pour obtenir la position actuelle
      await this.syncDeviceState(deviceId);
      
    } catch (error) {
      logger.error(`❌ Erreur arrêt volet ${deviceId}:`, error);
      throw error;
    }
  }

  async setShutterPosition(deviceId, position) {
    try {
      logger.info(`📍 Position volet ${deviceId}: ${position}%`);
      
      await this.idiamantClient.controlShutter(deviceId, 'set_position', position);
      
      // Mise à jour immédiate de l'état (optimiste)
      const state = position === 0 ? 'closed' : position === 100 ? 'open' : 'opening';
      await this.updateDeviceState(deviceId, state, position);
      
      // Synchronisation différée pour obtenir l'état réel
      setTimeout(() => this.syncDeviceState(deviceId), 3000);
      
    } catch (error) {
      logger.error(`❌ Erreur position volet ${deviceId}:`, error);
      throw error;
    }
  }

  async syncDeviceState(deviceId) {
    try {
      const status = await this.idiamantClient.getShutterStatus(deviceId);
      
      let state = 'unknown';
      switch (status.state) {
        case 'open':
          state = 'open';
          break;
        case 'closed':
          state = 'closed';
          break;
        case 'opening':
          state = 'opening';
          break;
        case 'closing':
          state = 'closing';
          break;
        default:
          // Détermination de l'état basé sur la position
          if (status.position === 0) {
            state = 'closed';
          } else if (status.position === 100) {
            state = 'open';
          } else {
            state = 'open'; // Position partielle = ouvert
          }
      }
      
      await this.updateDeviceState(deviceId, state, status.position);
      
      logger.debug(`🔄 État synchronisé pour ${deviceId}: ${state} (${status.position}%)`);
      
    } catch (error) {
      logger.error(`❌ Erreur synchronisation ${deviceId}:`, error);
    }
  }

  async updateDeviceState(deviceId, state, position) {
    try {
      const currentState = this.deviceStates.get(deviceId) || {};
      
      // Si la position n'est pas fournie, on conserve la précédente
      if (position === null || position === undefined) {
        position = currentState.position || 0;
      }
      
      const newState = {
        state,
        position,
        lastUpdate: Date.now()
      };
      
      // Mise à jour uniquement si l'état a changé
      if (currentState.state !== state || currentState.position !== position) {
        this.deviceStates.set(deviceId, newState);
        
        // Publication sur MQTT
        await this.mqttClient.publishShutterState(deviceId, state, position);
        
        logger.debug(`📡 État mis à jour pour ${deviceId}: ${state} (${position}%)`);
      }
      
    } catch (error) {
      logger.error(`❌ Erreur mise à jour état ${deviceId}:`, error);
      throw error;
    }
  }

  startPeriodicSync() {
    // Synchronisation toutes les 30 secondes (configurable)
    const interval = Math.max(this.config.SYNC_INTERVAL / 1000, 10); // Minimum 10 secondes
    const cronExpression = `*/${interval} * * * * *`;
    
    this.syncTask = cron.schedule(cronExpression, async () => {
      if (!this.isRunning) return;
      
      try {
        const devices = this.idiamantClient.getDevices();
        for (const device of devices) {
          await this.syncDeviceState(device.id);
        }
      } catch (error) {
        logger.error('❌ Erreur synchronisation périodique:', error);
      }
    });
    
    logger.info(`⏰ Synchronisation périodique configurée (${interval}s)`);
  }

  async stop() {
    this.isRunning = false;
    
    if (this.syncTask) {
      this.syncTask.stop();
      logger.info('⏰ Synchronisation périodique arrêtée');
    }
    
    logger.info('🎛️ Contrôleur de volets arrêté');
  }

  // Méthodes utilitaires
  getDeviceState(deviceId) {
    return this.deviceStates.get(deviceId);
  }

  getAllDeviceStates() {
    return Object.fromEntries(this.deviceStates);
  }
}

module.exports = ShutterController;
