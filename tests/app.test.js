const App = require('../src/index');
const config = require('../src/config/config');

describe('Application', () => {
  let app;

  beforeEach(() => {
    app = new App();
  });

  describe('Configuration validation', () => {
    test('should validate required configuration fields', () => {
      // Mock de la configuration pour les tests
      const originalConfig = { ...config };
      
      // Test avec configuration manquante
      config.IDIAMANT_API_URL = '';
      
      expect(() => {
        app.validateConfig();
      }).toThrow('Configuration manquante');
      
      // Restauration de la configuration
      Object.assign(config, originalConfig);
    });

    test('should pass with valid configuration', () => {
      expect(() => {
        app.validateConfig();
      }).not.toThrow();
    });
  });

  describe('Application lifecycle', () => {
    test('should initialize application correctly', () => {
      expect(app.isRunning).toBe(false);
      expect(app.idiamantClient).toBeNull();
      expect(app.mqttClient).toBeNull();
      expect(app.shutterController).toBeNull();
    });
  });
});
