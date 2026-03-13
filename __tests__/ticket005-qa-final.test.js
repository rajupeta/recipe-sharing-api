/**
 * TICKET-005 — Final QA Validation by Test Agent
 * Comprehensive tests for login endpoint and auth middleware.
 * Validates all acceptance criteria with additional edge cases.
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../src/db/database');
const app = require('../src/app');
const { findByEmail, findById } = require('../src/models/user');

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

beforeEach(() => {
  db.exec('DELETE FROM recipes');
  db.exec('DELETE FROM users');
});

afterAll(() => {
  db.exec('DELETE FROM recipes');
  db.exec('DELETE FROM users');
});

// Helper to register a user
async function registerUser(overrides = {}) {
  const defaults = {
    username: 'testuser',
    email: 'test@example.com',
    password: 'password123',
  };
  const user = { ...defaults, ...overrides };
  const res = await request(app).post('/api/auth/register').send(user);
  return { res, user };
}

/* ================================================================
   AC1: POST /api/auth/login with valid credentials returns 200
         with { user, token }
   ================================================================ */
describe('AC1: Login with valid credentials', () => {
  it('returns 200 with both user and token in body', async () => {
    const { user } = await registerUser();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user');
    expect(res.body).toHaveProperty('token');
  });

  it('returned user has correct id, username, email fields', async () => {
    const { user } = await registerUser();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password });

    expect(res.body.user.username).toBe(user.username);
    expect(res.body.user.email).toBe(user.email);
    expect(typeof res.body.user.id).toBe('number');
  });

  it('returned token is a valid JWT with user id payload', async () => {
    const { user } = await registerUser();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password });

    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    expect(decoded.id).toBe(res.body.user.id);
  });

  it('returned token expires in exactly 7 days', async () => {
    const { user } = await registerUser();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password });

    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    expect(decoded.exp - decoded.iat).toBe(7 * 24 * 60 * 60);
  });

  it('returned user does not include password_hash', async () => {
    const { user } = await registerUser();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password });

    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  it('returned user has expected fields only: id, username, email, bio, created_at', async () => {
    const { user } = await registerUser();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password });

    const keys = Object.keys(res.body.user).sort();
    expect(keys).toEqual(['bio', 'created_at', 'email', 'id', 'username']);
  });
});

/* ================================================================
   AC2: Invalid email returns 401
   ================================================================ */
describe('AC2: Invalid email returns 401', () => {
  beforeEach(async () => {
    await registerUser();
  });

  it('returns 401 for non-existent email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });

    expect(res.status).toBe(401);
  });

  it('returns generic error message for non-existent email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });

    expect(res.body.error).toBe('Invalid email or password');
  });
});

/* ================================================================
   AC3: Wrong password returns 401
   ================================================================ */
describe('AC3: Wrong password returns 401', () => {
  beforeEach(async () => {
    await registerUser();
  });

  it('returns 401 for wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'wrongpass' });

    expect(res.status).toBe(401);
  });

  it('returns generic error message for wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'wrongpass' });

    expect(res.body.error).toBe('Invalid email or password');
  });
});

/* ================================================================
   AC4: Error message does not reveal which field is wrong
   ================================================================ */
describe('AC4: Error message does not reveal which field is wrong', () => {
  beforeEach(async () => {
    await registerUser();
  });

  it('bad email and bad password produce identical error response shape', async () => {
    const badEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'wrong@example.com', password: 'password123' });

    const badPass = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'wrongpass' });

    expect(badEmail.status).toBe(badPass.status);
    expect(badEmail.body.error).toBe(badPass.body.error);
    expect(Object.keys(badEmail.body).sort()).toEqual(Object.keys(badPass.body).sort());
  });

  it('error response does not contain email-specific or password-specific hints', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'wrong@example.com', password: 'wrongpass' });

    const body = JSON.stringify(res.body).toLowerCase();
    expect(body).not.toContain('email not found');
    expect(body).not.toContain('incorrect password');
    expect(body).not.toContain('user not found');
    expect(body).not.toContain('password incorrect');
    expect(body).not.toContain('no such user');
  });
});

