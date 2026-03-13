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

describe('TICKET-009 QA — Additional validation', () => {
  describe('Categories — additional edge cases', () => {
    it('should reject category_ids with zero values', async () => {
      const res = await request(app)
        .post('/api/recipes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...validRecipe, category_ids: [0] });

      expect(res.status).toBe(400);
    });

    it('should reject category_ids with negative values', async () => {
      const res = await request(app)
        .post('/api/recipes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...validRecipe, category_ids: [-1] });

      expect(res.status).toBe(400);
    });

    it('should reject tag_ids with zero values', async () => {
      const res = await request(app)
        .post('/api/recipes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...validRecipe, tag_ids: [0] });

      expect(res.status).toBe(400);
    });

    it('should reject tag_ids with negative values', async () => {
      const res = await request(app)
        .post('/api/recipes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...validRecipe, tag_ids: [-5] });

      expect(res.status).toBe(400);
    });

    it('should return category with id, name, and created_at fields', async () => {
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Desserts' });

      expect(res.status).toBe(201);
      expect(res.body.category).toHaveProperty('id');
      expect(res.body.category).toHaveProperty('name');
      expect(res.body.category).toHaveProperty('created_at');
      expect(typeof res.body.category.id).toBe('number');
      expect(res.body.category.name).toBe('Desserts');
    });

    it('should return tag with id, name, and created_at fields', async () => {
      const res = await request(app)
        .post('/api/tags')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'healthy' });

      expect(res.status).toBe(201);
      expect(res.body.tag).toHaveProperty('id');
      expect(res.body.tag).toHaveProperty('name');
      expect(res.body.tag).toHaveProperty('created_at');
      expect(typeof res.body.tag.id).toBe('number');
      expect(res.body.tag.name).toBe('healthy');
    });
  });

  describe('Recipe associations — update semantics', () => {
    it('should keep existing tags when only category_ids is provided in update', async () => {
      const cat1 = db.prepare("INSERT INTO categories (name) VALUES ('Italian')").run();
      const cat2 = db.prepare("INSERT INTO categories (name) VALUES ('French')").run();
      const tag1 = db.prepare("INSERT INTO tags (name) VALUES ('quick')").run();

      // Create recipe with cat1 and tag1
      const createRes = await request(app)
        .post('/api/recipes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ...validRecipe,
          category_ids: [cat1.lastInsertRowid],
          tag_ids: [tag1.lastInsertRowid],
        });

      const recipeId = createRes.body.recipe.id;

      // Update only category_ids (omit tag_ids entirely)
      const updateRes = await request(app)
        .put(`/api/recipes/${recipeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ...validRecipe,
          category_ids: [cat2.lastInsertRowid],
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.recipe.categories).toHaveLength(1);
      expect(updateRes.body.recipe.categories[0].name).toBe('French');
      // tags should be unchanged since tag_ids was not provided (undefined)
      expect(updateRes.body.recipe.tags).toHaveLength(1);
      expect(updateRes.body.recipe.tags[0].name).toBe('quick');
    });

    it('should keep existing categories when only tag_ids is provided in update', async () => {
      const cat1 = db.prepare("INSERT INTO categories (name) VALUES ('Italian')").run();
      const tag1 = db.prepare("INSERT INTO tags (name) VALUES ('quick')").run();
      const tag2 = db.prepare("INSERT INTO tags (name) VALUES ('dinner')").run();

      // Create recipe with cat1 and tag1
      const createRes = await request(app)
        .post('/api/recipes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ...validRecipe,
          category_ids: [cat1.lastInsertRowid],
          tag_ids: [tag1.lastInsertRowid],
        });

      const recipeId = createRes.body.recipe.id;

      // Update only tag_ids (omit category_ids entirely)
      const updateRes = await request(app)
        .put(`/api/recipes/${recipeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ...validRecipe,
          tag_ids: [tag2.lastInsertRowid],
        });

      expect(updateRes.status).toBe(200);
      // categories should be unchanged since category_ids was not provided
      expect(updateRes.body.recipe.categories).toHaveLength(1);
      expect(updateRes.body.recipe.categories[0].name).toBe('Italian');
      expect(updateRes.body.recipe.tags).toHaveLength(1);
      expect(updateRes.body.recipe.tags[0].name).toBe('dinner');
    });

    it('should handle creating a recipe with empty category_ids and tag_ids arrays', async () => {
      const res = await request(app)
        .post('/api/recipes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ...validRecipe,
          category_ids: [],
          tag_ids: [],
        });

      expect(res.status).toBe(201);
      expect(res.body.recipe.categories).toEqual([]);
      expect(res.body.recipe.tags).toEqual([]);
    });
  });

  describe('Route registration verification', () => {
    it('GET /api/categories is registered and returns 200', async () => {
      const res = await request(app).get('/api/categories');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('categories');
    });

    it('GET /api/tags is registered and returns 200', async () => {
      const res = await request(app).get('/api/tags');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('tags');
    });

    it('POST /api/recipes accepts category_ids and tag_ids', async () => {
      const cat = db.prepare("INSERT INTO categories (name) VALUES ('Test')").run();
      const tag = db.prepare("INSERT INTO tags (name) VALUES ('test')").run();

      const res = await request(app)
        .post('/api/recipes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ...validRecipe,
          category_ids: [cat.lastInsertRowid],
          tag_ids: [tag.lastInsertRowid],
        });

      expect(res.status).toBe(201);
      expect(res.body.recipe.categories).toHaveLength(1);
      expect(res.body.recipe.tags).toHaveLength(1);
    });

    it('PUT /api/recipes/:id accepts category_ids and tag_ids', async () => {
      const cat = db.prepare("INSERT INTO categories (name) VALUES ('Test')").run();
      const tag = db.prepare("INSERT INTO tags (name) VALUES ('test')").run();

      const createRes = await request(app)
        .post('/api/recipes')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validRecipe);

      const recipeId = createRes.body.recipe.id;

      const res = await request(app)
        .put(`/api/recipes/${recipeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ...validRecipe,
          category_ids: [cat.lastInsertRowid],
          tag_ids: [tag.lastInsertRowid],
        });

      expect(res.status).toBe(200);
      expect(res.body.recipe.categories).toHaveLength(1);
      expect(res.body.recipe.tags).toHaveLength(1);
    });
  });

  describe('GET /api/recipes/:id response shape', () => {
    it('should include categories array with full category objects', async () => {
      const cat = db.prepare("INSERT INTO categories (name) VALUES ('Italian')").run();

      const createRes = await request(app)
        .post('/api/recipes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ...validRecipe,
          category_ids: [cat.lastInsertRowid],
        });

      const recipeId = createRes.body.recipe.id;
      const res = await request(app).get(`/api/recipes/${recipeId}`);

      expect(res.status).toBe(200);
      expect(res.body.recipe.categories[0]).toHaveProperty('id');
      expect(res.body.recipe.categories[0]).toHaveProperty('name');
      expect(res.body.recipe.categories[0]).toHaveProperty('created_at');
    });

    it('should include tags array with full tag objects', async () => {
      const tag = db.prepare("INSERT INTO tags (name) VALUES ('vegan')").run();

      const createRes = await request(app)
        .post('/api/recipes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ...validRecipe,
          tag_ids: [tag.lastInsertRowid],
        });

      const recipeId = createRes.body.recipe.id;
      const res = await request(app).get(`/api/recipes/${recipeId}`);

      expect(res.status).toBe(200);
      expect(res.body.recipe.tags[0]).toHaveProperty('id');
      expect(res.body.recipe.tags[0]).toHaveProperty('name');
      expect(res.body.recipe.tags[0]).toHaveProperty('created_at');
    });
  });
});
