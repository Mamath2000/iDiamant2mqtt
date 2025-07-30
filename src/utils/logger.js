require('dotenv').config();
const { createLogger, format, transports } = require('winston');
const path = require('path');

// Configuration des formats de log
const ICONS = {
  error: '❌',
  warn: '⚠️',
  info: 'ℹ️',
  debug: '🔍'
};

const logFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  format.printf(({ timestamp, level, message, stack }) => {
    const icon = ICONS[level] || '';
    const logMessage = `${timestamp} ${icon} [${level.toUpperCase()}]: ${message}`;
    return stack ? `${logMessage}\n${stack}` : logMessage;
  })
);

// Configuration du logger
const logger = createLogger({
    levels: {
        error: 0,
        warn: 1,
        info: 2,
        debug: 3
    },
    format: logFormat,
    transports: [
        // Console
        new transports.Console({
          format: format.combine(
            format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            format.errors({ stack: true }),
            format.colorize({ all: true }),
            format.printf(({ timestamp, level, message, stack }) => {
              const icon = ICONS[level.replace(/\s*\x1b\[[0-9;]*m/g, '').toLowerCase()] || '';
              // On retire les codes couleurs du timestamp pour garantir l'affichage
              return stack
                ? `${timestamp} ${icon}  [${level}]: ${message}\n${stack}`
                : `${timestamp} ${icon}  [${level}]: ${message}`;
            })
          )
        }),
        // Fichier général (tout)
        new transports.File({
          filename: path.join(__dirname, '../../logs/app.log'),
          level: process.env.APP_LOG_LEVEL || 'debug', // 👈 Niveau configurable
          maxsize: 5242880, // 5MB
          maxFiles: 5
        })
    ]
});


module.exports = logger;
