const request = require('supertest');
const jwt = require('jsonwebtoken');
const db = require('../src/db/database');
const app = require('../src/app');

beforeEach(() => {
  db.exec('DELETE FROM recipes');
  db.exec('DELETE FROM users');
});

afterAll(() => {
  db.exec('DELETE FROM recipes');
  db.exec('DELETE FROM users');
});

describe('TICKET-005 QA: POST /api/auth/login — edge cases', () => {
  const validUser = {
    username: 'testuser',
    email: 'test@example.com',
    password: 'password123',
  };

  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(validUser);
  });

  it('should return JWT that expires in 7 days', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: validUser.password });

    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET || 'test-secret');
    const durationSeconds = decoded.exp - decoded.iat;
    expect(durationSeconds).toBe(7 * 24 * 60 * 60);
  });

  it('should return user with exactly the expected fields (no extra)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: validUser.password });

    const userKeys = Object.keys(res.body.user).sort();
    expect(userKeys).toEqual(['bio', 'created_at', 'email', 'id', 'username']);
  });

  it('should return user.id as a number', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: validUser.password });

    expect(typeof res.body.user.id).toBe('number');
  });

  it('should handle case-sensitive email correctly', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'Test@Example.com', password: validUser.password });

    // SQLite LIKE is case-insensitive, but = is case-sensitive by default
    // The behavior here depends on whether the DB stores normalized email
    // Either 200 (if case-insensitive) or 401 (if case-sensitive) is acceptable
    expect([200, 401]).toContain(res.status);
  });

  it('should handle empty body gracefully', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({});

    expect(res.status).toBe(400);
  });

  it('should handle missing Content-Type header', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send('email=test@example.com&password=password123');

    // Without proper JSON content type, express.json() won't parse
    expect([400, 401]).toContain(res.status);
  });

  it('should trim whitespace from email before lookup', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: '  test@example.com  ', password: validUser.password });

    // The login validation uses .trim(), so whitespace should be stripped
    expect(res.status).toBe(200);
  });

  it('should not accept extra-long password without crashing', async () => {
    const longPassword = 'a'.repeat(10000);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: longPassword });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });
});

describe('TICKET-005 QA: Auth middleware — edge cases', () => {
  const validUser = {
    username: 'testuser',
    email: 'test@example.com',
    password: 'password123',
  };

  let token;

  beforeEach(async () => {
    const res = await request(app).post('/api/auth/register').send(validUser);
    token = res.body.token;
  });

  it('should return 401 for empty Bearer token', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer ');

    expect(res.status).toBe(401);
  });

  it('should return 401 for token signed with wrong secret', async () => {
    const badToken = jwt.sign({ id: 1 }, 'wrong-secret', { expiresIn: '7d' });

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${badToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('should return 401 for token with non-existent user id', async () => {
    const fakeToken = jwt.sign({ id: 99999 }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '7d' });

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${fakeToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('should not include password_hash in req.user attached by middleware', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  it('should return 401 for Authorization header with just "Bearer" (no token)', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer');

    expect(res.status).toBe(401);
  });

  it('should return 401 for token with extra spaces', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer  ${token}`);

    // Double space after Bearer means the token extracted would start with a space
    expect(res.status).toBe(401);
  });

  it('should allow login token to be used in auth middleware', async () => {
    // Get a token from login (not register)
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: validUser.password });

    const loginToken = loginRes.body.token;

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${loginToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(validUser.email);
  });

  it('should return consistent user shape from middleware and login', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: validUser.password });

    const meRes = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    // Both should return same user fields
    expect(Object.keys(loginRes.body.user).sort()).toEqual(
      Object.keys(meRes.body.user).sort()
    );
    expect(loginRes.body.user.id).toBe(meRes.body.user.id);
    expect(loginRes.body.user.email).toBe(meRes.body.user.email);
  });
});
