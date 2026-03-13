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

describe('GET /api/tags', () => {
  it('should return empty array when no tags exist', async () => {
    const res = await request(app).get('/api/tags');
    expect(res.status).toBe(200);
    expect(res.body.tags).toEqual([]);
  });

  it('should return all tags', async () => {
    db.prepare("INSERT INTO tags (name) VALUES ('quick')").run();
    db.prepare("INSERT INTO tags (name) VALUES ('vegan')").run();

    const res = await request(app).get('/api/tags');
    expect(res.status).toBe(200);
    expect(res.body.tags).toHaveLength(2);
  });

  it('should not require authentication', async () => {
    const res = await request(app).get('/api/tags');
    expect(res.status).toBe(200);
  });
});

describe('POST /api/tags', () => {
  it('should create a tag and return 201', async () => {
    const res = await request(app)
      .post('/api/tags')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'vegan' });

    expect(res.status).toBe(201);
    expect(res.body.tag).toHaveProperty('id');
    expect(res.body.tag.name).toBe('vegan');
    expect(res.body.tag).toHaveProperty('created_at');
  });

  it('should trim the tag name', async () => {
    const res = await request(app)
      .post('/api/tags')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: '  vegan  ' });

    expect(res.status).toBe(201);
    expect(res.body.tag.name).toBe('vegan');
  });

  it('should return 409 for duplicate tag name', async () => {
    await request(app)
      .post('/api/tags')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'vegan' });

    const res = await request(app)
      .post('/api/tags')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'vegan' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Tag name already exists');
  });

  it('should return 401 without authentication', async () => {
    const res = await request(app)
      .post('/api/tags')
      .send({ name: 'vegan' });

    expect(res.status).toBe(401);
  });

  it('should return 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/tags')
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
      .post('/api/tags')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'A' });

    expect(res.status).toBe(400);
  });

  it('should return 400 when name is too long', async () => {
    const res = await request(app)
      .post('/api/tags')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'A'.repeat(31) });

    expect(res.status).toBe(400);
  });
});