/* ================================================================
   AC5: Auth middleware attaches req.user for valid Bearer tokens
   ================================================================ */
describe('AC5: Auth middleware attaches req.user for valid tokens', () => {
  it('GET /api/me returns 200 with user for valid register token', async () => {
    const { res: regRes } = await registerUser();

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${regRes.body.token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toHaveProperty('id');
    expect(res.body.user).toHaveProperty('username', 'testuser');
    expect(res.body.user).toHaveProperty('email', 'test@example.com');
  });

  it('GET /api/me returns 200 with user for valid login token', async () => {
    const { user } = await registerUser();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password });

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(user.email);
  });

  it('req.user does not include password_hash', async () => {
    const { res: regRes } = await registerUser();

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${regRes.body.token}`);

    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  it('middleware returns correct user when multiple users exist', async () => {
    const { res: reg1 } = await registerUser({
      username: 'user1', email: 'user1@example.com', password: 'pass111111',
    });
    const { res: reg2 } = await registerUser({
      username: 'user2', email: 'user2@example.com', password: 'pass222222',
    });

    const me1 = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${reg1.body.token}`);
    expect(me1.body.user.email).toBe('user1@example.com');

    const me2 = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${reg2.body.token}`);
    expect(me2.body.user.email).toBe('user2@example.com');
  });
});

/* ================================================================
   AC6: Auth middleware returns 401 for missing Authorization header
   ================================================================ */
describe('AC6: Auth middleware returns 401 for missing Authorization header', () => {
  it('returns 401 when no Authorization header is sent', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('returns 401 for non-Bearer authorization scheme', async () => {
    const { res: regRes } = await registerUser();
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Basic ${regRes.body.token}`);

    expect(res.status).toBe(401);
  });

  it('returns 401 for empty Authorization header', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', '');

    expect(res.status).toBe(401);
  });
});

/* ================================================================
   AC7: Auth middleware returns 401 for expired or malformed tokens
   ================================================================ */
describe('AC7: Auth middleware returns 401 for expired or malformed tokens', () => {
  it('returns 401 for expired token', async () => {
    const expiredToken = jwt.sign({ id: 1 }, JWT_SECRET, { expiresIn: '0s' });
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('returns 401 for malformed token string', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer not.a.valid.jwt');

    expect(res.status).toBe(401);
  });

  it('returns 401 for random garbage token', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer abcdef12345');

    expect(res.status).toBe(401);
  });

  it('returns 401 for token signed with wrong secret', async () => {
    const badToken = jwt.sign({ id: 1 }, 'wrong-secret', { expiresIn: '7d' });
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${badToken}`);

    expect(res.status).toBe(401);
  });

  it('returns 401 for token referencing a deleted user', async () => {
    const { res: regRes } = await registerUser();
    const token = regRes.body.token;
    db.exec('DELETE FROM users');

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
  });

  it('returns 401 for token with non-existent user id', async () => {
    const fakeToken = jwt.sign({ id: 999999 }, JWT_SECRET, { expiresIn: '7d' });
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${fakeToken}`);

    expect(res.status).toBe(401);
  });

  it('returns 401 for empty Bearer value', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer ');

    expect(res.status).toBe(401);
  });

  it('returns 401 for "Bearer" with no space after it', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer');

    expect(res.status).toBe(401);
  });
});

/* ================================================================
   Login input validation
   ================================================================ */
describe('Login input validation', () => {
  it('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'password123' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: 'password123' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for empty email string', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: '', password: 'password123' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for empty password string', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: '' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for empty body', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({});

    expect(res.status).toBe(400);
  });

  it('trims whitespace from email before lookup', async () => {
    await registerUser();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: '  test@example.com  ', password: 'password123' });

    expect(res.status).toBe(200);
  });
});

