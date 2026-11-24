const { Pool } = require('pg');

// Initialize PostgreSQL connection pool using environment variables with sensible defaults
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT, 10) || 5432,
  user: process.env.PG_USER || 'gateshield',
  password: process.env.PG_PASSWORD || 'gateshield_dev',
  database: process.env.PG_DATABASE || 'gateshield',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

// Helper function to execute queries using the pool
const query = (text, params) => pool.query(text, params);

module.exports = {
  pool,
  query,
};
