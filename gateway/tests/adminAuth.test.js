const jwt = require('jsonwebtoken');
const { requireAdmin, JWT_SECRET } = require('../src/middleware/adminAuth');

describe('Admin Auth Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { path: '/stats', headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  test('skips auth for /auth/login', () => {
    req.path = '/auth/login';
    requireAdmin(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('returns 401 when no Authorization header', () => {
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 for invalid token', () => {
    req.headers.authorization = 'Bearer invalid.token.here';
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('attaches admin to req for valid token', () => {
    const payload = { id: 1, username: 'admin', role: 'admin' };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
    req.headers.authorization = `Bearer ${token}`;

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.admin).toBeDefined();
    expect(req.admin.username).toBe('admin');
    expect(req.admin.role).toBe('admin');
  });
});
