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

.PHONY: help install dev start test lint clean docker-build docker-run docker-stop docker-logs setup auth-url install-service uninstall-service service-start service-stop service-logs
.PHONY: help install dev start test lint clean docker-build docker-run docker-stop docker-logs setup auth-url service-install service-uninstall service-start service-stop service-logs

# ========================
# Install
# ========================
help:
	@echo "$(GREEN)iDiamant2MQTT - Makefile$(NC)"
	@echo ""
	@echo "$(YELLOW)Install :$(NC)"
	@echo "  $(GREEN)make setup$(NC)       - Configuration initiale du projet"
	@echo "  $(GREEN)make install$(NC)     - Installation des dépendances"
	@echo "  $(GREEN)make clean$(NC)       - Nettoyage des fichiers temporaires"
	@echo ""
	@echo "$(YELLOW)Run & Debug :$(NC)"
	@echo "  $(GREEN)make dev$(NC)         - Lancement en mode développement"
	@echo "  $(GREEN)make start$(NC)       - Lancement en mode production"
	@echo "  $(GREEN)make auth-url$(NC)    - Générer l'URL d'autorisation OAuth2"
	@echo ""
	@echo "$(YELLOW)Docker :$(NC)"
	@echo "  $(GREEN)make docker-build$(NC) - Construction de l'image Docker"
	@echo "  $(GREEN)make docker-run$(NC)  - Lancement du conteneur Docker"
	@echo "  $(GREEN)make docker-stop$(NC) - Arrêt du conteneur Docker"
	@echo "  $(GREEN)make docker-logs$(NC) - Affichage des logs Docker"
	@echo ""
	@echo "$(YELLOW)Service :$(NC)"
	@echo "  $(GREEN)make service-install$(NC)   - Installer le service systemd (démarrage auto)"
	@echo "  $(GREEN)make service-uninstall$(NC) - Désinstaller le service systemd"
	@echo "  $(GREEN)make service-start$(NC)     - Démarrer le service systemd"
	@echo "  $(GREEN)make service-stop$(NC)      - Arrêter le service systemd"
	@echo "  $(GREEN)make service-logs$(NC)      - Afficher les logs du service systemd"
	@echo ""

# ========================
# Install
# ========================


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

# Vérification de l'environnement
check-env:
	@echo "$(GREEN)Vérification de l'environnement...$(NC)"
	@node --version || (echo "$(RED)Node.js n'est pas installé$(NC)" && exit 1)
	@npm --version || (echo "$(RED)npm n'est pas installé$(NC)" && exit 1)
	@echo "$(GREEN)Environnement OK !$(NC)"

# Service
# ========================

# Commandes d'authentification Netatmo
auth-url:
	@echo "$(GREEN)Génération de l'URL d'autorisation OAuth2...$(NC)"
	@node src/token/auth-url-generator.js

# Désinstallation du service systemd
service-uninstall:
	@echo "Suppression du service systemd idiamant2mqtt..."
	sudo systemctl stop idiamant2mqtt.service || true
	sudo systemctl disable idiamant2mqtt.service || true
	sudo rm -f /etc/systemd/system/idiamant2mqtt.service
	sudo systemctl daemon-reload
	@echo "Service supprimé. Utilisez 'sudo systemctl status idiamant2mqtt' pour vérifier."

# Installation du service systemd
service-install:
	@echo "Installation du service systemd idiamant2mqtt..."
	@bash scripts/install-systemd-service.sh

# Démarrer le service systemd
service-start:
	@echo "Démarrage du service systemd idiamant2mqtt..."
	sudo systemctl start idiamant2mqtt.service

# Arrêter le service systemd
service-stop:
	@echo "Arrêt du service systemd idiamant2mqtt..."
	sudo systemctl stop idiamant2mqtt.service

# Logs du service systemd
service-logs:
	@echo "Affichage des logs du service systemd idiamant2mqtt..."
	sudo journalctl -u idiamant2mqtt.service -f



# Par défaut, afficher l'aide
.DEFAULT_GOAL := help