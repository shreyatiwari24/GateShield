const crypto = require('crypto');
const auth = require('../src/middleware/auth');
const db = require('../src/db/pool');

// Mock PostgreSQL pool query helper
jest.mock('../src/db/pool', () => ({
  query: jest.fn(),
  pool: {
    query: jest.fn(),
  },
}));

describe('Auth Middleware', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      header: jest.fn(),
      headers: {},
      path: '/api/products',
      originalUrl: '/api/products',
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  test('missing API key returns 401', async () => {
    req.header.mockReturnValue(undefined);

    await auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'API key required' });
    expect(next).not.toHaveBeenCalled();
  });

  test('invalid API key returns 403', async () => {
    const rawKey = 'invalid-fake-key';
    req.header.mockReturnValue(rawKey);

    // Mock DB returning no matching active client
    db.query.mockResolvedValueOnce({ rows: [] });

    await auth(req, res, next);

    const expectedHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringMatching(/SELECT id, name, api_key_hash, is_active\s+FROM api_clients/i),
      [expectedHash]
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid API key' });
    expect(next).not.toHaveBeenCalled();
  });

  test('valid API key attaches client info and rate config to req', async () => {
    const rawKey = 'test-key-alpha';
    req.header.mockReturnValue(rawKey);

    const mockClient = {
      id: 1,
      name: 'Alpha Corp',
      api_key_hash: crypto.createHash('sha256').update(rawKey).digest('hex'),
      is_active: true,
    };

    const mockRateConfig = {
      id: 10,
      client_id: 1,
      route_pattern: '*',
      algorithm: 'token_bucket',
      max_requests: 10,
      window_seconds: 60,
      bucket_capacity: 10,
      refill_rate: 0.17,
    };

    // First query: finding client
    db.query.mockResolvedValueOnce({ rows: [mockClient] });
    // Second query: finding rate limit config
    db.query.mockResolvedValueOnce({ rows: [mockRateConfig] });

    await auth(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(req.client).toEqual(mockClient);
    expect(req.rateConfig).toEqual(mockRateConfig);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
