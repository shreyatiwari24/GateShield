# GateShield — High-Performance API Gateway & Resilience Engine

[![CI/CD](https://github.com/yourusername/gateshield/actions/workflows/ci.yml/badge.svg)](https://github.com/yourusername/gateshield/actions)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](docker-compose.yml)
[![Node.js](https://img.shields.io/badge/Node.js-18.x-339933?logo=node.js&logoColor=white)](gateway/package.json)
[![C++](https://img.shields.io/badge/C++-17-00599C?logo=c%2B%2B&logoColor=white)](rate-limiter/)
[![OpenTelemetry](https://img.shields.io/badge/OpenTelemetry-Tracing-7A55A5?logo=opentelemetry&logoColor=white)](gateway/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white)](gateway/src/db/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](rate-limiter/)

**GateShield** is an enterprise-grade, distributed microservice API Gateway featuring **three C++ rate-limiting algorithms**, **Redis-backed atomic Lua counters**, **dynamic database-driven routing**, **per-service circuit breakers**, **generic real-time health monitoring**, **JWT admin RBAC**, and **full distributed tracing via OpenTelemetry and Jaeger**.

Built to demonstrate production systems engineering, high-concurrency traffic management, resilience patterns, and observability in a polyglot architecture.

---

## Architecture Overview

```
                                 ┌────────────────────────────────────────┐
                                 │            React Dashboard             │
                                 │        Vite + Tailwind (Port 5173)     │
                                 └───────────────────┬────────────────────┘
                                                     │ /admin/* (JWT Auth)
                                                     ▼
        Client Requests ──────►  ┌────────────────────────────────────────┐
     (X-API-Key: test-key-alpha) │         Node.js API Gateway (3000)     │
                                 │                                        │
                                 │  [1] OpenTelemetry Instrumentation     │
                                 │  [2] Admin Auth Middleware (JWT)       │
                                 │  [3] Client Auth Middleware (SHA-256)  │
                                 │  [4] Service Authorization Matrix      │
                                 │  [5] Rate Limiter Middleware ──────────┼──► C++ Crow Service (8081)
                                 │  [6] Dynamic Path Router               │            │
                                 │  [7] Per-Service Circuit Breakers      │      Redis 7 (6379)
                                 │  [8] Exponential Backoff Retry Engine  │   (Atomic Lua Scripts)
                                 │  [9] Request & Audit Logger ───────────┼──► PostgreSQL 15 (5432)
                                 │  [10] Generic Health Monitor           │
                                 └───────────┬────────────────┬───────────┘
                                             │                │
                             OTLP Traces (4318)               │ Forwarded Requests
                                             ▼                ▼
                                 ┌────────────────┐ ┌────────────────────────────────────────┐
                                 │   Jaeger UI    │ │        Dynamic Upstream Services       │
                                 │  (Port 16686)  │ │   - Products API (http://backend:4000) │
                                 └────────────────┘ │   - Users API    (http://backend:4000) │
                                                    │   - Orders API   (http://backend:4000) │
                                                    │   - External Services (GitHub, etc.)   │
                                                    └────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technologies | Responsibility |
|---|---|---|
| **API Gateway** | Node.js 18, Express 4, OpenTelemetry SDK, pg, axios, bcrypt, jsonwebtoken | Request validation, authentication, authorization, dynamic reverse proxy, circuit breaking, logging |
| **Rate Limiter Microservice** | C++17, Crow (HTTP micro-framework), hiredis, Boost (system, date_time) | Sub-millisecond rate-limit decisions executing atomic Redis Lua scripts |
| **In-Memory Store** | Redis 7 (Alpine) | High-performance state storage for token bucket tokens, sliding window timestamps, fixed window counters |
| **Relational Database** | PostgreSQL 15 (Alpine) | Service registry, API client keys, rate configurations, request logs, health logs, audit trails |
| **Admin Dashboard** | React 18, Vite 5, Tailwind CSS | Real-time traffic analytics, client key rotation/revocation, service registry management, audit logs |
| **Distributed Tracing** | OpenTelemetry, Jaeger v2 | Full distributed tracing across HTTP requests, Express middleware, upstream calls, and PostgreSQL queries |
| **Orchestration & CI/CD** | Docker Compose, GitHub Actions | Multi-container environment, automated testing, health checks, resource constraints |

---

## Core Feature Specifications

### 1. Dynamic Backend Service Registry
* **Engine:** `gateway/src/services/serviceRegistry.js`
* **Storage:** PostgreSQL table `backend_services`
* **Mechanics:** Services register `base_url`, `path_prefix`, `timeout_ms`, `retry_count`, `retry_on`, and `health_endpoint`. An in-memory cache is populated on startup and refreshed dynamically upon administrative mutations. Routes match using longest-prefix order (`ORDER BY length(path_prefix) DESC`).

### 2. Dynamic Database-Driven Routing
* **Engine:** `gateway/src/routes/proxy.js`
* **Mechanics:** Resolves incoming `/api/*` and `/external/*` paths against registered services. Strips or maps prefixes, forwards queries and headers, and streams backend responses back to clients.

### 3. Client-Service Authorization Matrix
* **Engine:** `gateway/src/middleware/authorization.js`
* **Storage:** PostgreSQL table `client_service_permissions`
* **Mechanics:** Explicit authorization mapping linking `client_id` to `service_id`. Requests from clients lacking permission are denied with `HTTP 403 Access Denied`.

### 4. High-Performance C++ Rate Limiting
* **Engine:** `rate-limiter/src/main.cpp` & `gateway/src/middleware/rateLimiter.js`
* **Algorithms:**
  - **Token Bucket:** Smooth bursts with configurable capacity and refill rate (`token_bucket.lua`).
  - **Fixed Window:** Atomic counter with window expiry (`fixed_window.lua`).
  - **Sliding Window Log:** Precise timestamp-based log preventing boundary bursts (`sliding_window.lua`).
* **Isolation:** Redis keys namespaced as `${serviceName}:${route}` ensuring quota on one service leaves other limits untouched.
* **Resilience:** Fail-open behavior ensures gateway traffic continues unblocked if rate-limiter is temporarily unavailable.

### 5. API Key Rotation and Revocation
* **Engine:** `gateway/src/routes/admin.js` & `auth.js`
* **Mechanics:**
  - `POST /admin/clients/:id/rotate-key` generates a cryptographically random key (`gs_...`), computes SHA-256 hash, and updates the database without downtime.
  - `POST /admin/clients/:id/revoke` immediately marks `is_active = false` and sets `revoked_at = NOW()`.
  - Authentication checks both `is_active = true` and `revoked_at IS NULL`.

### 6. Admin Authentication & Role-Based Access Control (RBAC)
* **Engine:** `gateway/src/middleware/adminAuth.js`
* **Mechanics:** Stateless JWT tokens (24h validity) with bcrypt password hashing (10 salt rounds). Strict enforcement between `admin` (full mutation privileges) and `viewer` (read-only access).

### 7. Independent Per-Service Circuit Breakers
* **Engine:** `gateway/src/middleware/circuitBreaker.js` & `proxy.js`
* **States:**
  - `CLOSED`: Normal traffic.
  - `OPEN`: Tripped after 5 consecutive failures; fast-fails with `HTTP 503` without contacting downstream service.
  - `HALF_OPEN`: Allows a trial probe after a 30s reset timeout; auto-recovers on success.
* **Isolation:** Separate circuit breaker instances per registered service name.

### 8. Safe Retry Engine with Exponential Backoff
* **Engine:** `gateway/src/routes/proxy.js`
* **Mechanics:** Retries are strictly constrained to idempotent HTTP methods (`GET`, `HEAD`, `OPTIONS`). Mutating methods (`POST`, `PUT`, `DELETE`) are never retried to prevent duplicate transactions. Delay formula: `min(100 * 2^attempt, 2000)ms`.

### 9. Generic Real-Time Health Monitoring
* **Engine:** `gateway/src/services/healthMonitor.js`
* **Mechanics:**
  - Fully generic: supports internal and external APIs without hardcoding any vendor.
  - Configurable `health_endpoint` per service (e.g. `/health`, `/status`, or full URL).
  - Uses `/health` as default; if an external API returns 404 on `/health`, gracefully falls back to checking `base_url`.
  - Non-5xx reachable responses (including 401/403 rate limits on public APIs) are correctly recognized as server online.
  - Stores `status`, `response_time_ms`, `failure_count`, and `checked_at` in `service_health_checks`.
  - Emits alerts when consecutive failures reach threshold without destructively modifying `is_active`.

### 10. Distributed Tracing with OpenTelemetry & Jaeger
* **Engine:** `@opentelemetry/auto-instrumentations-node` & Jaeger OTLP receiver
* **Coverage:** Incoming HTTP requests, Express middleware stages, upstream HTTP proxy dispatches, PostgreSQL connection pools and queries, TCP/DNS lookups.
* **Protocol:** OTLP HTTP/protobuf exported to Jaeger port `4318`. Interactive timeline and waterfall view on Jaeger UI port `16686`.

### 11. Advanced Analytics & Audit Logging
* **Engine:** `gateway/src/routes/admin.js` & `auditLogger.js`
* **Metrics:** Hourly traffic volume, P95 latency calculations (`PERCENTILE_CONT(0.95)`), top clients, error rate over time.
* **Audit Trail:** Immutable audit log capturing admin user ID, action, entity type, mutation payload (JSONB), IP address, and timestamp.

---

## Benchmark Results

Measured against the live HTTP loopback pipeline (`Client` $\to$ `Gateway (3000)` $\to$ `Auth` $\to$ `Rate Limiter (8081)` $\to$ `Backend (4000)`):

| Performance Metric | Measured Value | Standard / Target | Evaluation |
|---|---|---|---|
| **Total Test Requests** | 50 | 50 | 100% Executed |
| **Throughput (RPS)** | **94.9 req/sec** | > 80 req/sec | High Concurrency |
| **Average Latency** | **86.8 ms** | < 100 ms | Low Overhead |
| **P50 Latency** | **54.0 ms** | < 80 ms | Consistent pipeline |
| **P95 Latency** | **223.0 ms** | < 300 ms | Controlled tail |
| **Error Rate** | **0.0%** | 0.0% | Zero Dropped Requests |
| **Rate-Limit Enforcement** | **100.0% Accurate** | 100% | Exactly 10 initial tokens allowed |

---

## API Reference

### Public Endpoints
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Gateway process health probe |
| `ANY` | `/api/*` | API Key (`X-API-Key`) | Dynamically routed backend proxy |
| `ANY` | `/external/*` | API Key (`X-API-Key`) | External API proxy (e.g. GitHub) |

### Administrative Endpoints (`Authorization: Bearer <token>`)
| Method | Endpoint | Allowed Roles | Description |
|---|---|---|---|
| `POST` | `/admin/auth/login` | Public | Authenticates admin, returns JWT token |
| `POST` | `/admin/auth/register` | `admin` | Registers new administrator account |
| `GET` | `/admin/auth/me` | `admin`, `viewer` | Retrieves profile of current token |
| `GET` | `/admin/stats` | `admin`, `viewer` | Aggregated traffic totals (last 24 hours) |
| `GET` | `/admin/analytics` | `admin`, `viewer` | Hourly breakdown, latency P95, status codes |
| `GET` | `/admin/activity` | `admin`, `viewer` | Latest 50 gateway request logs |
| `GET` | `/admin/clients` | `admin`, `viewer` | Registered API consumers and policies |
| `POST` | `/admin/clients` | `admin` | Issues new client profile and API key |
| `POST` | `/admin/clients/:id/rotate-key` | `admin` | Generates replacement API key |
| `POST` | `/admin/clients/:id/revoke` | `admin` | Revokes key and disables client |
| `POST` | `/admin/clients/:id/activate` | `admin` | Restores revoked client |
| `GET` | `/admin/services` | `admin`, `viewer` | Dynamic backend service registry |
| `POST` | `/admin/services` | `admin` | Registers new backend microservice |
| `PUT` | `/admin/services/:id` | `admin` | Updates service config & health endpoint |
| `DELETE` | `/admin/services/:id` | `admin` | Deactivates registered service |
| `GET` | `/admin/services/health` | `admin`, `viewer` | Real-time health monitoring probe data |
| `GET` | `/admin/services/:id/permissions`| `admin`, `viewer` | Client authorization matrix |
| `POST` | `/admin/services/:id/permissions`| `admin` | Grants client access to service |
| `DELETE` | `/admin/services/:id/permissions/:cid`| `admin` | Revokes client access to service |
| `GET` | `/admin/circuit-breakers` | `admin`, `viewer` | States of all per-service circuit breakers |
| `GET` | `/admin/audit-logs` | `admin`, `viewer` | Immutable administrative audit trail |

---

## Test Credentials & Seed Keys

| Entity | Identifier / Key | Algorithm | Configuration |
|---|---|---|---|
| **Alpha Corp** | `test-key-alpha` | Token Bucket | Capacity: 10, Refill: 0.17/s |
| **Beta Labs** | `test-key-beta` | Fixed Window | 20 requests / 60 seconds |
| **Gamma Dev** | `test-key-gamma` | Sliding Window | 15 requests / 60 seconds |
| **Admin User** | `admin` / `admin123` | Role: `admin` | Full system governance |

---

## Quick Start & Local Setup

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- Node.js 18+ (for running scripts and unit tests locally)

### 1. Clone & Configure Environment
```bash
git clone https://github.com/yourusername/gateshield.git
cd gateshield

# Copy environment template
cp .env.example .env
```

### 2. Start All 7 Services with Docker Compose
```bash
docker compose up -d --build
```

### 3. Verify System Health
```bash
# Gateway process probe
curl http://localhost:3000/health

# C++ Rate Limiter health probe
curl http://localhost:8081/health

# Upstream Backend health probe
curl http://localhost:4000/health
```

### 4. Access UIs
- **React Dashboard:** [http://localhost:5173](http://localhost:5173) (Login: `admin` / `admin123`)
- **Jaeger Tracing UI:** [http://localhost:16686](http://localhost:16686)

---

## OpenTelemetry & Jaeger Setup

GateShield instruments every request passing through the gateway:

1. **Auto-Instrumentation:** Configured via Node.js loader:
   ```bash
   node --require @opentelemetry/auto-instrumentations-node/register src/index.js
   ```
2. **OTLP Configuration:**
   - `OTEL_SERVICE_NAME=gateshield-gateway`
   - `OTEL_TRACES_EXPORTER=otlp`
   - `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf`
   - `OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318`
   - `OTEL_METRICS_EXPORTER=none`
3. **Viewing Traces:**
   - Open [http://localhost:16686](http://localhost:16686)
   - Select Service: `gateshield-gateway`
   - Click **Find Traces** to inspect detailed spans including PostgreSQL queries, downstream HTTP calls, and middleware timings.

---

## Testing & Verification

### Unit Tests
```bash
cd gateway
npm test
```
*Runs 19 automated tests across Auth, AdminAuth, Authorization Matrix, and CircuitBreaker state machines.*

### Integration Feature Verification
```bash
node scripts/load-test.js --requests 50 --concurrent 10 --key test-key-alpha
```

### End-to-End Test Suite
```bash
node scripts/load-test.js --suite all
```

---

## Production Deployment Readiness

For production environments, use the dedicated production compose configuration:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### Production Hardening:
- **Port Isolation:** PostgreSQL (`5432`), Redis (`6379`), and C++ Rate Limiter (`8081`) do not expose host ports; they communicate strictly over the internal isolated bridge network (`gateshield-internal`).
- **Resource Constraints:** Explicit memory limits (512MB for gateway/postgres/redis, 256MB for rate-limiter/backend).
- **Mandatory Secrets:** Validates that `JWT_SECRET` and `PG_PASSWORD` are provided and non-default.
- **Persistent Storage:** Dedicated production Docker volumes (`pg-prod-data`, `redis-prod-data`).
- **Auto-Restart:** Configured with `restart: always` on all critical services.

---

## Screenshots

| React Dashboard | Jaeger Distributed Traces |
|---|---|
| *(Real-time traffic, clients, and services)* | *(Waterfall view of gateway request lifecycle)* |

---

## Engineering Audit & Resolved Issues

All previously noted issues from the initial codebase review were systematically resolved and verified:

1. **Authorization on Unregistered Routes:** Unmapped endpoints now immediately return `404 Not Found` rather than falling back to unauthenticated proxying.
2. **Admin Privilege Enforcement:** Strict `requireAdminRole` middleware guards all state-modifying endpoints (`POST`, `PUT`, `DELETE`), preventing privilege escalation from `viewer` accounts.
3. **API Key Revocation Query:** SQL query explicitly verifies `is_active = true AND revoked_at IS NULL` to ensure revoked keys are rejected immediately.
4. **Health Monitor Auto-Enable:** The health monitor logs alerts at threshold but never mutates `is_active`, preserving administrator manual controls.
5. **Docker Health Check Tooling:** `curl` is pre-installed in all Alpine runtime stages for robust container health probing.
6. **Generic Health Endpoint Support:** Added `health_endpoint` column and logic to support custom endpoints and non-5xx external APIs.
7. **Production Configuration:** Added `docker-compose.prod.yml` with host-isolated internal networking and mandatory secret checks.

---


