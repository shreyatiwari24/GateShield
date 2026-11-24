
const express = require('express');
const crypto = require('crypto');
const db = require('../db/pool');
const proxy = require('./proxy');
const serviceRegistry = require('../services/serviceRegistry');
const healthMonitor = require('../services/healthMonitor');
const { logAudit, getAuditLogs } = require('../services/auditLogger');
const {
  requireAdmin,
  requireAdminRole,
  login,
  register,
  me
} = require('../middleware/adminAuth');

const router = express.Router();

// ---- Feature 6: Admin Authentication Routes ----

router.post('/auth/login', login);

// Apply authentication to all subsequent routes
router.use(requireAdmin);

router.post('/auth/register', requireAdminRole, register);
router.get('/auth/me', me);


// ---- Feature 10: Advanced Analytics ----

/**
 * GET /admin/stats
 * Total, allowed and blocked requests in last 24 hours.
 */
router.get('/stats', async (req, res, next) => {
  try {
    const result = await db.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE allowed = true)::int AS allowed,
        COUNT(*) FILTER (WHERE allowed = false)::int AS blocked
      FROM request_logs
      WHERE created_at >= NOW() - INTERVAL '24 hours'
    `);

    const row = result?.rows?.[0] || {
      total: 0,
      allowed: 0,
      blocked: 0
    };

    res.json({
      total: row.total || 0,
      allowed: row.allowed || 0,
      blocked: row.blocked || 0,
      total_requests: row.total || 0,
      allowed_requests: row.allowed || 0,
      blocked_requests: row.blocked || 0
    });
  } catch (err) {
    next(err);
  }
});


/**
 * GET /admin/analytics
 * Hourly traffic, service statistics, top clients,
 * status codes and error rate.
 */
router.get('/analytics', async (req, res, next) => {
  try {
    const hours = req.query.hours === undefined
      ? 24
      : Number(req.query.hours);

    if (
      !Number.isInteger(hours) ||
      hours < 1 ||
      hours > 720
    ) {
      return res.status(400).json({
        error: 'Hours must be between 1 and 720'
      });
    }

    const validHours = hours;

    // Hourly traffic breakdown
    const hourlyResult = await db.query(`
      SELECT
        date_trunc('hour', created_at) AS hour,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE allowed = true)::int AS allowed,
        COUNT(*) FILTER (WHERE allowed = false)::int AS blocked,
        ROUND(AVG(response_time_ms)::numeric, 2) AS avg_response_ms
      FROM request_logs
      WHERE created_at >= NOW() - ($1 || ' hours')::interval
      GROUP BY date_trunc('hour', created_at)
      ORDER BY hour DESC
    `, [validHours]);

    // Per-service statistics
    const serviceResult = await db.query(`
      SELECT
        COALESCE(service_name, 'unknown') AS service_name,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE allowed = true)::int AS allowed,
        COUNT(*) FILTER (WHERE allowed = false)::int AS blocked,
        ROUND(AVG(response_time_ms)::numeric, 2) AS avg_response_ms,
        ROUND(
          PERCENTILE_CONT(0.95)
          WITHIN GROUP (ORDER BY response_time_ms)::numeric,
          2
        ) AS p95_response_ms
      FROM request_logs
      WHERE created_at >= NOW() - ($1 || ' hours')::interval
      GROUP BY service_name
      ORDER BY total DESC
    `, [validHours]);

    // Top clients by request volume
    const topClientsResult = await db.query(`
      SELECT
        c.id,
        c.name,
        COUNT(*)::int AS total_requests,
        COUNT(*) FILTER (WHERE l.allowed = true)::int AS allowed,
        COUNT(*) FILTER (WHERE l.allowed = false)::int AS blocked
      FROM request_logs l
      JOIN api_clients c ON l.client_id = c.id
      WHERE l.created_at >= NOW() - ($1 || ' hours')::interval
      GROUP BY c.id, c.name
      ORDER BY total_requests DESC
      LIMIT 10
    `, [validHours]);

    // HTTP status code distribution
    const statusResult = await db.query(`
      SELECT
        status_code,
        COUNT(*)::int AS count
      FROM request_logs
      WHERE created_at >= NOW() - ($1 || ' hours')::interval
      GROUP BY status_code
      ORDER BY count DESC
    `, [validHours]);

    // Error rate over time (5-minute buckets)
    const errorRateResult = await db.query(`
      SELECT
        date_trunc('minute', created_at) -
          (EXTRACT(minute FROM created_at)::int % 5)
          * INTERVAL '1 minute' AS bucket,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status_code >= 400)::int AS errors,
        ROUND(
          (
            COUNT(*) FILTER (WHERE status_code >= 400)::numeric /
            NULLIF(COUNT(*)::numeric, 0)
          ) * 100,
          2
        ) AS error_rate_pct
      FROM request_logs
      WHERE created_at >= NOW() - INTERVAL '6 hours'
      GROUP BY bucket
      ORDER BY bucket DESC
      LIMIT 72
    `);

    res.json({
      period_hours: validHours,
      hourly: hourlyResult.rows,
      per_service: serviceResult.rows,
      top_clients: topClientsResult.rows,
      status_codes: statusResult.rows,
      error_rate: errorRateResult.rows
    });

  } catch (err) {
    next(err);
  }
});


// ---- API Clients ----

/**
 * GET /admin/clients
 */
router.get('/clients', async (req, res, next) => {
  try {
    const result = await db.query(`
      SELECT
        c.id,
        c.name,
        c.is_active,
        c.created_at,
        c.revoked_at,
        r.id AS config_id,
        r.route_pattern,
        r.algorithm,
        r.max_requests,
        r.window_seconds,
        r.bucket_capacity,
        r.refill_rate
      FROM api_clients c
      LEFT JOIN rate_limit_configs r ON c.id = r.client_id
      ORDER BY c.id ASC
    `);

    const clientsMap = new Map();

    for (const row of result.rows) {
      if (!clientsMap.has(row.id)) {
        clientsMap.set(row.id, {
          id: row.id,
          name: row.name,
          is_active: row.is_active,
          created_at: row.created_at,
          revoked_at: row.revoked_at,
          config_id: row.config_id,
          route_pattern: row.route_pattern,
          algorithm: row.algorithm,
          max_requests: row.max_requests,
          window_seconds: row.window_seconds,
          bucket_capacity: row.bucket_capacity,
          refill_rate: row.refill_rate,
          configs: []
        });
      }

      if (row.config_id) {
        clientsMap.get(row.id).configs.push({
          id: row.config_id,
          client_id: row.id,
          route_pattern: row.route_pattern,
          algorithm: row.algorithm,
          max_requests: row.max_requests,
          window_seconds: row.window_seconds,
          bucket_capacity: row.bucket_capacity,
          refill_rate: row.refill_rate
        });
      }
    }

    res.json(Array.from(clientsMap.values()));

  } catch (err) {
    next(err);
  }
});


/**
 * POST /admin/clients
 * Create a new API client.
 */

router.post('/clients', requireAdminRole, async (req, res, next) => {
  let client;

  try {
    const {
      name,
      route_pattern = '*',
      algorithm = 'token_bucket',
      max_requests = 100,
      window_seconds = 60,
      bucket_capacity = 10,
      refill_rate = 1.0
    } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        error: 'Client name is required'
      });
    }

    const plaintextKey = `gs_${crypto.randomBytes(24).toString('hex')}`;

    const apiKeyHash = crypto
      .createHash('sha256')
      .update(plaintextKey)
      .digest('hex');

    // Start database transaction
    client = await db.pool.connect();
    await client.query('BEGIN');

    const clientResult = await client.query(
      `INSERT INTO api_clients
       (name, api_key_hash, is_active)
       VALUES ($1, $2, true)
       RETURNING id, name, is_active, created_at`,
      [name.trim(), apiKeyHash]
    );

    const newClient = clientResult.rows[0];

    const configResult = await client.query(
      `INSERT INTO rate_limit_configs
       (
         client_id,
         route_pattern,
         algorithm,
         max_requests,
         window_seconds,
         bucket_capacity,
         refill_rate
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        newClient.id,
        route_pattern,
        algorithm,
        max_requests,
        window_seconds,
        bucket_capacity,
        refill_rate
      ]
    );

    // Grant access to active services by default
    try {
      await client.query(
        `INSERT INTO client_service_permissions
         (client_id, service_id)
         SELECT $1, id
         FROM backend_services
         WHERE is_active = true
         ON CONFLICT (client_id, service_id) DO NOTHING`,
        [newClient.id]
      );
    } catch (permErr) {
      console.warn(
        '[Admin] Failed to auto-grant service permissions:',
        permErr.message
      );
    }

    await client.query('COMMIT');

    const adminId = req.admin ? req.admin.id : null;
    const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';

    await logAudit(
      adminId,
      'CREATE_CLIENT',
      'api_client',
      newClient.id,
      { name: name.trim() },
      ip
    );

    res.status(201).json({
      message: 'API client created successfully',
      client: newClient,
      api_key: plaintextKey,
      config: configResult.rows[0]
    });

  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('[Admin] Transaction rollback failed:', rollbackErr.message);
      }
    }

    next(err);

  } finally {
    if (client) {
      client.release();
    }
  }
});



