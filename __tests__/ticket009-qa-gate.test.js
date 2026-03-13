/**
 * TICKET-009 QA Gate Tests
 *
 * Validates all acceptance criteria for Categories and Tags API endpoints.
 * Tests cover CRUD, duplicates, recipe associations, and edge cases.
 */
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
    "INSERT INTO users (username, email, password_hash) VALUES ('qauser', 'qa@example.com', 'hash')"
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

// ── AC: GET /api/categories returns all categories ──
describe('AC: GET /api/categories returns all categories', () => {
  it('returns 200 with empty array when no categories', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('categories');
    expect(res.body.categories).toEqual([]);
  });

  it('returns all categories with correct shape', async () => {
    db.prepare("INSERT INTO categories (name) VALUES ('Appetizer')").run();
    db.prepare("INSERT INTO categories (name) VALUES ('Dessert')").run();
    db.prepare("INSERT INTO categories (name) VALUES ('Main Course')").run();

    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body.categories).toHaveLength(3);
    res.body.categories.forEach(cat => {
      expect(cat).toHaveProperty('id');
      expect(cat).toHaveProperty('name');
      expect(cat).toHaveProperty('created_at');
    });
  });

  it('does not require authentication', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
  });
});

// ── AC: POST /api/categories creates and returns 201 ──
describe('AC: POST /api/categories creates and returns 201', () => {
  it('creates category with valid name and returns 201', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Breakfast' });

    expect(res.status).toBe(201);
    expect(res.body.category.name).toBe('Breakfast');
    expect(res.body.category).toHaveProperty('id');
  });

  it('requires authentication', async () => {
    const res = await request(app)
      .post('/api/categories')
      .send({ name: 'Lunch' });
    expect(res.status).toBe(401);
  });

  it('trims whitespace from name', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: '   Snacks   ' });

    expect(res.status).toBe(201);
    expect(res.body.category.name).toBe('Snacks');
  });

  it('rejects name shorter than 2 chars', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'X' });
    expect(res.status).toBe(400);
  });

  it('rejects name longer than 50 chars', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'A'.repeat(51) });
    expect(res.status).toBe(400);
  });

  it('rejects empty name', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: '' });
    expect(res.status).toBe(400);
  });

  it('rejects missing name field', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('accepts name at exactly 2 chars (boundary)', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'OK' });
    expect(res.status).toBe(201);
  });

  it('accepts name at exactly 50 chars (boundary)', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'A'.repeat(50) });
    expect(res.status).toBe(201);
  });
});

// ── AC: Duplicate category name returns 409 ──
describe('AC: Duplicate category name returns 409', () => {
  it('returns 409 when creating category with existing name', async () => {
    await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Italian' });

    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Italian' });

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
  });
});

// ── AC: GET /api/tags returns all tags ──
describe('AC: GET /api/tags returns all tags', () => {
  it('returns 200 with empty array when no tags', async () => {
    const res = await request(app).get('/api/tags');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('tags');
    expect(res.body.tags).toEqual([]);
  });

  it('returns all tags with correct shape', async () => {
    db.prepare("INSERT INTO tags (name) VALUES ('quick')").run();
    db.prepare("INSERT INTO tags (name) VALUES ('vegan')").run();

    const res = await request(app).get('/api/tags');
    expect(res.status).toBe(200);
    expect(res.body.tags).toHaveLength(2);
    res.body.tags.forEach(tag => {
      expect(tag).toHaveProperty('id');
      expect(tag).toHaveProperty('name');
      expect(tag).toHaveProperty('created_at');
    });
  });

  it('does not require authentication', async () => {
    const res = await request(app).get('/api/tags');
    expect(res.status).toBe(200);
  });
});

