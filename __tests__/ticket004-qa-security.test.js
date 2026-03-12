/**
 * TICKET-004 QA Security & Robustness Tests
 * Test Agent — security edge cases and race condition coverage
 */

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

describe('TICKET-004 QA: Security & robustness', () => {
  const validUser = {
    username: 'secuser',
    email: 'sec@example.com',
    password: 'securepass123',
  };

  describe('SQL injection prevention', () => {
    it('should safely handle SQL injection in username', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          ...validUser,
          username: "admin'; DROP TABLE users;--",
        });

      // Should be rejected by validation (non-alphanumeric)
      expect(res.status).toBe(400);

      // Verify users table still exists
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
        .all();
      expect(tables.length).toBe(1);
    });

    it('should safely handle SQL injection in email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          ...validUser,
          email: "test@test.com'; DROP TABLE users;--",
        });

      // Should be rejected by validation (invalid email)
      expect(res.status).toBe(400);
    });
  });

  describe('XSS prevention in stored data', () => {
    it('should store but not execute script tags in username', async () => {
      // Alphanumeric validation prevents script tags in username
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          ...validUser,
          username: '<script>alert(1)</script>',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('password security', () => {
    it('should not return password in any error response', async () => {
      // Register first user
      await request(app).post('/api/auth/register').send(validUser);

      // Try duplicate — error response should not leak password
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validUser, username: 'otheruser' });

      expect(res.status).toBe(409);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain(validUser.password);
    });

    it('should not return password_hash in any error response', async () => {
      await request(app).post('/api/auth/register').send(validUser);

      const row = db
        .prepare('SELECT password_hash FROM users WHERE email = ?')
        .get(validUser.email);

      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validUser, username: 'otheruser' });

      const body = JSON.stringify(res.body);
      expect(body).not.toContain(row.password_hash);
    });
  });

  describe('concurrent registration defense', () => {
    it('should handle duplicate email gracefully even if both pass findByEmail check', async () => {
      // This tests the defensive UNIQUE constraint handler in auth.js
      // Insert a user directly into DB to simulate a race condition
      db.prepare(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
      ).run('existing', validUser.email, 'somehash');

      const res = await request(app)
        .post('/api/auth/register')
        .send(validUser);

      // Should get 409, not 500
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/email/i);
    });

    it('should handle duplicate username gracefully via UNIQUE constraint', async () => {
      db.prepare(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
      ).run(validUser.username, 'other@example.com', 'somehash');

      const res = await request(app)
        .post('/api/auth/register')
        .send(validUser);

      // Should get 409 for username conflict (email check passes since different email)
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/username/i);
    });
  });

  describe('request body edge cases', () => {
    it('should reject request with no Content-Type', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Content-Type', 'text/plain')
        .send('not json');

      // Express won't parse non-JSON body, so fields will be missing
      expect(res.status).toBe(400);
    });

    it('should reject extremely long username', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validUser, username: 'a'.repeat(1000) });

      expect(res.status).toBe(400);
    });

    it('should reject null values for required fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: null, email: null, password: null });

      expect(res.status).toBe(400);
    });

    it('should reject numeric values for string fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 12345, email: 12345, password: 12345 });

      expect(res.status).toBe(400);
    });

    it('should handle boolean values for fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: true, email: false, password: true });

      expect(res.status).toBe(400);
    });
  });

  describe('JWT token security', () => {
    it('should not include sensitive data in JWT payload', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(validUser);

      expect(res.status).toBe(201);

      const decoded = jwt.verify(
        res.body.token,
        process.env.JWT_SECRET || 'test-secret'
      );

      expect(decoded).not.toHaveProperty('password');
      expect(decoded).not.toHaveProperty('password_hash');
      expect(decoded).not.toHaveProperty('email');
      expect(decoded).not.toHaveProperty('username');
      expect(decoded).toHaveProperty('id');
      expect(decoded).toHaveProperty('iat');
      expect(decoded).toHaveProperty('exp');
    });

    it('should return a properly formatted JWT with 3 parts', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(validUser);

      expect(res.status).toBe(201);
      const parts = res.body.token.split('.');
      expect(parts.length).toBe(3);
    });
  });

  describe('multiple sequential registrations', () => {
    it('should assign unique incrementing IDs', async () => {
      const res1 = await request(app)
        .post('/api/auth/register')
        .send({ username: 'user1', email: 'user1@test.com', password: 'password123' });

      const res2 = await request(app)
        .post('/api/auth/register')
        .send({ username: 'user2', email: 'user2@test.com', password: 'password123' });

      const res3 = await request(app)
        .post('/api/auth/register')
        .send({ username: 'user3', email: 'user3@test.com', password: 'password123' });

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);
      expect(res3.status).toBe(201);

      expect(res2.body.user.id).toBeGreaterThan(res1.body.user.id);
      expect(res3.body.user.id).toBeGreaterThan(res2.body.user.id);
    });

    it('should generate unique tokens for different users', async () => {
      const res1 = await request(app)
        .post('/api/auth/register')
        .send({ username: 'tokenuser1', email: 'token1@test.com', password: 'password123' });

      const res2 = await request(app)
        .post('/api/auth/register')
        .send({ username: 'tokenuser2', email: 'token2@test.com', password: 'password123' });

      expect(res1.body.token).not.toBe(res2.body.token);
    });
  });

  describe('response status codes are correct', () => {
    it('should return exactly 201 for success (not 200)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(validUser);

      expect(res.status).toBe(201);
      expect(res.status).not.toBe(200);
    });

    it('should return 404 for GET on register endpoint', async () => {
      const res = await request(app).get('/api/auth/register');
      expect(res.status).toBe(404);
    });

    it('should return 404 for PUT on register endpoint', async () => {
      const res = await request(app)
        .put('/api/auth/register')
        .send(validUser);
      expect(res.status).toBe(404);
    });

    it('should return 404 for DELETE on register endpoint', async () => {
      const res = await request(app).delete('/api/auth/register');
      expect(res.status).toBe(404);
    });
  });
});
