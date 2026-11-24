-- ===========================================
-- GateShield - Database Schema
-- ===========================================
-- This file runs automatically when PostgreSQL starts
-- via docker-entrypoint-initdb.d

-- API Clients: each client gets a unique API key
CREATE TABLE IF NOT EXISTS api_clients (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    api_key_hash    VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 hash of the API key
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Rate Limit Configs: per-client, per-route settings
CREATE TABLE IF NOT EXISTS rate_limit_configs (
    id              SERIAL PRIMARY KEY,
    client_id       INTEGER NOT NULL REFERENCES api_clients(id) ON DELETE CASCADE,
    route_pattern   VARCHAR(200) NOT NULL,          -- e.g. '/api/products' or '*' for all routes
    algorithm       VARCHAR(30) NOT NULL DEFAULT 'token_bucket',  -- token_bucket | fixed_window | sliding_window
    max_requests    INTEGER NOT NULL DEFAULT 100,   -- max requests per window
    window_seconds  INTEGER NOT NULL DEFAULT 60,    -- window size in seconds
    bucket_capacity INTEGER DEFAULT 10,             -- token bucket: max tokens
    refill_rate     DOUBLE PRECISION DEFAULT 1.0,   -- token bucket: tokens added per second
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(client_id, route_pattern)
);

-- Request Logs: every request through the gateway
CREATE TABLE IF NOT EXISTS request_logs (
    id              SERIAL PRIMARY KEY,
    client_id       INTEGER REFERENCES api_clients(id),
    route           VARCHAR(200) NOT NULL,
    method          VARCHAR(10) NOT NULL,
    status_code     INTEGER NOT NULL,
    allowed         BOOLEAN NOT NULL,
    response_time_ms INTEGER,
    ip_address      VARCHAR(45),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast dashboard queries
CREATE INDEX IF NOT EXISTS idx_request_logs_created_at ON request_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_logs_client_id ON request_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_api_clients_key_hash ON api_clients(api_key_hash);

-- ===========================================
-- Extended Schema — New Features
-- ===========================================

-- Add revoked_at for API key rotation/revocation (Feature 5)
ALTER TABLE api_clients ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP;

-- Add service_name to request_logs for per-service analytics (Feature 10)
ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS service_name VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_request_logs_service ON request_logs(service_name);

-- Backend Services: dynamic service registry (Feature 1)
CREATE TABLE IF NOT EXISTS backend_services (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100) UNIQUE NOT NULL,
    base_url        VARCHAR(500) NOT NULL,
    path_prefix     VARCHAR(200) NOT NULL UNIQUE,     -- e.g. '/api/products'
    description     TEXT,
    is_active       BOOLEAN DEFAULT true,
    timeout_ms      INTEGER DEFAULT 5000,
    retry_count     INTEGER DEFAULT 0,
    retry_on        TEXT DEFAULT '',                   -- comma-separated status codes to retry on
    health_endpoint VARCHAR(500) DEFAULT '/health',    -- custom or relative health-check endpoint
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_backend_services_path_prefix ON backend_services(path_prefix);

-- Client-Service Permissions: authorization matrix (Feature 3)
CREATE TABLE IF NOT EXISTS client_service_permissions (
    id              SERIAL PRIMARY KEY,
    client_id       INTEGER NOT NULL REFERENCES api_clients(id) ON DELETE CASCADE,
    service_id      INTEGER NOT NULL REFERENCES backend_services(id) ON DELETE CASCADE,
    is_allowed      BOOLEAN DEFAULT true,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(client_id, service_id)
);

-- Admin Users: dashboard authentication (Feature 6)
CREATE TABLE IF NOT EXISTS admin_users (
    id              SERIAL PRIMARY KEY,
    username        VARCHAR(50) UNIQUE NOT NULL,
    password_hash   VARCHAR(128) NOT NULL,
    role            VARCHAR(20) DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit Logs: administrative action tracking (Feature 11)
CREATE TABLE IF NOT EXISTS audit_logs (
    id              SERIAL PRIMARY KEY,
    admin_id        INTEGER REFERENCES admin_users(id),
    action          VARCHAR(100) NOT NULL,
    entity_type     VARCHAR(50),
    entity_id       INTEGER,
    details         JSONB,
    ip_address      VARCHAR(45),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON audit_logs(admin_id);

-- Service Health Checks: monitoring records (Feature 9)
CREATE TABLE IF NOT EXISTS service_health_checks (
    id              SERIAL PRIMARY KEY,
    service_id      INTEGER NOT NULL REFERENCES backend_services(id) ON DELETE CASCADE,
    status          VARCHAR(20) NOT NULL,
    response_time_ms INTEGER,
    failure_count   INTEGER DEFAULT 0,
    error_message   TEXT,
    checked_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_service_health_checked_at ON service_health_checks(checked_at DESC);

-- Ensure non-breaking migration for existing databases
ALTER TABLE backend_services ADD COLUMN IF NOT EXISTS health_endpoint VARCHAR(500) DEFAULT '/health';
ALTER TABLE service_health_checks ADD COLUMN IF NOT EXISTS failure_count INTEGER DEFAULT 0;
