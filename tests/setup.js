// Configuration globale pour les tests
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Réduire les logs pendant les tests

// Mock des variables d'environnement pour les tests
process.env.IDIAMANT_CLIENT_ID = 'test_client_id';
process.env.IDIAMANT_CLIENT_SECRET = 'test_client_secret';
process.env.IDIAMANT_USERNAME = 'test_username';
process.env.IDIAMANT_PASSWORD = 'test_password';
process.env.MQTT_BROKER_URL = 'mqtt://test.broker:1883';
