const config = require('../config/config');

class HaDiscoveryPublisher {
  constructor(mqttClient) {
    this.mqttClient = mqttClient;
  }

  publishAuthStatus(tokens) {
    if (!config.HA_DISCOVERY || config.HA_DISCOVERY.toString().toLowerCase() !== 'true') return;
    if (!this.mqttClient) return;

    // Sensor: état d'authentification
    const authStatusTopic = `${config.HA_DISCOVERY_PREFIX}/binary_sensor/idiamant_auth_status/config`;
    const authStatusPayload = JSON.stringify({
      name: 'iDiamant Auth Status',
      unique_id: 'idiamant_auth_status',
      device_class: 'connectivity',
      state_topic: `${config.HA_DISCOVERY_PREFIX}/binary_sensor/idiamant_auth_status/state`,
      availability_topic: `${config.HA_DISCOVERY_PREFIX}/bridge/availability`,
      device: { name: config.HA_DEVICE_NAME, identifiers: ['idiamant_bridge'] }
    });
    this.mqttClient.publish(authStatusTopic, authStatusPayload, { retain: true });
    this.mqttClient.publish(`${config.HA_DISCOVERY_PREFIX}/binary_sensor/idiamant_auth_status/state`, 'ON', { retain: true });

    // Sensor: temps de validité du token
    const validityTopic = `${config.HA_DISCOVERY_PREFIX}/sensor/idiamant_token_validity/config`;
    const validityPayload = JSON.stringify({
      name: 'iDiamant Token Validity',
      unique_id: 'idiamant_token_validity',
      device_class: 'duration',
      unit_of_measurement: 's',
      state_topic: `${config.HA_DISCOVERY_PREFIX}/sensor/idiamant_token_validity/state`,
      availability_topic: `${config.HA_DISCOVERY_PREFIX}/bridge/availability`,
      device: { name: config.HA_DEVICE_NAME, identifiers: ['idiamant_bridge'] }
    });
    this.mqttClient.publish(validityTopic, validityPayload, { retain: true });
    this.mqttClient.publish(`${config.HA_DISCOVERY_PREFIX}/sensor/idiamant_token_validity/state`, tokens.expires_in.toString(), { retain: true });
  }
}

module.exports = HaDiscoveryPublisher;
