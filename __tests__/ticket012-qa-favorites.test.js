/**
 * TICKET-012 QA Acceptance Test Suite
 *
 * Comprehensive validation of User Favorites API endpoints:
 * AC1: POST /api/recipes/:id/favorite with auth adds to favorites, returns 201
 * AC2: Favoriting non-existent recipe returns 404
 * AC3: Duplicate favorite returns 409
 * AC4: All endpoints return 401 without auth
 * AC5: DELETE /api/recipes/:id/favorite removes favorite, returns 204
 * AC6: Removing non-favorited recipe returns 404
 * AC7: GET /api/users/favorites returns paginated favorited recipes with recipe details
 * AC8: Tests cover all success and error paths
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const db = require('../src/db/database');
const app = require('../src/app');

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

function createToken(userId) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '7d' });
}

function createExpiredToken(userId) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '-1s' });
}

function createTestUser(username = 'testuser', email = 'test@example.com') {
  const stmt = db.prepare(
    'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
  );
  const result = stmt.run(username, email, 'hashedpassword123');
  return { id: result.lastInsertRowid, username, email };
}

function createTestRecipe(userId, title = 'Test Recipe', extras = {}) {
  const stmt = db.prepare(
    'INSERT INTO recipes (user_id, title, description, ingredients, steps, cook_time, servings) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const result = stmt.run(
    userId,
    title,
    extras.description || 'A test recipe',
    extras.ingredients || 'ingredient1,ingredient2',
    extras.steps || 'step1,step2',
    extras.cook_time || 30,
    extras.servings || 4
  );
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

// ── AC1: POST /api/recipes/:id/favorite adds to favorites, returns 201 ──

describe('AC1: POST /api/recipes/:id/favorite — success path', () => {
  it('should return 201 with correct message', async () => {
    const user = createTestUser();
    const recipe = createTestRecipe(user.id);
    const token = createToken(user.id);

    const res = await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ message: 'Recipe added to favorites' });
  });

  it('should actually persist the favorite in the database', async () => {
    const user = createTestUser();
    const recipe = createTestRecipe(user.id);
    const token = createToken(user.id);

    await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    const fav = db.prepare(
      'SELECT * FROM favorites WHERE user_id = ? AND recipe_id = ?'
    ).get(user.id, recipe.id);
    expect(fav).toBeDefined();
    expect(Number(fav.user_id)).toBe(Number(user.id));
    expect(Number(fav.recipe_id)).toBe(Number(recipe.id));
  });

  it('should allow different users to favorite the same recipe', async () => {
    const user1 = createTestUser('user1', 'user1@test.com');
    const user2 = createTestUser('user2', 'user2@test.com');
    const recipe = createTestRecipe(user1.id);

    const res1 = await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${createToken(user1.id)}`);
    const res2 = await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${createToken(user2.id)}`);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
  });

  it('should allow a user to favorite multiple recipes', async () => {
    const user = createTestUser();
    const recipe1 = createTestRecipe(user.id, 'Recipe 1');
    const recipe2 = createTestRecipe(user.id, 'Recipe 2');
    const token = createToken(user.id);

    const res1 = await request(app)
      .post(`/api/recipes/${recipe1.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);
    const res2 = await request(app)
      .post(`/api/recipes/${recipe2.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
  });
});

// ── AC2: Favoriting non-existent recipe returns 404 ──

describe('AC2: POST /api/recipes/:id/favorite — non-existent recipe', () => {
  it('should return 404 for non-existent recipe ID', async () => {
    const user = createTestUser();
    const token = createToken(user.id);

    const res = await request(app)
      .post('/api/recipes/99999/favorite')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Recipe not found');
  });

  it('should return 404 for recipe ID 0', async () => {
    const user = createTestUser();
    const token = createToken(user.id);

    const res = await request(app)
      .post('/api/recipes/0/favorite')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Recipe not found');
  });
});

// ── AC3: Duplicate favorite returns 409 ──

describe('AC3: POST /api/recipes/:id/favorite — duplicate', () => {
  it('should return 409 when recipe is already favorited', async () => {
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

  it('should not create a duplicate entry in the database', async () => {
    const user = createTestUser();
    const recipe = createTestRecipe(user.id);
    const token = createToken(user.id);

    await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);
    await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    const count = db.prepare(
      'SELECT COUNT(*) as cnt FROM favorites WHERE user_id = ? AND recipe_id = ?'
    ).get(user.id, recipe.id).cnt;
    expect(count).toBe(1);
  });
});

// ── AC4: All endpoints return 401 without auth ──

describe('AC4: Authentication required on all endpoints', () => {
  it('POST /api/recipes/:id/favorite returns 401 without token', async () => {
    const res = await request(app).post('/api/recipes/1/favorite');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('POST /api/recipes/:id/favorite returns 401 with invalid token', async () => {
    const res = await request(app)
      .post('/api/recipes/1/favorite')
      .set('Authorization', 'Bearer invalidtoken');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid or expired token');
  });

  it('POST /api/recipes/:id/favorite returns 401 with expired token', async () => {
    const user = createTestUser();
    const token = createExpiredToken(user.id);

    const res = await request(app)
      .post('/api/recipes/1/favorite')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('DELETE /api/recipes/:id/favorite returns 401 without token', async () => {
    const res = await request(app).delete('/api/recipes/1/favorite');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('DELETE /api/recipes/:id/favorite returns 401 with invalid token', async () => {
    const res = await request(app)
      .delete('/api/recipes/1/favorite')
      .set('Authorization', 'Bearer invalidtoken');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid or expired token');
  });

  it('DELETE /api/recipes/:id/favorite returns 401 with expired token', async () => {
    const user = createTestUser();
    const token = createExpiredToken(user.id);

    const res = await request(app)
      .delete('/api/recipes/1/favorite')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('GET /api/users/favorites returns 401 without token', async () => {
    const res = await request(app).get('/api/users/favorites');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('GET /api/users/favorites returns 401 with invalid token', async () => {
    const res = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', 'Bearer invalidtoken');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid or expired token');
  });

  it('GET /api/users/favorites returns 401 with expired token', async () => {
    const user = createTestUser();
    const token = createExpiredToken(user.id);

    const res = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('returns 401 with malformed Authorization header (no Bearer prefix)', async () => {
    const user = createTestUser();
    const token = createToken(user.id);

    const res = await request(app)
      .post('/api/recipes/1/favorite')
      .set('Authorization', token);
    expect(res.status).toBe(401);
  });
});

// ── AC5: DELETE /api/recipes/:id/favorite removes favorite, returns 204 ──

describe('AC5: DELETE /api/recipes/:id/favorite — success path', () => {
  it('should return 204 on successful removal', async () => {
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
    expect(res.body).toEqual({});
  });

  it('should actually remove the favorite from the database', async () => {
    const user = createTestUser();
    const recipe = createTestRecipe(user.id);
    const token = createToken(user.id);

    await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    await request(app)
      .delete(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    const fav = db.prepare(
      'SELECT * FROM favorites WHERE user_id = ? AND recipe_id = ?'
    ).get(user.id, recipe.id);
    expect(fav).toBeUndefined();
  });

  it('should only remove the specific user-recipe pair', async () => {
    const user1 = createTestUser('user1', 'u1@test.com');
    const user2 = createTestUser('user2', 'u2@test.com');
    const recipe = createTestRecipe(user1.id);

    await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${createToken(user1.id)}`);
    await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${createToken(user2.id)}`);

    // User1 removes their favorite
    await request(app)
      .delete(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${createToken(user1.id)}`);

    // User2's favorite should still exist
    const fav = db.prepare(
      'SELECT * FROM favorites WHERE user_id = ? AND recipe_id = ?'
    ).get(user2.id, recipe.id);
    expect(fav).toBeDefined();
  });
});

// ── AC6: Removing non-favorited recipe returns 404 ──

describe('AC6: DELETE /api/recipes/:id/favorite — not in favorites', () => {
  it('should return 404 when recipe was never favorited', async () => {
    const user = createTestUser();
    const recipe = createTestRecipe(user.id);
    const token = createToken(user.id);

    const res = await request(app)
      .delete(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Recipe not in favorites');
  });

  it('should return 404 when trying to remove already-removed favorite', async () => {
    const user = createTestUser();
    const recipe = createTestRecipe(user.id);
    const token = createToken(user.id);

    await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);
    await request(app)
      .delete(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    // Second delete should return 404
    const res = await request(app)
      .delete(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Recipe not in favorites');
  });

  it('should return 404 when recipe does not exist at all', async () => {
    const user = createTestUser();
    const token = createToken(user.id);

    const res = await request(app)
      .delete('/api/recipes/99999/favorite')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Recipe not in favorites');
  });
});

// ── AC7: GET /api/users/favorites returns paginated results with recipe details ──

describe('AC7: GET /api/users/favorites — paginated response with recipe details', () => {
  it('should return recipes with full details', async () => {
    const user = createTestUser();
    const recipe = createTestRecipe(user.id, 'Chocolate Cake', {
      description: 'Rich chocolate cake',
      ingredients: 'flour,cocoa,sugar',
      steps: 'Mix,Bake,Cool',
      cook_time: 45,
      servings: 8,
    });
    const token = createToken(user.id);

    await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.recipes).toHaveLength(1);

    const r = res.body.recipes[0];
    expect(r.title).toBe('Chocolate Cake');
    expect(r.description).toBe('Rich chocolate cake');
    expect(r.ingredients).toBe('flour,cocoa,sugar');
    expect(r.steps).toBe('Mix,Bake,Cool');
    expect(r.cook_time).toBe(45);
    expect(r.servings).toBe(8);
    expect(r).toHaveProperty('id');
    expect(r).toHaveProperty('user_id');
    expect(r).toHaveProperty('created_at');
  });

  it('should return correct pagination structure', async () => {
    const user = createTestUser();
    const token = createToken(user.id);

    for (let i = 1; i <= 5; i++) {
      const recipe = createTestRecipe(user.id, `Recipe ${i}`);
      await request(app)
        .post(`/api/recipes/${recipe.id}/favorite`)
        .set('Authorization', `Bearer ${token}`);
    }

    const res = await request(app)
      .get('/api/users/favorites?page=1&limit=3')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.recipes).toHaveLength(3);
    expect(res.body.pagination).toEqual({
      page: 1,
      limit: 3,
      total: 5,
      totalPages: 2,
    });
  });

  it('should return correct second page', async () => {
    const user = createTestUser();
    const token = createToken(user.id);

    for (let i = 1; i <= 5; i++) {
      const recipe = createTestRecipe(user.id, `Recipe ${i}`);
      await request(app)
        .post(`/api/recipes/${recipe.id}/favorite`)
        .set('Authorization', `Bearer ${token}`);
    }

    const res = await request(app)
      .get('/api/users/favorites?page=2&limit=3')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.recipes).toHaveLength(2);
    expect(res.body.pagination).toEqual({
      page: 2,
      limit: 3,
      total: 5,
      totalPages: 2,
    });
  });

  it('should use default pagination (page=1, limit=10) when no params', async () => {
    const user = createTestUser();
    const token = createToken(user.id);

    const res = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(10);
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
    expect(res.body.pagination.totalPages).toBe(0);
  });

  it('should return empty array for a page beyond total pages', async () => {
    const user = createTestUser();
    const recipe = createTestRecipe(user.id);
    const token = createToken(user.id);

    await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .get('/api/users/favorites?page=100')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.recipes).toEqual([]);
    expect(res.body.pagination.total).toBe(1);
  });

  it('should only return the authenticated user\'s favorites (user isolation)', async () => {
    const user1 = createTestUser('user1', 'u1@test.com');
    const user2 = createTestUser('user2', 'u2@test.com');

    const recipe1 = createTestRecipe(user1.id, 'User1 Recipe');
    const recipe2 = createTestRecipe(user2.id, 'User2 Recipe');

    await request(app)
      .post(`/api/recipes/${recipe1.id}/favorite`)
      .set('Authorization', `Bearer ${createToken(user1.id)}`);
    await request(app)
      .post(`/api/recipes/${recipe2.id}/favorite`)
      .set('Authorization', `Bearer ${createToken(user2.id)}`);

    // User1 should only see their own favorites
    const res1 = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${createToken(user1.id)}`);

    expect(res1.body.recipes).toHaveLength(1);
    expect(res1.body.recipes[0].title).toBe('User1 Recipe');
    expect(res1.body.pagination.total).toBe(1);

    // User2 should only see their own favorites
    const res2 = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${createToken(user2.id)}`);

    expect(res2.body.recipes).toHaveLength(1);
    expect(res2.body.recipes[0].title).toBe('User2 Recipe');
    expect(res2.body.pagination.total).toBe(1);
  });

  it('should reflect removed favorites correctly', async () => {
    const user = createTestUser();
    const recipe1 = createTestRecipe(user.id, 'Keep');
    const recipe2 = createTestRecipe(user.id, 'Remove');
    const token = createToken(user.id);

    await request(app)
      .post(`/api/recipes/${recipe1.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);
    await request(app)
      .post(`/api/recipes/${recipe2.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    // Remove one
    await request(app)
      .delete(`/api/recipes/${recipe2.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.recipes).toHaveLength(1);
    expect(res.body.recipes[0].title).toBe('Keep');
    expect(res.body.pagination.total).toBe(1);
  });
});

// ── Route registration verification ──

describe('Route registration in app.js', () => {
  it('POST /api/recipes/:id/favorite route is registered', async () => {
    const user = createTestUser();
    const token = createToken(user.id);

    // Should not get 404 route-not-found (we expect 404 recipe-not-found)
    const res = await request(app)
      .post('/api/recipes/1/favorite')
      .set('Authorization', `Bearer ${token}`);

    // If route was not registered, Express returns 404 with default HTML
    // Our route returns JSON with specific error
    expect(res.headers['content-type']).toMatch(/json/);
  });

  it('DELETE /api/recipes/:id/favorite route is registered', async () => {
    const user = createTestUser();
    const token = createToken(user.id);

    const res = await request(app)
      .delete('/api/recipes/1/favorite')
      .set('Authorization', `Bearer ${token}`);

    expect(res.headers['content-type']).toMatch(/json/);
  });

  it('GET /api/users/favorites route is registered', async () => {
    const user = createTestUser();
    const token = createToken(user.id);

    const res = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
  });
});
