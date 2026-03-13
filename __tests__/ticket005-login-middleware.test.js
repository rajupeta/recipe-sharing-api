/**
 * TICKET-005 QA Validation — Login endpoint & Auth middleware
 *
 * Acceptance criteria coverage:
 * 1. POST /api/auth/login with valid credentials returns 200 with {user, token}
 * 2. Invalid email returns 401
 * 3. Wrong password returns 401
 * 4. Error message does not reveal which field is wrong
 * 5. Auth middleware attaches req.user for valid Bearer tokens
 * 6. Auth middleware returns 401 for missing Authorization header
 * 7. Auth middleware returns 401 for expired or malformed tokens
 * 8. Tests cover login success, invalid credentials, and all middleware cases
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const db = require('../src/db/database');
const app = require('../src/app');

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

beforeEach(() => {
  db.exec('DELETE FROM recipes');
  db.exec('DELETE FROM users');
});

afterAll(() => {
  db.exec('DELETE FROM recipes');
  db.exec('DELETE FROM users');
});

// Helper to register a user and return the response
async function registerUser(overrides = {}) {
  const defaults = {
    username: 'loginuser',
    email: 'login@example.com',
    password: 'password123',
  };
  return request(app)
    .post('/api/auth/register')
    .send({ ...defaults, ...overrides });
}

// ─── LOGIN ENDPOINT ────────────────────────────────────────────

describe('POST /api/auth/login — success cases', () => {
  beforeEach(async () => {
    await registerUser();
  });

  it('returns 200 with user and token for valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user');
    expect(res.body).toHaveProperty('token');
  });

  it('user object contains id, username, email, bio, created_at', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'password123' });

    const { user } = res.body;
    expect(user).toHaveProperty('id');
    expect(user).toHaveProperty('username', 'loginuser');
    expect(user).toHaveProperty('email', 'login@example.com');
    expect(user).toHaveProperty('bio');
    expect(user).toHaveProperty('created_at');
  });

  it('user object does NOT contain password_hash', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  it('token is a valid JWT with user id and 7d expiry', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'password123' });

    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    expect(decoded).toHaveProperty('id', res.body.user.id);
    expect(decoded).toHaveProperty('iat');
    expect(decoded).toHaveProperty('exp');

    // Verify ~7d expiry (604800 seconds ± a few seconds for test execution)
    const duration = decoded.exp - decoded.iat;
    expect(duration).toBeGreaterThanOrEqual(604790);
    expect(duration).toBeLessThanOrEqual(604810);
  });

  it('login token matches the same user id from registration', async () => {
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ username: 'another', email: 'another@example.com', password: 'pass123456' });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'another@example.com', password: 'pass123456' });

    const regDecoded = jwt.verify(regRes.body.token, JWT_SECRET);
    const loginDecoded = jwt.verify(loginRes.body.token, JWT_SECRET);
    expect(loginDecoded.id).toBe(regDecoded.id);
  });
});

describe('POST /api/auth/login — failure cases', () => {
  beforeEach(async () => {
    await registerUser();
  });

  it('returns 401 for non-existent email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'noone@example.com', password: 'password123' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });

  it('returns 401 for wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });

  it('error message is identical for bad email and bad password (no field leak)', async () => {
    const badEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'noone@example.com', password: 'password123' });

    const badPass = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'wrongpassword' });

    expect(badEmail.status).toBe(401);
    expect(badPass.status).toBe(401);
    expect(badEmail.body.error).toBe(badPass.body.error);
    expect(badEmail.body.error).toBe('Invalid email or password');
  });

  it('response body shape is identical for bad email vs bad password', async () => {
    const badEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'noone@example.com', password: 'password123' });

    const badPass = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'wrongpassword' });

    expect(Object.keys(badEmail.body).sort()).toEqual(Object.keys(badPass.body).sort());
  });
});

describe('POST /api/auth/login — validation', () => {
  it('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'email' }),
      ])
    );
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'password' }),
      ])
    );
  });

  it('returns 400 when email format is invalid', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'email' }),
      ])
    );
  });

  it('returns 400 when body is empty', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('returns 400 for empty string email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: '', password: 'password123' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for empty string password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: '' });

    expect(res.status).toBe(400);
  });
});

// ─── AUTH MIDDLEWARE ────────────────────────────────────────────

describe('Auth middleware — valid token', () => {
  let token;
  let userId;

  beforeEach(async () => {
    const reg = await registerUser();
    token = reg.body.token;
    userId = reg.body.user.id;
  });

  it('attaches req.user with correct fields for valid Bearer token', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toHaveProperty('id', userId);
    expect(res.body.user).toHaveProperty('username', 'loginuser');
    expect(res.body.user).toHaveProperty('email', 'login@example.com');
    expect(res.body.user).toHaveProperty('bio');
    expect(res.body.user).toHaveProperty('created_at');
  });

  it('req.user does NOT contain password_hash', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  it('returns correct user when multiple users exist', async () => {
    // Register a second user
    const reg2 = await request(app)
      .post('/api/auth/register')
      .send({ username: 'second', email: 'second@example.com', password: 'pass123456' });

    // First user's token returns first user's data
    const res1 = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res1.body.user.email).toBe('login@example.com');

    // Second user's token returns second user's data
    const res2 = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${reg2.body.token}`);
    expect(res2.body.user.email).toBe('second@example.com');
  });

  it('works with login-issued tokens too', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'password123' });

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('login@example.com');
  });
});

describe('Auth middleware — missing Authorization header', () => {
  it('returns 401 when no Authorization header is sent', async () => {
    const res = await request(app).get('/api/me');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('returns 401 when Authorization header is empty string', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', '');

    expect(res.status).toBe(401);
  });
});

describe('Auth middleware — invalid/malformed tokens', () => {
  it('returns 401 for completely invalid token string', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer totally.not.valid');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('returns 401 for token signed with wrong secret', async () => {
    const badToken = jwt.sign({ id: 1 }, 'wrong-secret', { expiresIn: '7d' });

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${badToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('returns 401 for expired token', async () => {
    const expiredToken = jwt.sign({ id: 1 }, JWT_SECRET, { expiresIn: '0s' });

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('returns 401 when Authorization is not Bearer scheme', async () => {
    await registerUser();
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'password123' });

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Basic ${loginRes.body.token}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('returns 401 for token with tampered signature', async () => {
    const reg = await registerUser();
    const parts = reg.body.token.split('.');
    // Corrupt the signature
    parts[2] = parts[2].split('').reverse().join('');
    const tampered = parts.join('.');

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${tampered}`);

    expect(res.status).toBe(401);
  });

  it('returns 401 when user referenced by token no longer exists', async () => {
    const reg = await registerUser();
    const token = reg.body.token;

    // Delete the user from DB
    db.exec('DELETE FROM users');

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('returns 401 for token with non-existent user id', async () => {
    const fakeToken = jwt.sign({ id: 999999 }, JWT_SECRET, { expiresIn: '7d' });

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${fakeToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });
});
