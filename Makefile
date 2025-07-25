# Makefile pour iDiamant2MQTT

# Variables
NODE_VERSION := 18
DOCKER_IMAGE := idiamant2mqtt
DOCKER_TAG := latest

# Couleurs pour les messages
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
NC := \033[0m # No Color

.PHONY: help install dev start test lint clean docker-build docker-run setup

# Affichage de l'aide
help:
	@echo "$(GREEN)iDiamant2MQTT - Makefile$(NC)"
	@echo ""
	@echo "$(YELLOW)Commandes disponibles :$(NC)"
	@echo "  $(GREEN)make setup$(NC)       - Configuration initiale du projet"
	@echo "  $(GREEN)make install$(NC)     - Installation des dépendances"
	@echo "  $(GREEN)make dev$(NC)         - Lancement en mode développement"
	@echo "  $(GREEN)make start$(NC)       - Lancement en mode production"
	@echo "  $(GREEN)make test$(NC)        - Exécution des tests"
	@echo "  $(GREEN)make lint$(NC)        - Vérification du code (ESLint)"
	@echo "  $(GREEN)make lint-fix$(NC)    - Correction automatique du code"
	@echo "  $(GREEN)make clean$(NC)       - Nettoyage des fichiers temporaires"
	@echo "  $(GREEN)make docker-build$(NC) - Construction de l'image Docker"
	@echo "  $(GREEN)make docker-run$(NC)  - Lancement du conteneur Docker"
	@echo ""
	@echo "$(YELLOW)Authentification Netatmo :$(NC)"
	@echo "  $(GREEN)make auth-url$(NC)    - Générer l'URL d'autorisation OAuth2"
	@echo "  $(GREEN)make auth-help$(NC)   - Aide sur l'authentification"
	@echo ""
	@echo "$(YELLOW)Tests et diagnostics :$(NC)"
	@echo "  $(GREEN)make test-mqtt$(NC)   - Tester la connexion MQTT"
	@echo ""

# Configuration initiale
setup: install
	@echo "$(GREEN)Configuration initiale...$(NC)"
	@if [ ! -f .env ]; then cp .env.example .env; echo "$(YELLOW)Fichier .env créé. Veuillez le configurer.$(NC)"; fi
	@echo "$(GREEN)Projet configuré avec succès !$(NC)"

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
	npm start

# Tests
test:
	@echo "$(GREEN)Exécution des tests...$(NC)"
	npm test

# Tests en mode watch
test-watch:
	@echo "$(GREEN)Exécution des tests en mode watch...$(NC)"
	npm run test:watch

# Linting
lint:
	@echo "$(GREEN)Vérification du code avec ESLint...$(NC)"
	npm run lint

# Correction automatique
lint-fix:
	@echo "$(GREEN)Correction automatique du code...$(NC)"
	npm run lint:fix

# Nettoyage
clean:
	@echo "$(GREEN)Nettoyage des fichiers temporaires...$(NC)"
	rm -rf node_modules/
	rm -rf coverage/
	rm -f npm-debug.log*
	rm -f yarn-error.log*
	@echo "$(GREEN)Nettoyage terminé !$(NC)"

# Construction Docker
docker-build:
	@echo "$(GREEN)Construction de l'image Docker...$(NC)"
	docker build -t $(DOCKER_IMAGE):$(DOCKER_TAG) .

# Lancement Docker
docker-run:
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

# Vérification de l'environnement
check-env:
	@echo "$(GREEN)Vérification de l'environnement...$(NC)"
	@node --version || (echo "$(RED)Node.js n'est pas installé$(NC)" && exit 1)
	@npm --version || (echo "$(RED)npm n'est pas installé$(NC)" && exit 1)
	@echo "$(GREEN)Environnement OK !$(NC)"

# Installation globale des outils de développement
install-dev-tools:
	@echo "$(GREEN)Installation des outils de développement...$(NC)"
	npm install -g nodemon eslint

# Par défaut, afficher l'aide
.DEFAULT_GOAL := help

# Commandes d'authentification Netatmo
auth-url:
	@echo "$(GREEN)Génération de l'URL d'autorisation OAuth2...$(NC)"
	@node src/token/auth-url-generator.js

auth-help:
	@node src/token/auth-helper.js

# Tests et diagnostics
test-mqtt:
	@echo "$(GREEN)Test de connexion MQTT...$(NC)"
	node temp/mqtt-test.js
