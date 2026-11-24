const authorization = require('../src/middleware/authorization');
const db = require('../src/db/pool');
const serviceRegistry = require('../src/services/serviceRegistry');

jest.mock('../src/db/pool', () => ({
  query: jest.fn(),
  pool: { query: jest.fn() },
}));

jest.mock('../src/services/serviceRegistry', () => ({
  getServiceByPrefix: jest.fn(),
  getAllServices: jest.fn(() => []),
  refresh: jest.fn(),
  loaded: true,
  services: [],
}));

describe('Authorization Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      client: { id: 1, name: 'Alpha Corp' },
      originalUrl: '/api/products',
      path: '/api/products',
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  test('passes through when no client (unauthenticated route)', async () => {
    req.client = null;
    await authorization(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('passes through when no matching service', async () => {
    serviceRegistry.getServiceByPrefix.mockReturnValue(null);
    await authorization(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('returns 403 when client has no permission', async () => {
    serviceRegistry.getServiceByPrefix.mockReturnValue({ id: 1, name: 'Products API' });
    db.query.mockResolvedValueOnce({ rows: [] });

    await authorization(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('allows request when permission exists', async () => {
    serviceRegistry.getServiceByPrefix.mockReturnValue({ id: 1, name: 'Products API' });
    db.query.mockResolvedValueOnce({ rows: [{ is_allowed: true }] });

    await authorization(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.service).toBeDefined();
    expect(req.service.name).toBe('Products API');
  });

  test('fails open on database error', async () => {
    serviceRegistry.getServiceByPrefix.mockReturnValue({ id: 1, name: 'Products API' });
    db.query.mockRejectedValueOnce(new Error('DB timeout'));

    await authorization(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
