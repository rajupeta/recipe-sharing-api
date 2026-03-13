const request = require('supertest');
const jwt = require('jsonwebtoken');
const db = require('../src/db/database');
const app = require('../src/app');

let authToken;
let userId;

const validRecipe = {
  title: 'Test Recipe',
  description: 'A test recipe',
  ingredients: 'flour, eggs, sugar',
  steps: 'Mix. Bake. Serve.',
  cook_time: 30,
  servings: 4,
};

beforeEach(() => {
  db.exec('DELETE FROM recipe_tags');
  db.exec('DELETE FROM recipe_categories');
  db.exec('DELETE FROM tags');
  db.exec('DELETE FROM categories');
  db.exec('DELETE FROM recipes');
  db.exec('DELETE FROM users');

  const result = db.prepare(
    "INSERT INTO users (username, email, password_hash) VALUES ('edgeuser', 'edge@example.com', 'hash')"
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

describe('Categories — edge cases', () => {
  it('should accept a name with exactly 2 characters', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'AB' });

    expect(res.status).toBe(201);
    expect(res.body.category.name).toBe('AB');
  });

  it('should accept a name with exactly 50 characters', async () => {
    const name = 'A'.repeat(50);
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name });

    expect(res.status).toBe(201);
    expect(res.body.category.name).toBe(name);
  });

  it('should reject a whitespace-only name after trimming', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: '   ' });

    expect(res.status).toBe(400);
  });

  it('should return categories sorted alphabetically by name', async () => {
    db.prepare("INSERT INTO categories (name) VALUES ('Zebra')").run();
    db.prepare("INSERT INTO categories (name) VALUES ('Apple')").run();
    db.prepare("INSERT INTO categories (name) VALUES ('Mango')").run();

    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body.categories[0].name).toBe('Apple');
    expect(res.body.categories[1].name).toBe('Mango');
    expect(res.body.categories[2].name).toBe('Zebra');
  });
});

describe('Tags — edge cases', () => {
  it('should accept a name with exactly 2 characters', async () => {
    const res = await request(app)
      .post('/api/tags')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'AB' });

    expect(res.status).toBe(201);
    expect(res.body.tag.name).toBe('AB');
  });

  it('should accept a name with exactly 30 characters', async () => {
    const name = 'A'.repeat(30);
    const res = await request(app)
      .post('/api/tags')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name });

    expect(res.status).toBe(201);
    expect(res.body.tag.name).toBe(name);
  });

  it('should reject a whitespace-only name after trimming', async () => {
    const res = await request(app)
      .post('/api/tags')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: '   ' });

    expect(res.status).toBe(400);
  });

  it('should return tags sorted alphabetically by name', async () => {
    db.prepare("INSERT INTO tags (name) VALUES ('zesty')").run();
    db.prepare("INSERT INTO tags (name) VALUES ('appetizing')").run();

    const res = await request(app).get('/api/tags');
    expect(res.status).toBe(200);
    expect(res.body.tags[0].name).toBe('appetizing');
    expect(res.body.tags[1].name).toBe('zesty');
  });
});

