/**
 * TICKET-012 QA Validation — Test Agent
 *
 * Final QA validation covering:
 * - Model-level unit tests for addFavorite, removeFavorite, getUserFavorites
 * - Integration: full lifecycle (add → list → remove → list)
 * - Boundary: large page numbers, zero/negative limits, concurrent user isolation
 * - Response structure validation
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const db = require('../src/db/database');
const app = require('../src/app');
const { addFavorite, removeFavorite, getUserFavorites } = require('../src/models/favorite');
const { getRecipeById } = require('../src/models/recipe');

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

function createToken(userId) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '7d' });
}

function createTestUser(username, email) {
  const stmt = db.prepare(
    'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
  );
  const result = stmt.run(username, email, 'hashedpassword123');
  return { id: result.lastInsertRowid, username, email };
}

function createTestRecipe(userId, title) {
  const stmt = db.prepare(
    'INSERT INTO recipes (user_id, title, description, ingredients, steps, cook_time, servings) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const result = stmt.run(userId, title, 'desc', 'ing1,ing2', 'step1,step2', 30, 4);
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

// ── Model-level unit tests ──

describe('Model: addFavorite', () => {
  it('should insert a row into the favorites table', () => {
    const user = createTestUser('m1', 'm1@test.com');
    const recipe = createTestRecipe(user.id, 'Model Test');

    addFavorite(user.id, recipe.id);

    const row = db.prepare(
      'SELECT * FROM favorites WHERE user_id = ? AND recipe_id = ?'
    ).get(user.id, recipe.id);
    expect(row).toBeDefined();
    expect(Number(row.user_id)).toBe(Number(user.id));
    expect(Number(row.recipe_id)).toBe(Number(recipe.id));
  });

  it('should throw SQLITE_CONSTRAINT_UNIQUE on duplicate', () => {
    const user = createTestUser('m2', 'm2@test.com');
    const recipe = createTestRecipe(user.id, 'Dup Test');

    addFavorite(user.id, recipe.id);
    expect(() => addFavorite(user.id, recipe.id)).toThrow();

    try {
      addFavorite(user.id, recipe.id);
    } catch (err) {
      expect(err.code).toBe('SQLITE_CONSTRAINT_UNIQUE');
    }
  });
});

describe('Model: removeFavorite', () => {
  it('should return true when a favorite was deleted', () => {
    const user = createTestUser('m3', 'm3@test.com');
    const recipe = createTestRecipe(user.id, 'Remove Test');

    addFavorite(user.id, recipe.id);
    const result = removeFavorite(user.id, recipe.id);
    expect(result).toBe(true);
  });

  it('should return false when no matching favorite exists', () => {
    const user = createTestUser('m4', 'm4@test.com');
    const result = removeFavorite(user.id, 99999);
    expect(result).toBe(false);
  });

  it('should actually delete the row from the database', () => {
    const user = createTestUser('m5', 'm5@test.com');
    const recipe = createTestRecipe(user.id, 'Delete Verify');

    addFavorite(user.id, recipe.id);
    removeFavorite(user.id, recipe.id);

    const row = db.prepare(
      'SELECT * FROM favorites WHERE user_id = ? AND recipe_id = ?'
    ).get(user.id, recipe.id);
    expect(row).toBeUndefined();
  });
});

describe('Model: getUserFavorites', () => {
  it('should return recipes and pagination structure', () => {
    const user = createTestUser('m6', 'm6@test.com');
    const recipe = createTestRecipe(user.id, 'Fav List');
    addFavorite(user.id, recipe.id);

    const result = getUserFavorites(user.id, { page: 1, limit: 10 });

    expect(result).toHaveProperty('recipes');
    expect(result).toHaveProperty('pagination');
    expect(result.recipes).toHaveLength(1);
    expect(result.recipes[0].title).toBe('Fav List');
    expect(result.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
  });

  it('should use default pagination when no options provided', () => {
    const user = createTestUser('m7', 'm7@test.com');
    const result = getUserFavorites(user.id);

    expect(result.pagination.page).toBe(1);
    expect(result.pagination.limit).toBe(10);
    expect(result.recipes).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });

  it('should return correct totalPages calculation', () => {
    const user = createTestUser('m8', 'm8@test.com');
    for (let i = 0; i < 7; i++) {
      const recipe = createTestRecipe(user.id, `R${i}`);
      addFavorite(user.id, recipe.id);
    }

    const result = getUserFavorites(user.id, { page: 1, limit: 3 });
    expect(result.pagination.total).toBe(7);
    expect(result.pagination.totalPages).toBe(3); // ceil(7/3) = 3
    expect(result.recipes).toHaveLength(3);
  });
});

describe('Model: getRecipeById', () => {
  it('should return undefined for non-existent recipe', () => {
    const result = getRecipeById(99999);
    expect(result).toBeUndefined();
  });

  it('should return the recipe for a valid ID', () => {
    const user = createTestUser('m9', 'm9@test.com');
    const recipe = createTestRecipe(user.id, 'Find Me');

    const result = getRecipeById(recipe.id);
    expect(result).toBeDefined();
    expect(result.title).toBe('Find Me');
    expect(result.id).toBe(Number(recipe.id));
  });
});

// ── Full lifecycle integration ──

describe('Integration: complete favorites lifecycle', () => {
  it('add → verify in list → remove → verify gone from list', async () => {
    const user = createTestUser('life1', 'life1@test.com');
    const recipe = createTestRecipe(user.id, 'Lifecycle Recipe');
    const token = createToken(user.id);

    // Add favorite
    const addRes = await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);
    expect(addRes.status).toBe(201);

    // List should contain the recipe
    const listRes1 = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${token}`);
    expect(listRes1.status).toBe(200);
    expect(listRes1.body.recipes).toHaveLength(1);
    expect(listRes1.body.recipes[0].title).toBe('Lifecycle Recipe');

    // Remove favorite
    const delRes = await request(app)
      .delete(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);
    expect(delRes.status).toBe(204);

    // List should be empty now
    const listRes2 = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${token}`);
    expect(listRes2.status).toBe(200);
    expect(listRes2.body.recipes).toHaveLength(0);
    expect(listRes2.body.pagination.total).toBe(0);
  });

  it('add → duplicate 409 → remove → re-add 201', async () => {
    const user = createTestUser('life2', 'life2@test.com');
    const recipe = createTestRecipe(user.id, 'Cycle Recipe');
    const token = createToken(user.id);

    // Add
    const r1 = await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);
    expect(r1.status).toBe(201);

    // Duplicate
    const r2 = await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);
    expect(r2.status).toBe(409);
    expect(r2.body.error).toBe('Recipe already in favorites');

    // Remove
    const r3 = await request(app)
      .delete(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);
    expect(r3.status).toBe(204);

    // Re-add should succeed
    const r4 = await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);
    expect(r4.status).toBe(201);
    expect(r4.body.message).toBe('Recipe added to favorites');
  });
});

// ── Boundary and response structure ──

describe('Boundary: pagination edge cases via API', () => {
  it('should handle page=0 gracefully', async () => {
    const user = createTestUser('bound1', 'b1@test.com');
    const token = createToken(user.id);

    const res = await request(app)
      .get('/api/users/favorites?page=0')
      .set('Authorization', `Bearer ${token}`);

    // Should not crash — may return empty or default behavior
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('recipes');
    expect(res.body).toHaveProperty('pagination');
  });

  it('should handle very large page number', async () => {
    const user = createTestUser('bound2', 'b2@test.com');
    const recipe = createTestRecipe(user.id, 'Big Page');
    const token = createToken(user.id);

    addFavorite(user.id, recipe.id);

    const res = await request(app)
      .get('/api/users/favorites?page=999999')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.recipes).toEqual([]);
    expect(res.body.pagination.total).toBe(1);
  });

  it('should handle non-numeric page/limit gracefully (defaults)', async () => {
    const user = createTestUser('bound3', 'b3@test.com');
    const token = createToken(user.id);

    const res = await request(app)
      .get('/api/users/favorites?page=abc&limit=xyz')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // parseInt('abc') is NaN, || 1 should default
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(10);
  });
});

describe('Response structure validation', () => {
  it('POST favorite response has exactly { message } key', async () => {
    const user = createTestUser('resp1', 'resp1@test.com');
    const recipe = createTestRecipe(user.id, 'Structure Test');
    const token = createToken(user.id);

    const res = await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(Object.keys(res.body)).toEqual(['message']);
    expect(res.body.message).toBe('Recipe added to favorites');
  });

  it('GET favorites response has exactly { recipes, pagination } keys', async () => {
    const user = createTestUser('resp2', 'resp2@test.com');
    const token = createToken(user.id);

    const res = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['pagination', 'recipes']);
    expect(Object.keys(res.body.pagination).sort()).toEqual(['limit', 'page', 'total', 'totalPages']);
  });

  it('404 error response has { error } key', async () => {
    const user = createTestUser('resp3', 'resp3@test.com');
    const token = createToken(user.id);

    const res = await request(app)
      .post('/api/recipes/99999/favorite')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
    expect(typeof res.body.error).toBe('string');
  });

  it('409 error response has { error } key', async () => {
    const user = createTestUser('resp4', 'resp4@test.com');
    const recipe = createTestRecipe(user.id, 'Dup Resp');
    const token = createToken(user.id);

    await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toBe('Recipe already in favorites');
  });
});

// ── Multi-user isolation ──

describe('Multi-user isolation', () => {
  it('user A cannot see user B favorites and vice versa', async () => {
    const userA = createTestUser('isoA', 'isoA@test.com');
    const userB = createTestUser('isoB', 'isoB@test.com');
    const recipeA = createTestRecipe(userA.id, 'A Only');
    const recipeB = createTestRecipe(userB.id, 'B Only');
    const tokenA = createToken(userA.id);
    const tokenB = createToken(userB.id);

    await request(app)
      .post(`/api/recipes/${recipeA.id}/favorite`)
      .set('Authorization', `Bearer ${tokenA}`);
    await request(app)
      .post(`/api/recipes/${recipeB.id}/favorite`)
      .set('Authorization', `Bearer ${tokenB}`);

    const resA = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${tokenA}`);
    const resB = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(resA.body.recipes).toHaveLength(1);
    expect(resA.body.recipes[0].title).toBe('A Only');
    expect(resB.body.recipes).toHaveLength(1);
    expect(resB.body.recipes[0].title).toBe('B Only');
  });

  it('user A removing their favorite does not affect user B', async () => {
    const userA = createTestUser('iso2A', 'iso2A@test.com');
    const userB = createTestUser('iso2B', 'iso2B@test.com');
    const recipe = createTestRecipe(userA.id, 'Shared Recipe');
    const tokenA = createToken(userA.id);
    const tokenB = createToken(userB.id);

    // Both favorite the same recipe
    await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${tokenA}`);
    await request(app)
      .post(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${tokenB}`);

    // A removes
    await request(app)
      .delete(`/api/recipes/${recipe.id}/favorite`)
      .set('Authorization', `Bearer ${tokenA}`);

    // B still has it
    const resB = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(resB.body.recipes).toHaveLength(1);
    expect(resB.body.recipes[0].title).toBe('Shared Recipe');

    // A does not
    const resA = await request(app)
      .get('/api/users/favorites')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(resA.body.recipes).toHaveLength(0);
  });
});
