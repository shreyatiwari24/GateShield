const db = require('../db/pool');
const serviceRegistry = require('../services/serviceRegistry');

/**
 * Authorization middleware for GateShield API Gateway.
 * Checks if the authenticated client has permission to access the matched backend service.
 */
async function authorization(req, res, next) {
  try {
    const client = req.client;
    if (!client) {
      return next(); // No client = unauthenticated route, let other middleware handle
    }

    // Determine which service this request targets
    
    let fullPath = req.originalUrl
      ? req.originalUrl.split('?')[0]
      : req.path;

    // Remove /external prefix before matching service
    if (fullPath.startsWith('/external/')) {
      fullPath = fullPath.replace(/^\/external/, '');
    }

    const service = serviceRegistry.getServiceByPrefix(fullPath);

    if (!service) {
      // No matching service found — let the proxy handle the 404/fallback
      return next();
    }

    // Attach the matched service to the request for downstream use
    req.service = service;

    // Check client_service_permissions table
    const result = await db.query(
      `SELECT is_allowed FROM client_service_permissions
       WHERE client_id = $1 AND service_id = $2`,
      [client.id, service.id]
    );

    if (result.rows.length === 0 || !result.rows[0].is_allowed) {
      return res.status(403).json({
        error: 'Access denied',
        message: `Client '${client.name}' is not authorized to access '${service.name}'`,
      });
    }

    return next();
  } catch (error) {
    // Fail open: if authorization check fails, allow the request through
    console.warn('[Authorization] Error checking permissions, failing open:', error.message);
    return next();
  }
}

module.exports = authorization;
