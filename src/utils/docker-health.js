#!/usr/bin/env node

/**
 * Script de health check simple pour Docker
 * Vérifie que l'application peut démarrer et que les composants de base fonctionnent
 */

const fs = require('fs');
const path = require('path');

async function healthCheck() {
    try {
        // 1. Vérifier que le fichier de configuration existe
        const configPath = path.join(__dirname, '../config/config.js');
        if (!fs.existsSync(configPath)) {
            throw new Error('Fichier de configuration manquant');
        }

        // 2. Tenter de charger la configuration
        const config = require('../config/config');
        if (!config.IDIAMANT_CLIENT_ID || !config.MQTT_BROKER_URL) {
            throw new Error('Configuration incomplète');
        }

        // 3. Vérifier que les modules principaux peuvent être chargés
        require('../utils/logger');
        require('../services/mqtt-client');

        // 4. Vérifier l'existence du répertoire de logs
        const logsDir = path.join(__dirname, '../../logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }

        console.log('Health check OK - Application ready');
        process.exit(0);

    } catch (error) {
        console.error('Health check FAILED:', error.message);
        process.exit(1);
    }
}

// Exécuter le health check
healthCheck();