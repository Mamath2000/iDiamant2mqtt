# Makefile pour iDiamant2MQTT

# Variables
NODE_VERSION := 18
DOCKER_IMAGE := idiamant2mqtt
DOCKER_TAG := latest
DOCKER_USER := mamath2000  # Remplacez par votre nom d'utilisateur Docker Hub

# Couleurs pour les messages
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
BLUE := \033[0;34m
NC := \033[0m # No Color

.PHONY: help install dev start test lint clean docker-build docker-run docker-stop docker-logs setup auth-url
.PHONY: service-install service-uninstall service-start service-stop service-logs
.PHONY: docker-build-push version-bump check-env

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
	@echo "  $(GREEN)make version-bump$(NC)        - Incrémenter manuellement la version"
	@echo ""
	@echo "$(YELLOW)🔧 CONFIGURATION:$(NC)"
	@echo "  $(GREEN)make install$(NC)             - Installation des dépendances"
	@echo "  $(GREEN)make check-env$(NC)           - Vérifier la configuration"
	@echo "  $(GREEN)make clean$(NC)               - Nettoyage des fichiers temporaires"
	@echo ""
	@echo "$(YELLOW)🔄 SERVICE SYSTÈME:$(NC)"
	@echo "  $(GREEN)make service-install$(NC)     - Installer le service systemd"
	@echo "  $(GREEN)make service-start$(NC)       - Démarrer le service systemd"
	@echo "  $(GREEN)make service-stop$(NC)        - Arrêter le service systemd"
	@echo "  $(GREEN)make service-logs$(NC)        - Logs du service systemd"
	@echo ""
	@echo "$(BLUE)📦 Version actuelle: $$(grep '"version"' package.json | sed 's/.*"version": "\(.*\)".*/\1/')$(NC)"
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

# ========================
# Build et Publication
# ========================

# Build et publication Docker Hub avec incrémentation de version
docker-build-push: check-env
	@echo "$(GREEN)🚀 Build et publication Docker Hub avec incrémentation de version...$(NC)"
	@bash -c 'set -e; \
	command -v jq >/dev/null 2>&1 || { echo "$(RED)❌ jq est requis mais non installé. Installez avec: sudo apt install jq$(NC)"; exit 1; }; \
	docker info | grep -q Username || { echo "$(RED)❌ Non connecté à Docker Hub. Lancez \"docker login\" d\'abord.$(NC)"; exit 1; }; \
	VERSION=$$(jq -r ".version" package.json); \
	GIT_REF=$$(git rev-parse --short HEAD); \
	echo "$(BLUE)📦 Version actuelle: $$VERSION$(NC)"; \
	echo "$(BLUE)🔀 Ref git: $$GIT_REF$(NC)"; \
	if [ -n "$$(git status --porcelain)" ]; then \
		echo "$(YELLOW)⚠️  Warning: Working directory non propre. Les changements non commités ne seront pas inclus.$(NC)"; \
		git status --short; \
		read -p "Continuer quand même ? (y/N): " -n 1 -r; \
		echo; \
		if [[ ! $$REPLY =~ ^[Yy]$$ ]]; then \
			echo "$(RED)❌ Abandon.$(NC)"; \
			exit 1; \
		fi; \
	fi; \
	echo "$(GREEN)🔨 Construction de l\'image Docker...$(NC)"; \
	docker build \
		--build-arg GIT_REF=$$GIT_REF \
		--build-arg BUILD_DATE=$$(date -u +"%Y-%m-%dT%H:%M:%SZ") \
		-t $(DOCKER_IMAGE):latest \
		-t $(DOCKER_IMAGE):$$VERSION \
		-t $(DOCKER_IMAGE):$$GIT_REF \
		.; \
	echo "$(GREEN)🏷️  Tagging des images...$(NC)"; \
	docker tag $(DOCKER_IMAGE):latest $(DOCKER_USER)/$(DOCKER_IMAGE):latest; \
	docker tag $(DOCKER_IMAGE):$$VERSION $(DOCKER_USER)/$(DOCKER_IMAGE):$$VERSION; \
	docker tag $(DOCKER_IMAGE):$$GIT_REF $(DOCKER_USER)/$(DOCKER_IMAGE):$$GIT_REF; \
	echo "$(GREEN)📤 Publication sur Docker Hub...$(NC)"; \
	docker push $(DOCKER_USER)/$(DOCKER_IMAGE):latest; \
	docker push $(DOCKER_USER)/$(DOCKER_IMAGE):$$VERSION; \
	docker push $(DOCKER_USER)/$(DOCKER_IMAGE):$$GIT_REF; \
	echo "$(GREEN)🔢 Incrémentation de la version...$(NC)"; \
	IFS="." read -r MAJOR MINOR PATCH <<< "$$VERSION"; \
	PATCH=$$((PATCH + 1)); \
	NEW_VERSION="$$MAJOR.$$MINOR.$$PATCH"; \
	echo "$(GREEN)📝 Mise à jour de package.json vers $$NEW_VERSION...$(NC)"; \
	jq ".version = \"$$NEW_VERSION\"" package.json > package.json.tmp && mv package.json.tmp package.json; \
	echo "$(GREEN)💾 Commit de la nouvelle version...$(NC)"; \
	git add package.json; \
	git commit -m "🚀 Bump version to $$NEW_VERSION\n\n- Auto-increment after Docker build\n- Docker images published:\n  - $(DOCKER_USER)/$(DOCKER_IMAGE):latest\n  - $(DOCKER_USER)/$(DOCKER_IMAGE):$$VERSION\n  - $(DOCKER_USER)/$(DOCKER_IMAGE):$$GIT_REF"; \
	echo ""; \
	echo "$(GREEN)✅ Build et publication terminés avec succès!$(NC)"; \
	echo "$(BLUE)📦 Version précédente: $$VERSION$(NC)"; \
	echo "$(BLUE)📦 Nouvelle version: $$NEW_VERSION$(NC)"; \
	echo "$(BLUE)🐳 Images Docker publiées:$(NC)"; \
	echo "   - $(DOCKER_USER)/$(DOCKER_IMAGE):latest"; \
	echo "   - $(DOCKER_USER)/$(DOCKER_IMAGE):$$VERSION"; \
	echo "   - $(DOCKER_USER)/$(DOCKER_IMAGE):$$GIT_REF"; \
	echo ""; \
	echo "$(YELLOW)💡 Pour déployer la nouvelle version:$(NC)"; \
	echo "   docker pull $(DOCKER_USER)/$(DOCKER_IMAGE):latest"; \
	echo "   docker run $(DOCKER_USER)/$(DOCKER_IMAGE):latest"; \
	echo ""; \
	echo "$(YELLOW)🔄 N\'oubliez pas de push le commit de version:$(NC)"; \
	echo "   git push origin main"'

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
	@if [ ! -f ".env" ]; then \
		echo "$(YELLOW)⚠️ Fichier .env manquant$(NC)"; \
		echo "$(BLUE)💡 Créez le fichier: cp .env.example .env$(NC)"; \
	else \
		echo "$(GREEN)✅ Fichier .env présent$(NC)"; \
	fi
	@echo "$(GREEN)✅ Tous les prérequis sont satisfaits$(NC)"

# Par défaut, afficher l'aide
.DEFAULT_GOAL := help



# Par défaut, afficher l'aide
.DEFAULT_GOAL := help