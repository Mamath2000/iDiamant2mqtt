#!/bin/bash

# Script pour générer l'URL d'autorisation OAuth2 en production Docker
# Usage: ./generate-oauth-url.sh

set -e

echo "🔑 Génération de l'URL d'autorisation OAuth2 Netatmo"
echo ""

# Vérifier que Docker est disponible
if ! command -v docker &> /dev/null; then
    echo "❌ Docker n'est pas installé ou accessible"
    exit 1
fi


# Vérifier que config.conf existe
if [ ! -f "config.conf" ]; then
    echo "❌ Fichier config.conf non trouvé"
    echo "💡 Créez le fichier avec vos identifiants Netatmo :"
    echo "   cp config.conf.example config.conf"
    echo "   nano config.conf"
    exit 1
fi

# Vérifier si un conteneur Docker Compose tourne déjà
if docker compose ps --status running | grep -q "Up"; then
    echo "⚠️  Un ou plusieurs conteneurs Docker Compose sont déjà en cours d'exécution. Arrêt en cours..."
    docker compose down
    echo "✅ Conteneurs arrêtés."
fi

# Lire la configuration pour récupérer le port
AUTH_PORT=$(grep "^auth_server_port" config.conf | cut -d'=' -f2 | tr -d ' ' || echo "3000")
if [ -z "$AUTH_PORT" ]; then
    AUTH_PORT=3000
fi

echo "📋 Port du serveur d'authentification: $AUTH_PORT"

# Récupérer l'image Docker
DOCKER_USER=${DOCKER_USER:-"mathmath350"}
DOCKER_IMAGE="idiamant2mqtt"

echo "🐳 Utilisation de l'image Docker: $DOCKER_USER/$DOCKER_IMAGE:latest"

# Vérifier si l'image existe localement
if ! docker images --format "table {{.Repository}}:{{.Tag}}" | grep -q "$DOCKER_USER/$DOCKER_IMAGE:latest"; then
    echo "📥 Téléchargement de l'image Docker..."
    docker pull "$DOCKER_USER/$DOCKER_IMAGE:latest" || {
        echo "❌ Impossible de télécharger l'image Docker"
        echo "💡 Vérifiez que l'image existe sur Docker Hub"
        exit 1
    }
fi

echo "⚡ Génération de l'URL d'autorisation..."
echo ""

# Exécuter le générateur d'URL dans le conteneur
docker run --rm \
    -v "$(pwd)/config.conf:/app/config.conf:ro" \
    -p "$AUTH_PORT:$AUTH_PORT" \
    "$DOCKER_USER/$DOCKER_IMAGE:latest" \
    node src/token/auth-url-generator.js

echo ""
echo "✅ URL générée avec succès !"
echo "📝 Copiez cette URL dans votre navigateur pour autoriser l'application"
echo "🔗 Après autorisation, le token sera automatiquement envoyé via MQTT"

# Proposer de relancer Docker Compose
read -p $'\nVoulez-vous redémarrer les conteneurs Docker Compose ? (o/n) : ' restart_choice
if [[ "$restart_choice" =~ ^[Oo]$ ]]; then
    echo "🔄 Redémarrage de Docker Compose..."
    docker compose up -d
    echo "✅ Docker Compose redémarré."
else
    echo "⏸️  Docker Compose n'a pas été redémarré."
fi