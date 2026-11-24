const axios = require('axios');

/**
 * End-to-End Integration tests for GateShield API Gateway.
 * Requires running PostgreSQL, Redis, C++ Rate Limiter, and Sample Backend services.
 * Skipped by default for isolated test runners.
 */
describe.skip('GateShield API Gateway Integration Tests', () => {
  const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000';
  const VALID_API_KEY = 'test-key-alpha';
  const INVALID_API_KEY = 'invalid-nonexistent-api-key';

  test('valid API key + within rate limit = 200 response', async () => {
    const response = await axios.get(`${GATEWAY_URL}/api/products`, {
      headers: {
        'X-API-Key': VALID_API_KEY,
      },
    });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.data)).toBe(true);
    expect(response.headers).toHaveProperty('x-ratelimit-remaining');
    expect(response.headers).toHaveProperty('x-ratelimit-limit');
  });

  test('invalid API key = 403', async () => {
    try {
      await axios.get(`${GATEWAY_URL}/api/products`, {
        headers: {
          'X-API-Key': INVALID_API_KEY,
        },
      });
      // Should fail if request succeeded
      expect(true).toBe(false);
    } catch (error) {
      expect(error.response).toBeDefined();
      expect(error.response.status).toBe(403);
      expect(error.response.data).toEqual(
        expect.objectContaining({ error: 'Invalid API key' })
      );
    }
  });

  test('exceeding rate limit = 429', async () => {
    let rateLimited = false;
    let rateLimitedResponse = null;

    // Send rapid requests to exceed the configured rate limit (e.g. 10 req/min for Alpha Corp)
    for (let i = 0; i < 20; i++) {
      try {
        await axios.get(`${GATEWAY_URL}/api/products`, {
          headers: {
            'X-API-Key': VALID_API_KEY,
          },
        });
      } catch (error) {
        if (error.response && error.response.status === 429) {
          rateLimited = true;
          rateLimitedResponse = error.response;
          break;
        }
      }
    }

    expect(rateLimited).toBe(true);
    expect(rateLimitedResponse).not.toBeNull();
    expect(rateLimitedResponse.status).toBe(429);
    expect(rateLimitedResponse.data).toEqual(
      expect.objectContaining({ error: 'Rate limit exceeded' })
    );
    expect(rateLimitedResponse.headers).toHaveProperty('retry-after');
  });
});