/* ================================================================
   Integration: Login → use token → access protected resource
   ================================================================ */
describe('Integration: login flow end-to-end', () => {
  it('register → login → access protected route with login token', async () => {
    const { user } = await registerUser();

    // Login
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password });
    expect(loginRes.status).toBe(200);

    // Use login token on protected route
    const meRes = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${loginRes.body.token}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe(user.email);
    expect(meRes.body.user).not.toHaveProperty('password_hash');
  });

  it('login and register return consistent user shapes', async () => {
    const { user, res: regRes } = await registerUser();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password });

    expect(Object.keys(regRes.body.user).sort()).toEqual(
      Object.keys(loginRes.body.user).sort()
    );
  });

  it('login returns same user id as registration', async () => {
    const { user, res: regRes } = await registerUser();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password });

    expect(loginRes.body.user.id).toBe(regRes.body.user.id);
  });
});

/* ================================================================
   Model-level validation: findByEmail, findById
   ================================================================ */
describe('User model functions', () => {
  it('findByEmail returns user with password_hash for bcrypt comparison', async () => {
    await registerUser();
    const user = findByEmail('test@example.com');
    expect(user).toBeDefined();
    expect(user).toHaveProperty('password_hash');
    expect(user.password_hash).toBeTruthy();
  });

  it('findByEmail returns null for non-existent email', () => {
    const user = findByEmail('nobody@example.com');
    expect(user).toBeUndefined();
  });

  it('findById returns user without password_hash', async () => {
    await registerUser();
    const fullUser = findByEmail('test@example.com');
    const user = findById(fullUser.id);
    expect(user).toBeDefined();
    expect(user).not.toHaveProperty('password_hash');
    expect(user).toHaveProperty('id');
    expect(user).toHaveProperty('username');
    expect(user).toHaveProperty('email');
  });

  it('findById returns undefined for non-existent id', () => {
    const user = findById(99999);
    expect(user).toBeUndefined();
  });

  it('stored password_hash matches original password via bcrypt', async () => {
    await registerUser({ password: 'mypassword123' });
    const user = findByEmail('test@example.com');
    const matches = await bcrypt.compare('mypassword123', user.password_hash);
    expect(matches).toBe(true);
  });

  it('stored password_hash does not match wrong password via bcrypt', async () => {
    await registerUser({ password: 'mypassword123' });
    const user = findByEmail('test@example.com');
    const matches = await bcrypt.compare('wrongpassword', user.password_hash);
    expect(matches).toBe(false);
  });
});

/* ================================================================
   Security edge cases
   ================================================================ */
describe('Security edge cases', () => {
  beforeEach(async () => {
    await registerUser();
  });

  it('SQL injection in email field does not bypass auth', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: "' OR 1=1 --", password: 'anything' });

    expect(res.status).not.toBe(200);
  });

  it('handles extremely long password without crashing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'x'.repeat(10000) });

    expect(res.status).toBe(401);
  });

  it('handles null email gracefully', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: null, password: 'password123' });

    expect(res.status).toBe(400);
  });

  it('handles null password gracefully', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: null });

    expect(res.status).toBe(400);
  });

  it('tampered JWT token payload is rejected', async () => {
    const { res: regRes } = await registerUser({
      username: 'tampertest', email: 'tamper@example.com', password: 'pass123456',
    });
    const token = regRes.body.token;
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    payload.id = 999;
    parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64url');

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${parts.join('.')}`);

    expect(res.status).toBe(401);
  });

  it('all 401 responses return JSON content-type', async () => {
    // No auth header
    const r1 = await request(app).get('/api/me');
    expect(r1.headers['content-type']).toMatch(/application\/json/);

    // Bad login
    const r2 = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong' });
    expect(r2.headers['content-type']).toMatch(/application\/json/);

    // Wrong password
    const r3 = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'wrongpass' });
    expect(r3.headers['content-type']).toMatch(/application\/json/);
  });
});
