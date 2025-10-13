# iDiamant2MQTT - Déploiement Docker

Guide pour déployer iDiamant2MQTT avec Docker et Docker Compose.

## 🚀 Démarrage Rapide

### 1. Récupérer l'image
```bash
docker pull mathmath350/idiamant2mqtt:latest
```

### 2. Préparer la configuration
```bash
# Copier le fichier d'exemple
cp config.conf.example config.conf

# Éditer avec vos paramètres
nano config.conf
```

### 3. Lancer avec Docker Compose
```bash
docker-compose up -d
```

### 4. Voir les logs
```bash
# Logs en temps réel
docker-compose logs -f idiamant2mqtt

# Logs des dernières 100 lignes
docker logs --tail 100 idiamant2mqtt
```

## 📋 Configuration Docker

### Variables d'environnement importantes
- `DOCKER_ENV=true` : Active le mode Docker (désactive les couleurs dans les logs)
- `NODE_ENV=production` : Mode production

### Volumes montés
- `./config.conf:/app/config.conf:ro` : Configuration en lecture seule
- `./logs:/app/logs` : Dossier des logs persistants

### Gestion des logs
Les logs sont disponibles de **3 manières** :

1. **stdout Docker** (pour `docker logs`)
   ```bash
   docker logs idiamant2mqtt
   ```

2. **Fichiers de log** (montés via volume)
   ```bash
   tail -f logs/app.log
   tail -f logs/auth.log
   tail -f logs/mqtt.log
   ```

3. **Docker Compose logs**
   ```bash
   docker-compose logs -f
   ```

## 🔧 Configuration des logs Docker

Le système adapte automatiquement le format des logs selon l'environnement :

| Environnement | Couleurs | Destination | Format |
|---------------|----------|-------------|---------|
| Terminal local | ✅ Oui | Console + Fichiers | Avec couleurs et icônes |
| Docker | ❌ Non | stdout + Fichiers | Sans couleurs, Docker-friendly |

### Exemple de logs Docker
```
2025-10-13 14:30:39 ℹ️  [info]: ✅ Logs Docker fonctionnels
2025-10-13 14:30:39 ⚠️  [warn]: ⚠️ Test warning  
2025-10-13 14:30:39 ❌  [error]: ❌ Test error
```

## 🐳 Commandes Docker utiles

### Build local
```bash
# Build l'image localement
make docker-build

# Test des logs Docker
make test-docker-logs
```

### Gestion du conteneur
```bash
# Démarrer
docker-compose up -d

# Arrêter  
docker-compose down

# Redémarrer
docker-compose restart

# Voir l'état
docker-compose ps
```

### Debugging
```bash
# Shell dans le conteneur
docker exec -it idiamant2mqtt sh

# Voir les logs en temps réel
docker-compose logs -f

# Health check
docker inspect idiamant2mqtt | grep Health
```

## 📊 Monitoring et Health Check

Le conteneur inclut un health check automatique :

```yaml
healthcheck:
  test: ["CMD", "node", "-e", "console.log('Health check OK')"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 10s
```

Vérifier l'état :
```bash
docker ps  # Colonne STATUS
docker inspect idiamant2mqtt --format='{{.State.Health.Status}}'
```

## 🔄 Mise à jour

```bash
# Récupérer la nouvelle version
docker pull mathmath350/idiamant2mqtt:latest

# Relancer
docker-compose down
docker-compose up -d
```

## 🛠️ Dépannage

### Problème de permissions logs
```bash
mkdir -p logs
chmod 755 logs
```

### Logs ne s'affichent pas
```bash
# Vérifier que le conteneur tourne
docker ps

# Vérifier les logs du conteneur
docker logs idiamant2mqtt

# Vérifier la configuration montée
docker exec idiamant2mqtt cat config.conf
```

### Config.conf non trouvé
```bash
# Vérifier le montage
docker exec idiamant2mqtt ls -la /app/config.conf

# Recréer depuis l'exemple
cp config.conf.example config.conf
```

## 📈 Production

Pour un déploiement en production :

1. **Utiliser un reverse proxy** (Traefik, Nginx)
2. **Monitoring** avec Prometheus + Grafana
3. **Sauvegarde** de `config.conf` et `logs/`
4. **Mise à jour automatique** avec Watchtower

Exemple avec Watchtower :
```yaml
watchtower:
  image: containrrr/watchtower
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
  command: --interval 3600 idiamant2mqtt
```

Les logs sont parfaitement intégrés pour Docker ! 🚀