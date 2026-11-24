
const crypto = require('crypto');
const db = require('../db/pool');

/**
 * Authentication middleware for GateShield API Gateway.
 * Verifies API keys and retrieves the client's rate limit configuration.
 */
async function auth(req, res, next) {
  try {
    // 1. Read API key from request header
    const apiKey =
      (typeof req.header === 'function' ? req.header('x-api-key') : null) ||
      (req.headers && req.headers['x-api-key']);

    // 2. Check if API key is provided
    if (!apiKey) {
      return res.status(401).json({
        error: 'API key required',
      });
    }

    // 3. Hash API key using SHA-256
    const apiKeyHash = crypto
      .createHash('sha256')
      .update(apiKey)
      .digest('hex');

    // 4. Verify API key, active status and revocation status
    const clientResult = await db.query(
      `SELECT id, name, api_key_hash, is_active
       FROM api_clients
       WHERE api_key_hash = $1
       AND is_active = true
       AND revoked_at IS NULL`,
      [apiKeyHash]
    );

    if (!clientResult.rows || clientResult.rows.length === 0) {
      return res.status(403).json({
        error: 'Invalid API key',
      });
    }

    const client = clientResult.rows[0];

    // 5. Fetch rate limit configurations for this client
    const configResult = await db.query(
      'SELECT * FROM rate_limit_configs WHERE client_id = $1',
      [client.id]
    );

    const configs = configResult.rows || [];

    // 6. Match route-specific rate limit configuration
    const currentPath = (req.path || '').toLowerCase();

    const originalPath = req.originalUrl
      ? req.originalUrl.split('?')[0].toLowerCase()
      : currentPath;

    let matchedConfig =
      configs.find(
        c => c.route_pattern.toLowerCase() === currentPath
      ) ||
      configs.find(
        c => c.route_pattern.toLowerCase() === originalPath
      ) ||
      configs.find(
        c =>
          currentPath.startsWith('/api') &&
          c.route_pattern.toLowerCase() ===
            currentPath.replace(/^\/api/, '')
      ) ||
      configs.find(c => c.route_pattern === '*') ||
      null;

    // 7. Default rate limit configuration
    if (!matchedConfig) {
      matchedConfig = {
        client_id: client.id,
        route_pattern: '*',
        algorithm: 'token_bucket',
        max_requests: 100,
        window_seconds: 60,
        bucket_capacity: 10,
        refill_rate: 1.0,
      };
    }

    // 8. Attach client and rate configuration to request
    req.client = client;
    req.rateConfig = matchedConfig;

    return next();

  } catch (error) {
    console.error(
      '[AuthMiddleware] Error validating API key:',
      error
    );

    return res.status(500).json({
      error: 'Internal server error during authentication',
    });
  }
}

module.exports = auth;
