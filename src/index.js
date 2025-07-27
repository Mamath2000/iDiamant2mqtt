const logger = require('./utils/logger');
const config = require('./config/config');
const MQTTClient = require('./services/mqtt-client');
const NetatmoAuthHelper = require('./token/auth-helper');
const IDiamantDevicesHandler = require('./services/idiamant-devices');

class App {
    constructor() {
        this.mqttClient = null;
        this.shutterController = null;
        this.isRunning = false;
    }

    async start() {
        try {
            logger.info('🚀 Démarrage de iDiamant2MQTT...');
            // Vérification de la configuration
            this.validateConfig();

            // Initialisation du client MQTT
            this.mqttClient = new MQTTClient(config);
            await this.mqttClient.connect();
            logger.info('✅ Client MQTT connecté');

            // Gestion du token via auth-helper
            const authHelper = new NetatmoAuthHelper();
            const tokenData = authHelper.getTokenData();

            if (!authHelper.isTokenValid(tokenData)) {
                logger.error('❌ Token Netatmo absent ou expiré. Veuillez relancer l\'authentification avec : make auth-url');
                process.exit(1);
            }
            
            const devicesHandler = new IDiamantDevicesHandler(config, tokenData, this.mqttClient);
            logger.info('✅ Token Netatmo valide. OK');
            devicesHandler.startTokenAutoRefresh();

            logger.info('✅ Initialisation des appareils Netatmo...');
            devicesHandler.initialize().then(success => {
                if (success) {
                    logger.info('✅ Appareils initialisés avec succès');

                    // Instanciation et démarrage du contrôleur de volets
                    const ShutterController = require('./controllers/shutter-controller');
                    const shutterController = new ShutterController(devicesHandler, this.mqttClient, config);
                    shutterController.listenCommands();
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
        const missingFields = requiredFields.filter(field => !config[field] || config[field].toString().trim() === '' || config[field].toString().includes('your_'));
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
                        await this.shutterController.stop();
                    }
                    if (this.devicesHandler) {
                        this.devicesHandler.stop(); // Ajoute cet appel
                    }
                    if (this.mqttClient) {
                        await this.mqttClient.disconnect();
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