// ---- API Key Rotation and Revocation ----

/**
 * POST /admin/clients/:id/rotate-key
 */
router.post('/clients/:id/rotate-key', requireAdminRole, async (req, res, next) => {
  try {
    const clientId = Number(req.params.id);

if (!Number.isSafeInteger(clientId) || clientId <= 0) {
  return res.status(400).json({ error: 'Invalid client ID' });
}

    const existing = await db.query(
      'SELECT * FROM api_clients WHERE id = $1',
      [clientId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const plaintextKey = `gs_${crypto.randomBytes(24).toString('hex')}`;

    const apiKeyHash = crypto
      .createHash('sha256')
      .update(plaintextKey)
      .digest('hex');

    const result = await db.query(
      `UPDATE api_clients
       SET api_key_hash = $1,
           is_active = true,
           revoked_at = NULL
       WHERE id = $2
       RETURNING id, name, is_active, created_at`,
      [apiKeyHash, clientId]
    );

    const adminId = req.admin ? req.admin.id : null;
    const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';

    await logAudit(
      adminId,
      'ROTATE_KEY',
      'api_client',
      clientId,
      { name: existing.rows[0].name },
      ip
    );

    res.json({
      message: 'API key rotated successfully. Save the new key — it will not be shown again.',
      client: result.rows[0],
      api_key: plaintextKey
    });

  } catch (err) {
    next(err);
  }
});


/**
 * POST /admin/clients/:id/revoke
 */
router.post('/clients/:id/revoke', requireAdminRole, async (req, res, next) => {
  try {
   const clientId = Number(req.params.id);

if (!Number.isSafeInteger(clientId) || clientId <= 0) {
  return res.status(400).json({ error: 'Invalid client ID' });
}

    const result = await db.query(
      `UPDATE api_clients
       SET is_active = false,
           revoked_at = NOW()
       WHERE id = $1
       RETURNING id, name, is_active, revoked_at`,
      [clientId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const adminId = req.admin ? req.admin.id : null;
    const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';

    await logAudit(
      adminId,
      'REVOKE_KEY',
      'api_client',
      clientId,
      { name: result.rows[0].name },
      ip
    );

    res.json({
      message: 'Client API key revoked',
      client: result.rows[0]
    });

  } catch (err) {
    next(err);
  }
});


/**
 * POST /admin/clients/:id/activate
 */
router.post('/clients/:id/activate', requireAdminRole, async (req, res, next) => {
  try {
    const clientId = Number(req.params.id);

if (!Number.isSafeInteger(clientId) || clientId <= 0) {
  return res.status(400).json({ error: 'Invalid client ID' });
}

    const result = await db.query(
      `UPDATE api_clients
       SET is_active = true,
           revoked_at = NULL
       WHERE id = $1
       RETURNING id, name, is_active`,
      [clientId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const adminId = req.admin ? req.admin.id : null;
    const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';

    await logAudit(
      adminId,
      'ACTIVATE_CLIENT',
      'api_client',
      clientId,
      { name: result.rows[0].name },
      ip
    );

    res.json({
      message: 'Client re-activated',
      client: result.rows[0]
    });

  } catch (err) {
    next(err);
  }
});


/**
 * PATCH /admin/clients/:id/deactivate
 */
router.patch('/clients/:id/deactivate', requireAdminRole, async (req, res, next) => {
  try {
    const clientId = Number(req.params.id);

if (!Number.isSafeInteger(clientId) || clientId <= 0) {
  return res.status(400).json({ error: 'Invalid client ID' });
}

    const result = await db.query(
      `UPDATE api_clients
       SET is_active = false
       WHERE id = $1
       RETURNING id, name, is_active`,
      [clientId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const adminId = req.admin ? req.admin.id : null;
    const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';

    await logAudit(
      adminId,
      'DEACTIVATE_CLIENT',
      'api_client',
      clientId,
      { name: result.rows[0].name },
      ip
    );

    res.json({
      message: 'Client deactivated successfully',
      client: result.rows[0]
    });

  } catch (err) {
    next(err);
  }
});


// ---- Backend Services CRUD ----

/**
 * GET /admin/services
 */
router.get('/services', async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT * FROM backend_services ORDER BY id ASC'
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});


/**
 * POST /admin/services
 */
router.post('/services', requireAdminRole, async (req, res, next) => {
  try {
    const service = await serviceRegistry.addService(req.body);

    const adminId = req.admin ? req.admin.id : null;
    const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';

    await logAudit(
      adminId,
      'CREATE_SERVICE',
      'backend_service',
      service.id,
      { name: service.name },
      ip
    );

    res.status(201).json({
      message: 'Backend service created',
      service
    });

  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        error: 'Service name or path prefix already exists'
      });
    }

    next(err);
  }
});


/**
 * PUT /admin/services/:id
 */
router.put('/services/:id', requireAdminRole, async (req, res, next) => {
  try {
   const id = Number(req.params.id);

if (!Number.isSafeInteger(id) || id <= 0) {
  return res.status(400).json({ error: 'Invalid service ID' });
}

    const service = await serviceRegistry.updateService(id, req.body);

    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const adminId = req.admin ? req.admin.id : null;
    const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';

    await logAudit(
      adminId,
      'UPDATE_SERVICE',
      'backend_service',
      id,
      req.body,
      ip
    );

    res.json({
      message: 'Backend service updated',
      service
    });

  } catch (err) {
    next(err);
  }
});


/**
 * DELETE /admin/services/:id
 */
router.delete('/services/:id', requireAdminRole, async (req, res, next) => {
  try {
    const id = Number(req.params.id);

if (!Number.isSafeInteger(id) || id <= 0) {
  return res.status(400).json({ error: 'Invalid service ID' });
}

    const service = await serviceRegistry.removeService(id);

    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const adminId = req.admin ? req.admin.id : null;
    const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';

    await logAudit(
      adminId,
      'DELETE_SERVICE',
      'backend_service',
      id,
      { name: service.name },
      ip
    );

    res.json({
      message: 'Backend service disabled',
      service
    });

  } catch (err) {
    next(err);
  }
});


// ---- Client-Service Permissions ----

/**
 * GET /admin/services/:id/permissions
 */
router.get('/services/:id/permissions', async (req, res, next) => {
  try {
    const serviceId = Number(req.params.id);

if (!Number.isSafeInteger(serviceId) || serviceId <= 0) {
  return res.status(400).json({ error: 'Invalid service ID' });
}

    const result = await db.query(`
      SELECT
        p.id,
        p.client_id,
        c.name AS client_name,
        p.is_allowed,
        p.created_at
      FROM client_service_permissions p
      JOIN api_clients c ON p.client_id = c.id
      WHERE p.service_id = $1
      ORDER BY c.name
    `, [serviceId]);

    res.json(result.rows);

  } catch (err) {
    next(err);
  }
});


/**
 * POST /admin/services/:id/permissions
 */
router.post('/services/:id/permissions', requireAdminRole, async (req, res, next) => {
  try {
    const serviceId = Number(req.params.id);
const clientId = Number(req.body.client_id);

if (
  !Number.isSafeInteger(serviceId) ||
  serviceId <= 0 ||
  !Number.isSafeInteger(clientId) ||
  clientId <= 0
) {
  return res.status(400).json({
    error: 'Invalid service ID or client ID'
  });
}

    const result = await db.query(
      `INSERT INTO client_service_permissions
       (client_id, service_id)
       VALUES ($1, $2)
       ON CONFLICT (client_id, service_id)
       DO UPDATE SET is_allowed = true
       RETURNING *`,
      [clientId, serviceId]
    );

    const adminId = req.admin ? req.admin.id : null;
    const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';

    await logAudit(
      adminId,
      'GRANT_PERMISSION',
      'permission',
      result.rows[0].id,
      { client_id: clientId, service_id: serviceId },
      ip
    );

    res.status(201).json({
      message: 'Permission granted',
      permission: result.rows[0]
    });

  } catch (err) {
    next(err);
  }
});


/**
 * DELETE /admin/services/:id/permissions/:clientId
 */
router.delete('/services/:id/permissions/:clientId', requireAdminRole, async (req, res, next) => {
  try {
    const serviceId = Number(req.params.id);
const clientId = Number(req.params.clientId);

if (
  !Number.isSafeInteger(serviceId) ||
  serviceId <= 0 ||
  !Number.isSafeInteger(clientId) ||
  clientId <= 0
) {
  return res.status(400).json({
    error: 'Invalid service or client ID'
  });
}

    const result = await db.query(
      `UPDATE client_service_permissions
       SET is_allowed = false
       WHERE client_id = $1 AND service_id = $2
       RETURNING *`,
      [clientId, serviceId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Permission not found'
      });
    }

    const adminId = req.admin ? req.admin.id : null;
    const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';

    await logAudit(
      adminId,
      'REVOKE_PERMISSION',
      'permission',
      result.rows[0].id,
      { client_id: clientId, service_id: serviceId },
      ip
    );

    res.json({
      message: 'Permission revoked'
    });

  } catch (err) {
    next(err);
  }
});


// ---- Activity / Config / Circuit Breaker ----

/**
 * GET /admin/activity
 */
router.get('/activity', async (req, res, next) => {
  try {
    const result = await db.query(`
      SELECT
        l.id,
        l.client_id,
        c.name AS client_name,
        l.route,
        l.method,
        l.status_code,
        l.allowed,
        l.response_time_ms,
        l.ip_address,
        l.service_name,
        l.created_at
      FROM request_logs l
      LEFT JOIN api_clients c ON l.client_id = c.id
      ORDER BY l.created_at DESC
      LIMIT 50
    `);

    res.json(result.rows);

  } catch (err) {
    next(err);
  }
});


/**
 * GET /admin/config
 */
router.get('/config', async (req, res, next) => {
  try {
    const result = await db.query(`
      SELECT
        r.id,
        r.client_id,
        c.name AS client_name,
        c.is_active AS is_active,
        r.route_pattern,
        r.algorithm,
        r.max_requests,
        r.window_seconds,
        r.bucket_capacity,
        r.refill_rate,
        r.created_at
      FROM rate_limit_configs r
      JOIN api_clients c ON r.client_id = c.id
      ORDER BY r.id ASC
    `);

    res.json(result.rows);

  } catch (err) {
    next(err);
  }
});


/**
 * PUT /admin/config/:id
 */
router.put('/config/:id', requireAdminRole, async (req, res, next) => {
  try {
    const configId = Number(req.params.id);

if (!Number.isSafeInteger(configId) || configId <= 0) {
  return res.status(400).json({
    error: 'Invalid config id'
  });
}

    const {
      algorithm,
      max_requests,
      window_seconds,
      bucket_capacity,
      refill_rate,
      route_pattern
    } = req.body;

    const existingResult = await db.query(
      'SELECT * FROM rate_limit_configs WHERE id = $1',
      [configId]
    );

    if (!existingResult.rows || existingResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Rate limit config not found'
      });
    }

    const current = existingResult.rows[0];

    const updateResult = await db.query(
      `UPDATE rate_limit_configs
       SET algorithm = COALESCE($1, algorithm),
           max_requests = COALESCE($2, max_requests),
           window_seconds = COALESCE($3, window_seconds),
           bucket_capacity = COALESCE($4, bucket_capacity),
           refill_rate = COALESCE($5, refill_rate),
           route_pattern = COALESCE($6, route_pattern)
       WHERE id = $7
       RETURNING *`,
      [
        algorithm !== undefined ? algorithm : current.algorithm,
        max_requests !== undefined ? max_requests : current.max_requests,
        window_seconds !== undefined ? window_seconds : current.window_seconds,
        bucket_capacity !== undefined ? bucket_capacity : current.bucket_capacity,
        refill_rate !== undefined ? refill_rate : current.refill_rate,
        route_pattern !== undefined ? route_pattern : current.route_pattern,
        configId
      ]
    );

    const adminId = req.admin ? req.admin.id : null;
    const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';

    await logAudit(
      adminId,
      'UPDATE_RATE_CONFIG',
      'rate_limit_config',
      configId,
      req.body,
      ip
    );

    res.json({
      message: 'Rate limit config updated successfully',
      config: updateResult.rows[0]
    });

  } catch (err) {
    next(err);
  }
});


// ---- Feature 7: Circuit Breakers ----

/**
 * GET /admin/circuit-breaker
 */
router.get('/circuit-breaker', (req, res) => {
  const cb = proxy.circuitBreaker ||
    (proxy.getCircuitBreaker ? proxy.getCircuitBreaker() : null);

  if (!cb) {
    return res.status(500).json({
      error: 'Circuit breaker not available'
    });
  }

  res.json(cb.getState());
});


/**
 * GET /admin/circuit-breakers
 */
router.get('/circuit-breakers', (req, res) => {
  const states = proxy.getAllCircuitBreakerStates
    ? proxy.getAllCircuitBreakerStates()
    : {};

  res.json(states);
});


// ---- Feature 9: Health Monitoring ----

/**
 * GET /admin/services/health
 */
router.get('/services/health', async (req, res, next) => {
  try {
    const status = await healthMonitor.getHealthStatus();
    res.json(status);
  } catch (err) {
    next(err);
  }
});


// ---- Feature 11: Audit Logs ----

/**
 * GET /admin/audit-logs
 */
router.get('/audit-logs', async (req, res, next) => {
  try {
    const limit = req.query.limit === undefined
      ? 100
      : Number(req.query.limit);

    const offset = req.query.offset === undefined
      ? 0
      : Number(req.query.offset);

    const adminId = req.query.admin_id === undefined
      ? undefined
      : Number(req.query.admin_id);

    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 500 ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      (
        adminId !== undefined &&
        (!Number.isInteger(adminId) || adminId < 1)
      )
    ) {
      return res.status(400).json({
        error: 'Invalid pagination or admin_id parameters'
      });
    }

    const action = req.query.action;
    const entityType = req.query.entity_type;

    const logs = await getAuditLogs({
      limit,
      offset,
      adminId,
      action,
      entityType
    });

    res.json(logs);

  } catch (err) {
    next(err);
  }
});


module.exports = router;
