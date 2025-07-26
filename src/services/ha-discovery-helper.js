#!/usr/bin/env node
const logger = require('../utils/logger');

class haDiscoveryHelper {
    constructor(mqttClient, config) {
        this.mqttClient = mqttClient;
        this.config = config;
        this.isDiscoveryEnabled = this.config.HA_DISCOVERY || false;
        this.discoveryPrfix = this.config.HA_DISCOVERY_PREFIX || 'homeassistant';
        this.baseTopic = `${this.config.MQTT_TOPIC_PREFIX}`;
    }


    publishGatewayComponents(bridgeId) {
        if (!this.isDiscoveryEnabled) {
            return;
        }
        const identifier = `idiamant_${bridgeId.replace(/:/g, '')}`;
        const device = {
            identifiers: [identifier],
            name: 'Idiamant Gateway',
            manufacturer: 'Netatmo',
            connections: [
                ['mac', bridgeId] // Remplacer par l'adresse MAC de votre appareil
            ]
        }
        const origin = {
            name: "iDiamant2mqtt"
        };
        const stateTopic = `${this.baseTopic}/bridge`;
        const gatewayTopic = `${this.discoveryPrfix}/device/${identifier}/config`;
        const gatewayPayload = {
            device: device,
            origin: origin,
            components: {
                idiamant_gateway_refresh_token: {
                    platform: 'button',
                    object_id: 'idiamant_gateway_refresh_token',
                    unique_id: 'idiamant_gateway_refresh_token',
                    name: 'Refresh Token',
                    force_update: true,
                    command_topic: `${stateTopic}/cmd`,
                    payload_press: 'refreshToken',
                    icon: 'mdi:refresh'
                },
                idiamant_gateway_token_expire_at: {
                    platform: 'sensor',
                    object_id: 'idiamant_gateway_token_expire_at',
                    unique_id: 'idiamant_gateway_token_expire_at',
                    name: 'Token Expire At',
                    force_update: true,
                    state_topic: `${stateTopic}/expire_at_ts`,
                    value_template: '{{ as_datetime(value|int /1000) }}',
                    device_class: 'timestamp',
                    icon: 'mdi:clock-outline',
                    expire_after: 10800 // 3 heures
                },
                idiamant_gateway_token_expire_at_text: {
                    platform: 'sensor',
                    object_id: 'idiamant_gateway_token_expire_at_text',
                    unique_id: 'idiamant_gateway_token_expire_at_text',
                    name: 'Token Expire At Text',
                    force_update: true,
                    state_topic: `${stateTopic}/expire_date`,
                    icon: 'mdi:clock-outline',
                    expire_after: 10800 // 3 heures
                },
                idiamant_gateway_state: {
                    platform: 'binary_sensor',
                    object_id: 'idiamant_gateway_state',
                    unique_id: 'idiamant_gateway_state',
                    name: 'State',
                    force_update: true,
                    state_topic: `${stateTopic}/lwt`,
                    payload_off: 'offline',
                    payload_on: 'online',
                    device_class: 'connectivity'
                }

            }
        };

        this.mqttClient.publish(gatewayTopic, JSON.stringify(gatewayPayload), { retain: true });
        console.log(`Composant Gateway publié sur le topic ${gatewayTopic}`);
    }

