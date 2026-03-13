/**
 * TICKET-005 — Test Agent QA validation
 * Additional edge-case and security tests written by the test agent.
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

describe('TICKET-005 Test-Agent: Login security & edge cases', () => {
  const validUser = {
    username: 'qauser',
    email: 'qa@example.com',
    password: 'securepass123',
  };

  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(validUser);
  });

  it('should not accept SQL injection in email field', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: "' OR 1=1 --", password: 'anything' });

    // Should be 400 (invalid email format) not 200
    expect(res.status).not.toBe(200);
  });

  it('should return JSON content-type on success', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: validUser.password });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('should return JSON content-type on 401 error', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('should not leak timing info via different response structures', async () => {
    const resBadEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: validUser.password });

    const resBadPass = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: 'wrongpassword' });

    // Both responses must have identical keys
    expect(Object.keys(resBadEmail.body).sort()).toEqual(Object.keys(resBadPass.body).sort());
  });

  it('login token should have same payload structure as register token', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ username: 'newuser', email: 'new@example.com', password: 'pass123456' });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: validUser.password });

    const regDecoded = jwt.verify(registerRes.body.token, JWT_SECRET);
    const loginDecoded = jwt.verify(loginRes.body.token, JWT_SECRET);

    // Both should have id, iat, exp
    expect(Object.keys(regDecoded).sort()).toEqual(Object.keys(loginDecoded).sort());
  });

  it('should handle null values in request body', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: null, password: null });

    expect(res.status).toBe(400);
  });

  it('should handle numeric values in request body', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 12345, password: 67890 });

    expect(res.status).not.toBe(200);
  });
});

describe('TICKET-005 Test-Agent: Auth middleware additional edge cases', () => {
  const validUser = {
    username: 'qauser',
    email: 'qa@example.com',
    password: 'securepass123',
  };

  let token;

  beforeEach(async () => {
    const res = await request(app).post('/api/auth/register').send(validUser);
    token = res.body.token;
  });

  it('should return 401 for Authorization header with only whitespace after Bearer', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer    ');

    expect(res.status).toBe(401);
  });

  it('should return 401 for token with tampered payload', async () => {
    // Split token, modify payload, reassemble (invalid signature)
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    payload.id = 99999;
    parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const tamperedToken = parts.join('.');

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${tamperedToken}`);

    expect(res.status).toBe(401);
  });

  it('should return correct user data when multiple users exist', async () => {
    // Register a second user
    const user2 = { username: 'user2', email: 'user2@example.com', password: 'pass123456' };
    const reg2 = await request(app).post('/api/auth/register').send(user2);
    const token2 = reg2.body.token;

    // User 1 token should return user 1 data
    const res1 = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res1.status).toBe(200);
    expect(res1.body.user.email).toBe(validUser.email);

    // User 2 token should return user 2 data
    const res2 = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${token2}`);

    expect(res2.status).toBe(200);
    expect(res2.body.user.email).toBe(user2.email);
  });

  it('should return JSON content-type on 401 from middleware', async () => {
    const res = await request(app).get('/api/me');

    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});
