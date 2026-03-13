/**
 * TICKET-012 QA Edge Case Tests
 *
 * Additional edge cases not covered by existing test suites:
 * - Non-numeric recipe IDs
 * - Negative recipe IDs
 * - Re-favoriting after unfavoriting
 * - Pagination with limit=1
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const db = require('../src/db/database');
const app = require('../src/app');

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

function createToken(userId) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '7d' });
}

function createTestUser(username = 'edgeuser', email = 'edge@example.com') {
  const stmt = db.prepare(
    'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
  );
  const result = stmt.run(username, email, 'hashedpassword123');
  return { id: result.lastInsertRowid, username, email };
}

function createTestRecipe(userId, title = 'Edge Recipe') {
  const stmt = db.prepare(
    'INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)'
  );
  const result = stmt.run(userId, title, 'ingredient1', 'step1');
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

describe('Edge case: non-numeric and invalid recipe IDs', () => {
  it('POST with non-numeric ID returns 404', async () => {
    const user = createTestUser();
    const token = createToken(user.id);

    const res = await request(app)
      .post('/api/recipes/abc/favorite')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('DELETE with non-numeric ID returns 404', async () => {
    const user = createTestUser();
    const token = createToken(user.id);

    const res = await request(app)
      .delete('/api/recipes/abc/favorite')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('POST with negative ID returns 404', async () => {
    const user = createTestUser();
    const token = createToken(user.id);

    const res = await request(app)
      .post('/api/recipes/-1/favorite')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

describe('Edge case: re-favoriting after unfavoriting', () => {
  it('should allow re-favoriting a previously unfavorited recipe', async () => {
    const user = createTestUser();
    const recipe = createTestRecipe(user.id);
    const token = createToken(user.id);

    // Favorite
    await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    // Unfavorite
    await request(app)
      .delete(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    // Re-favorite
    const res = await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Recipe added to favorites');

    // Verify in DB
    const fav = db.prepare(
      'SELECT * FROM favorites WHERE user_id = ? AND recipe_id = ?'
    ).get(user.id, recipe.id);
    expect(fav).toBeDefined();
  });
});

describe('Edge case: pagination with limit=1', () => {
  it('should paginate correctly with limit=1', async () => {
    const user = createTestUser();
    const token = createToken(user.id);

    for (let i = 1; i <= 3; i++) {
      const recipe = createTestRecipe(user.id, `Recipe ${i}`);
      await request(app)
        .post(`/api/recipes/${recipe.id}/favorite`)
        .set('Authorization', `Bearer ${token}`);
    }

    const res = await request(app)
      .get('/api/users/favorites?page=1&limit=1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.recipes).toHaveLength(1);
    expect(res.body.pagination).toEqual({
      page: 1,
      limit: 1,
      total: 3,
      totalPages: 3,
    });
  });
});

describe('Edge case: 204 response has no body', () => {
  it('DELETE success should return empty body with 204', async () => {
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
    expect(res.text).toBe('');
  });
});
