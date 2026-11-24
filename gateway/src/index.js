require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authMiddleware = require('./middleware/auth');
const rateLimiterMiddleware = require('./middleware/rateLimiter');
const authorizationMiddleware = require('./middleware/authorization');
const { requireAdmin } = require('./middleware/adminAuth');
const proxyRoutes = require('./routes/proxy');
const adminRoutes = require('./routes/admin');
const serviceRegistry = require('./services/serviceRegistry');
const healthMonitor = require('./services/healthMonitor');

const app = express();
const PORT = process.env.GATEWAY_PORT || 3000;

// Enable Cross-Origin Resource Sharing (CORS) with configurable origins
const corsOptions = {
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
    : '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
};
app.use(cors(corsOptions));

// Parse JSON request bodies
app.use(express.json());

// Public health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Admin routes — Feature 6: protected by JWT admin auth (login is public)
app.use('/admin', adminRoutes);

// Helper wrapper to skip middleware for /admin and /health endpoints
const skipAuthAndRateLimit = (middleware) => {
  return (req, res, next) => {
    if (req.path === '/health' || req.path.startsWith('/admin')) {
      return next();
    }
    return middleware(req, res, next);
  };
};

// Mount gateway authentication, authorization, and rate limiting middleware
app.use(skipAuthAndRateLimit(authMiddleware));
app.use(skipAuthAndRateLimit(authorizationMiddleware));  // Feature 3
app.use(skipAuthAndRateLimit(rateLimiterMiddleware));

// Mount reverse proxy routes under /api (Feature 2: dynamic routing)
app.use('/api', proxyRoutes);
// Mount external API proxy routes
app.use('/external', proxyRoutes);

// Fallback 404 handler for unregistered endpoints
app.use((req, res, next) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Centralized error handling middleware
app.use((err, req, res, next) => {
  console.error('[Gateway] Unhandled error:', err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal Server Error',
  });
});

// Start listening if not running under test runner
if (process.env.NODE_ENV !== 'test') {
  (async () => {
    // Feature 1: Load service registry from database
    try {
      await serviceRegistry.refresh();
    } catch (err) {
      console.warn('[Gateway] Service registry initial load failed (will retry):', err.message);
    }

    // Feature 9: Start backend health monitoring
    healthMonitor.start();

    app.listen(PORT, () => {
      console.log(`GateShield API Gateway listening on port ${PORT}`);
    });
  })();
}

// Graceful shutdown
process.on('SIGTERM', () => {
  healthMonitor.stop();
  process.exit(0);
});

module.exports = app;
