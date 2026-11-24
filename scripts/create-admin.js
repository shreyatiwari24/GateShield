const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const username = process.argv[2];
let password = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => password += chunk);

process.stdin.on('end', async () => {
  const pool = new Pool({
    host: process.env.PG_HOST || 'postgres',
    port: Number(process.env.PG_PORT || 5432),
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE
  });

  let transaction = false;

  try {
    password = password.replace(/\r?\n$/, '');

    if (!/^[A-Za-z0-9_.-]{3,50}$/.test(username || '')) {
      throw new Error('Invalid username.');
    }

    if (password.length < 12) {
      throw new Error('Password must contain at least 12 characters.');
    }

    await pool.query('BEGIN');
    transaction = true;

    await pool.query('LOCK TABLE admin_users IN EXCLUSIVE MODE');

    const existing = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM admin_users WHERE role = 'admin' AND is_active = true) AS found"
    );

    if (existing.rows[0].found) {
      throw new Error('An active admin already exists. Bootstrap refused.');
    }

    const hash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      'INSERT INTO admin_users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role',
      [username, hash, 'admin']
    );

    await pool.query('COMMIT');
    transaction = false;

    console.log(JSON.stringify(result.rows[0]));
  } catch (err) {
    if (transaction) await pool.query('ROLLBACK').catch(() => {});
    console.error('Bootstrap failed:', err.message);
    process.exitCode = 1;
  } finally {
    password = '';
    await pool.end();
  }
});
