/**
 * TICKET-012 Final QA Validation
 * Test Agent: Comprehensive acceptance criteria verification
 *
 * Acceptance Criteria:
 * 1. POST /api/recipes/:id/favorite with auth adds to favorites, returns 201
 * 2. Favoriting non-existent recipe returns 404
 * 3. Duplicate favorite returns 409
 * 4. All endpoints return 401 without auth
 * 5. DELETE /api/recipes/:id/favorite removes favorite, returns 204
 * 6. Removing non-favorited recipe returns 404
 * 7. GET /api/users/favorites returns paginated favorited recipes with recipe details
 * 8. Tests cover all success and error paths
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const db = require('../src/db/database');
const app = require('../src/app');

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

function makeToken(userId) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '1h' });
}

function insertUser(username, email) {
  return db.prepare(
    'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
  ).run(username, email, 'hashed_pw_123');
}

function insertRecipe(userId, title, opts = {}) {
  return db.prepare(
    'INSERT INTO recipes (user_id, title, description, ingredients, steps, cook_time, servings) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    userId,
    title,
    opts.description || 'A test recipe',
    opts.ingredients || 'flour,sugar,eggs',
    opts.steps || 'mix,bake,serve',
    opts.cookTime || 30,
    opts.servings || 4
  );
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

// ============================================================
// AC1: POST /api/recipes/:id/favorite — success path (201)
// ============================================================
describe('AC1: POST /api/recipes/:id/favorite returns 201', () => {
  it('adds recipe to favorites and returns correct message', async () => {
    const user = insertUser('alice', 'alice@test.com');
    const recipe = insertRecipe(user.lastInsertRowid, 'Pancakes');
    const token = makeToken(user.lastInsertRowid);

    const res = await request(app)
      .post(`/api/recipes/${recipe.lastInsertRowid}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Recipe added to favorites');
  });

  it('persists the favorite in the database', async () => {
    const user = insertUser('bob', 'bob@test.com');
    const recipe = insertRecipe(user.lastInsertRowid, 'Waffles');
    const token = makeToken(user.lastInsertRowid);

    await request(app)
      .post(`/api/recipes/${recipe.lastInsertRowid}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    const fav = db.prepare(
      'SELECT * FROM favorites WHERE user_id = ? AND recipe_id = ?'
    ).get(user.lastInsertRowid, recipe.lastInsertRowid);

    expect(fav).toBeDefined();
    expect(fav.user_id).toBe(Number(user.lastInsertRowid));
    expect(fav.recipe_id).toBe(Number(recipe.lastInsertRowid));
  });

  it('allows different users to favorite the same recipe', async () => {
    const user1 = insertUser('u1', 'u1@test.com');
    const user2 = insertUser('u2', 'u2@test.com');
    const recipe = insertRecipe(user1.lastInsertRowid, 'Shared Recipe');

    const res1 = await request(app)
      .post(`/api/recipes/${recipe.lastInsertRowid}/favorite`)
      .set('Authorization', `Bearer ${makeToken(user1.lastInsertRowid)}`);
    const res2 = await request(app)
      .post(`/api/recipes/${recipe.lastInsertRowid}/favorite`)
      .set('Authorization', `Bearer ${makeToken(user2.lastInsertRowid)}`);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
  });
});

// ============================================================
// AC2: Favoriting non-existent recipe returns 404
// ============================================================
describe('AC2: POST non-existent recipe returns 404', () => {
  it('returns 404 with error message for missing recipe', async () => {
    const user = insertUser('carol', 'carol@test.com');
    const token = makeToken(user.lastInsertRowid);

    const res = await request(app)
      .post('/api/recipes/999999/favorite')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Recipe not found');
  });

  it('returns 404 for recipe id 0', async () => {
    const user = insertUser('dave', 'dave@test.com');
    const token = makeToken(user.lastInsertRowid);

    const res = await request(app)
      .post('/api/recipes/0/favorite')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

// ============================================================
// AC3: Duplicate favorite returns 409
// ============================================================
describe('AC3: Duplicate favorite returns 409', () => {
  it('returns 409 when favoriting the same recipe twice', async () => {
    const user = insertUser('eve', 'eve@test.com');
    const recipe = insertRecipe(user.lastInsertRowid, 'Duplicate Test');
    const token = makeToken(user.lastInsertRowid);

    const first = await request(app)
      .post(`/api/recipes/${recipe.lastInsertRowid}/favorite`)
      .set('Authorization', `Bearer ${token}`);
    expect(first.status).toBe(201);

    const second = await request(app)
      .post(`/api/recipes/${recipe.lastInsertRowid}/favorite`)
      .set('Authorization', `Bearer ${token}`);
    expect(second.status).toBe(409);
    expect(second.body.error).toBe('Recipe already in favorites');
  });

  it('does not create a duplicate row in the database', async () => {
    const user = insertUser('frank', 'frank@test.com');
    const recipe = insertRecipe(user.lastInsertRowid, 'No Dup');
    const token = makeToken(user.lastInsertRowid);

    await request(app)
      .post(`/api/recipes/${recipe.lastInsertRowid}/favorite`)
      .set('Authorization', `Bearer ${token}`);
    await request(app)
      .post(`/api/recipes/${recipe.lastInsertRowid}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    const count = db.prepare(
      'SELECT COUNT(*) as cnt FROM favorites WHERE user_id = ? AND recipe_id = ?'
    ).get(user.lastInsertRowid, recipe.lastInsertRowid);

    expect(count.cnt).toBe(1);
  });
});

// ============================================================
// AC4: All endpoints return 401 without auth
// ============================================================
describe('AC4: All endpoints return 401 without auth', () => {
  it('POST /api/recipes/:id/favorite returns 401 with no token', async () => {
    const res = await request(app).post('/api/recipes/1/favorite');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('DELETE /api/recipes/:id/favorite returns 401 with no token', async () => {
    const res = await request(app).delete('/api/recipes/1/favorite');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('GET /api/users/favorites returns 401 with no token', async () => {
    const res = await request(app).get('/api/users/favorites');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('POST returns 401 with invalid Bearer token', async () => {
    const res = await request(app)
      .post('/api/recipes/1/favorite')
      .set('Authorization', 'Bearer bad.token.here');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid or expired token');
  });

  it('DELETE returns 401 with invalid Bearer token', async () => {
    const res = await request(app)
      .delete('/api/recipes/1/favorite')
      .set('Authorization', 'Bearer bad.token.here');
    expect(res.status).toBe(401);
  });

  it('GET returns 401 with invalid Bearer token', async () => {
    const res = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', 'Bearer bad.token.here');
    expect(res.status).toBe(401);
  });

  it('returns 401 with expired token', async () => {
    const expiredToken = jwt.sign({ id: 1 }, JWT_SECRET, { expiresIn: '0s' });
    // Small delay to ensure token is expired
    await new Promise(r => setTimeout(r, 10));
    const res = await request(app)
      .post('/api/recipes/1/favorite')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
  });

  it('returns 401 with malformed Authorization header', async () => {
    const res = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', 'NotBearer sometoken');
    expect(res.status).toBe(401);
  });
});

// ============================================================
// AC5: DELETE /api/recipes/:id/favorite removes favorite, returns 204
// ============================================================
describe('AC5: DELETE removes favorite and returns 204', () => {
  it('removes the favorite and returns 204 with no body', async () => {
    const user = insertUser('grace', 'grace@test.com');
    const recipe = insertRecipe(user.lastInsertRowid, 'Removable');
    const token = makeToken(user.lastInsertRowid);

    await request(app)
      .post(`/api/recipes/${recipe.lastInsertRowid}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .delete(`/api/recipes/${recipe.lastInsertRowid}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it('actually removes the row from the database', async () => {
    const user = insertUser('hank', 'hank@test.com');
    const recipe = insertRecipe(user.lastInsertRowid, 'Gone Recipe');
    const token = makeToken(user.lastInsertRowid);

    await request(app)
      .post(`/api/recipes/${recipe.lastInsertRowid}/favorite`)
      .set('Authorization', `Bearer ${token}`);
    await request(app)
      .delete(`/api/recipes/${recipe.lastInsertRowid}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    const fav = db.prepare(
      'SELECT * FROM favorites WHERE user_id = ? AND recipe_id = ?'
    ).get(user.lastInsertRowid, recipe.lastInsertRowid);
    expect(fav).toBeUndefined();
  });

  it('can re-favorite after removing', async () => {
    const user = insertUser('ivan', 'ivan@test.com');
    const recipe = insertRecipe(user.lastInsertRowid, 'Re-fav');
    const token = makeToken(user.lastInsertRowid);

    await request(app)
      .post(`/api/recipes/${recipe.lastInsertRowid}/favorite`)
      .set('Authorization', `Bearer ${token}`);
    await request(app)
      .delete(`/api/recipes/${recipe.lastInsertRowid}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post(`/api/recipes/${recipe.lastInsertRowid}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
  });
});

// ============================================================
// AC6: Removing non-favorited recipe returns 404
// ============================================================
describe('AC6: DELETE non-favorited recipe returns 404', () => {
  it('returns 404 when recipe was never favorited', async () => {
    const user = insertUser('judy', 'judy@test.com');
    const recipe = insertRecipe(user.lastInsertRowid, 'Never Faved');
    const token = makeToken(user.lastInsertRowid);

    const res = await request(app)
      .delete(`/api/recipes/${recipe.lastInsertRowid}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Recipe not in favorites');
  });

  it('returns 404 when removing an already-removed favorite', async () => {
    const user = insertUser('karl', 'karl@test.com');
    const recipe = insertRecipe(user.lastInsertRowid, 'Double Remove');
    const token = makeToken(user.lastInsertRowid);

    await request(app)
      .post(`/api/recipes/${recipe.lastInsertRowid}/favorite`)
      .set('Authorization', `Bearer ${token}`);
    await request(app)
      .delete(`/api/recipes/${recipe.lastInsertRowid}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .delete(`/api/recipes/${recipe.lastInsertRowid}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Recipe not in favorites');
  });

  it('user A cannot remove user B favorite', async () => {
    const userA = insertUser('userA', 'a@test.com');
    const userB = insertUser('userB', 'b@test.com');
    const recipe = insertRecipe(userA.lastInsertRowid, 'Cross-user');

    // User B favorites the recipe
    await request(app)
      .post(`/api/recipes/${recipe.lastInsertRowid}/favorite`)
      .set('Authorization', `Bearer ${makeToken(userB.lastInsertRowid)}`);

    // User A tries to remove user B's favorite
    const res = await request(app)
      .delete(`/api/recipes/${recipe.lastInsertRowid}/favorite`)
      .set('Authorization', `Bearer ${makeToken(userA.lastInsertRowid)}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Recipe not in favorites');

    // Verify user B's favorite still exists
    const fav = db.prepare(
      'SELECT * FROM favorites WHERE user_id = ? AND recipe_id = ?'
    ).get(userB.lastInsertRowid, recipe.lastInsertRowid);
    expect(fav).toBeDefined();
  });
});

// ============================================================
// AC7: GET /api/users/favorites — paginated with recipe details
// ============================================================
describe('AC7: GET /api/users/favorites returns paginated results', () => {
  it('returns recipes with full details', async () => {
    const user = insertUser('luna', 'luna@test.com');
    const recipe = insertRecipe(user.lastInsertRowid, 'Detailed Recipe', {
      description: 'A very detailed recipe',
      ingredients: 'butter,cream,vanilla',
      steps: 'melt,mix,chill',
      cookTime: 45,
      servings: 6,
    });
    const token = makeToken(user.lastInsertRowid);

    await request(app)
      .post(`/api/recipes/${recipe.lastInsertRowid}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.recipes).toHaveLength(1);

    const r = res.body.recipes[0];
    expect(r.title).toBe('Detailed Recipe');
    expect(r.description).toBe('A very detailed recipe');
    expect(r.ingredients).toBe('butter,cream,vanilla');
    expect(r.steps).toBe('melt,mix,chill');
    expect(r.cook_time).toBe(45);
    expect(r.servings).toBe(6);
    expect(r.id).toBeDefined();
    expect(r.user_id).toBeDefined();
  });

  it('returns correct pagination structure', async () => {
    const user = insertUser('mike', 'mike@test.com');
    const token = makeToken(user.lastInsertRowid);

    const res = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body).toHaveProperty('recipes');
    expect(res.body).toHaveProperty('pagination');
    expect(res.body.pagination).toHaveProperty('page');
    expect(res.body.pagination).toHaveProperty('limit');
    expect(res.body.pagination).toHaveProperty('total');
    expect(res.body.pagination).toHaveProperty('totalPages');
  });

  it('defaults to page=1 and limit=10', async () => {
    const user = insertUser('nancy', 'nancy@test.com');
    const token = makeToken(user.lastInsertRowid);

    const res = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(10);
  });

  it('paginates correctly across multiple pages', async () => {
    const user = insertUser('otto', 'otto@test.com');
    const token = makeToken(user.lastInsertRowid);

    for (let i = 0; i < 5; i++) {
      const r = insertRecipe(user.lastInsertRowid, `Recipe ${i}`);
      await request(app)
        .post(`/api/recipes/${r.lastInsertRowid}/favorite`)
        .set('Authorization', `Bearer ${token}`);
    }

    const page1 = await request(app)
      .get('/api/users/favorites?page=1&limit=2')
      .set('Authorization', `Bearer ${token}`);

    expect(page1.body.recipes).toHaveLength(2);
    expect(page1.body.pagination).toEqual({
      page: 1, limit: 2, total: 5, totalPages: 3,
    });

    const page3 = await request(app)
      .get('/api/users/favorites?page=3&limit=2')
      .set('Authorization', `Bearer ${token}`);

    expect(page3.body.recipes).toHaveLength(1);
    expect(page3.body.pagination).toEqual({
      page: 3, limit: 2, total: 5, totalPages: 3,
    });
  });

  it('returns empty results for a page beyond total', async () => {
    const user = insertUser('pat', 'pat@test.com');
    const recipe = insertRecipe(user.lastInsertRowid, 'Only One');
    const token = makeToken(user.lastInsertRowid);

    await request(app)
      .post(`/api/recipes/${recipe.lastInsertRowid}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .get('/api/users/favorites?page=100&limit=10')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.recipes).toEqual([]);
    expect(res.body.pagination.total).toBe(1);
  });

  it('only returns favorites for the authenticated user', async () => {
    const user1 = insertUser('quinn', 'quinn@test.com');
    const user2 = insertUser('rose', 'rose@test.com');
    const recipe1 = insertRecipe(user1.lastInsertRowid, 'Quinn Fav');
    const recipe2 = insertRecipe(user1.lastInsertRowid, 'Rose Fav');

    await request(app)
      .post(`/api/recipes/${recipe1.lastInsertRowid}/favorite`)
      .set('Authorization', `Bearer ${makeToken(user1.lastInsertRowid)}`);
    await request(app)
      .post(`/api/recipes/${recipe2.lastInsertRowid}/favorite`)
      .set('Authorization', `Bearer ${makeToken(user2.lastInsertRowid)}`);

    const res = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${makeToken(user1.lastInsertRowid)}`);

    expect(res.body.recipes).toHaveLength(1);
    expect(res.body.recipes[0].title).toBe('Quinn Fav');
    expect(res.body.pagination.total).toBe(1);
  });

  it('returns empty array when user has no favorites', async () => {
    const user = insertUser('steve', 'steve@test.com');
    const token = makeToken(user.lastInsertRowid);

    const res = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.recipes).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
    expect(res.body.pagination.totalPages).toBe(0);
  });
});

// ============================================================
// AC8: Additional edge cases and integration paths
// ============================================================
describe('AC8: Edge cases and integration', () => {
  it('handles string recipe id parameter gracefully', async () => {
    const user = insertUser('tina', 'tina@test.com');
    const token = makeToken(user.lastInsertRowid);

    const res = await request(app)
      .post('/api/recipes/abc/favorite')
      .set('Authorization', `Bearer ${token}`);

    // NaN parseInt should result in recipe not found
    expect(res.status).toBe(404);
  });

  it('handles negative recipe id', async () => {
    const user = insertUser('uma', 'uma@test.com');
    const token = makeToken(user.lastInsertRowid);

    const res = await request(app)
      .post('/api/recipes/-1/favorite')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('favorite, unfavorite, re-favorite full cycle works', async () => {
    const user = insertUser('vince', 'vince@test.com');
    const recipe = insertRecipe(user.lastInsertRowid, 'Cycle Recipe');
    const token = makeToken(user.lastInsertRowid);

    // Favorite
    let res = await request(app)
      .post(`/api/recipes/${recipe.lastInsertRowid}/favorite`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(201);

    // Verify in list
    res = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.recipes).toHaveLength(1);

    // Unfavorite
    res = await request(app)
      .delete(`/api/recipes/${recipe.lastInsertRowid}/favorite`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);

    // Verify empty
    res = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.recipes).toHaveLength(0);

    // Re-favorite
    res = await request(app)
      .post(`/api/recipes/${recipe.lastInsertRowid}/favorite`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(201);

    // Verify back in list
    res = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.recipes).toHaveLength(1);
  });

  it('user can favorite multiple recipes', async () => {
    const user = insertUser('wendy', 'wendy@test.com');
    const token = makeToken(user.lastInsertRowid);
    const recipeIds = [];

    for (let i = 0; i < 4; i++) {
      const r = insertRecipe(user.lastInsertRowid, `Multi Fav ${i}`);
      recipeIds.push(r.lastInsertRowid);
      await request(app)
        .post(`/api/recipes/${r.lastInsertRowid}/favorite`)
        .set('Authorization', `Bearer ${token}`);
    }

    const res = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.recipes).toHaveLength(4);
    expect(res.body.pagination.total).toBe(4);
  });

  it('routes are correctly registered in app.js', async () => {
    // POST favorite route exists
    const postRes = await request(app).post('/api/recipes/1/favorite');
    expect(postRes.status).not.toBe(404);

    // DELETE favorite route exists
    const deleteRes = await request(app).delete('/api/recipes/1/favorite');
    expect(deleteRes.status).not.toBe(404);

    // GET favorites route exists
    const getRes = await request(app).get('/api/users/favorites');
    expect(getRes.status).not.toBe(404);
  });
});
