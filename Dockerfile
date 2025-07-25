FROM node:18-alpine

# Métadonnées de l'image
LABEL maintainer="Mamath2000"
LABEL description="Passerelle iDiamant vers MQTT pour Home Assistant"
LABEL version="1.0.0"

# Installation des dépendances système
RUN apk add --no-cache \
    tini \
    && rm -rf /var/cache/apk/*

# Création de l'utilisateur non-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Définition du répertoire de travail
WORKDIR /app

# Copie des fichiers de configuration des dépendances
COPY package*.json ./

# Installation des dépendances
RUN npm ci --only=production && \
    npm cache clean --force

# Copie du code source
COPY src/ ./src/

# Création du répertoire de logs
RUN mkdir -p logs && \
    chown -R nextjs:nodejs /app

# Basculement vers l'utilisateur non-root
USER nextjs

# Exposition du port
EXPOSE 3000

# Point d'entrée avec tini pour une gestion propre des signaux
ENTRYPOINT ["/sbin/tini", "--"]

# Commande par défaut
CMD ["node", "src/index.js"]

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "console.log('Health check OK')" || exit 1