// ── AC: POST /api/tags creates and returns 201 ──
describe('AC: POST /api/tags creates and returns 201', () => {
  it('creates tag with valid name and returns 201', async () => {
    const res = await request(app)
      .post('/api/tags')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'gluten-free' });

    expect(res.status).toBe(201);
    expect(res.body.tag.name).toBe('gluten-free');
    expect(res.body.tag).toHaveProperty('id');
  });

  it('requires authentication', async () => {
    const res = await request(app)
      .post('/api/tags')
      .send({ name: 'easy' });
    expect(res.status).toBe(401);
  });

  it('trims whitespace from name', async () => {
    const res = await request(app)
      .post('/api/tags')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: '  spicy  ' });

    expect(res.status).toBe(201);
    expect(res.body.tag.name).toBe('spicy');
  });

  it('rejects name shorter than 2 chars', async () => {
    const res = await request(app)
      .post('/api/tags')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'X' });
    expect(res.status).toBe(400);
  });

  it('rejects name longer than 30 chars', async () => {
    const res = await request(app)
      .post('/api/tags')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'A'.repeat(31) });
    expect(res.status).toBe(400);
  });

  it('returns 409 for duplicate tag name', async () => {
    await request(app)
      .post('/api/tags')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'healthy' });

    const res = await request(app)
      .post('/api/tags')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'healthy' });

    expect(res.status).toBe(409);
  });

  it('accepts name at exactly 2 chars (boundary)', async () => {
    const res = await request(app)
      .post('/api/tags')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'OK' });
    expect(res.status).toBe(201);
  });

  it('accepts name at exactly 30 chars (boundary)', async () => {
    const res = await request(app)
      .post('/api/tags')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'A'.repeat(30) });
    expect(res.status).toBe(201);
  });
});

// ── AC: Recipes can be created with category_ids and tag_ids ──
describe('AC: Recipes can be created with category_ids and tag_ids', () => {
  let catId, tagId;

  beforeEach(() => {
    const cat = db.prepare("INSERT INTO categories (name) VALUES ('Dinner')").run();
    catId = Number(cat.lastInsertRowid);
    const tag = db.prepare("INSERT INTO tags (name) VALUES ('quick')").run();
    tagId = Number(tag.lastInsertRowid);
  });

  it('creates recipe with category_ids and tag_ids', async () => {
    const res = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Test Recipe',
        ingredients: 'flour, sugar',
        steps: 'Mix and bake',
        category_ids: [catId],
        tag_ids: [tagId],
      });

    expect(res.status).toBe(201);
    expect(res.body.recipe.categories).toHaveLength(1);
    expect(res.body.recipe.categories[0].name).toBe('Dinner');
    expect(res.body.recipe.tags).toHaveLength(1);
    expect(res.body.recipe.tags[0].name).toBe('quick');
  });

  it('creates recipe without category_ids and tag_ids', async () => {
    const res = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Plain Recipe',
        ingredients: 'water',
        steps: 'Boil',
      });

    expect(res.status).toBe(201);
    expect(res.body.recipe.categories).toEqual([]);
    expect(res.body.recipe.tags).toEqual([]);
  });

  it('creates recipe with empty category_ids and tag_ids arrays', async () => {
    const res = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Empty Assoc Recipe',
        ingredients: 'nothing',
        steps: 'Do nothing',
        category_ids: [],
        tag_ids: [],
      });

    expect(res.status).toBe(201);
    expect(res.body.recipe.categories).toEqual([]);
    expect(res.body.recipe.tags).toEqual([]);
  });

  it('creates recipe with multiple categories and tags', async () => {
    const cat2 = db.prepare("INSERT INTO categories (name) VALUES ('Lunch')").run();
    const tag2 = db.prepare("INSERT INTO tags (name) VALUES ('healthy')").run();

    const res = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Multi Recipe',
        ingredients: 'lots',
        steps: 'Many steps',
        category_ids: [catId, Number(cat2.lastInsertRowid)],
        tag_ids: [tagId, Number(tag2.lastInsertRowid)],
      });

    expect(res.status).toBe(201);
    expect(res.body.recipe.categories).toHaveLength(2);
    expect(res.body.recipe.tags).toHaveLength(2);
  });
});

