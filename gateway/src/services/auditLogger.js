const db = require('../db/pool');

/**
 * Audit Logger for GateShield admin operations.
 * Records all administrative actions for accountability and compliance.
 */
async function logAudit(adminId, action, entityType, entityId, details, ipAddress) {
  try {
    await db.query(
      `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        adminId || null,
        action,
        entityType || null,
        entityId || null,
        details ? JSON.stringify(details) : null,
        ipAddress || null,
      ]
    );
  } catch (err) {
    console.error('[AuditLogger] Failed to record audit log:', err.message);
  }
}

/**
 * Query audit logs with optional filters.
 */
async function getAuditLogs({ limit = 100, offset = 0, adminId, action, entityType } = {}) {
  try {
    let where = [];
    let params = [];
    let idx = 1;

    if (adminId) {
      where.push(`a.admin_id = $${idx++}`);
      params.push(adminId);
    }
    if (action) {
      where.push(`a.action ILIKE $${idx++}`);
      params.push(`%${action}%`);
    }
    if (entityType) {
      where.push(`a.entity_type = $${idx++}`);
      params.push(entityType);
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    params.push(limit);
    params.push(offset);

    const result = await db.query(`
      SELECT a.id, a.admin_id, u.username AS admin_username,
             a.action, a.entity_type, a.entity_id, a.details,
             a.ip_address, a.created_at
      FROM audit_logs a
      LEFT JOIN admin_users u ON a.admin_id = u.id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT $${idx++} OFFSET $${idx}
    `, params);

    return result.rows;
  } catch (err) {
    console.error('[AuditLogger] Failed to fetch audit logs:', err.message);
    return [];
  }
}

module.exports = {
  logAudit,
  getAuditLogs,
};