    publishShutterComponents(device, bridgeId) {
        if (!this.isDiscoveryEnabled || !device || !device.id || !device.name) {
            return;
        }

        const identifier = `idiamant_shutter_${device.id}`;
        const device_def = {
            identifiers: [identifier],
            name: `Volet ${device.name.charAt(0).toUpperCase() + device.name.slice(1)}`,
            manufacturer: 'Dubendorff',
            serial_number: device.id,
            model: 'Type VB 3002 R1',
            via_device: `idiamant_${bridgeId.replace(/:/g, '')}`
        };
        const origin = {
            name: "iDiamant2mqtt"
        };
        const stateTopic = `${this.baseTopic}/${device.id}`;
        const gatewayTopic = `${this.discoveryPrfix}/device/${identifier}/config`;
        const gatewayPayload = {
            device: device_def,
            origin: origin,
            components: {
                [`idiamant_${device.name}_state_label`]: {
                    platform: "sensor",
                    object_id: `volet_${device.name}_state_label`,
                    unique_id: `idiamant_${device.id}_state_label`,
                    name: "Label",
                    state_topic: `${stateTopic}/state_fr`,
                    force_update: "true",
                    icon: "mdi:blinds-vertical",
                    has_entity_name: true
                },
                [`idiamant_${device.name}_state`]: {
                    platform: "sensor",
                    object_id: `volet_${device.name}_state`,
                    unique_id: `idiamant_${device.id}_state`,
                    name: "Etat",
                    state_topic: `${stateTopic}/state`,
                    force_update: "true",
                    icon: "mdi:blinds-vertical",
                    has_entity_name: true
                },
                [`idiamant_${device.name}_is_open`]: {
                    platform: "binary_sensor",
                    object_id: `volet_${device.name}_is_open`,
                    unique_id: `idiamant_${device.id}_is_open`,
                    name: "Est ouvert",
                    state_topic: `${stateTopic}/is_open`,
                    value_template: "{{ 1 if value==true else 0 }}",
                    payload_on: 1,
                    payload_off: 0,
                    force_update: true,
                    icon: "mdi:lock-open-variant",
                    has_entity_name: true
                },
                [`idiamant_${device.name}_is_closed`]: {
                    platform: "binary_sensor",
                    object_id: `volet_${device.name}_is_closed`,
                    unique_id: `idiamant_${device.id}_is_closed`,
                    name: "Est fermé",
                    state_topic: `${stateTopic}/is_close`,
                    value_template: "{{ 1 if value==true else 0 }}",
                    payload_on: 1,
                    payload_off: 0,
                    force_update: true,
                    icon: "mdi:lock-open-variant",
                    has_entity_name: true
                },
                [`idiamant_${device.name}_cmd_open`]: {
                    platform: "button",
                    object_id: `volet_${device.name}_cmd_open`,
                    unique_id: `idiamant_${device.id}_cmd_open`,
                    name: "Ouvrir",
                    command_topic: `${stateTopic}/cmd`,
                    payload_press: "open",
                    icon: "mdi:arrow-expand-horizontal",
                    has_entity_name: true
                },
                [`idiamant_${device.name}_cmd_close`]: {
                    platform: "button",
                    object_id: `volet_${device.name}_cmd_close`,
                    unique_id: `idiamant_${device.id}_cmd_close`,
                    name: "Fermer",
                    command_topic: `${stateTopic}/cmd`,
                    payload_press: "close",
                    icon: "mdi:arrow-collapse-horizontal",
                    has_entity_name: true
                },
                [`idiamant_${device.name}_cmd_half`]: {
                    platform: "button",
                    object_id: `volet_${device.name}_cmd_half`,
                    unique_id: `idiamant_${device.id}_cmd_half`,
                    name: "Entreouvrir",
                    command_topic: `${stateTopic}/cmd`,
                    payload_press: "half_open",
                    icon: "mdi:arrow-collapse",
                    has_entity_name: true
                },
                [`idiamant_${device.name}_cmd_stop`]: {
                    platform: "button",
                    object_id: `volet_${device.name}_cmd_stop`,
                    unique_id: `idiamant_${device.id}_cmd_stop`,
                    name: "Arrêt",
                    command_topic: `${stateTopic}/cmd`,
                    payload_press: "stop",
                    icon: "mdi:square-outline",
                    has_entity_name: true
                },
                [`idiamant_${device.name}_last_seen`]: {
                    platform: 'sensor',
                    object_id: `volet_${device.name}_last_seen`,
                    unique_id: `idiamant_${device.id}_last_seen`,
                    name: 'Dernière vue',
                    force_update: true,
                    state_topic: `${stateTopic}/last_seen`,
                    value_template: '{{ as_datetime(value|int /1000) }}',
                    device_class: 'timestamp',
                    icon: 'mdi:clock-outline'
                },
                [`idiamant_${device.name}_etat`]: {
                    platform: 'binary_sensor',
                    object_id: `volet_${device.name}_etat`,
                    unique_id: `idiamant_${device.id}_etat`,
                    name: 'État',
                    force_update: true,
                    state_topic: `${stateTopic}/lwt`,
                    payload_off: 'offline',
                    payload_on: 'online',
                    device_class: 'connectivity'
                },
                [`idiamant_${device.name}_cover`]: {
                    platform: 'cover',
                    object_id: `volet_${device.name}_cover`,
                    unique_id: `idiamant_${device.id}_cover`,
                    name: `Volet ${device.name.charAt(0).toUpperCase() + device.name.slice(1)}`,
                    command_topic: `${stateTopic}/cmd`,
                    state_topic: `${stateTopic}/state`,
                    payload_open: 'open',
                    payload_close: 'close',
                    payload_stop: 'stop',
                    state_open: 'open',
                    state_closed: 'closed',
                    optimistic: false,
                }

            }
        };

        this.mqttClient.publish(gatewayTopic, JSON.stringify(gatewayPayload), { retain: true });
        console.log(`Composant Volet publié sur le topic ${gatewayTopic}`);
    }

}

module.exports = haDiscoveryHelper;