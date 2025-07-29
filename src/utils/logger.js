require('dotenv').config();
const winston = require('winston');
const config = require('../config/config');

// Configuration des formats de log
const ICONS = {
  error: '❌',
  warn: '⚠️',
  info: 'ℹ️',
  debug: '🔍'
};

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    const icon = ICONS[level] || '';
    const logMessage = `${timestamp} ${icon} [${level.toUpperCase()}]: ${message}`;
    return stack ? `${logMessage}\n${stack}` : logMessage;
  })
);

// Configuration du logger
const logger = winston.createLogger({
  level: config.LOG_LEVEL || 'info', // Niveau de log par défaut
  format: logFormat,
  transports: [
    // Console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.colorize({ all: true }),
        winston.format.printf(({ timestamp, level, message, stack }) => {
          const icon = ICONS[level.replace(/\s*\x1b\[[0-9;]*m/g, '').toLowerCase()] || '';
          // On retire les codes couleurs du timestamp pour garantir l'affichage
          return stack
            ? `${timestamp} ${icon}  [${level}]: ${message}\n${stack}`
            : `${timestamp} ${icon}  [${level}]: ${message}`;
        })
      )
    }),
    
    // Fichier pour les erreurs
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    
    // Fichier pour tous les logs
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ],
  
  // Gestion des exceptions non capturées
  exceptionHandlers: [
    new winston.transports.File({ filename: 'logs/exceptions.log' })
  ],
  
  // Gestion des rejets de promesse non capturés
  rejectionHandlers: [
    new winston.transports.File({ filename: 'logs/rejections.log' })
  ]
});


module.exports = logger;
