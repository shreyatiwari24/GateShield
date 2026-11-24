
const db = require('../db/pool');

/**
 * Dynamic Backend Service Registry for GateShield.
 * Loads all services and matches routes, including inactive services.
 */
class ServiceRegistry {
  constructor() {
    this.services = [];
    this.loaded = false;
  }

  /**
   * Load all backend services from PostgreSQL.
   */
  async refresh() {
    try {
      const result = await db.query(
        `SELECT id, name, base_url, path_prefix, description, is_active,
                timeout_ms, retry_count, retry_on, health_endpoint, created_at, updated_at
         FROM backend_services
         ORDER BY length(path_prefix) DESC`
      );

      this.services = result.rows || [];
      this.loaded = true;

      console.log(
        `[ServiceRegistry] Loaded ${this.services.length} backend services`
      );
    } catch (err) {
      console.error(
        '[ServiceRegistry] Failed to load services:',
        err.message
      );

      if (!this.loaded) {
        this.services = [];
      }
    }
  }

  /**
   * Find the best matching service by path prefix.
   * Returns both active and inactive services.
   */
  getServiceByPrefix(path) {
    const normalizedPath = path.toLowerCase().split('?')[0];

    // Services are sorted by longest prefix first
    for (const svc of this.services) {
      const prefix = svc.path_prefix.toLowerCase();

      if (
        normalizedPath === prefix ||
        normalizedPath.startsWith(prefix + '/')
      ) {
        return svc;
      }
    }

    return null;
  }

  /**
   * Get all registered services.
   */
  getAllServices() {
    return this.services;
  }

  /**
   * Get service by database ID.
   */
  getServiceById(id) {
    return this.services.find(s => s.id === id) || null;
  }

  /**
   * Add a new backend service.
   */
  async addService({
    name,
    base_url,
    path_prefix,
    description,
    timeout_ms,
    retry_count,
    retry_on,
    health_endpoint
  }) {
    const result = await db.query(
      `INSERT INTO backend_services
       (name, base_url, path_prefix, description, timeout_ms, retry_count, retry_on, health_endpoint)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        name,
        base_url,
        path_prefix,
        description || null,
        timeout_ms || 5000,
        retry_count || 0,
        retry_on || '',
        health_endpoint ? health_endpoint.trim() : '/health'
      ]
    );

    await this.refresh();

    return result.rows[0];
  }

  /**
   * Update an existing backend service.
   */
  async updateService(id, updates) {
    const fields = [];
    const values = [];
    let idx = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (
        [
          'name',
          'base_url',
          'path_prefix',
          'description',
          'is_active',
          'timeout_ms',
          'retry_count',
          'retry_on',
          'health_endpoint'
        ].includes(key)
      ) {
        fields.push(`${key} = $${idx}`);
        values.push(value);
        idx++;
      }
    }

    if (fields.length === 0) return null;

    fields.push('updated_at = NOW()');
    values.push(id);

    const result = await db.query(
      `UPDATE backend_services
       SET ${fields.join(', ')}
       WHERE id = $${idx}
       RETURNING *`,
      values
    );

    await this.refresh();

    return result.rows[0] || null;
  }

  /**
   * Soft-delete a service by disabling it.
   */
  async removeService(id) {
    const result = await db.query(
      `UPDATE backend_services
       SET is_active = false, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    await this.refresh();

    return result.rows[0] || null;
  }
}

// Singleton instance
const registry = new ServiceRegistry();

module.exports = registry;
