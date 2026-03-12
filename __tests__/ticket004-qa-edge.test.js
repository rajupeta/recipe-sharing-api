/**
 * TICKET-004 QA Edge Case Tests
 * Test Agent — additional coverage for user registration endpoint
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../src/db/database');
const app = require('../src/app');

beforeEach(() => {
  db.exec('DELETE FROM recipes');
  db.exec('DELETE FROM users');
});

afterAll(() => {
  // Clean up data but do NOT close the shared db singleton —
  // closing it causes failures in other test files that share the same module.
  db.exec('DELETE FROM recipes');
  db.exec('DELETE FROM users');
});

describe('TICKET-004 QA: POST /api/auth/register — edge cases', () => {
  const validUser = {
    username: 'testuser',
    email: 'test@example.com',
    password: 'password123',
  };

  describe('username boundary validation', () => {
    it('should accept username with exactly 3 characters', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validUser, username: 'abc' });

      expect(res.status).toBe(201);
      expect(res.body.user.username).toBe('abc');
    });

    it('should accept username with exactly 30 characters', async () => {
      const username = 'a'.repeat(30);
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validUser, username });

      expect(res.status).toBe(201);
      expect(res.body.user.username).toBe(username);
    });

    it('should reject username with 31 characters', async () => {
      const username = 'a'.repeat(31);
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validUser, username });

      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'username' }),
        ])
      );
    });

    it('should reject username with 2 characters', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validUser, username: 'ab' });

      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'username' }),
        ])
      );
    });

    it('should reject username with spaces', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validUser, username: 'test user' });

      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'username' }),
        ])
      );
    });

    it('should reject username with underscores', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validUser, username: 'test_user' });

      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'username' }),
        ])
      );
    });

    it('should reject username with hyphens', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validUser, username: 'test-user' });

      expect(res.status).toBe(400);
    });

    it('should accept numeric-only username', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validUser, username: '12345' });

      expect(res.status).toBe(201);
      expect(res.body.user.username).toBe('12345');
    });

    it('should reject empty string username', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validUser, username: '' });

      expect(res.status).toBe(400);
    });
  });

  describe('password boundary validation', () => {
    it('should accept password with exactly 6 characters', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validUser, password: '123456' });

      expect(res.status).toBe(201);
    });

    it('should reject password with 5 characters', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validUser, password: '12345' });

      expect(res.status).toBe(400);
    });

    it('should accept very long password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validUser, password: 'x'.repeat(200) });

      expect(res.status).toBe(201);
    });
  });

  describe('email validation edge cases', () => {
    it('should reject email without domain', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validUser, email: 'user@' });

      expect(res.status).toBe(400);
    });

    it('should reject email without @ sign', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validUser, email: 'user.example.com' });

      expect(res.status).toBe(400);
    });

    it('should reject empty string email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validUser, email: '' });

      expect(res.status).toBe(400);
    });
  });

  describe('bcrypt password hashing', () => {
    it('should hash password with 10 salt rounds', async () => {
      await request(app)
        .post('/api/auth/register')
        .send(validUser);

      const row = db.prepare('SELECT password_hash FROM users WHERE email = ?').get(validUser.email);
      // bcrypt hash with 10 rounds starts with $2b$10$ or $2a$10$
      expect(row.password_hash).toMatch(/^\$2[aby]\$10\$/);
    });

    it('should create different hashes for same password (salt)', async () => {
      await request(app)
        .post('/api/auth/register')
        .send(validUser);

      await request(app)
        .post('/api/auth/register')
        .send({ username: 'otheruser', email: 'other@example.com', password: validUser.password });

      const row1 = db.prepare('SELECT password_hash FROM users WHERE email = ?').get(validUser.email);
      const row2 = db.prepare('SELECT password_hash FROM users WHERE email = ?').get('other@example.com');

      expect(row1.password_hash).not.toBe(row2.password_hash);
    });

    it('should store a hash that verifies against original password', async () => {
      await request(app)
        .post('/api/auth/register')
        .send(validUser);

      const row = db.prepare('SELECT password_hash FROM users WHERE email = ?').get(validUser.email);
      const matches = await bcrypt.compare(validUser.password, row.password_hash);
      expect(matches).toBe(true);
    });

    it('should store a hash that does NOT verify against wrong password', async () => {
      await request(app)
        .post('/api/auth/register')
        .send(validUser);

      const row = db.prepare('SELECT password_hash FROM users WHERE email = ?').get(validUser.email);
      const matches = await bcrypt.compare('wrongpassword', row.password_hash);
      expect(matches).toBe(false);
    });
  });

  describe('JWT token validation', () => {
    it('should generate a token that expires in 7 days', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(validUser);

      const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET || 'test-secret');
      // JWT exp and iat are in seconds
      const durationSeconds = decoded.exp - decoded.iat;
      expect(durationSeconds).toBe(7 * 24 * 60 * 60); // 7 days in seconds
    });

    it('should fail verification with wrong secret', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(validUser);

      expect(() => {
        jwt.verify(res.body.token, 'wrong-secret');
      }).toThrow();
    });

    it('should contain only id in token payload (no email or username)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(validUser);

      const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET || 'test-secret');
      expect(decoded).toHaveProperty('id');
      expect(decoded).not.toHaveProperty('email');
      expect(decoded).not.toHaveProperty('username');
    });
  });

  describe('response shape', () => {
    it('should return user object with exactly the expected fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(validUser);

      expect(res.status).toBe(201);
      const userKeys = Object.keys(res.body.user).sort();
      expect(userKeys).toEqual(['bio', 'created_at', 'email', 'id', 'username'].sort());
    });

    it('should return Content-Type application/json', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(validUser);

      expect(res.headers['content-type']).toMatch(/application\/json/);
    });

    it('should return user.id as a number', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(validUser);

      expect(typeof res.body.user.id).toBe('number');
    });

    it('should return token as a string', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(validUser);

      expect(typeof res.body.token).toBe('string');
      expect(res.body.token.length).toBeGreaterThan(0);
    });
  });

  describe('duplicate detection', () => {
    it('should detect duplicate email even with different username', async () => {
      await request(app).post('/api/auth/register').send(validUser);

      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'differentuser', email: validUser.email, password: 'password456' });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/email/i);
    });

    it('should detect duplicate username even with different email', async () => {
      await request(app).post('/api/auth/register').send(validUser);

      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: validUser.username, email: 'different@example.com', password: 'password456' });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/username/i);
    });

    it('should check email before username (email conflict takes priority)', async () => {
      await request(app).post('/api/auth/register').send(validUser);

      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: validUser.username, email: validUser.email, password: 'password456' });

      expect(res.status).toBe(409);
      // Since email is checked first in the code, we get email error
      expect(res.body.error).toBe('Email already registered');
    });
  });

  describe('input handling', () => {
    it('should ignore extra fields in request body', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validUser, isAdmin: true, role: 'admin' });

      expect(res.status).toBe(201);
      expect(res.body.user).not.toHaveProperty('isAdmin');
      expect(res.body.user).not.toHaveProperty('role');
    });

    it('should trim whitespace from username', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validUser, username: '  testuser  ' });

      expect(res.status).toBe(201);
      expect(res.body.user.username).toBe('testuser');
    });

    it('should trim whitespace from email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validUser, email: '  test@example.com  ' });

      expect(res.status).toBe(201);
      expect(res.body.user.email).toBe('test@example.com');
    });
  });

  describe('user model functions', () => {
    it('findByEmail returns undefined for non-existent email', () => {
      const { findByEmail } = require('../src/models/user');
      const result = findByEmail('nonexistent@example.com');
      expect(result).toBeUndefined();
    });

    it('findByUsername returns undefined for non-existent username', () => {
      const { findByUsername } = require('../src/models/user');
      const result = findByUsername('nonexistent');
      expect(result).toBeUndefined();
    });

    it('findByEmail returns full user row (including password_hash)', async () => {
      const { findByEmail } = require('../src/models/user');
      await request(app).post('/api/auth/register').send(validUser);

      const user = findByEmail(validUser.email);
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('username', validUser.username);
      expect(user).toHaveProperty('email', validUser.email);
      expect(user).toHaveProperty('password_hash');
    });

    it('findByUsername returns full user row', async () => {
      const { findByUsername } = require('../src/models/user');
      await request(app).post('/api/auth/register').send(validUser);

      const user = findByUsername(validUser.username);
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('email', validUser.email);
    });

    it('createUser returns user without password_hash', async () => {
      const { createUser } = require('../src/models/user');
      const passwordHash = await bcrypt.hash('testpass', 10);
      const user = createUser({ username: 'modeltest', email: 'model@test.com', passwordHash });

      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('username', 'modeltest');
      expect(user).toHaveProperty('email', 'model@test.com');
      expect(user).toHaveProperty('bio');
      expect(user).toHaveProperty('created_at');
      expect(user).not.toHaveProperty('password_hash');
    });
  });

  describe('error response format', () => {
    it('validation errors have field and message properties', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({});

      expect(res.status).toBe(400);
      res.body.errors.forEach((err) => {
        expect(err).toHaveProperty('field');
        expect(err).toHaveProperty('message');
        expect(typeof err.field).toBe('string');
        expect(typeof err.message).toBe('string');
      });
    });

    it('409 conflict response has error property as string', async () => {
      await request(app).post('/api/auth/register').send(validUser);

      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...validUser, username: 'otheruser' });

      expect(res.status).toBe(409);
      expect(typeof res.body.error).toBe('string');
    });
  });
});
