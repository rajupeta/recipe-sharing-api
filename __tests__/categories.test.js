const request = require('supertest');
const jwt = require('jsonwebtoken');
const db = require('../src/db/database');
const app = require('../src/app');

let authToken;
let userId;

beforeEach(() => {
  db.exec('DELETE FROM recipe_tags');
  db.exec('DELETE FROM recipe_categories');
  db.exec('DELETE FROM tags');
  db.exec('DELETE FROM categories');
  db.exec('DELETE FROM recipes');
  db.exec('DELETE FROM users');

  const result = db.prepare(
    "INSERT INTO users (username, email, password_hash) VALUES ('testuser', 'test@example.com', 'hash')"
  ).run();
  userId = result.lastInsertRowid;
  authToken = jwt.sign({ id: userId }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
});

afterAll(() => {
  db.exec('DELETE FROM recipe_tags');
  db.exec('DELETE FROM recipe_categories');
  db.exec('DELETE FROM tags');
  db.exec('DELETE FROM categories');
  db.exec('DELETE FROM recipes');
  db.exec('DELETE FROM users');
});

describe('GET /api/categories', () => {
  it('should return empty array when no categories exist', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body.categories).toEqual([]);
  });

  it('should return all categories', async () => {
    db.prepare("INSERT INTO categories (name) VALUES ('Italian')").run();
    db.prepare("INSERT INTO categories (name) VALUES ('Mexican')").run();

    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body.categories).toHaveLength(2);
    expect(res.body.categories[0].name).toBe('Italian');
    expect(res.body.categories[1].name).toBe('Mexican');
  });

  it('should not require authentication', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
  });
});

describe('POST /api/categories', () => {
  it('should create a category and return 201', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Italian' });

    expect(res.status).toBe(201);
    expect(res.body.category).toHaveProperty('id');
    expect(res.body.category.name).toBe('Italian');
    expect(res.body.category).toHaveProperty('created_at');
  });

  it('should trim the category name', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: '  Italian  ' });

    expect(res.status).toBe(201);
    expect(res.body.category.name).toBe('Italian');
  });

  it('should return 409 for duplicate category name', async () => {
    await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Italian' });

    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Italian' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Category name already exists');
  });

  it('should return 401 without authentication', async () => {
    const res = await request(app)
      .post('/api/categories')
      .send({ name: 'Italian' });

    expect(res.status).toBe(401);
  });

  it('should return 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'name' }),
      ])
    );
  });

  it('should return 400 when name is too short', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'A' });

    expect(res.status).toBe(400);
  });

  it('should return 400 when name is too long', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'A'.repeat(51) });

    expect(res.status).toBe(400);
  });
});
