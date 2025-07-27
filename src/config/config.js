require('dotenv').config();

const config = {
  // Configuration iDiamant/Netatmo
  IDIAMANT_API_URL: process.env.IDIAMANT_API_URL || 'https://api.netatmo.com',
  IDIAMANT_CLIENT_ID: process.env.IDIAMANT_CLIENT_ID,
  IDIAMANT_CLIENT_SECRET: process.env.IDIAMANT_CLIENT_SECRET,
  IDIAMANT_IP: process.env.IDIAMANT_IP || '',
  NETATMO_REDIRECT_URI: process.env.NETATMO_REDIRECT_URI,
  
  // Configuration MQTT
  MQTT_BROKER_URL: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
  MQTT_USERNAME: process.env.MQTT_USERNAME,
  MQTT_PASSWORD: process.env.MQTT_PASSWORD,
  MQTT_CLIENT_ID: process.env.MQTT_CLIENT_ID || 'idiamant2mqtt',
  MQTT_TOPIC_PREFIX: process.env.MQTT_TOPIC_PREFIX || 'idiamant',
  
  // Configuration Home Assistant
  HA_DISCOVERY: process.env.HA_DISCOVERY ? String(process.env.HA_DISCOVERY).toLowerCase() === 'true' : false,
  HA_DISCOVERY_PREFIX: process.env.HA_DISCOVERY_PREFIX || 'homeassistant',
  HA_DEVICE_NAME: process.env.HA_DEVICE_NAME || 'iDiamant Bridge',
  
  // Configuration réseau
  MQTT_KEEPALIVE: parseInt(process.env.MQTT_KEEPALIVE) || 60, // 60 secondes
  
  // Environnement
  MODE_ENV: process.env.MODE_ENV || 'development',

  // Configuration de l'application
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  SYNC_INTERVAL: parseInt(process.env.SYNC_INTERVAL) || 30000, // 30 secondes
};

// Validation des configurations critiques
const logger = require('../utils/logger');
if (config.MODE_ENV === 'production') {
  // En production, on s'assure que les champs critiques sont définis
  const requiredFields = [
    'IDIAMANT_CLIENT_ID',
    'IDIAMANT_CLIENT_SECRET'
  ];
  const missingFields = requiredFields.filter(field => !config[field]);
  if (missingFields.length > 0) {
    logger.error(`Configuration manquante en production: ${missingFields.join(', ')}`);
    process.exit(1);
  }
  logger.info('✅ Configuration validée pour la production');
}

module.exports = config;
