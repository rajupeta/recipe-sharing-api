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
    "INSERT INTO users (username, email, password_hash) VALUES ('qaextra', 'qaextra@example.com', 'hash')"
  ).run();
  userId = Number(result.lastInsertRowid);
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

describe('TICKET-009 QA — Additional edge cases (test-agent)', () => {

  describe('Non-existent category/tag IDs', () => {
    it('should fail when creating recipe with non-existent category_id', async () => {
      const res = await request(app)
        .post('/api/recipes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...validRecipe, category_ids: [99999] });

      // Should fail due to foreign key constraint
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('should fail when creating recipe with non-existent tag_id', async () => {
      const res = await request(app)
        .post('/api/recipes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...validRecipe, tag_ids: [99999] });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Auth edge cases', () => {
    it('should reject POST /api/categories with invalid token', async () => {
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', 'Bearer invalid-token')
        .send({ name: 'Test' });

      expect(res.status).toBe(401);
    });

    it('should reject POST /api/tags with invalid token', async () => {
      const res = await request(app)
        .post('/api/tags')
        .set('Authorization', 'Bearer invalid-token')
        .send({ name: 'Test' });

      expect(res.status).toBe(401);
    });

    it('should reject POST /api/recipes with no auth header', async () => {
      const res = await request(app)
        .post('/api/recipes')
        .send(validRecipe);

      expect(res.status).toBe(401);
    });

    it('should reject PUT /api/recipes/:id with no auth header', async () => {
      const createRes = await request(app)
        .post('/api/recipes')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validRecipe);

      const res = await request(app)
        .put(`/api/recipes/${createRes.body.recipe.id}`)
        .send(validRecipe);

      expect(res.status).toBe(401);
    });

    it('should reject DELETE /api/recipes/:id with no auth header', async () => {
      const createRes = await request(app)
        .post('/api/recipes')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validRecipe);

      const res = await request(app)
        .delete(`/api/recipes/${createRes.body.recipe.id}`);

      expect(res.status).toBe(401);
    });
  });

  describe('Recipe validation', () => {
    it('should reject recipe without title', async () => {
      const res = await request(app)
        .post('/api/recipes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ingredients: 'flour', steps: 'bake' });

      expect(res.status).toBe(400);
    });

    it('should reject recipe without ingredients', async () => {
      const res = await request(app)
        .post('/api/recipes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Cake', steps: 'bake' });

      expect(res.status).toBe(400);
    });

    it('should reject recipe without steps', async () => {
      const res = await request(app)
        .post('/api/recipes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Cake', ingredients: 'flour' });

      expect(res.status).toBe(400);
    });

    it('should return 404 for PUT on non-existent recipe', async () => {
      const res = await request(app)
        .put('/api/recipes/99999')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validRecipe);

      expect(res.status).toBe(404);
    });

    it('should return 404 for DELETE on non-existent recipe', async () => {
      const res = await request(app)
        .delete('/api/recipes/99999')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('Category name validation edge cases', () => {
    it('should reject empty string name', async () => {
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: '' });

      expect(res.status).toBe(400);
    });

    it('should reject name with only 1 character', async () => {
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'X' });

      expect(res.status).toBe(400);
    });

    it('should reject name with 51 characters', async () => {
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'A'.repeat(51) });

      expect(res.status).toBe(400);
    });
  });

  describe('Tag name validation edge cases', () => {
    it('should reject empty string name', async () => {
      const res = await request(app)
        .post('/api/tags')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: '' });

      expect(res.status).toBe(400);
    });

    it('should reject name with only 1 character', async () => {
      const res = await request(app)
        .post('/api/tags')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'X' });

      expect(res.status).toBe(400);
    });

    it('should reject name with 31 characters', async () => {
      const res = await request(app)
        .post('/api/tags')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'A'.repeat(31) });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/categories — response shape', () => {
    it('should return an object with categories key', async () => {
      const res = await request(app).get('/api/categories');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('categories');
      expect(Array.isArray(res.body.categories)).toBe(true);
    });
  });

  describe('GET /api/tags — response shape', () => {
    it('should return an object with tags key', async () => {
      const res = await request(app).get('/api/tags');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('tags');
      expect(Array.isArray(res.body.tags)).toBe(true);
    });
  });

  describe('Recipe with associations — full object shape', () => {
    it('should return recipe with all expected fields plus categories and tags', async () => {
      const cat = db.prepare("INSERT INTO categories (name) VALUES ('Italian')").run();
      const tag = db.prepare("INSERT INTO tags (name) VALUES ('quick')").run();

      const createRes = await request(app)
        .post('/api/recipes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ...validRecipe,
          category_ids: [Number(cat.lastInsertRowid)],
          tag_ids: [Number(tag.lastInsertRowid)],
        });

      expect(createRes.status).toBe(201);
      const recipe = createRes.body.recipe;

      expect(recipe).toHaveProperty('id');
      expect(recipe).toHaveProperty('user_id');
      expect(recipe).toHaveProperty('title');
      expect(recipe).toHaveProperty('ingredients');
      expect(recipe).toHaveProperty('steps');
      expect(recipe).toHaveProperty('categories');
      expect(recipe).toHaveProperty('tags');
      expect(recipe).toHaveProperty('created_at');
      expect(recipe).toHaveProperty('updated_at');
    });
  });
});
