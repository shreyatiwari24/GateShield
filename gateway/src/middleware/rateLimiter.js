const rateLimiterClient = require('../services/rateLimiterClient');
const db = require('../db/pool');

/**
 * Rate Limiter middleware for GateShield API Gateway.
 * Interacts with the C++ rate limiter service to enforce limits.
 * Feature 4: Supports per-service rate limiting via service-scoped keys.
 */
async function rateLimiter(req, res, next) {
  try {
    const client = req.client;
    const rateConfig = req.rateConfig || {};

    // If client is missing (e.g. unauthenticated routes), skip rate limiting
    if (!client) {
      return next();
    }

    const clientId = client.id;
    const route = req.originalUrl ? req.originalUrl.split('?')[0] : (req.path || '/');
    const algorithm = rateConfig.algorithm || 'token_bucket';
    const maxRequests = rateConfig.max_requests !== undefined ? rateConfig.max_requests : 100;
    const windowSeconds = rateConfig.window_seconds !== undefined ? rateConfig.window_seconds : 60;
    const bucketCapacity = rateConfig.bucket_capacity !== undefined ? rateConfig.bucket_capacity : 10;
    const refillRate = rateConfig.refill_rate !== undefined ? rateConfig.refill_rate : 1.0;

    // Feature 4: Include service name in rate limit key for per-service isolation
    const serviceName = req.service ? req.service.name : 'global';
    const rateLimitRoute = `${serviceName}:${route}`;

    let result;
    try {
      result = await rateLimiterClient.check(
        clientId,
        rateLimitRoute,
        algorithm,
        maxRequests,
        windowSeconds,
        bucketCapacity,
        refillRate
      );
    } catch (clientErr) {
      console.warn('[RateLimiter] Rate limiter service failed, failing open:', clientErr.message);
      result = { allowed: true, remaining: -1, retry_after: 0 };
    }

    // Determine the configured limit to show in headers
    const limit = (algorithm === 'token_bucket' && bucketCapacity) ? bucketCapacity : maxRequests;

    if (result && result.allowed) {
      // Allowed: attach rate limit headers and proceed
      res.setHeader('X-RateLimit-Limit', String(limit));
      res.setHeader('X-RateLimit-Remaining', String(result.remaining));
      return next();
    } else {
      // Rejected: return 429 Too Many Requests
      const retryAfter = (result && result.retry_after !== undefined) ? result.retry_after : 1;
      res.setHeader('Retry-After', String(retryAfter));
      res.setHeader('X-RateLimit-Limit', String(limit));
      res.setHeader('X-RateLimit-Remaining', '0');

      // Log blocked request to database for monitoring dashboard
      const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';
      try {
        const logPromise = db.query(
          `INSERT INTO request_logs
           (client_id, route, method, status_code, allowed, response_time_ms, ip_address, service_name)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [clientId, route, req.method, 429, false, 0, ip, req.service ? req.service.name : null]
        );
        if (logPromise && typeof logPromise.catch === 'function') {
          logPromise.catch((logErr) => {
            console.warn('[RateLimiter] Failed to record blocked request to request_logs:', logErr.message);
          });
        }
      } catch (logErr) {
        console.warn('[RateLimiter] Failed to record blocked request to request_logs:', logErr.message);
      }

      return res.status(429).json({
        error: 'Rate limit exceeded',
        retry_after: retryAfter,
      });
    }
  } catch (error) {
    console.warn('[RateLimiter] Unexpected middleware error, failing open:', error.message);
    return next();
  }
}

module.exports = rateLimiter;
