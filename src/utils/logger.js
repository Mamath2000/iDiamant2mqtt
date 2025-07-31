require('dotenv').config();
const { createLogger, format, transports } = require('winston');
const path = require('path');
const config = require('../config/config');

// --- 1. Définir les catégories spéciales qui auront leur propre fichier de log ---
const CATEGORIES = ['auth', 'mqtt']; // Ajoutez d'autres catégories ici si besoin (ex: 'mqtt', 'api')

// Configuration des formats de log
const ICONS = {
  error: '❌',
  warn: '⚠️',
  info: 'ℹ️',
  debug: '🔍'
};

// --- 2. Créer un filtre pour n'accepter que les logs d'une certaine catégorie ---
const categoryFilter = (category) => format((info) => {
  // Si le log a la bonne catégorie, on le laisse passer. Sinon, on le bloque.
  return info.category === category ? info : false;
});


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
const winstonLogger = createLogger({
    format: logFormat,
    transports: [
        // Console
        new transports.Console({
          level: config.LOG_LEVEL || 'info', // Niveau de log par défaut
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
          level: config.APP_LOG_LEVEL || 'debug', // 👈 Niveau configurable
          maxsize: 5242880, // 5MB
          maxFiles: 5
        }),
        // Fichiers spécifiques pour chaque catégorie
        ...CATEGORIES.map(category => new transports.File({
          filename: path.join(__dirname, `../../logs/${category}.log`),
          level: config[`${category.toUpperCase()}_LOG_LEVEL`] || 'info', // Niveau configurable par catégorie
          format: categoryFilter(category)(), // Appliquer le filtre spécifique
            maxsize: 5242880,
            maxFiles: 5
        }))  
    ]
});

// --- 4. Créer un wrapper pour gérer la syntaxe `logger.info('auth', ...)` ---
const logger = {};
const levels = ['error', 'warn', 'info', 'debug'];

levels.forEach(level => {
  logger[level] = (firstArg, ...args) => {
    // Vérifie si le premier argument est une catégorie définie
    if (typeof firstArg === 'string' && CATEGORIES.includes(firstArg)) {
      const category = firstArg;
      const message = args[0];
      const meta = args.length > 1 ? args[1] : {};
      
      // Appelle le logger Winston avec la catégorie dans les métadonnées
      winstonLogger[level](message, { ...meta, category });
    } else {
      // Comportement normal si pas de catégorie
      winstonLogger[level](firstArg, ...args);
    }
  };
});

module.exports = logger;
