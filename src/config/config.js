require('dotenv').config();

const config = {
  // Configuration iDiamant/Netatmo
  IDIAMANT_API_URL: process.env.IDIAMANT_API_URL || 'https://api.netatmo.com',
  IDIAMANT_CLIENT_ID: process.env.IDIAMANT_CLIENT_ID,
  IDIAMANT_CLIENT_SECRET: process.env.IDIAMANT_CLIENT_SECRET,
  IDIAMANT_USERNAME: process.env.IDIAMANT_USERNAME,
  IDIAMANT_PASSWORD: process.env.IDIAMANT_PASSWORD,
  
  // Configuration MQTT
  MQTT_BROKER_URL: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
  MQTT_USERNAME: process.env.MQTT_USERNAME,
  MQTT_PASSWORD: process.env.MQTT_PASSWORD,
  MQTT_CLIENT_ID: process.env.MQTT_CLIENT_ID || 'idiamant2mqtt',
  MQTT_TOPIC_PREFIX: process.env.MQTT_TOPIC_PREFIX || 'homeassistant/cover',
  
  // Configuration Home Assistant
  HA_DISCOVERY_PREFIX: process.env.HA_DISCOVERY_PREFIX || 'homeassistant',
  HA_DEVICE_NAME: process.env.HA_DEVICE_NAME || 'iDiamant Bridge',
  
  // Configuration de l'application
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  SYNC_INTERVAL: parseInt(process.env.SYNC_INTERVAL) || 30000, // 30 secondes
  RETRY_INTERVAL: parseInt(process.env.RETRY_INTERVAL) || 5000, // 5 secondes
  MAX_RETRIES: parseInt(process.env.MAX_RETRIES) || 3,
  
  // Configuration réseau
  HTTP_TIMEOUT: parseInt(process.env.HTTP_TIMEOUT) || 10000, // 10 secondes
  MQTT_KEEPALIVE: parseInt(process.env.MQTT_KEEPALIVE) || 60, // 60 secondes
  
  // Environnement
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT) || 3000
};

// Validation des configurations critiques
if (config.NODE_ENV === 'production') {
  const requiredFields = [
    'IDIAMANT_CLIENT_ID',
    'IDIAMANT_CLIENT_SECRET',
    'IDIAMANT_USERNAME',
    'IDIAMANT_PASSWORD'
  ];
  
  const missingFields = requiredFields.filter(field => !config[field]);
  if (missingFields.length > 0) {
    console.error(`❌ Configuration manquante en production: ${missingFields.join(', ')}`);
    process.exit(1);
  }
}

module.exports = config;
