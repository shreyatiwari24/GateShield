const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const db = require('../db/pool');

const JWT_SECRET = process.env.JWT_SECRET || 'gateshield-dev-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'gateshield-dev-secret' || process.env.JWT_SECRET.includes('change-me')) {
  if (process.env.NODE_ENV === 'production' && process.env.STRICT_SECURITY === 'true') {
    throw new Error('[Security FATAL] Production deployment requires a secure, non-default JWT_SECRET.');
  }
  console.warn('[Security Warning] JWT_SECRET is using a default development secret. Set a strong secret in production.');
}

/**
 * Middleware: verify JWT token for admin routes.
 * Skips /admin/auth/login (public endpoint).
 */
function requireAdmin(req, res, next) {
  // Allow login endpoint without authentication
  if (req.path === '/auth/login') {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Admin authentication required' });
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired admin token' });
  }
}

/**
 * Middleware: require admin role (not just viewer).
 */
function requireAdminRole(req, res, next) {
  if (!req.admin || req.admin.role !== 'admin') {
    return res.status(403).json({ error: 'Admin role required' });
  }
  return next();
}

/**
 * Login handler: validate credentials, return JWT.
 */
async function login(req, res) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const result = await db.query(
      'SELECT id, username, password_hash, role, is_active FROM admin_users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const admin = result.rows[0];
    if (!admin.is_active) {
      return res.status(401).json({ error: 'Account is disabled' });
    }

    const passwordValid = await bcrypt.compare(password, admin.password_hash);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: admin.id, username: admin.username, role: admin.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      message: 'Login successful',
      token,
      admin: { id: admin.id, username: admin.username, role: admin.role },
    });
  } catch (err) {
    console.error('[AdminAuth] Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Register a new admin user (requires existing admin role).
 */
async function register(req, res) {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const validRole = role === 'admin' ? 'admin' : 'viewer';
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const result = await db.query(
      `INSERT INTO admin_users (username, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING id, username, role, is_active, created_at`,
      [username, passwordHash, validRole]
    );

    res.status(201).json({
      message: 'Admin user created',
      admin: result.rows[0],
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username already exists' });
    }
    console.error('[AdminAuth] Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Get current admin info from JWT.
 */
async function me(req, res) {
  try {
    const result = await db.query(
      'SELECT id, username, role, is_active, created_at FROM admin_users WHERE id = $1',
      [req.admin.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Admin user not found' });
    }
    res.json({ admin: result.rows[0] });
  } catch (err) {
    console.error('[AdminAuth] Me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  requireAdmin,
  requireAdminRole,
  login,
  register,
  me,
  JWT_SECRET,
};
