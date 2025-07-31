const axios = require('axios');
const logger = require('./logger');

class ApiHelper {
    constructor(baseURL, defaultTimeout = 10000) {
        this.baseURL = baseURL;
        this.defaultTimeout = defaultTimeout;
        this.accessToken = null;
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            retries: 0
        };
    }

    /**
     * Mettre à jour le token d'accès
     */
    setAccessToken(token) {
        this.accessToken = token;
        logger.debug('🔑 Token d\'accès mis à jour dans ApiHelper');
    }

    /**
     * Obtenir les headers avec authentification
     */
    _getAuthHeaders(customHeaders = {}) {
        const headers = { ...customHeaders };
        if (!headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }
        if (this.accessToken) {
            headers['Authorization'] = `Bearer ${this.accessToken}`;
        }
        return headers;
    }

    /**
     * GET sans retry, mais avec statistiques
     */
    async get(url, config = {}) {
        const endpoint = this._getEndpoint(url);
        this.metrics.totalRequests++;
        try {
            const response = await axios({
                method: 'GET',
                url: `${this.baseURL}${url}`,
                timeout: this.defaultTimeout,
                ...config,
                headers: this._getAuthHeaders(config.headers)
            });
            this.metrics.successfulRequests++;
            if (response.status < 200 || response.status >= 300) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response;
        } catch (error) {
            this.metrics.failedRequests++;
            logger.error(`❌ Requête GET échouée pour ${endpoint}:`, error.message);
            throw error;
        }
    }

    /**
     * POST sans retry, mais avec statistiques
     */
    async post(url, data = null, config = {}) {
        const endpoint = this._getEndpoint(url);
        this.metrics.totalRequests++;
        try {
            const response = await axios({
                method: 'POST',
                url: `${this.baseURL}${url}`,
                data,
                timeout: this.defaultTimeout,
                ...config,
                headers: this._getAuthHeaders(config.headers)
            });
            this.metrics.successfulRequests++;
            if (response.status < 200 || response.status >= 300) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response;
        } catch (error) {
            this.metrics.failedRequests++;
            logger.error(`❌ Requête POST échouée pour ${endpoint}:`, error.message);
            throw error;
        }
    }

    /**
     * PUT sans retry, mais avec statistiques
     */
    async put(url, data = null, config = {}) {
        const endpoint = this._getEndpoint(url);
        this.metrics.totalRequests++;
        try {
            const response = await axios({
                method: 'PUT',
                url: `${this.baseURL}${url}`,
                data,
                timeout: this.defaultTimeout,
                ...config,
                headers: this._getAuthHeaders(config.headers)
            });
            this.metrics.successfulRequests++;
            if (response.status < 200 || response.status >= 300) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response;
        } catch (error) {
            this.metrics.failedRequests++;
            logger.error(`❌ Requête PUT échouée pour ${endpoint}:`, error.message);
            throw error;
        }
    }

    /**
     * Health check avec authentification
     */
    async healthCheck(endpoint = '/homesdata') {
        try {
            const startTime = Date.now();
            const response = await this.get(endpoint, {
                retryOptions: { retries: 0, baseDelay: 0 }
            });
            const responseTime = Date.now() - startTime;
            return {
                healthy: true,
                status: response.status,
                responseTime,
                authenticated: !!this.accessToken,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                healthy: false,
                error: error.message,
                authenticated: !!this.accessToken,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Métriques de performance
     */
    getMetrics() {
        const successRate = this.metrics.totalRequests > 0 
            ? (this.metrics.successfulRequests / this.metrics.totalRequests * 100).toFixed(2)
            : 0;
        return {
            ...this.metrics,
            successRate: `${successRate}%`
        };
    }

    /**
     * Reset des métriques
     */
    resetMetrics() {
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            retries: 0
        };
    }

    // ===== MÉTHODES PRIVÉES =====

    _getEndpoint(url) {
        // Extrait le nom de l'endpoint pour les logs
        return url.split('?')[0].split('/')[1] || 'root';
    }
}

module.exports = ApiHelper;