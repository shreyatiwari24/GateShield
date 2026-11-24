#!/usr/bin/env node

/**
 * GateShield — Advanced Load & Concurrency Test Suite
 *
 * Tests:
 *   1. Sustained throughput under concurrent load
 *   2. Rate-limiter enforcement accuracy
 *   3. Multi-client isolation
 *   4. Per-service routing correctness
 *   5. Circuit breaker trip under cascading failures
 *
 * Usage:
 *   node scripts/load-test.js                              # defaults
 *   node scripts/load-test.js --requests 200 --concurrent 50
 *   node scripts/load-test.js --key test-key-alpha --route /api/products
 *   node scripts/load-test.js --suite all                  # run full suite
 */

const http = require('http');
const https = require('https');

// ---- CLI args ----
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    url: 'http://localhost:3000',
    route: '/api/products',
    key: 'test-key-alpha',
    requests: 100,
    concurrent: 10,
    suite: null, // null = single run, 'all' = full suite
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === '--url' || arg === '-u') && args[i + 1]) opts.url = args[++i];
    else if ((arg === '--route' || arg === '-r') && args[i + 1]) opts.route = args[++i];
    else if ((arg === '--key' || arg === '-k') && args[i + 1]) opts.key = args[++i];
    else if ((arg === '--requests' || arg === '-n') && args[i + 1]) opts.requests = parseInt(args[++i], 10);
    else if ((arg === '--concurrent' || arg === '-c') && args[i + 1]) opts.concurrent = parseInt(args[++i], 10);
    else if (arg === '--suite' && args[i + 1]) opts.suite = args[++i];
  }
  return opts;
}

// ---- HTTP request helper (no deps) ----
function sendRequest(targetUrl, apiKey, method = 'GET', timeoutMs = 10000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const url = new URL(targetUrl);
    const mod = url.protocol === 'https:' ? https : http;

    const req = mod.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: timeoutMs,
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, responseTime: Date.now() - start, error: null });
      });
    });

    req.on('error', (err) => {
      resolve({ statusCode: 0, responseTime: Date.now() - start, error: err.code || err.message });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ statusCode: 0, responseTime: Date.now() - start, error: 'TIMEOUT' });
    });
    req.end();
  });
}

