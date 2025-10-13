const fs = require('fs');
const path = require('path');
const ini = require('ini');

// Fonction utilitaire pour résoudre les variables
function resolveVariables(configObj, value) {
  if (typeof value !== 'string') return value;
  
  return value.replace(/\$\{([^}]+)\}/g, (match, varPath) => {
    const parts = varPath.split('.');
    let result = configObj;
    
    for (const part of parts) {
      if (result && typeof result === 'object' && part in result) {
        result = result[part];
      } else {
        return match; // Retourner la variable non résolue si elle n'existe pas
      }
    }
    
    return result;
  });
}

// Charger la configuration depuis config.conf
let configData;
const configPath = path.join(__dirname, '../../config.conf');

try {
  if (!fs.existsSync(configPath)) {
    console.error('❌ Fichier config.conf non trouvé !');
    console.error('💡 Créez le fichier: cp config.conf.example config.conf');
    process.exit(1);
  }
  
  const configFile = fs.readFileSync(configPath, 'utf-8');
  configData = ini.parse(configFile);
} catch (error) {
  console.error('❌ Erreur lors de la lecture de config.conf:', error.message);
  process.exit(1);
}

// Résoudre les variables dans la configuration
function resolveConfigVariables(obj) {
  if (typeof obj === 'string') {
    return resolveVariables(configData, obj);
  } else if (typeof obj === 'object' && obj !== null) {
    const resolved = {};
    for (const [key, value] of Object.entries(obj)) {
      resolved[key] = resolveConfigVariables(value);
    }
    return resolved;
  }
  return obj;
}

configData = resolveConfigVariables(configData);

// Fonction utilitaire pour parser les booléens
const parseBoolean = (value, defaultValue = false) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return defaultValue;
};

// Fonction utilitaire pour parser les entiers
const parseInteger = (value, defaultValue = 0) => {
  const parsed = parseInt(value);
  return isNaN(parsed) ? defaultValue : parsed;
};

// Configuration mappée
const config = {
  // Configuration iDiamant/Netatmo
  IDIAMANT_API_URL: configData.netatmo?.api_url || 'https://api.netatmo.com',
  IDIAMANT_CLIENT_ID: configData.netatmo?.client_id,
  IDIAMANT_CLIENT_SECRET: configData.netatmo?.client_secret,
  IDIAMANT_IP: configData.device?.idiamant_ip || '',
  NETATMO_REDIRECT_URI: configData.netatmo?.redirect_uri,
  
  // Configuration MQTT
  MQTT_BROKER_URL: configData.mqtt?.broker_url || 'mqtt://localhost:1883',
  MQTT_USERNAME: configData.mqtt?.username || '',
  MQTT_PASSWORD: configData.mqtt?.password || '',
  MQTT_CLIENT_ID: configData.mqtt?.client_id || 'idiamant2mqtt',
  MQTT_TOPIC_PREFIX: configData.mqtt?.topic_prefix || 'idiamant',
  MQTT_KEEPALIVE: parseInteger(configData.mqtt?.keepalive, 60),
  
  // Configuration Home Assistant
  HA_DISCOVERY: parseBoolean(configData.homeassistant?.discovery, false),
  HA_DISCOVERY_PREFIX: configData.homeassistant?.discovery_prefix || 'homeassistant',
  HA_DEVICE_NAME: configData.homeassistant?.device_name || 'iDiamant Bridge',
  
  // Configuration de l'application
  MODE_ENV: configData.application?.environment || 'development',
  LOG_LEVEL: configData.logging?.console_level || 'info',
  APP_LOG_LEVEL: configData.logging?.file_level || 'debug',
  AUTH_LOG_LEVEL: configData.logging?.auth_level || 'debug',
  MQTT_LOG_LEVEL: configData.logging?.mqtt_level || 'info',
  SYNC_INTERVAL: parseInteger(configData.application?.sync_interval, 30000),
  
  // Configuration du serveur d'authentification
  AUTH_SERVER_PORT: parseInteger(configData.application?.auth_server_port, 3000),
  AUTH_SERVER_HOST: configData.application?.auth_server_host || '0.0.0.0',
  
  // Configuration des logs
  LOG_DIRECTORY: configData.application?.log_directory || './logs',
  APP_LOG_FILE: configData.application?.app_log_file || 'app.log',
  AUTH_LOG_FILE: configData.application?.auth_log_file || 'auth.log',
};

// Gestion du mode debug VS Code
if (process.env.DEBUG_MODE === 'vscode') {
    console.log('🐛 Mode debugger détecté (vscode) - ajustements automatiques :');
    console.log('  - LOG_LEVEL: debug');
    console.log('  - MQTT_KEEPALIVE: 900 (15 min)');
    
    config.LOG_LEVEL = 'debug';
    config.MQTT_KEEPALIVE = 900; // 15 minutes
}

// Validation des champs obligatoires
const requiredFields = [
  { key: 'IDIAMANT_CLIENT_ID', value: config.IDIAMANT_CLIENT_ID },
  { key: 'IDIAMANT_CLIENT_SECRET', value: config.IDIAMANT_CLIENT_SECRET },
  { key: 'NETATMO_REDIRECT_URI', value: config.NETATMO_REDIRECT_URI }
];

const missingFields = requiredFields.filter(field => !field.value);

if (missingFields.length > 0) {
  console.error('❌ Configuration incomplète ! Champs manquants :');
  missingFields.forEach(field => {
    console.error(`   - ${field.key}`);
  });
  console.error('💡 Vérifiez votre fichier config.conf');
  process.exit(1);
}

module.exports = config;
