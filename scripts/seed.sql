-- ===========================================
-- GateShield - Seed Data for Development
-- ===========================================
-- Creates test API clients with known API keys for local testing.
--
-- Test API Keys (plain text -> SHA-256 hash):
--   test-key-alpha   -> SHA-256 stored below
--   test-key-beta    -> SHA-256 stored below
--   test-key-gamma   -> SHA-256 stored below
--
-- To generate a SHA-256 hash:
--   echo -n "test-key-alpha" | sha256sum

-- Insert test clients
INSERT INTO api_clients (name, api_key_hash) VALUES
    ('Alpha Corp',  'd1a9c70d19c81f247d9a6c57b2a6bb48212cc202e49a432e16025a9d5d3fa8d3'),  -- SHA-256 of 'test-key-alpha'
    ('Beta Labs',   '038833737202aaf8dd73da38fc2bdef7b37ac9dffb7832e626094221bd84421d'),  -- SHA-256 of 'test-key-beta'
    ('Gamma Dev',   '7c6f5e9756cd1b2017873abf43720a9c25c59dd8888c63d10c9b79d2fbfd3e01')   -- SHA-256 of 'test-key-gamma'
ON CONFLICT (api_key_hash) DO NOTHING;

-- Set up rate limit configs for each client
-- Alpha Corp: Token Bucket, 10 req/min on all routes
INSERT INTO rate_limit_configs (client_id, route_pattern, algorithm, max_requests, window_seconds, bucket_capacity, refill_rate)
VALUES (1, '*', 'token_bucket', 10, 60, 10, 0.17)
ON CONFLICT (client_id, route_pattern) DO NOTHING;

-- Beta Labs: Fixed Window, 20 req/min on all routes
INSERT INTO rate_limit_configs (client_id, route_pattern, algorithm, max_requests, window_seconds)
VALUES (2, '*', 'fixed_window', 20, 60)
ON CONFLICT (client_id, route_pattern) DO NOTHING;

-- Gamma Dev: Sliding Window, 15 req/min on all routes
INSERT INTO rate_limit_configs (client_id, route_pattern, algorithm, max_requests, window_seconds)
VALUES (3, '*', 'sliding_window', 15, 60)
ON CONFLICT (client_id, route_pattern) DO NOTHING;


-- ===========================================
-- Extended Seed Data — New Features
-- ===========================================

-- Backend Services (Feature 1): register the 3 existing backend endpoints
INSERT INTO backend_services (name, base_url, path_prefix, description, timeout_ms, retry_count)
VALUES
    ('Products API', 'http://backend:4000', '/api/products', 'Product catalog service', 5000, 1),
    ('Users API',    'http://backend:4000', '/api/users',    'User management service', 5000, 1),
    ('Orders API',   'http://backend:4000', '/api/orders',   'Order processing service', 5000, 1)
ON CONFLICT (path_prefix) DO NOTHING;

-- Client-Service Permissions (Feature 3): grant all seed clients access to all services
INSERT INTO client_service_permissions (client_id, service_id)
SELECT c.id, s.id
FROM api_clients c
CROSS JOIN backend_services s
WHERE c.id IN (1, 2, 3)
ON CONFLICT (client_id, service_id) DO NOTHING;

-- Admin User (Feature 6): default admin account
-- Password: admin123 (bcrypt hash pre-computed)
INSERT INTO admin_users (username, password_hash, role)
VALUES ('admin', '$2b$10$rICGqrMcVoJlNcv.v4j4UOhldpMVcmWjHQ6kZ7M5HBsQfKBfSK6Ym', 'admin')
ON CONFLICT (username) DO NOTHING;
