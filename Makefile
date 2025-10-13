# Makefile pour iDiamant2MQTT

# Variables
NODE_VERSION := 18
DOCKER_IMAGE := idiamant2mqtt
DOCKER_TAG := latest
DOCKER_USER := mathmath350  # Votre nom d'utilisateur Docker Hub
DOCKER_FULL_IMAGE := $(DOCKER_USER)/$(DOCKER_IMAGE):$(DOCKER_TAG)

# Couleurs pour les messages
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
BLUE := \033[0;34m
NC := \033[0m # No Color

.PHONY: help install dev start test lint clean docker-build docker-run docker-stop docker-logs setup auth-url
.PHONY: docker-build-push version-bump check-env test-config test-docker-logs docker-auth-url

# ========================
# Aide
# ========================
help:
	@echo "$(GREEN)🚀 iDiamant2MQTT - Makefile$(NC)"
	@echo ""
	@echo "$(YELLOW)⚡ COMMANDES PRINCIPALES:$(NC)"
	@echo "  $(GREEN)make setup$(NC)               - Configuration initiale complète"
	@echo "  $(GREEN)make start$(NC)               - Lancement en mode production"
	@echo "  $(GREEN)make dev$(NC)                 - Lancement en mode développement"
	@echo "  $(GREEN)make auth-url$(NC)            - Générer l'URL d'autorisation OAuth2"
	@echo ""
	@echo "$(YELLOW)🐳 DOCKER & PUBLICATION:$(NC)"
	@echo "  $(GREEN)make docker-build$(NC)        - Construction de l'image Docker locale"
	@echo "  $(GREEN)make docker-build-push$(NC)   - Build + Publication Docker Hub + Version bump"
	@echo "  $(GREEN)make docker-auth-url$(NC)     - Générer URL OAuth2 via Docker"
	@echo "  $(GREEN)make test-docker-logs$(NC)    - Tester les logs dans Docker"
	@echo "  $(GREEN)make version-bump$(NC)        - Incrémenter manuellement la version"
	@echo ""
	@echo "$(YELLOW)🔧 CONFIGURATION:$(NC)"
	@echo "  $(GREEN)make install$(NC)             - Installation des dépendances"
	@echo "  $(GREEN)make check-env$(NC)           - Vérifier l'environnement"
	@echo "  $(GREEN)make test-config$(NC)         - Tester la configuration"
	@echo "  $(GREEN)make clean$(NC)               - Nettoyage des fichiers temporaires"
	@echo ""

	@echo ""
	@echo "$(BLUE)📦 Version actuelle: $$(grep '"version"' package.json | sed 's/.*"version": "\(.*\)".*/\1/')$(NC)"
	@echo ""

# ========================
# Install
# ========================


# ========================
# Installation et Configuration
# ========================

# Configuration initiale du projet
setup:
	@echo "$(GREEN)🚀 Configuration initiale du projet iDiamant2MQTT...$(NC)"
	@if [ ! -f "config.conf" ]; then \
		echo "$(BLUE)📋 Création du fichier de configuration...$(NC)"; \
		cp config.conf.example config.conf; \
		echo "$(YELLOW)⚠️ Veuillez éditer config.conf avec vos paramètres$(NC)"; \
		echo "$(BLUE)💡 Notamment: client_id, client_secret, idiamant_ip$(NC)"; \
	else \
		echo "$(GREEN)✅ Fichier config.conf déjà présent$(NC)"; \
	fi
	@mkdir -p logs
	@echo "$(GREEN)📁 Dossier logs créé$(NC)"
	npm install
	@echo ""
	@echo "$(GREEN)✅ Projet configuré avec succès !$(NC)"
	@echo "$(BLUE)📝 Prochaines étapes:$(NC)"
	@echo "  1. Éditez config.conf avec vos paramètres"
	@echo "  2. Lancez: make auth-url"
	@echo "  3. Obtenez votre token Netatmo"
	@echo "  4. Lancez: make start"

# Installation des dépendances
install:
	@echo "$(GREEN)Installation des dépendances Node.js...$(NC)"
	npm install

# Mode développement avec rechargement automatique
dev:
	@echo "$(GREEN)Lancement en mode développement...$(NC)"
	npm run dev

# Mode production
start:
	@echo "$(GREEN)Lancement en mode production...$(NC)"
	MODE_ENV=production npm start

# Nettoyage
clean:
	@echo "$(GREEN)Nettoyage des fichiers temporaires...$(NC)"
	rm -rf node_modules/
	rm -f npm-debug.log*
	rm -f yarn-error.log*
	@echo "$(GREEN)Nettoyage terminé !$(NC)"

# Construction Docker
docker-build:
	@echo "$(GREEN)Construction de l'image Docker...$(NC)"
	docker build -t $(DOCKER_IMAGE):$(DOCKER_TAG) .

# Lancement Docker
docker-run:
# Docker
# ========================
	@echo "$(GREEN)Lancement du conteneur Docker...$(NC)"
	docker run -d --name idiamant2mqtt --env-file .env -p 3000:3000 $(DOCKER_IMAGE):$(DOCKER_TAG)

# Arrêt Docker
docker-stop:
	@echo "$(GREEN)Arrêt du conteneur Docker...$(NC)"
	docker stop idiamant2mqtt || true
	docker rm idiamant2mqtt || true

# Logs Docker
docker-logs:
	@echo "$(GREEN)Affichage des logs Docker...$(NC)"
	docker logs -f idiamant2mqtt



# Service
# ========================

# Génération de l'URL d'autorisation
auth-url:
	@echo "$(GREEN)🔑 Génération de l'URL d'autorisation OAuth2...$(NC)"
	@node src/token/auth-url-generator.js

# ========================
# Build et Publication
# ========================

# Build et publication Docker Hub avec incrémentation de version
docker-build-push: check-env
	@echo "$(GREEN)🚀 Lancement du build et publication Docker Hub...$(NC)"
	@if [ ! -f "scripts/build-docker-image.sh" ]; then \
		echo "$(RED)❌ Script build-docker-image.sh non trouvé$(NC)"; \
		exit 1; \
	fi
	@DOCKER_USER=$(DOCKER_USER) ./scripts/build-docker-image.sh

# Incrémenter manuellement la version
version-bump:
	@echo "$(GREEN)📦 Incrémentation manuelle de la version...$(NC)"
	@bash -c 'CURRENT_VERSION=$$(grep "\"version\"" package.json | sed "s/.*\"version\": \"\(.*\)\".*/\1/"); \
	echo "Version actuelle: $$CURRENT_VERSION"; \
	IFS="." read -r MAJOR MINOR PATCH <<< "$$CURRENT_VERSION"; \
	PATCH=$$((PATCH + 1)); \
	NEW_VERSION="$$MAJOR.$$MINOR.$$PATCH"; \
	echo "Nouvelle version: $$NEW_VERSION"; \
	jq ".version = \"$$NEW_VERSION\"" package.json > package.json.tmp && mv package.json.tmp package.json; \
	echo "$(GREEN)✅ Version mise à jour vers $$NEW_VERSION$(NC)"'

# Vérifier l'environnement et la configuration
check-env:
	@echo "$(GREEN)🔍 Vérification de l'environnement...$(NC)"
	@command -v node >/dev/null 2>&1 || { echo "$(RED)❌ Node.js n'est pas installé$(NC)"; exit 1; }
	@command -v npm >/dev/null 2>&1 || { echo "$(RED)❌ npm n'est pas installé$(NC)"; exit 1; }
	@command -v git >/dev/null 2>&1 || { echo "$(RED)❌ Git n'est pas installé$(NC)"; exit 1; }
	@command -v docker >/dev/null 2>&1 || { echo "$(RED)❌ Docker n'est pas installé$(NC)"; exit 1; }
	@command -v jq >/dev/null 2>&1 || { echo "$(RED)❌ jq n'est pas installé (sudo apt install jq)$(NC)"; exit 1; }
	@echo "$(GREEN)✅ Node.js: $$(node --version)$(NC)"
	@echo "$(GREEN)✅ npm: $$(npm --version)$(NC)"
	@echo "$(GREEN)✅ Git: $$(git --version | head -n1)$(NC)"
	@echo "$(GREEN)✅ Docker: $$(docker --version)$(NC)"
	@echo "$(GREEN)✅ jq: $$(jq --version)$(NC)"
	@if [ ! -f "config.conf" ]; then \
		echo "$(YELLOW)⚠️ Fichier config.conf manquant$(NC)"; \
		echo "$(BLUE)💡 Créez le fichier: cp config.conf.example config.conf$(NC)"; \
	else \
		echo "$(GREEN)✅ Fichier config.conf présent$(NC)"; \
	fi
	@echo "$(GREEN)✅ Tous les prérequis sont satisfaits$(NC)"

# Test de la configuration
test-config:
	@echo "$(GREEN)🔍 Test de la configuration...$(NC)"
	@node -e "try { const config = require('./src/config/config'); console.log('$(GREEN)✅ Configuration chargée avec succès$(NC)'); console.log('$(BLUE)📋 Paramètres principaux:$(NC)'); console.log('  Client ID:', config.IDIAMANT_CLIENT_ID ? '✅ Configuré' : '❌ Manquant'); console.log('  MQTT Broker:', config.MQTT_BROKER_URL); console.log('  Log Level:', config.LOG_LEVEL); console.log('  Environment:', config.MODE_ENV); } catch(e) { console.error('$(RED)❌ Erreur de configuration:$(NC)', e.message); process.exit(1); }"
	@echo "$(GREEN)🔍 Test du système de logging...$(NC)"
	@node -e "const logger = require('./src/utils/logger'); logger.info('Test configuration OK'); logger.info('auth', 'Test auth logging OK'); console.log('$(GREEN)✅ Système de logging fonctionnel$(NC)')"

# Génération de l'URL d'autorisation via Docker
docker-auth-url:
	@echo "$(GREEN)🔑 Génération de l'URL d'autorisation OAuth2 via Docker...$(NC)"
	@if [ ! -f "config.conf" ]; then \
		echo "$(RED)❌ Fichier config.conf non trouvé$(NC)"; \
		echo "$(BLUE)💡 Créez le fichier: cp config.conf.example config.conf$(NC)"; \
		exit 1; \
	fi
	@docker run --rm -v $(PWD)/config.conf:/app/config.conf:ro $(DOCKER_FULL_IMAGE) node src/token/auth-url-generator.js

# Test des logs Docker
test-docker-logs: docker-build
	@echo "$(GREEN)🐳 Test des logs Docker...$(NC)"
	@if [ ! -f "config-docker-test.conf" ]; then \
		echo "$(BLUE)📋 Création de la configuration de test Docker...$(NC)"; \
		cp config.conf.example config-docker-test.conf; \
		sed -i 's/VOTRE_CLIENT_ID/test_client_id/g' config-docker-test.conf; \
		sed -i 's/VOTRE_CLIENT_SECRET/test_client_secret/g' config-docker-test.conf; \
	fi
	@echo "$(GREEN)🔍 Lancement du test Docker...$(NC)"
	@docker run --rm -v $(PWD)/config-docker-test.conf:/app/config.conf $(DOCKER_IMAGE):$(DOCKER_TAG) \
		timeout 5s node -e "const logger = require('./src/utils/logger'); logger.info('✅ Logs Docker fonctionnels'); logger.warn('⚠️ Test warning'); logger.error('❌ Test error');" || echo "$(GREEN)✅ Test Docker terminé$(NC)"

# Par défaut, afficher l'aide
.DEFAULT_GOAL := help



# Par défaut, afficher l'aide
.DEFAULT_GOAL := help