# Configuration iDiamant2MQTT

Ce projet utilise maintenant un fichier `config.conf` au lieu du fichier `.env` pour une meilleure lisibilité et organisation.

## 🚀 Installation Rapide

```bash
# 1. Configuration initiale (crée config.conf depuis l'exemple)
make setup

# 2. Éditer la configuration
nano config.conf

# 3. Générer l'URL d'autorisation Netatmo
make auth-url

# 4. Démarrer l'application
make start
```

## 📋 Structure du fichier config.conf

Le fichier de configuration est organisé en sections :

### [netatmo] - Configuration API Netatmo
```ini
api_url = https://api.netatmo.com
redirect_uri = https://votre-domaine.com/netatmo/callback
client_id = VOTRE_CLIENT_ID
client_secret = VOTRE_CLIENT_SECRET
```

### [device] - Configuration iDiamant
```ini
idiamant_ip = 192.168.1.100
```

### [mqtt] - Configuration MQTT
```ini
broker_url = mqtt://localhost:1883
username = 
password = 
client_id = idiamant2mqtt_${netatmo.client_id}
topic_prefix = idiamant2mqtt
keepalive = 60
```

### [homeassistant] - Intégration Home Assistant
```ini
discovery = true
discovery_prefix = homeassistant
device_name = iDiamant Bridge
```

### [logging] - Configuration des logs
```ini
console_level = info
file_level = debug
auth_level = debug
mqtt_level = info
```

### [application] - Configuration générale
```ini
environment = production
sync_interval = 30000
auth_server_port = 3000
auth_server_host = 0.0.0.0
log_directory = ./logs
app_log_file = app.log
auth_log_file = auth.log
```

## 🔧 Fonctionnalités Avancées

### Variables dynamiques
Le système supporte les références entre sections :
```ini
client_id = idiamant2mqtt_${netatmo.client_id}
```

### Niveaux de log par catégorie
- `console_level` : Logs affichés dans la console
- `file_level` : Logs sauvés dans app.log
- `auth_level` : Logs d'authentification dans auth.log
- `mqtt_level` : Logs MQTT dans mqtt.log

### Validation automatique
Le système vérifie automatiquement :
- Présence du fichier `config.conf`
- Champs obligatoires (`client_id`, `client_secret`, `redirect_uri`)
- Format des valeurs (booléens, entiers)

## 🐳 Docker et Versioning

### Build et publication automatique
```bash
# Build + Publication Docker Hub + Bump version
make docker-build-push

# Juste incrémenter la version
make version-bump

# Vérifier l'environnement
make check-env
```

## 📝 Migration depuis .env

Si vous avez un ancien fichier `.env`, voici la correspondance :

| Ancien (.env) | Nouveau (config.conf) |
|---------------|----------------------|
| `IDIAMANT_CLIENT_ID` | `[netatmo] client_id` |
| `MQTT_BROKER_URL` | `[mqtt] broker_url` |
| `LOG_LEVEL` | `[logging] console_level` |
| `APP_LOG_LEVEL` | `[logging] file_level` |

## 🛠️ Dépannage

### Erreur "Fichier config.conf non trouvé"
```bash
cp config.conf.example config.conf
nano config.conf
```

### Erreur "Configuration incomplète"
Vérifiez que ces champs sont remplis :
- `[netatmo] client_id`
- `[netatmo] client_secret` 
- `[netatmo] redirect_uri`

### Problème de permissions logs
```bash
mkdir -p logs
chmod 755 logs
```

## 📚 Commandes Make Disponibles

| Commande | Description |
|----------|-------------|
| `make help` | Affiche l'aide |
| `make setup` | Configuration initiale |
| `make start` | Lancement production |
| `make dev` | Lancement développement |
| `make auth-url` | Générer URL OAuth2 |
| `make docker-build-push` | Build + Publish + Version |
| `make check-env` | Vérifier l'environnement |
| `make service-install` | Installer service systemd |

La nouvelle configuration est plus flexible, plus lisible et plus robuste ! 🚀