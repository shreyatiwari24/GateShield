const axios = require('axios');
const db = require('../db/pool');
const serviceRegistry = require('./serviceRegistry');

/**
 * Backend Health Monitor for GateShield.
 * Generic and configurable health monitoring for internal and external services.
 * Does not hardcode any third-party provider.
 */
class HealthMonitor {
  constructor(options = {}) {
    this.intervalMs = options.intervalMs || 30000;
    this.failureThreshold = options.failureThreshold || 3;

    // Track consecutive failures for each service
    this.consecutiveFailures = new Map();

    this.timer = null;
    this.isChecking = false;
  }

  /**
   * Start periodic health monitoring.
   */
  start() {
    if (this.timer) return;

    console.log(
      `[HealthMonitor] Starting health checks every ${this.intervalMs / 1000}s`
    );

    // Initial health check after services start
    setTimeout(() => {
      this.checkAllServices();
    }, 5000);

    this.timer = setInterval(() => {
      this.checkAllServices();
    }, this.intervalMs);
  }

  /**
   * Stop health monitoring.
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[HealthMonitor] Stopped');
    }
  }

  /**
   * Resolve the target health check URL for a given service.
   * Supports:
   * - Fully qualified URLs (e.g. "https://api.example.com/status")
   * - Relative endpoints (e.g. "/health", "/ping", "/")
   * - Defaulting to "/health" when not specified
   */
  resolveHealthUrl(service) {
    const rawEndpoint = (service.health_endpoint || '').trim();
    if (rawEndpoint.startsWith('http://') || rawEndpoint.startsWith('https://')) {
      return rawEndpoint;
    }
    const baseUrl = (service.base_url || '').replace(/\/+$/, '');
    if (!rawEndpoint) {
      return `${baseUrl}/health`;
    }
    const endpoint = rawEndpoint.startsWith('/') ? rawEndpoint : `/${rawEndpoint}`;
    return `${baseUrl}${endpoint}`;
  }

  /**
   * Check all registered backend services.
   */
  async checkAllServices() {
    if (this.isChecking) return;
    this.isChecking = true;

    try {
      const services = serviceRegistry.getAllServices();
      for (const service of services) {
        await this.checkService(service);
      }
    } catch (error) {
      console.error(
        '[HealthMonitor] Failed to check services:',
        error.message
      );
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Check health of an individual backend service.
   * Generic implementation:
   * - Uses configurable health_endpoint (default: /health)
   * - Sends standard user agent and headers
   * - If default /health returns 404, gracefully probes base URL
   * - Marks 2xx/3xx (and responsive non-5xx for external endpoints) healthy
   * - Marks 5xx and network errors unhealthy
   * - Records status, latency, error message, and consecutive failure count
   */
  async checkService(service) {
    const startTime = Date.now();
    let status = 'healthy';
    let responseTimeMs = 0;
    let errorMessage = null;

    const resolvedUrl = this.resolveHealthUrl(service);
    const hasCustomEndpoint = Boolean(
      service.health_endpoint &&
      service.health_endpoint.trim() !== '' &&
      service.health_endpoint.trim() !== '/health'
    );

    const headers = {
      'User-Agent': 'GateShield-HealthMonitor/1.0',
      'Accept': 'application/json, text/plain, */*',
    };

    try {
      let response;

      try {
        response = await axios.get(resolvedUrl, {
          timeout: service.timeout_ms || 5000,
          headers,
          validateStatus: (s) => s < 500, // Do not throw on 4xx to inspect response
        });
      } catch (reqError) {
        // Network errors (DNS, ECONNREFUSED, ETIMEDOUT, etc.)
        throw reqError;
      }

      // If default /health was used and returned 404, fallback to checking base URL
      if (!hasCustomEndpoint && response.status === 404) {
        const baseUrl = (service.base_url || '').replace(/\/+$/, '');
        try {
          const fallbackResp = await axios.get(baseUrl, {
            timeout: service.timeout_ms || 5000,
            headers,
            validateStatus: (s) => s < 500,
          });
          response = fallbackResp;
        } catch (fallbackErr) {
          throw fallbackErr;
        }
      }

      responseTimeMs = Date.now() - startTime;

      // Status evaluation:
      // Status < 400 is healthy
      // 401 (auth required), 403 (e.g. rate-limit or bot protection on public API),
      // 405 (method not allowed) verify the server is live, reachable and responding
      if (
        response.status < 400 ||
        response.status === 401 ||
        response.status === 403 ||
        response.status === 405
      ) {
        status = 'healthy';
        this.consecutiveFailures.set(service.name, 0);
        console.log(
          `[HealthMonitor] ${service.name}: Healthy (${responseTimeMs}ms) [HTTP ${response.status}]`
        );
      } else {
        status = 'unhealthy';
        errorMessage = `HTTP ${response.status}`;
        await this._recordFailure(service);
      }
    } catch (error) {
      responseTimeMs = Date.now() - startTime;
      status = 'unhealthy';
      errorMessage = error.message || 'Connection failed';
      await this._recordFailure(service);
    }

    const currentFailures = this.consecutiveFailures.get(service.name) || 0;

    // Save health-check result in PostgreSQL
    try {
      await db.query(
        `INSERT INTO service_health_checks
         (service_id, status, response_time_ms, error_message, failure_count)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          service.id,
          status,
          responseTimeMs,
          errorMessage,
          currentFailures,
        ]
      );
    } catch (dbError) {
      console.error(
        '[HealthMonitor] Failed to record health check:',
        dbError.message
      );
    }
  }

  /**
   * Track consecutive failures and alert at threshold.
   */
  async _recordFailure(service) {
    const count = (this.consecutiveFailures.get(service.name) || 0) + 1;
    this.consecutiveFailures.set(service.name, count);

    console.warn(
      `[HealthMonitor] ${service.name}: Unhealthy (${count} consecutive failures)`
    );

    if (count >= this.failureThreshold) {
      console.error(
        `[HealthMonitor] ALERT: ${service.name} has reached ${count} consecutive failures`
      );
    }
  }

  /**
   * Get latest health status of all registered services.
   */
  async getHealthStatus() {
    try {
      const result = await db.query(`
        SELECT DISTINCT ON (s.id)
          s.id,
          s.name,
          s.base_url,
          s.path_prefix,
          s.health_endpoint,
          s.is_active,
          h.status AS health_status,
          h.response_time_ms,
          COALESCE(h.failure_count, 0) AS failure_count,
          h.error_message,
          h.checked_at
        FROM backend_services s
        LEFT JOIN service_health_checks h
          ON s.id = h.service_id
        ORDER BY s.id, h.checked_at DESC
      `);

      return result.rows;
    } catch (error) {
      console.error(
        '[HealthMonitor] Failed to fetch health status:',
        error.message
      );
      return [];
    }
  }
}

// Export singleton instance
const healthMonitor = new HealthMonitor();

module.exports = healthMonitor;