describe('Recipes — category/tag association edge cases', () => {
  it('should create a recipe with multiple categories and tags', async () => {
    const cat1 = db.prepare("INSERT INTO categories (name) VALUES ('Italian')").run();
    const cat2 = db.prepare("INSERT INTO categories (name) VALUES ('Pasta')").run();
    const tag1 = db.prepare("INSERT INTO tags (name) VALUES ('quick')").run();
    const tag2 = db.prepare("INSERT INTO tags (name) VALUES ('easy')").run();
    const tag3 = db.prepare("INSERT INTO tags (name) VALUES ('dinner')").run();

    const res = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        ...validRecipe,
        category_ids: [cat1.lastInsertRowid, cat2.lastInsertRowid],
        tag_ids: [tag1.lastInsertRowid, tag2.lastInsertRowid, tag3.lastInsertRowid],
      });

    expect(res.status).toBe(201);
    expect(res.body.recipe.categories).toHaveLength(2);
    expect(res.body.recipe.tags).toHaveLength(3);
  });

  it('should create a recipe without category_ids and tag_ids (optional fields)', async () => {
    const res = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${authToken}`)
      .send(validRecipe);

    expect(res.status).toBe(201);
    expect(res.body.recipe.categories).toEqual([]);
    expect(res.body.recipe.tags).toEqual([]);
  });

  it('should reject non-array category_ids', async () => {
    const res = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ ...validRecipe, category_ids: 'not-an-array' });

    expect(res.status).toBe(400);
  });

  it('should reject non-array tag_ids', async () => {
    const res = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ ...validRecipe, tag_ids: 'not-an-array' });

    expect(res.status).toBe(400);
  });

  it('should reject non-integer values in category_ids', async () => {
    const res = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ ...validRecipe, category_ids: ['abc'] });

    expect(res.status).toBe(400);
  });

  it('should reject non-integer values in tag_ids', async () => {
    const res = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ ...validRecipe, tag_ids: ['abc'] });

    expect(res.status).toBe(400);
  });

  it('GET /api/recipes/:id returns categories and tags arrays even when empty', async () => {
    const createRes = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${authToken}`)
      .send(validRecipe);

    const recipeId = createRes.body.recipe.id;
    const res = await request(app).get(`/api/recipes/${recipeId}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.recipe.categories)).toBe(true);
    expect(Array.isArray(res.body.recipe.tags)).toBe(true);
    expect(res.body.recipe.categories).toEqual([]);
    expect(res.body.recipe.tags).toEqual([]);
  });

  it('should replace all associations on update', async () => {
    const cat1 = db.prepare("INSERT INTO categories (name) VALUES ('Italian')").run();
    const cat2 = db.prepare("INSERT INTO categories (name) VALUES ('Mexican')").run();
    const cat3 = db.prepare("INSERT INTO categories (name) VALUES ('Chinese')").run();
    const tag1 = db.prepare("INSERT INTO tags (name) VALUES ('pasta')").run();
    const tag2 = db.prepare("INSERT INTO tags (name) VALUES ('spicy')").run();

    // Create with cat1, cat2 and tag1
    const createRes = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        ...validRecipe,
        category_ids: [cat1.lastInsertRowid, cat2.lastInsertRowid],
        tag_ids: [tag1.lastInsertRowid],
      });

    const recipeId = createRes.body.recipe.id;

    // Update to cat3 and tag2 only
    const updateRes = await request(app)
      .put(`/api/recipes/${recipeId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        ...validRecipe,
        category_ids: [cat3.lastInsertRowid],
        tag_ids: [tag2.lastInsertRowid],
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.recipe.categories).toHaveLength(1);
    expect(updateRes.body.recipe.categories[0].name).toBe('Chinese');
    expect(updateRes.body.recipe.tags).toHaveLength(1);
    expect(updateRes.body.recipe.tags[0].name).toBe('spicy');

    // Verify via GET as well
    const getRes = await request(app).get(`/api/recipes/${recipeId}`);
    expect(getRes.body.recipe.categories).toHaveLength(1);
    expect(getRes.body.recipe.tags).toHaveLength(1);
  });

  it('should delete recipe and cascade junction table entries', async () => {
    const cat = db.prepare("INSERT INTO categories (name) VALUES ('Italian')").run();
    const tag = db.prepare("INSERT INTO tags (name) VALUES ('pasta')").run();

    const createRes = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        ...validRecipe,
        category_ids: [cat.lastInsertRowid],
        tag_ids: [tag.lastInsertRowid],
      });

    const recipeId = createRes.body.recipe.id;

    // Verify junction table entries exist
    const rcBefore = db.prepare('SELECT COUNT(*) as cnt FROM recipe_categories WHERE recipe_id = ?').get(recipeId);
    const rtBefore = db.prepare('SELECT COUNT(*) as cnt FROM recipe_tags WHERE recipe_id = ?').get(recipeId);
    expect(rcBefore.cnt).toBe(1);
    expect(rtBefore.cnt).toBe(1);

    // Delete recipe
    const deleteRes = await request(app)
      .delete(`/api/recipes/${recipeId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(deleteRes.status).toBe(204);

    // Verify junction table entries are cascaded
    const rcAfter = db.prepare('SELECT COUNT(*) as cnt FROM recipe_categories WHERE recipe_id = ?').get(recipeId);
    const rtAfter = db.prepare('SELECT COUNT(*) as cnt FROM recipe_tags WHERE recipe_id = ?').get(recipeId);
    expect(rcAfter.cnt).toBe(0);
    expect(rtAfter.cnt).toBe(0);
  });

  it('should handle duplicate category name with 409 even with different casing if DB is case-insensitive', async () => {
    await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Italian' });

    // Same exact name should 409
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Italian' });

    expect(res.status).toBe(409);
  });

  it('should handle duplicate tag name with 409', async () => {
    await request(app)
      .post('/api/tags')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'vegan' });

    const res = await request(app)
      .post('/api/tags')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'vegan' });

    expect(res.status).toBe(409);
  });
});
