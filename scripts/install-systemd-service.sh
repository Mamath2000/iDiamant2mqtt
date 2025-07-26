#!/bin/bash
set -e

TEMPLATE="../src/config/idiamant2mqtt.service.template"
TARGET="/etc/systemd/system/idiamant2mqtt.service"
USER_NAME="$(whoami)"
WORKDIR="$(pwd)"

if [ ! -f "$TEMPLATE" ]; then
  echo "Template systemd introuvable : $TEMPLATE"
  exit 1
fi

sed "s|__USER__|$USER_NAME|g; s|__WORKDIR__|$WORKDIR|g" "$TEMPLATE" > /tmp/idiamant2mqtt.service
sudo cp /tmp/idiamant2mqtt.service "$TARGET"
sudo systemctl daemon-reload
sudo systemctl enable idiamant2mqtt.service
sudo systemctl restart idiamant2mqtt.service

echo "Service installé et démarré. Utilisez 'sudo systemctl status idiamant2mqtt' pour vérifier."
