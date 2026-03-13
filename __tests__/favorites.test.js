const request = require('supertest');
const jwt = require('jsonwebtoken');
const db = require('../src/db/database');
const app = require('../src/app');

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

function createToken(userId) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '7d' });
}

function createTestUser(username = 'testuser', email = 'test@example.com') {
  const stmt = db.prepare(
    'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
  );
  const result = stmt.run(username, email, 'hashedpassword123');
  return { id: result.lastInsertRowid, username, email };
}

function createTestRecipe(userId, title = 'Test Recipe') {
  const stmt = db.prepare(
    'INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)'
  );
  const result = stmt.run(userId, title, 'ingredient1,ingredient2', 'step1,step2');
  return { id: result.lastInsertRowid, title };
}

beforeEach(() => {
  db.exec('DELETE FROM favorites');
  db.exec('DELETE FROM recipes');
  db.exec('DELETE FROM users');
});

afterAll(() => {
  db.exec('DELETE FROM favorites');
  db.exec('DELETE FROM recipes');
  db.exec('DELETE FROM users');
});

describe('POST /api/recipes/:id/favorite', () => {
  it('should add a recipe to favorites and return 201', async () => {
    const user = createTestUser();
    const recipe = createTestRecipe(user.id);
    const token = createToken(user.id);

    const res = await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ message: 'Recipe added to favorites' });
  });

  it('should return 404 when recipe does not exist', async () => {
    const user = createTestUser();
    const token = createToken(user.id);

    const res = await request(app)
      .post('/api/recipes/99999/favorite')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Recipe not found');
  });

  it('should return 409 when recipe is already in favorites', async () => {
    const user = createTestUser();
    const recipe = createTestRecipe(user.id);
    const token = createToken(user.id);

    await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Recipe already in favorites');
  });

  it('should return 401 without auth token', async () => {
    const res = await request(app)
      .post('/api/recipes/1/favorite');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('should return 401 with invalid token', async () => {
    const res = await request(app)
      .post('/api/recipes/1/favorite')
      .set('Authorization', 'Bearer invalidtoken');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid or expired token');
  });
});

describe('DELETE /api/recipes/:id/favorite', () => {
  it('should remove a favorite and return 204', async () => {
    const user = createTestUser();
    const recipe = createTestRecipe(user.id);
    const token = createToken(user.id);

    await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .delete(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
  });

  it('should return 404 when recipe is not in favorites', async () => {
    const user = createTestUser();
    const recipe = createTestRecipe(user.id);
    const token = createToken(user.id);

    const res = await request(app)
      .delete(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Recipe not in favorites');
  });

  it('should return 401 without auth token', async () => {
    const res = await request(app)
      .delete('/api/recipes/1/favorite');

    expect(res.status).toBe(401);
  });
});

describe('GET /api/users/favorites', () => {
  it('should return paginated favorite recipes with details', async () => {
    const user = createTestUser();
    const recipe1 = createTestRecipe(user.id, 'Recipe One');
    const recipe2 = createTestRecipe(user.id, 'Recipe Two');
    const token = createToken(user.id);

    await request(app)
      .post(`/api/recipes/${recipe1.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);
    await request(app)
      .post(`/api/recipes/${recipe2.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.recipes).toHaveLength(2);
    expect(res.body.recipes[0]).toHaveProperty('title');
    expect(res.body.recipes[0]).toHaveProperty('ingredients');
    expect(res.body.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 2,
      totalPages: 1,
    });
  });

  it('should respect pagination parameters', async () => {
    const user = createTestUser();
    const token = createToken(user.id);

    // Create 3 recipes and favorite them
    for (let i = 1; i <= 3; i++) {
      const recipe = createTestRecipe(user.id, `Recipe ${i}`);
      await request(app)
        .post(`/api/recipes/${recipe.id}/favorite`)
        .set('Authorization', `Bearer ${token}`);
    }

    const res = await request(app)
      .get('/api/users/favorites?page=2&limit=2')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.recipes).toHaveLength(1);
    expect(res.body.pagination).toEqual({
      page: 2,
      limit: 2,
      total: 3,
      totalPages: 2,
    });
  });

  it('should return empty array when user has no favorites', async () => {
    const user = createTestUser();
    const token = createToken(user.id);

    const res = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.recipes).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });

  it('should return 401 without auth token', async () => {
    const res = await request(app)
      .get('/api/users/favorites');

    expect(res.status).toBe(401);
  });

  it('should use default pagination values', async () => {
    const user = createTestUser();
    const token = createToken(user.id);

    const res = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(10);
  });
});
