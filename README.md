# iDiamant2MQTT

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![MQTT](https://img.shields.io/badge/MQTT-3.1.1-orange.svg)](https://mqtt.org/)

**Passerelle entre iDiamant (Netatmo) et MQTT pour l'intégration Home Assistant**

Une passerelle Node.js qui permet de contrôler les volets roulants iDiamant/Bubendorff via MQTT, avec une intégration automatique dans Home Assistant grâce au système de découverte automatique.

## ✨ Fonctionnalités

- 🏠 **Intégration Home Assistant** - Découverte automatique des dispositifs
- 🎛️ **Contrôle complet** - Ouverture, fermeture, arrêt et positionnement précis
- 📡 **Communication MQTT** - Protocol léger et fiable
- 🔄 **Synchronisation** - État en temps réel des volets
- 🛡️ **Robuste** - Gestion des erreurs et reconnexion automatique
- 📊 **Monitoring** - Logs détaillés et métriques
- 🐳 **Docker** - Déploiement simplifié
- ⚡ **Makefile** - Gestion simplifiée des tâches

## 📋 Prérequis

- **Node.js** 18+ 
- **Compte Netatmo** avec accès API iDiamant
- **Broker MQTT** (Mosquitto, Home Assistant, etc.)
- **Home Assistant** (optionnel mais recommandé)

## 🚀 Installation

### Installation rapide avec Make

```bash
# Clonage du projet
git clone https://github.com/Mamath2000/iDiamant2mqtt.git
cd iDiamant2mqtt

# Configuration et installation
make setup
```

### Installation manuelle

```bash
# Installation des dépendances
npm install

# Copie du fichier de configuration
cp .env.example .env

# Édition de la configuration
nano .env
```

## ⚙️ Configuration

### Variables d'environnement

Éditez le fichier `.env` avec vos paramètres :

```bash
# Configuration iDiamant/Netatmo
IDIAMANT_CLIENT_ID=your_client_id_here
IDIAMANT_CLIENT_SECRET=your_client_secret_here
IDIAMANT_USERNAME=your_netatmo_username
IDIAMANT_PASSWORD=your_netatmo_password

# Configuration MQTT
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=your_mqtt_username
MQTT_PASSWORD=your_mqtt_password
```

### Obtention des identifiants Netatmo

1. Créez un compte développeur sur [dev.netatmo.com](https://dev.netatmo.com)
2. Créez une nouvelle application
3. Récupérez votre `Client ID` and `Client Secret`
4. Utilisez vos identifiants Netatmo habituels pour `USERNAME` et `PASSWORD`

## 🎯 Utilisation

### Avec Make (recommandé)

```bash
# Lancement en développement
make dev

# Lancement en production
make start

# Tests
make test

# Vérification du code
make lint
```

### Avec npm

```bash
# Développement
npm run dev

# Production
npm start

# Tests
npm test
```

### Avec Docker

```bash
# Construction de l'image
make docker-build

# Lancement du conteneur
make docker-run

# Visualisation des logs
make docker-logs
```

## 📡 Intégration MQTT

### Topics MQTT

Pour chaque volet détecté, les topics suivants sont créés :

```
homeassistant/cover/{device_id}/set          # Commandes (OPEN/CLOSE/STOP)
homeassistant/cover/{device_id}/set_position # Position (0-100)
homeassistant/cover/{device_id}/state        # État actuel
homeassistant/cover/{device_id}/position     # Position actuelle
```

### Commandes disponibles

```bash
# Ouverture complète
mosquitto_pub -t "homeassistant/cover/device123/set" -m "OPEN"

# Fermeture complète
mosquitto_pub -t "homeassistant/cover/device123/set" -m "CLOSE"

# Arrêt
mosquitto_pub -t "homeassistant/cover/device123/set" -m "STOP"

# Position spécifique (50%)
mosquitto_pub -t "homeassistant/cover/device123/set_position" -m "50"
```

## 🏠 Intégration Home Assistant

L'intégration est **automatique** grâce au système de découverte MQTT de Home Assistant.

### Configuration Home Assistant

Assurez-vous que MQTT est configuré dans `configuration.yaml` :

```yaml
mqtt:
  broker: localhost
  port: 1883
  username: your_username
  password: your_password
  discovery: true
  discovery_prefix: homeassistant
```

### Entités créées

Chaque volet apparaîtra automatiquement comme une entité `cover.idiamant_device_name` avec :

- ✅ Contrôles d'ouverture/fermeture
- 📍 Contrôle de position précise
- 📊 État en temps réel
- 🔄 Historique des changements

## 📁 Structure du projet

```
iDiamant2mqtt/
├── src/
│   ├── index.js                 # Point d'entrée principal
│   ├── config/
│   │   └── config.js           # Configuration centralisée
│   ├── services/
│   │   ├── idiamant-client.js  # Client API iDiamant
│   │   └── mqtt-client.js      # Client MQTT
│   ├── controllers/
│   │   └── shutter-controller.js # Logique de contrôle
│   └── utils/
│       └── logger.js           # Système de logs
├── logs/                       # Fichiers de logs
├── Dockerfile                  # Configuration Docker
├── Makefile                    # Tâches automatisées
├── package.json               # Dépendances Node.js
└── .env.example              # Template de configuration
```

## 🔧 Développement

### Scripts disponibles

```bash
# Toutes les commandes Make
make help

# Développement avec rechargement automatique
make dev

# Tests avec couverture
make test

# Linting et formatage
make lint
make lint-fix

# Nettoyage
make clean
```

### Ajout de nouvelles fonctionnalités

1. **Fork** le projet
2. Créez une **branche** pour votre fonctionnalité
3. **Committez** vos changements
4. **Testez** avec `make test`
5. Soumettez une **Pull Request**

## 📊 Monitoring et logs

### Niveaux de logs

- `error` - Erreurs critiques
- `warn` - Avertissements
- `info` - Informations générales (défaut)
- `debug` - Informations détaillées

### Fichiers de logs

```
logs/
├── combined.log    # Tous les logs
├── error.log      # Erreurs uniquement
├── exceptions.log # Exceptions non gérées
└── rejections.log # Promesses rejetées
```

### Commandes de monitoring

```bash
# Logs en temps réel
tail -f logs/combined.log

# Erreurs uniquement
tail -f logs/error.log

# Avec Docker
make docker-logs
```

## 🚨 Dépannage

### Problèmes courants

#### Erreur d'authentification Netatmo
```bash
# Vérifiez vos identifiants
grep IDIAMANT .env

# Testez la connexion
curl -X POST "https://api.netatmo.com/oauth2/token" \
  -d "grant_type=password&client_id=YOUR_ID&client_secret=YOUR_SECRET&username=YOUR_USER&password=YOUR_PASS"
```

#### Connexion MQTT échouée
```bash
# Testez le broker MQTT
mosquitto_pub -h localhost -p 1883 -t "test" -m "hello"

# Vérifiez les logs
tail -f logs/error.log
```

#### Dispositifs non détectés
```bash
# Vérifiez les logs de découverte
grep "dispositifs.*découverts" logs/combined.log

# Mode debug
LOG_LEVEL=debug make start
```

### Support

- 📖 **Documentation** : Ce README
- 🐛 **Issues** : [GitHub Issues](https://github.com/Mamath2000/iDiamant2mqtt/issues)
- 💬 **Discussions** : [GitHub Discussions](https://github.com/Mamath2000/iDiamant2mqtt/discussions)

## 📄 Licence

Ce projet est sous licence **MIT**. Voir le fichier `LICENSE` pour plus de détails.

## 🤝 Contribution

Les contributions sont les bienvenues ! Consultez le guide de contribution pour plus d'informations.

## 🔄 Changelog

### v1.0.0
- ✨ Version initiale
- 🏠 Intégration Home Assistant
- 📡 Support MQTT complet
- 🎛️ Contrôle des volets iDiamant
- 🐳 Support Docker
- ⚡ Makefile pour la gestion

---

**Développé avec ❤️ pour la communauté domotique**