// ── AC: GET /api/recipes/:id includes categories and tags ──
describe('AC: GET /api/recipes/:id includes categories and tags', () => {
  it('returns categories and tags arrays in recipe response', async () => {
    const cat = db.prepare("INSERT INTO categories (name) VALUES ('Soup')").run();
    const tag = db.prepare("INSERT INTO tags (name) VALUES ('warm')").run();

    const createRes = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Tomato Soup',
        ingredients: 'tomatoes, broth',
        steps: 'Simmer',
        category_ids: [Number(cat.lastInsertRowid)],
        tag_ids: [Number(tag.lastInsertRowid)],
      });

    const recipeId = createRes.body.recipe.id;
    const res = await request(app).get(`/api/recipes/${recipeId}`);

    expect(res.status).toBe(200);
    expect(res.body.recipe).toHaveProperty('categories');
    expect(res.body.recipe).toHaveProperty('tags');
    expect(res.body.recipe.categories).toHaveLength(1);
    expect(res.body.recipe.categories[0].name).toBe('Soup');
    expect(res.body.recipe.tags).toHaveLength(1);
    expect(res.body.recipe.tags[0].name).toBe('warm');
  });

  it('returns empty arrays when recipe has no associations', async () => {
    const createRes = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'No Assoc Recipe',
        ingredients: 'stuff',
        steps: 'Do stuff',
      });

    const recipeId = createRes.body.recipe.id;
    const res = await request(app).get(`/api/recipes/${recipeId}`);

    expect(res.status).toBe(200);
    expect(res.body.recipe.categories).toEqual([]);
    expect(res.body.recipe.tags).toEqual([]);
  });
});

// ── AC: Updating a recipe replaces its category/tag associations ──
describe('AC: Updating a recipe replaces category/tag associations', () => {
  it('replaces categories and tags on update', async () => {
    const cat1 = db.prepare("INSERT INTO categories (name) VALUES ('Italian')").run();
    const cat2 = db.prepare("INSERT INTO categories (name) VALUES ('Mexican')").run();
    const tag1 = db.prepare("INSERT INTO tags (name) VALUES ('spicy')").run();
    const tag2 = db.prepare("INSERT INTO tags (name) VALUES ('mild')").run();

    const createRes = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Update Test',
        ingredients: 'things',
        steps: 'Steps',
        category_ids: [Number(cat1.lastInsertRowid)],
        tag_ids: [Number(tag1.lastInsertRowid)],
      });

    const recipeId = createRes.body.recipe.id;
    expect(createRes.body.recipe.categories[0].name).toBe('Italian');
    expect(createRes.body.recipe.tags[0].name).toBe('spicy');

    const updateRes = await request(app)
      .put(`/api/recipes/${recipeId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Update Test',
        ingredients: 'things',
        steps: 'Steps',
        category_ids: [Number(cat2.lastInsertRowid)],
        tag_ids: [Number(tag2.lastInsertRowid)],
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.recipe.categories).toHaveLength(1);
    expect(updateRes.body.recipe.categories[0].name).toBe('Mexican');
    expect(updateRes.body.recipe.tags).toHaveLength(1);
    expect(updateRes.body.recipe.tags[0].name).toBe('mild');
  });

  it('clears associations when empty arrays provided', async () => {
    const cat = db.prepare("INSERT INTO categories (name) VALUES ('Asian')").run();
    const tag = db.prepare("INSERT INTO tags (name) VALUES ('sweet')").run();

    const createRes = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Clear Test',
        ingredients: 'things',
        steps: 'Steps',
        category_ids: [Number(cat.lastInsertRowid)],
        tag_ids: [Number(tag.lastInsertRowid)],
      });

    const recipeId = createRes.body.recipe.id;

    const updateRes = await request(app)
      .put(`/api/recipes/${recipeId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Clear Test',
        ingredients: 'things',
        steps: 'Steps',
        category_ids: [],
        tag_ids: [],
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.recipe.categories).toEqual([]);
    expect(updateRes.body.recipe.tags).toEqual([]);
  });

  it('returns 403 when non-owner tries to update', async () => {
    const createRes = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Owner Recipe',
        ingredients: 'stuff',
        steps: 'Steps',
      });

    const otherUser = db.prepare(
      "INSERT INTO users (username, email, password_hash) VALUES ('other', 'other@test.com', 'hash')"
    ).run();
    const otherToken = jwt.sign(
      { id: otherUser.lastInsertRowid },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    const res = await request(app)
      .put(`/api/recipes/${createRes.body.recipe.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        title: 'Hijacked',
        ingredients: 'stuff',
        steps: 'Steps',
      });

    expect(res.status).toBe(403);
  });

  it('returns 404 when updating non-existent recipe', async () => {
    const res = await request(app)
      .put('/api/recipes/99999')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Ghost',
        ingredients: 'nothing',
        steps: 'None',
      });

    expect(res.status).toBe(404);
  });
});

// ── AC: Tests cover CRUD, duplicates, and recipe associations ──
describe('AC: End-to-end workflow', () => {
  it('full lifecycle: create categories, tags, recipe with associations, update, verify', async () => {
    // Create categories
    const cat1Res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Breakfast' });
    expect(cat1Res.status).toBe(201);

    const cat2Res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Brunch' });
    expect(cat2Res.status).toBe(201);

    // Create tags
    const tag1Res = await request(app)
      .post('/api/tags')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'quick' });
    expect(tag1Res.status).toBe(201);

    const tag2Res = await request(app)
      .post('/api/tags')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'healthy' });
    expect(tag2Res.status).toBe(201);

    // Verify categories list
    const catsRes = await request(app).get('/api/categories');
    expect(catsRes.body.categories).toHaveLength(2);

    // Verify tags list
    const tagsRes = await request(app).get('/api/tags');
    expect(tagsRes.body.tags).toHaveLength(2);

    // Create recipe with associations
    const recipeRes = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Eggs Benedict',
        ingredients: 'eggs, muffin, hollandaise',
        steps: 'Poach eggs, toast muffin, assemble',
        category_ids: [cat1Res.body.category.id],
        tag_ids: [tag1Res.body.tag.id, tag2Res.body.tag.id],
      });

    expect(recipeRes.status).toBe(201);
    expect(recipeRes.body.recipe.categories).toHaveLength(1);
    expect(recipeRes.body.recipe.tags).toHaveLength(2);

    // Verify via GET
    const getRes = await request(app).get(`/api/recipes/${recipeRes.body.recipe.id}`);
    expect(getRes.body.recipe.categories[0].name).toBe('Breakfast');
    expect(getRes.body.recipe.tags).toHaveLength(2);

    // Update to different associations
    const updateRes = await request(app)
      .put(`/api/recipes/${recipeRes.body.recipe.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Eggs Benedict Deluxe',
        ingredients: 'eggs, muffin, hollandaise, bacon',
        steps: 'Poach eggs, toast muffin, add bacon, assemble',
        category_ids: [cat2Res.body.category.id],
        tag_ids: [tag2Res.body.tag.id],
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.recipe.categories).toHaveLength(1);
    expect(updateRes.body.recipe.categories[0].name).toBe('Brunch');
    expect(updateRes.body.recipe.tags).toHaveLength(1);
    expect(updateRes.body.recipe.tags[0].name).toBe('healthy');
  });
});

