require('dotenv').config();
const winston = require('winston');

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

// Détermine le niveau de log basé sur l'environnement
const getLogLevel = () => {
  const env = process.env.MODE_ENV || 'development';
  const logLevel = process.env.LOG_LEVEL;
  
  if (logLevel) return logLevel;
  return env === 'production' ? 'warn' : 'info';
};

// Configuration du logger
const logger = winston.createLogger({
  level: getLogLevel(),
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

// En développement, on veut voir tous les logs
if ((process.env.NODE_ENV || 'development') === 'development') {
  logger.level = process.env.LOG_LEVEL || 'debug'; // Respecte LOG_LEVEL même en dev
}

module.exports = logger;
