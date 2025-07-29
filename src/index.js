const logger = require('./utils/logger');
const config = require('./config/config');
const MQTTClient = require('./services/mqtt-client');
const NetatmoAuthHelper = require('./token/auth-helper');
const IDiamantDevicesHandler = require('./services/idiamant-devices');
const ShutterController = require('./controllers/shutter-controller');
const HealthMonitor = require('./utils/health');
const ApiHelper = require('./utils/api-helper'); 

const axios= require('axios');

class App {
    constructor() {
        this.config = config;
        this.mqttClient = null;
        this.shutterController = null;
        this.healthMonitor = null;
        this.authHelper = null;
        this.devicesHandler = null;
        this.apiHelper = null;
        this.isRunning = false;
    }

    async start() {
        try {
            // Démarrage de l'application
            logger.info('🚀 Démarrage de iDiamant2MQTT...');
            // Vérification de la configuration
            this.validateConfig();

            // Initialisation du client MQTT
            this.mqttClient = new MQTTClient(this.config);
            await this.mqttClient.connect();
            logger.info('✅ Client MQTT connecté');

            this.apiHelper = new ApiHelper(`${this.config.IDIAMANT_API_URL}/api`, 5000); // Timeout de 5 secondes

            // Gestion du token via auth-helper
            this.authHelper = new NetatmoAuthHelper(this.mqttClient, this.apiHelper);

            this.authHelper.setupPermanentTokenListener();
            await new Promise(resolve => setTimeout(resolve, 2000)); // Attente de 2 secondes

            while (!this.authHelper.tokenData) {
                logger.info('🔄 En attente du token Netatmo...');
                await new Promise(resolve => setTimeout(resolve, 10000)); // Attente de 10 secondes
            }

            logger.info('✅ Token Netatmo récupéré avec succès');
            // this.authHelper.startTokenAutoRefresh();

            const token = this.authHelper.tokenData.access_token;
            this.apiHelper.setAccessToken(token);
            
            logger.debug(`🔍 Token utilisé: ${token.substring(0, 20)}...`);
            logger.debug(`🔍 API Initialisée: ${this.config.IDIAMANT_API_URL}`);

            this.devicesHandler = new IDiamantDevicesHandler(this.config, this.mqttClient, this.apiHelper);
            logger.info('✅ Initialisation des appareils Netatmo...');

            this.devicesHandler.initialize().then(success => {
                if (success) {
                    logger.info('✅ Appareils initialisés avec succès');

                    this.devicesHandler.startShutterStatusUpdate();
                    this.mqttClient.setBridgeCommandHandler((deviceId, topic, message) => {
                        this.authHelper.refreshTokenCommandHandler(deviceId, topic, message);
                    });

                    // Instanciation et démarrage du contrôleur de volets
                    this.shutterController = new ShutterController(this.config, this.mqttClient, this.devicesHandler);

                    this.shutterController.checkDevices();
                    this.shutterController.listenCommands();

                    this.healthMonitor = new HealthMonitor(this);
                    this.healthMonitor.start();
                    logger.info('🏥 Health monitoring démarré');

                } else {
                    logger.error('❌ Échec de l\'initialisation des appareils');
                }
            });
            this.isRunning = true;
            // Gestion propre de l'arrêt
            this.setupGracefulShutdown();
        } catch (error) {
            logger.error('❌ Erreur lors du démarrage:', error);
            process.exit(1);
        }
    }

    validateConfig() {
        const requiredFields = [
            'IDIAMANT_API_URL',
            'MQTT_BROKER_URL',
            'IDIAMANT_CLIENT_ID',
            'IDIAMANT_CLIENT_SECRET'
        ];
        const missingFields = requiredFields.filter(field => !this.config[field] || this.config[field].toString().trim() === '' || this.config[field].toString().includes('your_'));
        if (missingFields.length > 0) {
            logger.error(`❌ Configuration manquante ou invalide : ${missingFields.join(', ')}`);
            throw new Error(`Configuration manquante ou invalide : ${missingFields.join(', ')}`);
        }
        logger.info('✅ Configuration validée');
    }

    setupGracefulShutdown() {
        const shutdown = async (signal) => {
            logger.info(`📡 Signal ${signal} reçu. Arrêt en cours...`);

            if (this.isRunning) {
                this.isRunning = false;

                try {
                    if (this.shutterController) {
                        this.shutterController.stop();
                    }
                    if (this.devicesHandler) {
                        this.devicesHandler.stop(); // Ajoute cet appel
                    }
                    if (this.mqttClient) {
                        this.mqttClient.disconnect();
                    }

                    if (this.healthMonitor) {
                        this.healthMonitor.stop();
                    }

                    if (this.authHelper) {
                        this.authHelper.stop();
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
            // process.exit(1);
        });

        process.on('unhandledRejection', (reason) => {
            logger.error('❌ Promesse rejetée non gérée:', reason);
            // process.exit(1);
        });
    }
}

// Démarrage de l'application
if (require.main === module) {
    const app = new App();
    app.start();
}

module.exports = App;