// ── Edge cases ──
describe('Edge cases', () => {
  it('rejects invalid token for category creation', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', 'Bearer invalidtoken')
      .send({ name: 'Test' });
    expect(res.status).toBe(401);
  });

  it('rejects invalid token for tag creation', async () => {
    const res = await request(app)
      .post('/api/tags')
      .set('Authorization', 'Bearer invalidtoken')
      .send({ name: 'Test' });
    expect(res.status).toBe(401);
  });

  it('category name with only whitespace is rejected', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: '   ' });
    expect(res.status).toBe(400);
  });

  it('tag name with only whitespace is rejected', async () => {
    const res = await request(app)
      .post('/api/tags')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: '   ' });
    expect(res.status).toBe(400);
  });

  it('recipe creation validates category_ids as array', async () => {
    const res = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Bad IDs',
        ingredients: 'stuff',
        steps: 'Steps',
        category_ids: 'not-array',
      });
    expect(res.status).toBe(400);
  });

  it('recipe creation validates tag_ids as array', async () => {
    const res = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Bad IDs',
        ingredients: 'stuff',
        steps: 'Steps',
        tag_ids: 'not-array',
      });
    expect(res.status).toBe(400);
  });

  it('GET /api/recipes/:id returns 404 for non-existent recipe', async () => {
    const res = await request(app).get('/api/recipes/99999');
    expect(res.status).toBe(404);
  });

  it('DELETE recipe requires auth and ownership', async () => {
    const createRes = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'To Delete',
        ingredients: 'stuff',
        steps: 'Steps',
      });

    const res = await request(app).delete(`/api/recipes/${createRes.body.recipe.id}`);
    expect(res.status).toBe(401);
  });
});
