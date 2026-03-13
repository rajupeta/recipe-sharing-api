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

/*
 * TICKET-005 Acceptance Criteria:
 * 1. POST /api/auth/login with valid credentials returns 200 with {user, token}
 * 2. Invalid email returns 401
 * 3. Wrong password returns 401
 * 4. Error message does not reveal which field is wrong
 * 5. Auth middleware attaches req.user for valid Bearer tokens
 * 6. Auth middleware returns 401 for missing Authorization header
 * 7. Auth middleware returns 401 for expired or malformed tokens
 * 8. Tests cover login success, invalid credentials, and all middleware cases
 */

describe('TICKET-005 Acceptance: POST /api/auth/login', () => {
  const validUser = {
    username: 'qauser',
    email: 'qa@example.com',
    password: 'securepass123',
  };

  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(validUser);
  });

  // AC1: POST /api/auth/login with valid credentials returns 200 with {user, token}
  describe('AC1: Valid login returns 200 with {user, token}', () => {
    it('returns 200 status code', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: validUser.email, password: validUser.password });

      expect(res.status).toBe(200);
    });

    it('returns user object with id, username, email, bio, created_at', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: validUser.email, password: validUser.password });

      expect(res.body.user).toHaveProperty('id');
      expect(res.body.user).toHaveProperty('username', validUser.username);
      expect(res.body.user).toHaveProperty('email', validUser.email);
      expect(res.body.user).toHaveProperty('bio');
      expect(res.body.user).toHaveProperty('created_at');
    });

    it('returns a valid JWT token with user id', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: validUser.email, password: validUser.password });

      expect(res.body).toHaveProperty('token');
      const decoded = jwt.verify(res.body.token, JWT_SECRET);
      expect(decoded).toHaveProperty('id', res.body.user.id);
    });

    it('returns token that expires in 7 days', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: validUser.email, password: validUser.password });

      const decoded = jwt.verify(res.body.token, JWT_SECRET);
      expect(decoded.exp - decoded.iat).toBe(7 * 24 * 60 * 60);
    });

    it('does not include password_hash in returned user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: validUser.email, password: validUser.password });

      expect(res.body.user).not.toHaveProperty('password_hash');
    });
  });

  // AC2: Invalid email returns 401
  describe('AC2: Invalid email returns 401', () => {
    it('returns 401 for non-existent email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nonexistent@example.com', password: validUser.password });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password');
    });
  });

  // AC3: Wrong password returns 401
  describe('AC3: Wrong password returns 401', () => {
    it('returns 401 for incorrect password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: validUser.email, password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password');
    });
  });

  // AC4: Error message does not reveal which field is wrong
  describe('AC4: Error message does not reveal which field is wrong', () => {
    it('returns identical error for bad email and bad password', async () => {
      const resBadEmail = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: validUser.password });

      const resBadPassword = await request(app)
        .post('/api/auth/login')
        .send({ email: validUser.email, password: 'wrongpassword' });

      expect(resBadEmail.status).toBe(resBadPassword.status);
      expect(resBadEmail.body.error).toBe(resBadPassword.body.error);
      expect(resBadEmail.body.error).toBe('Invalid email or password');
    });

    it('does not include field-specific hints in 401 responses', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'wrongpassword' });

      const errorText = JSON.stringify(res.body).toLowerCase();
      expect(errorText).not.toContain('email not found');
      expect(errorText).not.toContain('wrong password');
      expect(errorText).not.toContain('user not found');
      expect(errorText).not.toContain('password mismatch');
    });
  });

  // Validation edge cases for login
  describe('Login validation', () => {
    it('returns 400 when email is missing', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ password: 'password123' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when password is missing', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: validUser.email });

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'notvalid', password: 'password123' });

      expect(res.status).toBe(400);
    });

    it('returns 400 for empty body', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(res.status).toBe(400);
    });

    it('trims whitespace from email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: '  qa@example.com  ', password: validUser.password });

      expect(res.status).toBe(200);
    });
  });
});

describe('TICKET-005 Acceptance: Auth middleware', () => {
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

  // AC5: Auth middleware attaches req.user for valid Bearer tokens
  describe('AC5: Attaches req.user for valid Bearer tokens', () => {
    it('returns 200 and user object for valid token', async () => {
      const res = await request(app)
        .get('/api/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.user).toHaveProperty('id');
      expect(res.body.user).toHaveProperty('username', validUser.username);
      expect(res.body.user).toHaveProperty('email', validUser.email);
    });

    it('does not include password_hash in req.user', async () => {
      const res = await request(app)
        .get('/api/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.user).not.toHaveProperty('password_hash');
    });

    it('works with token from login endpoint', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: validUser.email, password: validUser.password });

      const res = await request(app)
        .get('/api/me')
        .set('Authorization', `Bearer ${loginRes.body.token}`);

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(validUser.email);
    });
  });

  // AC6: Auth middleware returns 401 for missing Authorization header
  describe('AC6: Returns 401 for missing Authorization header', () => {
    it('returns 401 when no Authorization header', async () => {
      const res = await request(app).get('/api/me');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Authentication required');
    });

    it('returns 401 for non-Bearer scheme', async () => {
      const res = await request(app)
        .get('/api/me')
        .set('Authorization', `Basic ${token}`);

      expect(res.status).toBe(401);
    });
  });

  // AC7: Auth middleware returns 401 for expired or malformed tokens
  describe('AC7: Returns 401 for expired or malformed tokens', () => {
    it('returns 401 for malformed token', async () => {
      const res = await request(app)
        .get('/api/me')
        .set('Authorization', 'Bearer garbage.token.here');

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

    it('returns 401 for token signed with wrong secret', async () => {
      const badToken = jwt.sign({ id: 1 }, 'wrong-secret', { expiresIn: '7d' });

      const res = await request(app)
        .get('/api/me')
        .set('Authorization', `Bearer ${badToken}`);

      expect(res.status).toBe(401);
    });

    it('returns 401 for token with non-existent user id', async () => {
      const fakeToken = jwt.sign({ id: 99999 }, JWT_SECRET, { expiresIn: '7d' });

      const res = await request(app)
        .get('/api/me')
        .set('Authorization', `Bearer ${fakeToken}`);

      expect(res.status).toBe(401);
    });

    it('returns 401 for empty Bearer token', async () => {
      const res = await request(app)
        .get('/api/me')
        .set('Authorization', 'Bearer ');

      expect(res.status).toBe(401);
    });

    it('returns 401 when user has been deleted', async () => {
      db.exec('DELETE FROM users');

      const res = await request(app)
        .get('/api/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
    });
  });
});
