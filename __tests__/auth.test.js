const request = require('supertest');
const jwt = require('jsonwebtoken');
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

describe('POST /api/auth/register', () => {
  const validUser = {
    username: 'testuser',
    email: 'test@example.com',
    password: 'password123',
  };

  it('should register a new user and return 201 with user and token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(validUser);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('user');
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toHaveProperty('id');
    expect(res.body.user.username).toBe('testuser');
    expect(res.body.user.email).toBe('test@example.com');
    expect(res.body.user).toHaveProperty('bio');
    expect(res.body.user).toHaveProperty('created_at');
  });

  it('should never include password_hash in the user object', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(validUser);

    expect(res.status).toBe(201);
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  it('should store password as bcrypt hash in the database', async () => {
    await request(app)
      .post('/api/auth/register')
      .send(validUser);

    const row = db.prepare('SELECT password_hash FROM users WHERE email = ?').get(validUser.email);
    expect(row.password_hash).toMatch(/^\$2[aby]\$/);
    expect(row.password_hash).not.toBe(validUser.password);
  });

  it('should return a valid JWT token containing user id', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(validUser);

    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET || 'test-secret');
    expect(decoded).toHaveProperty('id', res.body.user.id);
  });

  it('should return 409 when email is already registered', async () => {
    await request(app).post('/api/auth/register').send(validUser);

    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, username: 'otheruser' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Email already registered');
  });

  it('should return 409 when username is already taken', async () => {
    await request(app).post('/api/auth/register').send(validUser);

    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, email: 'other@example.com' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Username already taken');
  });

  describe('validation errors', () => {
    it('should return 400 when username is missing', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'password123' });

      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'username' }),
        ])
      );
    });

    it('should return 400 when username is too short', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'ab', email: 'test@example.com', password: 'password123' });

      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'username' }),
        ])
      );
    });

    it('should return 400 when username contains non-alphanumeric characters', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'user@name', email: 'test@example.com', password: 'password123' });

      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'username' }),
        ])
      );
    });

    it('should return 400 when email is invalid', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'testuser', email: 'notanemail', password: 'password123' });

      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'email' }),
        ])
      );
    });

    it('should return 400 when email is missing', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'testuser', password: 'password123' });

      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'email' }),
        ])
      );
    });

    it('should return 400 when password is too short', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'testuser', email: 'test@example.com', password: '12345' });

      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'password' }),
        ])
      );
    });

    it('should return 400 when password is missing', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'testuser', email: 'test@example.com' });

      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'password' }),
        ])
      );
    });

    it('should return 400 when all fields are missing', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.errors.length).toBeGreaterThanOrEqual(3);
    });
  });
});

describe('POST /api/auth/login', () => {
  const validUser = {
    username: 'testuser',
    email: 'test@example.com',
    password: 'password123',
  };

  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(validUser);
  });

  it('should login with valid credentials and return 200 with user and token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: validUser.password });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user');
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.email).toBe(validUser.email);
    expect(res.body.user.username).toBe(validUser.username);
    expect(res.body.user).toHaveProperty('id');
    expect(res.body.user).toHaveProperty('bio');
    expect(res.body.user).toHaveProperty('created_at');
  });

  it('should not include password_hash in the user object', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: validUser.password });

    expect(res.status).toBe(200);
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  it('should return a valid JWT token containing user id', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: validUser.password });

    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET || 'test-secret');
    expect(decoded).toHaveProperty('id', res.body.user.id);
  });

  it('should return 401 for non-existent email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'wrong@example.com', password: validUser.password });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });

  it('should return 401 for wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });

  it('should not reveal which field is wrong', async () => {
    const resBadEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'wrong@example.com', password: validUser.password });

    const resBadPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: 'wrongpassword' });

    expect(resBadEmail.body.error).toBe(resBadPassword.body.error);
  });

  it('should return 400 when email is missing', async () => {
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

  it('should return 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'password' }),
      ])
    );
  });

  it('should return 400 for invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'notanemail', password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'email' }),
      ])
    );
  });
});

describe('Auth middleware', () => {
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

  it('should attach req.user for valid Bearer token', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toHaveProperty('id');
    expect(res.body.user.email).toBe(validUser.email);
    expect(res.body.user.username).toBe(validUser.username);
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  it('should return 401 for missing Authorization header', async () => {
    const res = await request(app).get('/api/me');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('should return 401 for malformed token', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer invalidtoken123');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('should return 401 for expired token', async () => {
    const expiredToken = jwt.sign(
      { id: 1 },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '0s' }
    );

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('should return 401 when Authorization header is not Bearer scheme', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Basic ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('should return 401 when user no longer exists', async () => {
    db.exec('DELETE FROM users');

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });
});
