const axios = require('axios');

// Read C++ rate limiter service base URL from environment or default to localhost:8081
const RATE_LIMITER_URL = process.env.RATE_LIMITER_URL || 'http://localhost:8081';

/**
 * Check if a request should be allowed by calling the C++ rate limiter service.
 * Supports both positional parameters and an options object.
 *
 * @param {number|object} clientId - Numeric client ID, or configuration object
 * @param {string} [route] - Endpoint route (e.g. '/api/products')
 * @param {string} [algorithm] - 'token_bucket' | 'fixed_window' | 'sliding_window'
 * @param {number} [maxRequests] - Maximum requests allowed per window
 * @param {number} [windowSeconds] - Window size in seconds
 * @param {number} [bucketCapacity] - Token bucket maximum capacity
 * @param {number} [refillRate] - Token bucket refill rate (tokens/sec)
 * @returns {Promise<{ allowed: boolean, remaining: number, retry_after: number }>}
 */
async function check(clientId, route, algorithm, maxRequests, windowSeconds, bucketCapacity, refillRate) {
  let payload;

  // Build the payload using snake_case keys that the C++ Crow service expects
  if (typeof clientId === 'object' && clientId !== null) {
    const config = clientId;
    payload = {
      client_id: String(config.clientId || config.client_id || 'anonymous'),
      route: config.route || '/',
      algorithm: config.algorithm || 'token_bucket',
      max_requests: config.maxRequests ?? config.max_requests ?? 100,
      window_seconds: config.windowSeconds ?? config.window_seconds ?? 60,
      bucket_capacity: config.bucketCapacity ?? config.bucket_capacity ?? 10,
      refill_rate: config.refillRate ?? config.refill_rate ?? 1.0,
    };
  } else {
    payload = {
      client_id: String(clientId),
      route: route || '/',
      algorithm: algorithm || 'token_bucket',
      max_requests: maxRequests ?? 100,
      window_seconds: windowSeconds ?? 60,
      bucket_capacity: bucketCapacity ?? 10,
      refill_rate: refillRate ?? 1.0,
    };
  }

  try {
    const response = await axios.post(`${RATE_LIMITER_URL}/check`, payload, {
      timeout: 2000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = response.data || {};
    return {
      allowed: data.allowed !== undefined ? Boolean(data.allowed) : true,
      remaining: data.remaining !== undefined ? Number(data.remaining) : 0,
      retry_after: data.retry_after !== undefined ? Number(data.retry_after) : (data.retryAfter !== undefined ? Number(data.retryAfter) : 0),
    };
  } catch (error) {
    // Fail open: if the rate limiter service is unreachable or errors, allow traffic through
    console.warn(`[RateLimiterClient] Warning: Failed to contact rate limiter service at ${RATE_LIMITER_URL}/check (${error.message}). Failing open.`);
    return {
      allowed: true,
      remaining: -1,
      retry_after: 0,
    };
  }
}

/**
 * Health check for the C++ rate limiter service.
 * @returns {Promise<boolean>} True if healthy, false otherwise
 */
async function health() {
  try {
    const response = await axios.get(`${RATE_LIMITER_URL}/health`, {
      timeout: 2000,
    });
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

module.exports = {
  check,
  health,
};
