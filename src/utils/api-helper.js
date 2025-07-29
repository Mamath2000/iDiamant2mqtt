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
        
        // ✅ Content-Type par défaut SEULEMENT si pas spécifié
        if (!headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }
        
        if (this.accessToken) {
            headers['Authorization'] = `Bearer ${this.accessToken}`;
        }
        
        return headers;
    }

    /**
     * Wrapper principal avec retry
     */
    async withRetry(apiCall, options = {}) {
        const {
            retries = 3,
            baseDelay = 1000,
            maxDelay = 30000,
            backoffMultiplier = 2,
            retryOn = [408, 429, 500, 502, 503, 504],
            endpoint = 'unknown'
        } = options;

        let lastError;
        
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                this.metrics.totalRequests++;
                
                const result = await apiCall();
                
                this.metrics.successfulRequests++;
                
                if (attempt > 0) {
                    logger.info(`✅ Succès après ${attempt} tentative(s) pour ${endpoint}`);
                }
                
                return result;
                
            } catch (error) {
                lastError = error;
                this.metrics.failedRequests++;
                
                // ✅ Si 401 Unauthorized, le token est peut-être expiré
                if (error.response && error.response.status === 401) {
                    logger.warn(`🔑 Token expiré pour ${endpoint}, arrêt des retries`);
                    break; // Ne pas retry sur les erreurs d'auth
                }
                
                // Vérifier si on doit retry
                const shouldRetry = attempt < retries && this._shouldRetry(error, retryOn);
                
                if (shouldRetry) {
                    this.metrics.retries++;
                    const delay = Math.min(baseDelay * Math.pow(backoffMultiplier, attempt), maxDelay);
                    
                    logger.warn(`⚠️ Tentative ${attempt + 1}/${retries + 1} échouée pour ${endpoint}: ${error.message}. Retry dans ${delay}ms`);
                    
                    await this._sleep(delay);
                } else {
                    break;
                }
            }
        }
        
        logger.error(`❌ Toutes les tentatives échouées pour ${endpoint}:`, lastError.message);
        throw lastError;
    }

    /**
     * GET avec retry automatique et authentification
     */
    async get(url, config = {}) {
        const endpoint = this._getEndpoint(url);
        
        return this.withRetry(async () => {
            const response = await axios({
                method: 'GET',
                url: `${this.baseURL}${url}`,
                timeout: this.defaultTimeout,
                ...config,
                headers: this._getAuthHeaders(config.headers)
            });
            
            if (response.status < 200 || response.status >= 300) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return response;
        }, { endpoint, ...config.retryOptions });
    }

    /**
     * POST avec retry automatique et authentification
     */
    async post(url, data = null, config = {}) {
        const endpoint = this._getEndpoint(url);
        
        return this.withRetry(async () => {
            const response = await axios({
                method: 'POST',
                url: `${this.baseURL}${url}`,
                data,
                timeout: this.defaultTimeout,
                ...config,
                headers: this._getAuthHeaders(config.headers)
            });
            
            if (response.status < 200 || response.status >= 300) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return response;
        }, { endpoint, ...config.retryOptions });
    }

    /**
     * PUT avec retry automatique et authentification
     */
    async put(url, data = null, config = {}) {
        const endpoint = this._getEndpoint(url);
        
        return this.withRetry(async () => {
            const response = await axios({
                method: 'PUT',
                url: `${this.baseURL}${url}`,
                data,
                timeout: this.defaultTimeout,
                ...config,
                headers: this._getAuthHeaders(config.headers)
            });
            
            if (response.status < 200 || response.status >= 300) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return response;
        }, { endpoint, ...config.retryOptions });
    }

    /**
     * Health check avec authentification
     */
    async healthCheck(endpoint = '/homesdata') {
        try {
            const startTime = Date.now();
            const response = await this.get(endpoint, {
                retryOptions: { retries: 1, baseDelay: 2000 }
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

    _shouldRetry(error, retryOn) {
        // Retry sur les codes d'erreur HTTP spécifiés
        if (error.response && retryOn.includes(error.response.status)) {
            return true;
        }
        
        // Retry sur les erreurs réseau
        if (error.code === 'ECONNRESET' || 
            error.code === 'ENOTFOUND' || 
            error.code === 'ECONNREFUSED' ||
            error.code === 'ETIMEDOUT') {
            return true;
        }
        
        return false;
    }

    _getEndpoint(url) {
        // Extrait le nom de l'endpoint pour les logs
        return url.split('?')[0].split('/')[1] || 'root';
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = ApiHelper;