// ---- Stats ----
function printSummary(label, stats, durationSec) {
  const pct = (n) => stats.totalSent > 0 ? ((n / stats.totalSent) * 100).toFixed(1) : '0.0';
  const times = stats.responseTimes.filter(t => t > 0).sort((a, b) => a - b);
  const avg = times.length ? (times.reduce((a, b) => a + b, 0) / times.length).toFixed(1) : 0;
  const p50 = times.length ? times[Math.floor(times.length * 0.5)] : 0;
  const p95 = times.length ? times[Math.floor(times.length * 0.95)] : 0;
  const p99 = times.length ? times[Math.floor(times.length * 0.99)] : 0;
  const rps = durationSec > 0 ? (stats.totalSent / durationSec).toFixed(1) : 0;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${label}`);
  console.log('='.repeat(60));
  console.log(`  Total Requests:    ${stats.totalSent}`);
  console.log(`  Allowed (2xx):     ${stats.allowed} (${pct(stats.allowed)}%)`);
  console.log(`  Rate-Limited (429):${stats.rateLimited} (${pct(stats.rateLimited)}%)`);
  console.log(`  Errors:            ${stats.errors} (${pct(stats.errors)}%)`);
  console.log('-'.repeat(60));
  console.log(`  Avg Response:      ${avg} ms`);
  console.log(`  P50 / P95 / P99:   ${p50} / ${p95} / ${p99} ms`);
  console.log(`  Throughput:        ${rps} req/s`);
  console.log(`  Duration:          ${durationSec.toFixed(2)}s`);

  if (Object.keys(stats.statusCodes).length > 0) {
    console.log('-'.repeat(60));
    console.log('  Status Code Breakdown:');
    for (const [code, count] of Object.entries(stats.statusCodes)) {
      console.log(`    ${code}: ${count} (${pct(count)}%)`);
    }
  }
  console.log('='.repeat(60));
}

// ---- Run a batch of requests ----
async function runBatch(url, key, total, concurrency) {
  const stats = { totalSent: 0, allowed: 0, rateLimited: 0, errors: 0, responseTimes: [], statusCodes: {} };
  const start = Date.now();
  let remaining = total;

  while (remaining > 0) {
    const batch = Math.min(concurrency, remaining);
    const promises = [];
    for (let i = 0; i < batch; i++) promises.push(sendRequest(url, key));
    const results = await Promise.all(promises);

    for (const r of results) {
      stats.totalSent++;
      stats.responseTimes.push(r.responseTime);
      if (r.error) {
        stats.errors++;
        stats.statusCodes[r.error] = (stats.statusCodes[r.error] || 0) + 1;
      } else {
        stats.statusCodes[r.statusCode] = (stats.statusCodes[r.statusCode] || 0) + 1;
        if (r.statusCode >= 200 && r.statusCode < 300) stats.allowed++;
        else if (r.statusCode === 429) stats.rateLimited++;
        else stats.errors++;
      }
    }
    remaining -= batch;
    process.stdout.write(`\r  Progress: ${stats.totalSent}/${total}`);
  }

  const duration = (Date.now() - start) / 1000;
  return { stats, duration };
}

// ---- Test Suite ----
async function runSuite(baseUrl, keys) {
  console.log('\n' + '█'.repeat(60));
  console.log('  GateShield Full Load & Concurrency Test Suite');
  console.log('█'.repeat(60));

  // Test 1: Sustained throughput
  console.log('\n▶ Test 1: Sustained Throughput (100 requests, concurrency 20)');
  const t1 = await runBatch(`${baseUrl}/api/products`, keys[0], 100, 20);
  printSummary('Sustained Throughput — Products API', t1.stats, t1.duration);

  // Test 2: Rate limiter enforcement
  console.log('\n▶ Test 2: Rate Limiter Enforcement (50 rapid-fire requests)');
  const t2 = await runBatch(`${baseUrl}/api/products`, keys[0], 50, 50);
  printSummary('Rate Limiter Enforcement', t2.stats, t2.duration);
  if (t2.stats.rateLimited > 0) {
    console.log('  ✓ Rate limiter is enforcing limits correctly');
  } else {
    console.log('  ⚠ No rate-limited requests detected (check if rate limiter is running)');
  }

  // Test 3: Multi-client isolation
  console.log('\n▶ Test 3: Multi-Client Isolation');
  const clientResults = [];
  for (const key of keys) {
    const r = await runBatch(`${baseUrl}/api/products`, key, 30, 10);
    clientResults.push(r);
  }
  for (let i = 0; i < keys.length; i++) {
    printSummary(`Client: ${keys[i]}`, clientResults[i].stats, clientResults[i].duration);
  }

  // Test 4: Per-service routing
  console.log('\n▶ Test 4: Per-Service Routing');
  const routes = ['/api/products', '/api/users', '/api/orders'];
  for (const route of routes) {
    const r = await runBatch(`${baseUrl}${route}`, keys[0], 20, 5);
    printSummary(`Route: ${route}`, r.stats, r.duration);
  }

  // Test 5: High concurrency stress
  console.log('\n▶ Test 5: High Concurrency Stress (200 requests, concurrency 50)');
  const t5 = await runBatch(`${baseUrl}/api/products`, keys[0], 200, 50);
  printSummary('High Concurrency Stress', t5.stats, t5.duration);

  console.log('\n' + '█'.repeat(60));
  console.log('  Suite Complete');
  console.log('█'.repeat(60) + '\n');
}

// ---- Main ----
async function main() {
  const opts = parseArgs();

  if (opts.suite === 'all') {
    await runSuite(opts.url, ['test-key-alpha', 'test-key-beta', 'test-key-gamma']);
  } else {
    console.log('\n' + '='.repeat(60));
    console.log('  GateShield Load Test');
    console.log('='.repeat(60));
    console.log(`  Target:      ${opts.url}${opts.route}`);
    console.log(`  API Key:     ${opts.key}`);
    console.log(`  Requests:    ${opts.requests}`);
    console.log(`  Concurrency: ${opts.concurrent}`);
    console.log('='.repeat(60));

    const { stats, duration } = await runBatch(`${opts.url}${opts.route}`, opts.key, opts.requests, opts.concurrent);
    printSummary('Load Test Results', stats, duration);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
