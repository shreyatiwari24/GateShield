const express = require('express');
const axios = require('axios');
const db = require('../db/pool');
const { CircuitBreaker } = require('../middleware/circuitBreaker');
const serviceRegistry = require('../services/serviceRegistry');

const router = express.Router();

// Fallback for existing BACKEND_URL env var (backward compatibility)
//const FALLBACK_BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

// ---- Feature 7: Per-service circuit breaker registry ----
const circuitBreakers = new Map();

function getCircuitBreaker(serviceName) {
  if (!circuitBreakers.has(serviceName)) {
    circuitBreakers.set(serviceName, new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 30000,
      halfOpenMaxAttempts: 1,
    }));
  }
  return circuitBreakers.get(serviceName);
}

/**
 * Get all circuit breaker states (for admin dashboard).
 */
function getAllCircuitBreakerStates() {
  const states = {};
  for (const [name, breaker] of circuitBreakers) {
    states[name] = breaker.getState();
  }
  return states;
}

/**
 * Log request details to PostgreSQL request_logs table.
 */
async function logRequest(clientId, route, method, statusCode, allowed, responseTimeMs, ip, serviceName) {
  try {
    await db.query(
      `INSERT INTO request_logs
       (client_id, route, method, status_code, allowed, response_time_ms, ip_address, service_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [clientId, route, method, statusCode, allowed, responseTimeMs, ip, serviceName || null]
    );
  } catch (err) {
    console.error('[Proxy] Failed to log request to database:', err.message);
  }
}

/**
 * Feature 8: Retry with exponential backoff for safe HTTP methods.
 */

async function requestWithRetry(config, retryCount, retryOnCodes) {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  const method = (config.method || 'GET').toUpperCase();

  const configuredRetries = Number.isInteger(Number(retryCount))
    ? Number(retryCount)
    : 0;

  const maxRetries = safeMethods.includes(method)
    ? Math.min(Math.max(configuredRetries, 0), 3)
    : 0;

  const retryableCodes = retryOnCodes
    ? retryOnCodes.split(',')
        .map(c => parseInt(c.trim(), 10))
        .filter(c => !isNaN(c))
    : [502, 503];

  const networkErrors = [
    'ECONNABORTED',
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'ENOTFOUND',
    'ERR_NETWORK',
  ];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await axios(config);
    } catch (err) {
      const status = err.response?.status;

      const isRetryable =
        retryableCodes.includes(status) ||
        (!status && networkErrors.includes(err.code));

      if (attempt >= maxRetries || !isRetryable) {
        throw err;
      }

      const delay = Math.min(100 * Math.pow(2, attempt), 2000);

      console.log(
        `[Proxy] Retry ${attempt + 1}/${maxRetries} ` +
        `for ${config.url} after ${delay}ms`
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}


/**
 * Feature 2: Dynamic routing — forward request to matched backend service.
 */
async function forwardToService(req, res, service) {
  const startTime = Date.now();
  const clientId = req.client ? req.client.id : null;
  const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';
  const method = req.method;
  const route = req.originalUrl ? req.originalUrl.split('?')[0] : (req.baseUrl + req.path);
  const serviceName = service ? service.name : 'unknown';
  

  // Strip the path prefix to get the backend-relative path
  // let backendPath = req.path;
  // if (service && service.path_prefix) {
  //   const prefix = service.path_prefix.replace(/^\/api/, '');
  //   // req.path under /api mount is e.g. '/products' or '/products/123'
  //   // We forward to the backend as-is since the backend expects '/products'
  // }

  const baseUrl = service.base_url.replace(/\/+$/, '');

 let backendPath = req.path;

  // External requests: remove the service prefix before forwarding
  if (req.baseUrl === '/external' && service.path_prefix) {
    const externalPath = req.originalUrl.split('?')[0]
      .replace(/^\/external/, '');

    backendPath = externalPath.slice(service.path_prefix.length) || '/';

    if (!backendPath.startsWith('/')) {
      backendPath = `/${backendPath}`;
    }
  }

  const targetUrl = `${baseUrl}${backendPath}`;

  const timeoutMs = service ? (service.timeout_ms || 5000) : 5000;
  const retryCount = service ? (service.retry_count || 0) : 0;
  const retryOn = service ? (service.retry_on || '') : '';

  // Feature 7: Get per-service circuit breaker
  const breaker = getCircuitBreaker(serviceName);

  try {
    const backendResponse = await breaker.fire(async () => {
      return await requestWithRetry({
        method: req.method,
        url: targetUrl,
        params: req.query,
        data: ['POST', 'PUT', 'PATCH'].includes(req.method) ? req.body : undefined,
        headers: {
          'Content-Type': 'application/json',
          ...(req.headers['x-api-key'] ? { 'x-api-key': req.headers['x-api-key'] } : {}),
        },
        timeout: timeoutMs,
      }, retryCount, retryOn);
    });

    const responseTimeMs = Date.now() - startTime;
    await logRequest(clientId, route, method, backendResponse.status, true, responseTimeMs, ip, serviceName);
    return res.status(backendResponse.status).json(backendResponse.data);
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;

    if (error.name === 'CircuitOpenError' || breaker.state === 'OPEN') {
      await logRequest(clientId, route, method, 503, false, responseTimeMs, ip, serviceName);
      return res.status(503).json({ error: 'Service temporarily unavailable', service: serviceName });
    }

    if (error.response) {
      const statusCode = error.response.status || 502;
      await logRequest(clientId, route, method, statusCode, false, responseTimeMs, ip, serviceName);
      return res.status(statusCode).json(error.response.data || { error: 'Backend error' });
    }

    await logRequest(clientId, route, method, 502, false, responseTimeMs, ip, serviceName);
    return res.status(502).json({ error: 'Bad Gateway: Backend service unreachable', service: serviceName });
  }
}

/**
 * Feature 2: Dynamic catch-all route — matches any /api/* path and routes
 * to the appropriate backend service using the service registry.
 */

router.all('/*', async (req, res) => {
  const isExternal = req.baseUrl === '/external';

  const fullPath = isExternal
    ? req.originalUrl.split('?')[0].replace(/^\/external/, '')
    : '/api' + req.path;

  const service = serviceRegistry.getServiceByPrefix(fullPath);

  // Reject unregistered routes
  if (!service) {
    console.log(`[Proxy] No registered service found for: ${fullPath}`);

    return res.status(404).json({
      error: 'Service not found',
      message: `No backend service registered for route: ${fullPath}`,
    });
  }

  // Reject registered but disabled services
  if (!service.is_active) {
    return res.status(503).json({
      error: 'Service is currently disabled',
      service: service.name,
    });
  }

  // Forward only registered and active services
  return forwardToService(req, res, service);
});

// Expose for admin routes and tests
router.circuitBreaker = getCircuitBreaker('legacy-backend'); // backward compat
router.getCircuitBreaker = () => getCircuitBreaker('legacy-backend');
router.getAllCircuitBreakerStates = getAllCircuitBreakerStates;
router.getCircuitBreakerForService = getCircuitBreaker;
router.logRequest = logRequest;

module.exports = router;
module.exports.circuitBreaker = router.circuitBreaker;
module.exports.getCircuitBreaker = router.getCircuitBreaker;
module.exports.getAllCircuitBreakerStates = getAllCircuitBreakerStates;
module.exports.logRequest = logRequest;
