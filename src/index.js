const logger = require('./utils/logger');
const config = require('./config/config');
const IDiamantClient = require('./services/idiamant-client');
const MQTTClient = require('./services/mqtt-client');
const ShutterController = require('./controllers/shutter-controller');

class App {
  constructor() {
    this.idiamantClient = null;
    this.mqttClient = null;
    this.shutterController = null;
    this.isRunning = false;
  }

  async start() {
    try {
      logger.info('🚀 Démarrage de iDiamant2MQTT...');
      
      // Vérification de la configuration
      this.validateConfig();
      
      // Initialisation des clients
      await this.initializeClients();
      
      // Démarrage du contrôleur de volets
      await this.initializeShutterController();
      
      this.isRunning = true;
      logger.info('✅ iDiamant2MQTT démarré avec succès !');
      
      // Gestion propre de l'arrêt
      this.setupGracefulShutdown();
      
    } catch (error) {
      logger.error('❌ Erreur lors du démarrage:', error);
      process.exit(1);
    }
  }

  validateConfig() {
    const requiredFields = ['IDIAMANT_API_URL', 'MQTT_BROKER_URL'];
    const missingFields = requiredFields.filter(field => !config[field]);
    
    if (missingFields.length > 0) {
      throw new Error(`Configuration manquante: ${missingFields.join(', ')}`);
    }
    
    logger.info('✅ Configuration validée');
  }

  async initializeClients() {
    // Client iDiamant
    this.idiamantClient = new IDiamantClient(config);
    await this.idiamantClient.connect();
    logger.info('✅ Client iDiamant connecté');

    // Client MQTT
    this.mqttClient = new MQTTClient(config);
    await this.mqttClient.connect();
    logger.info('✅ Client MQTT connecté');
  }

  async initializeShutterController() {
    this.shutterController = new ShutterController(
      this.idiamantClient,
      this.mqttClient,
      config
    );
    
    await this.shutterController.start();
    logger.info('✅ Contrôleur de volets initialisé');
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      logger.info(`📡 Signal ${signal} reçu. Arrêt en cours...`);
      
      if (this.isRunning) {
        this.isRunning = false;
        
        try {
          if (this.shutterController) {
            await this.shutterController.stop();
          }
          
          if (this.mqttClient) {
            await this.mqttClient.disconnect();
          }
          
          if (this.idiamantClient) {
            await this.idiamantClient.disconnect();
          }
          
          logger.info('👋 Arrêt propre terminé');
          process.exit(0);
        } catch (error) {
          logger.error('❌ Erreur lors de l\'arrêt:', error);
          process.exit(1);
        }
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    
    process.on('uncaughtException', (error) => {
      logger.error('❌ Exception non gérée:', error);
      process.exit(1);
    });
    
    process.on('unhandledRejection', (reason) => {
      logger.error('❌ Promesse rejetée non gérée:', reason);
      process.exit(1);
    });
  }
}

// Démarrage de l'application
if (require.main === module) {
  const app = new App();
  app.start();
}

module.exports = App;
