/**
 * TICKET-012 QA Gate Validation
 *
 * Test agent verification of all acceptance criteria for User Favorites API.
 * This suite validates the implementation against the ticket requirements.
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const db = require('../src/db/database');
const app = require('../src/app');

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

function makeToken(userId) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '1h' });
}

function seedUser(name = 'qauser', email = 'qa@test.com') {
  const result = db.prepare(
    'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
  ).run(name, email, 'hash123');
  return { id: result.lastInsertRowid, username: name, email };
}

function seedRecipe(userId, title = 'QA Recipe') {
  const result = db.prepare(
    'INSERT INTO recipes (user_id, title, description, ingredients, steps, cook_time, servings) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(userId, title, 'desc', 'eggs,flour', 'mix,bake', 20, 2);
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

describe('QA Gate: POST /api/recipes/:id/favorite', () => {
  test('returns 201 with success message when adding favorite', async () => {
    const user = seedUser();
    const recipe = seedRecipe(user.id);
    const token = makeToken(user.id);

    const res = await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Recipe added to favorites');
  });

  test('persists favorite to database', async () => {
    const user = seedUser();
    const recipe = seedRecipe(user.id);
    const token = makeToken(user.id);

    await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    const row = db.prepare(
      'SELECT * FROM favorites WHERE user_id = ? AND recipe_id = ?'
    ).get(user.id, recipe.id);
    expect(row).toBeDefined();
  });

  test('returns 404 for non-existent recipe', async () => {
    const user = seedUser();
    const token = makeToken(user.id);

    const res = await request(app)
      .post('/api/recipes/999999/favorite')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Recipe not found');
  });

  test('returns 409 for duplicate favorite', async () => {
    const user = seedUser();
    const recipe = seedRecipe(user.id);
    const token = makeToken(user.id);

    await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Recipe already in favorites');
  });

  test('returns 401 without auth', async () => {
    const res = await request(app).post('/api/recipes/1/favorite');
    expect(res.status).toBe(401);
  });
});

describe('QA Gate: DELETE /api/recipes/:id/favorite', () => {
  test('returns 204 on successful removal', async () => {
    const user = seedUser();
    const recipe = seedRecipe(user.id);
    const token = makeToken(user.id);

    await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .delete(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
  });

  test('removes favorite from database', async () => {
    const user = seedUser();
    const recipe = seedRecipe(user.id);
    const token = makeToken(user.id);

    await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);
    await request(app)
      .delete(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    const row = db.prepare(
      'SELECT * FROM favorites WHERE user_id = ? AND recipe_id = ?'
    ).get(user.id, recipe.id);
    expect(row).toBeUndefined();
  });

  test('returns 404 when recipe not in favorites', async () => {
    const user = seedUser();
    const recipe = seedRecipe(user.id);
    const token = makeToken(user.id);

    const res = await request(app)
      .delete(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Recipe not in favorites');
  });

  test('returns 401 without auth', async () => {
    const res = await request(app).delete('/api/recipes/1/favorite');
    expect(res.status).toBe(401);
  });
});

describe('QA Gate: GET /api/users/favorites', () => {
  test('returns paginated favorites with recipe details', async () => {
    const user = seedUser();
    const recipe = seedRecipe(user.id, 'Pasta Bolognese');
    const token = makeToken(user.id);

    await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.recipes).toHaveLength(1);
    expect(res.body.recipes[0].title).toBe('Pasta Bolognese');
    expect(res.body.recipes[0]).toHaveProperty('ingredients');
    expect(res.body.recipes[0]).toHaveProperty('steps');
    expect(res.body.recipes[0]).toHaveProperty('id');
    expect(res.body.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
  });

  test('defaults to page=1, limit=10', async () => {
    const user = seedUser();
    const token = makeToken(user.id);

    const res = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(10);
  });

  test('respects custom page and limit params', async () => {
    const user = seedUser();
    const token = makeToken(user.id);

    for (let i = 1; i <= 5; i++) {
      const r = seedRecipe(user.id, `R${i}`);
      await request(app)
        .post(`/api/recipes/${r.id}/favorite`)
        .set('Authorization', `Bearer ${token}`);
    }

    const res = await request(app)
      .get('/api/users/favorites?page=2&limit=2')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.recipes).toHaveLength(2);
    expect(res.body.pagination).toEqual({
      page: 2,
      limit: 2,
      total: 5,
      totalPages: 3,
    });
  });

  test('returns empty when no favorites exist', async () => {
    const user = seedUser();
    const token = makeToken(user.id);

    const res = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.recipes).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });

  test('isolates favorites per user', async () => {
    const u1 = seedUser('u1', 'u1@t.com');
    const u2 = seedUser('u2', 'u2@t.com');
    const r1 = seedRecipe(u1.id, 'U1 Fav');
    const r2 = seedRecipe(u2.id, 'U2 Fav');

    await request(app)
      .post(`/api/recipes/${r1.id}/favorite`)
      .set('Authorization', `Bearer ${makeToken(u1.id)}`);
    await request(app)
      .post(`/api/recipes/${r2.id}/favorite`)
      .set('Authorization', `Bearer ${makeToken(u2.id)}`);

    const res = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${makeToken(u1.id)}`);

    expect(res.body.recipes).toHaveLength(1);
    expect(res.body.recipes[0].title).toBe('U1 Fav');
  });

  test('returns 401 without auth', async () => {
    const res = await request(app).get('/api/users/favorites');
    expect(res.status).toBe(401);
  });
});

describe('QA Gate: end-to-end favorite lifecycle', () => {
  test('add, list, remove, verify removed from list', async () => {
    const user = seedUser();
    const recipe = seedRecipe(user.id, 'Lifecycle Recipe');
    const token = makeToken(user.id);

    // Add
    const addRes = await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);
    expect(addRes.status).toBe(201);

    // List — should include it
    const listRes = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.body.recipes).toHaveLength(1);

    // Remove
    const delRes = await request(app)
      .delete(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);
    expect(delRes.status).toBe(204);

    // List again — should be empty
    const listRes2 = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${token}`);
    expect(listRes2.body.recipes).toHaveLength(0);

    // Re-add should work (not 409)
    const reAddRes = await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);
    expect(reAddRes.status).toBe(201);
  });
});
