const request = require('supertest');
const jwt = require('jsonwebtoken');
const db = require('../src/db/database');
const app = require('../src/app');

let authToken;
let userId;
let otherToken;
let otherUserId;

beforeEach(() => {
  db.exec('DELETE FROM recipe_tags');
  db.exec('DELETE FROM recipe_categories');
  db.exec('DELETE FROM tags');
  db.exec('DELETE FROM categories');
  db.exec('DELETE FROM recipes');
  db.exec('DELETE FROM users');

  const result = db.prepare(
    "INSERT INTO users (username, email, password_hash) VALUES ('testuser', 'test@example.com', 'hash')"
  ).run();
  userId = Number(result.lastInsertRowid);
  authToken = jwt.sign({ id: userId }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });

  const other = db.prepare(
    "INSERT INTO users (username, email, password_hash) VALUES ('otheruser', 'other@example.com', 'hash2')"
  ).run();
  otherUserId = Number(other.lastInsertRowid);
  otherToken = jwt.sign({ id: otherUserId }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
});

afterAll(() => {
  db.exec('DELETE FROM recipe_tags');
  db.exec('DELETE FROM recipe_categories');
  db.exec('DELETE FROM tags');
  db.exec('DELETE FROM categories');
  db.exec('DELETE FROM recipes');
  db.exec('DELETE FROM users');
});

// Helper to create a category
async function createCategory(name, token) {
  return request(app)
    .post('/api/categories')
    .set('Authorization', `Bearer ${token || authToken}`)
    .send({ name });
}

// Helper to create a tag
async function createTag(name, token) {
  return request(app)
    .post('/api/tags')
    .set('Authorization', `Bearer ${token || authToken}`)
    .send({ name });
}

// Helper to create a recipe
async function createRecipe(overrides = {}, token) {
  const defaults = {
    title: 'Test Recipe',
    ingredients: 'flour, sugar',
    steps: 'Mix and bake',
  };
  return request(app)
    .post('/api/recipes')
    .set('Authorization', `Bearer ${token || authToken}`)
    .send({ ...defaults, ...overrides });
}

// ============================================================
// ACCEPTANCE CRITERIA TESTS
// ============================================================

describe('TICKET-009 Acceptance Criteria', () => {

  describe('AC: GET /api/categories returns all categories', () => {
    it('returns empty array when no categories exist', async () => {
      const res = await request(app).get('/api/categories');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('categories');
      expect(res.body.categories).toEqual([]);
    });

    it('returns all created categories with correct structure', async () => {
      await createCategory('Desserts');
      await createCategory('Appetizers');
      await createCategory('Main Course');

      const res = await request(app).get('/api/categories');
      expect(res.status).toBe(200);
      expect(res.body.categories).toHaveLength(3);

      for (const cat of res.body.categories) {
        expect(cat).toHaveProperty('id');
        expect(cat).toHaveProperty('name');
        expect(cat).toHaveProperty('created_at');
        expect(typeof cat.id).toBe('number');
        expect(typeof cat.name).toBe('string');
      }
    });

    it('does not require authentication', async () => {
      const res = await request(app).get('/api/categories');
      expect(res.status).toBe(200);
    });
  });

  describe('AC: POST /api/categories creates and returns 201', () => {
    it('creates category with valid name and returns 201', async () => {
      const res = await createCategory('Italian');
      expect(res.status).toBe(201);
      expect(res.body.category.name).toBe('Italian');
      expect(res.body.category).toHaveProperty('id');
      expect(res.body.category).toHaveProperty('created_at');
    });

    it('requires authentication', async () => {
      const res = await request(app)
        .post('/api/categories')
        .send({ name: 'Italian' });
      expect(res.status).toBe(401);
    });

    it('validates name is required', async () => {
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('validates name minimum length (2 chars)', async () => {
      const res = await createCategory('A');
      expect(res.status).toBe(400);
    });

    it('validates name maximum length (50 chars)', async () => {
      const res = await createCategory('A'.repeat(51));
      expect(res.status).toBe(400);
    });

    it('accepts name at exactly 2 chars', async () => {
      const res = await createCategory('AB');
      expect(res.status).toBe(201);
      expect(res.body.category.name).toBe('AB');
    });

    it('accepts name at exactly 50 chars', async () => {
      const res = await createCategory('A'.repeat(50));
      expect(res.status).toBe(201);
    });

    it('trims whitespace from name', async () => {
      const res = await createCategory('  Pasta  ');
      expect(res.status).toBe(201);
      expect(res.body.category.name).toBe('Pasta');
    });
  });

  describe('AC: Duplicate category name returns 409', () => {
    it('returns 409 for exact duplicate name', async () => {
      await createCategory('Italian');
      const res = await createCategory('Italian');
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Category name already exists');
    });

    it('returns 409 when duplicate is created after trimming', async () => {
      await createCategory('Italian');
      const res = await createCategory('  Italian  ');
      expect(res.status).toBe(409);
    });
  });

  describe('AC: GET /api/tags returns all tags', () => {
    it('returns empty array when no tags exist', async () => {
      const res = await request(app).get('/api/tags');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('tags');
      expect(res.body.tags).toEqual([]);
    });

    it('returns all created tags with correct structure', async () => {
      await createTag('spicy');
      await createTag('quick');
      await createTag('vegan');

      const res = await request(app).get('/api/tags');
      expect(res.status).toBe(200);
      expect(res.body.tags).toHaveLength(3);

      for (const tag of res.body.tags) {
        expect(tag).toHaveProperty('id');
        expect(tag).toHaveProperty('name');
        expect(tag).toHaveProperty('created_at');
        expect(typeof tag.id).toBe('number');
        expect(typeof tag.name).toBe('string');
      }
    });

    it('does not require authentication', async () => {
      const res = await request(app).get('/api/tags');
      expect(res.status).toBe(200);
    });
  });

  describe('AC: POST /api/tags creates and returns 201', () => {
    it('creates tag with valid name and returns 201', async () => {
      const res = await createTag('spicy');
      expect(res.status).toBe(201);
      expect(res.body.tag.name).toBe('spicy');
      expect(res.body.tag).toHaveProperty('id');
      expect(res.body.tag).toHaveProperty('created_at');
    });

    it('requires authentication', async () => {
      const res = await request(app)
        .post('/api/tags')
        .send({ name: 'spicy' });
      expect(res.status).toBe(401);
    });

    it('validates name is required', async () => {
      const res = await request(app)
        .post('/api/tags')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('validates name minimum length (2 chars)', async () => {
      const res = await createTag('A');
      expect(res.status).toBe(400);
    });

    it('validates name maximum length (30 chars)', async () => {
      const res = await createTag('A'.repeat(31));
      expect(res.status).toBe(400);
    });

    it('accepts name at exactly 2 chars', async () => {
      const res = await createTag('AB');
      expect(res.status).toBe(201);
    });

    it('accepts name at exactly 30 chars', async () => {
      const res = await createTag('A'.repeat(30));
      expect(res.status).toBe(201);
    });

    it('trims whitespace from name', async () => {
      const res = await createTag('  quick  ');
      expect(res.status).toBe(201);
      expect(res.body.tag.name).toBe('quick');
    });

    it('returns 409 for duplicate tag name', async () => {
      await createTag('spicy');
      const res = await createTag('spicy');
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Tag name already exists');
    });
  });

  describe('AC: Recipes can be created with category_ids and tag_ids arrays', () => {
    it('creates recipe with categories and tags', async () => {
      const cat = await createCategory('Italian');
      const tag = await createTag('quick');

      const res = await createRecipe({
        category_ids: [cat.body.category.id],
        tag_ids: [tag.body.tag.id],
      });

      expect(res.status).toBe(201);
      expect(res.body.recipe).toHaveProperty('categories');
      expect(res.body.recipe).toHaveProperty('tags');
      expect(res.body.recipe.categories).toHaveLength(1);
      expect(res.body.recipe.tags).toHaveLength(1);
      expect(res.body.recipe.categories[0].name).toBe('Italian');
      expect(res.body.recipe.tags[0].name).toBe('quick');
    });

    it('creates recipe with multiple categories and tags', async () => {
      const cat1 = await createCategory('Italian');
      const cat2 = await createCategory('Pasta');
      const tag1 = await createTag('quick');
      const tag2 = await createTag('easy');
      const tag3 = await createTag('dinner');

      const res = await createRecipe({
        category_ids: [cat1.body.category.id, cat2.body.category.id],
        tag_ids: [tag1.body.tag.id, tag2.body.tag.id, tag3.body.tag.id],
      });

      expect(res.status).toBe(201);
      expect(res.body.recipe.categories).toHaveLength(2);
      expect(res.body.recipe.tags).toHaveLength(3);
    });

    it('creates recipe without categories and tags (optional)', async () => {
      const res = await createRecipe();
      expect(res.status).toBe(201);
      expect(res.body.recipe.categories).toEqual([]);
      expect(res.body.recipe.tags).toEqual([]);
    });

    it('creates recipe with empty category_ids and tag_ids arrays', async () => {
      const res = await createRecipe({
        category_ids: [],
        tag_ids: [],
      });
      expect(res.status).toBe(201);
      expect(res.body.recipe.categories).toEqual([]);
      expect(res.body.recipe.tags).toEqual([]);
    });

    it('creates recipe with only categories, no tags', async () => {
      const cat = await createCategory('Dessert');
      const res = await createRecipe({
        category_ids: [cat.body.category.id],
      });
      expect(res.status).toBe(201);
      expect(res.body.recipe.categories).toHaveLength(1);
      expect(res.body.recipe.tags).toEqual([]);
    });

    it('creates recipe with only tags, no categories', async () => {
      const tag = await createTag('healthy');
      const res = await createRecipe({
        tag_ids: [tag.body.tag.id],
      });
      expect(res.status).toBe(201);
      expect(res.body.recipe.categories).toEqual([]);
      expect(res.body.recipe.tags).toHaveLength(1);
    });
  });

  describe('AC: GET /api/recipes/:id includes categories and tags in response', () => {
    it('returns categories and tags arrays in recipe response', async () => {
      const cat = await createCategory('Mexican');
      const tag = await createTag('spicy');

      const recipe = await createRecipe({
        category_ids: [cat.body.category.id],
        tag_ids: [tag.body.tag.id],
      });

      const res = await request(app).get(`/api/recipes/${recipe.body.recipe.id}`);
      expect(res.status).toBe(200);
      expect(res.body.recipe.categories).toHaveLength(1);
      expect(res.body.recipe.tags).toHaveLength(1);
      expect(res.body.recipe.categories[0]).toHaveProperty('id');
      expect(res.body.recipe.categories[0]).toHaveProperty('name');
      expect(res.body.recipe.categories[0].name).toBe('Mexican');
      expect(res.body.recipe.tags[0]).toHaveProperty('id');
      expect(res.body.recipe.tags[0]).toHaveProperty('name');
      expect(res.body.recipe.tags[0].name).toBe('spicy');
    });

    it('returns empty arrays when recipe has no associations', async () => {
      const recipe = await createRecipe();
      const res = await request(app).get(`/api/recipes/${recipe.body.recipe.id}`);
      expect(res.status).toBe(200);
      expect(res.body.recipe.categories).toEqual([]);
      expect(res.body.recipe.tags).toEqual([]);
    });

    it('returns 404 for non-existent recipe', async () => {
      const res = await request(app).get('/api/recipes/99999');
      expect(res.status).toBe(404);
    });
  });

  describe('AC: Updating a recipe replaces its category/tag associations', () => {
    it('replaces categories on update', async () => {
      const cat1 = await createCategory('Italian');
      const cat2 = await createCategory('French');

      const recipe = await createRecipe({
        category_ids: [cat1.body.category.id],
        tag_ids: [],
      });
      const recipeId = recipe.body.recipe.id;

      // Update to replace Italian with French
      const res = await request(app)
        .put(`/api/recipes/${recipeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Updated Recipe',
          ingredients: 'flour',
          steps: 'bake',
          category_ids: [cat2.body.category.id],
        });

      expect(res.status).toBe(200);
      expect(res.body.recipe.categories).toHaveLength(1);
      expect(res.body.recipe.categories[0].name).toBe('French');
    });

    it('replaces tags on update', async () => {
      const tag1 = await createTag('quick');
      const tag2 = await createTag('slow');

      const recipe = await createRecipe({
        tag_ids: [tag1.body.tag.id],
      });
      const recipeId = recipe.body.recipe.id;

      const res = await request(app)
        .put(`/api/recipes/${recipeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Updated Recipe',
          ingredients: 'flour',
          steps: 'bake',
          tag_ids: [tag2.body.tag.id],
        });

      expect(res.status).toBe(200);
      expect(res.body.recipe.tags).toHaveLength(1);
      expect(res.body.recipe.tags[0].name).toBe('slow');
    });

    it('clears all categories when updated with empty array', async () => {
      const cat = await createCategory('Italian');
      const recipe = await createRecipe({
        category_ids: [cat.body.category.id],
      });

      const res = await request(app)
        .put(`/api/recipes/${recipe.body.recipe.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Updated',
          ingredients: 'flour',
          steps: 'bake',
          category_ids: [],
        });

      expect(res.status).toBe(200);
      expect(res.body.recipe.categories).toEqual([]);
    });

    it('clears all tags when updated with empty array', async () => {
      const tag = await createTag('quick');
      const recipe = await createRecipe({
        tag_ids: [tag.body.tag.id],
      });

      const res = await request(app)
        .put(`/api/recipes/${recipe.body.recipe.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Updated',
          ingredients: 'flour',
          steps: 'bake',
          tag_ids: [],
        });

      expect(res.status).toBe(200);
      expect(res.body.recipe.tags).toEqual([]);
    });

    it('preserves existing tags when only category_ids provided in update', async () => {
      const cat1 = await createCategory('Italian');
      const cat2 = await createCategory('French');
      const tag = await createTag('quick');

      const recipe = await createRecipe({
        category_ids: [cat1.body.category.id],
        tag_ids: [tag.body.tag.id],
      });

      const res = await request(app)
        .put(`/api/recipes/${recipe.body.recipe.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Updated',
          ingredients: 'flour',
          steps: 'bake',
          category_ids: [cat2.body.category.id],
          // tag_ids not provided — should keep existing
        });

      expect(res.status).toBe(200);
      expect(res.body.recipe.categories).toHaveLength(1);
      expect(res.body.recipe.categories[0].name).toBe('French');
      expect(res.body.recipe.tags).toHaveLength(1);
      expect(res.body.recipe.tags[0].name).toBe('quick');
    });

    it('preserves existing categories when only tag_ids provided in update', async () => {
      const cat = await createCategory('Italian');
      const tag1 = await createTag('quick');
      const tag2 = await createTag('easy');

      const recipe = await createRecipe({
        category_ids: [cat.body.category.id],
        tag_ids: [tag1.body.tag.id],
      });

      const res = await request(app)
        .put(`/api/recipes/${recipe.body.recipe.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Updated',
          ingredients: 'flour',
          steps: 'bake',
          tag_ids: [tag2.body.tag.id],
          // category_ids not provided — should keep existing
        });

      expect(res.status).toBe(200);
      expect(res.body.recipe.categories).toHaveLength(1);
      expect(res.body.recipe.categories[0].name).toBe('Italian');
      expect(res.body.recipe.tags).toHaveLength(1);
      expect(res.body.recipe.tags[0].name).toBe('easy');
    });

    it('prevents non-owner from updating recipe associations', async () => {
      const cat = await createCategory('Italian');
      const recipe = await createRecipe({
        category_ids: [cat.body.category.id],
      });

      const res = await request(app)
        .put(`/api/recipes/${recipe.body.recipe.id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({
          title: 'Hijacked',
          ingredients: 'stolen',
          steps: 'hack',
          category_ids: [],
        });

      expect(res.status).toBe(403);
    });
  });
});

// ============================================================
// ADDITIONAL INTEGRATION & EDGE CASE TESTS
// ============================================================

describe('TICKET-009 Integration Tests', () => {

  describe('Full lifecycle: create → read → update → verify', () => {
    it('complete recipe lifecycle with associations', async () => {
      // Create categories and tags
      const cat1 = await createCategory('Breakfast');
      const cat2 = await createCategory('Lunch');
      const tag1 = await createTag('healthy');
      const tag2 = await createTag('fast');
      const tag3 = await createTag('vegetarian');

      // Step 1: Create recipe with initial associations
      const created = await createRecipe({
        title: 'Avocado Toast',
        ingredients: 'bread, avocado, salt',
        steps: 'Toast bread, spread avocado',
        category_ids: [cat1.body.category.id],
        tag_ids: [tag1.body.tag.id, tag2.body.tag.id],
      });
      expect(created.status).toBe(201);
      const recipeId = created.body.recipe.id;

      // Step 2: Read and verify initial associations
      const read1 = await request(app).get(`/api/recipes/${recipeId}`);
      expect(read1.body.recipe.categories).toHaveLength(1);
      expect(read1.body.recipe.categories[0].name).toBe('Breakfast');
      expect(read1.body.recipe.tags).toHaveLength(2);
      const tagNames1 = read1.body.recipe.tags.map(t => t.name).sort();
      expect(tagNames1).toEqual(['fast', 'healthy']);

      // Step 3: Update — change categories and tags
      const updated = await request(app)
        .put(`/api/recipes/${recipeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Avocado Toast Deluxe',
          ingredients: 'bread, avocado, salt, pepper, lime',
          steps: 'Toast bread, spread avocado, season',
          category_ids: [cat1.body.category.id, cat2.body.category.id],
          tag_ids: [tag3.body.tag.id],
        });
      expect(updated.status).toBe(200);

      // Step 4: Read and verify updated associations
      const read2 = await request(app).get(`/api/recipes/${recipeId}`);
      expect(read2.body.recipe.title).toBe('Avocado Toast Deluxe');
      expect(read2.body.recipe.categories).toHaveLength(2);
      expect(read2.body.recipe.tags).toHaveLength(1);
      expect(read2.body.recipe.tags[0].name).toBe('vegetarian');

      // Step 5: Remove all associations
      const cleared = await request(app)
        .put(`/api/recipes/${recipeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Avocado Toast Deluxe',
          ingredients: 'bread, avocado',
          steps: 'Toast and spread',
          category_ids: [],
          tag_ids: [],
        });
      expect(cleared.status).toBe(200);
      expect(cleared.body.recipe.categories).toEqual([]);
      expect(cleared.body.recipe.tags).toEqual([]);

      // Step 6: Verify via GET that associations are gone
      const read3 = await request(app).get(`/api/recipes/${recipeId}`);
      expect(read3.body.recipe.categories).toEqual([]);
      expect(read3.body.recipe.tags).toEqual([]);
    });
  });

  describe('Recipe deletion cascades to junction tables', () => {
    it('deleting a recipe removes its category and tag associations', async () => {
      const cat = await createCategory('Dessert');
      const tag = await createTag('sweet');

      const recipe = await createRecipe({
        category_ids: [cat.body.category.id],
        tag_ids: [tag.body.tag.id],
      });

      const del = await request(app)
        .delete(`/api/recipes/${recipe.body.recipe.id}`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(del.status).toBe(204);

      // Verify recipe is gone
      const get = await request(app).get(`/api/recipes/${recipe.body.recipe.id}`);
      expect(get.status).toBe(404);

      // Verify categories and tags still exist (only junction entries deleted)
      const cats = await request(app).get('/api/categories');
      expect(cats.body.categories).toHaveLength(1);
      expect(cats.body.categories[0].name).toBe('Dessert');

      const tags = await request(app).get('/api/tags');
      expect(tags.body.tags).toHaveLength(1);
      expect(tags.body.tags[0].name).toBe('sweet');
    });
  });

  describe('Multiple recipes sharing categories and tags', () => {
    it('two recipes can share the same category', async () => {
      const cat = await createCategory('Italian');

      const r1 = await createRecipe({
        title: 'Pasta',
        ingredients: 'pasta, sauce',
        steps: 'Cook pasta',
        category_ids: [cat.body.category.id],
      });
      const r2 = await createRecipe({
        title: 'Pizza',
        ingredients: 'dough, cheese',
        steps: 'Bake pizza',
        category_ids: [cat.body.category.id],
      });

      expect(r1.status).toBe(201);
      expect(r2.status).toBe(201);

      const get1 = await request(app).get(`/api/recipes/${r1.body.recipe.id}`);
      const get2 = await request(app).get(`/api/recipes/${r2.body.recipe.id}`);
      expect(get1.body.recipe.categories[0].name).toBe('Italian');
      expect(get2.body.recipe.categories[0].name).toBe('Italian');
    });

    it('two recipes can share the same tag', async () => {
      const tag = await createTag('quick');

      const r1 = await createRecipe({
        title: 'Salad',
        ingredients: 'lettuce',
        steps: 'Chop',
        tag_ids: [tag.body.tag.id],
      });
      const r2 = await createRecipe({
        title: 'Sandwich',
        ingredients: 'bread',
        steps: 'Assemble',
        tag_ids: [tag.body.tag.id],
      });

      expect(r1.status).toBe(201);
      expect(r2.status).toBe(201);

      const get1 = await request(app).get(`/api/recipes/${r1.body.recipe.id}`);
      const get2 = await request(app).get(`/api/recipes/${r2.body.recipe.id}`);
      expect(get1.body.recipe.tags[0].name).toBe('quick');
      expect(get2.body.recipe.tags[0].name).toBe('quick');
    });

    it('deleting one recipe does not affect another recipe sharing the same category', async () => {
      const cat = await createCategory('Mexican');

      const r1 = await createRecipe({
        title: 'Tacos',
        ingredients: 'tortilla',
        steps: 'Fill',
        category_ids: [cat.body.category.id],
      });
      const r2 = await createRecipe({
        title: 'Burrito',
        ingredients: 'tortilla, rice',
        steps: 'Roll',
        category_ids: [cat.body.category.id],
      });

      await request(app)
        .delete(`/api/recipes/${r1.body.recipe.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      const get2 = await request(app).get(`/api/recipes/${r2.body.recipe.id}`);
      expect(get2.status).toBe(200);
      expect(get2.body.recipe.categories).toHaveLength(1);
      expect(get2.body.recipe.categories[0].name).toBe('Mexican');
    });
  });

  describe('Validation on recipe association fields', () => {
    it('rejects non-array category_ids', async () => {
      const res = await createRecipe({ category_ids: 'not-an-array' });
      expect(res.status).toBe(400);
    });

    it('rejects non-array tag_ids', async () => {
      const res = await createRecipe({ tag_ids: 'not-an-array' });
      expect(res.status).toBe(400);
    });

    it('rejects non-integer values in category_ids', async () => {
      const res = await createRecipe({ category_ids: ['abc'] });
      expect(res.status).toBe(400);
    });

    it('rejects non-integer values in tag_ids', async () => {
      const res = await createRecipe({ tag_ids: ['abc'] });
      expect(res.status).toBe(400);
    });

    it('rejects negative values in category_ids', async () => {
      const res = await createRecipe({ category_ids: [-1] });
      expect(res.status).toBe(400);
    });

    it('rejects zero in tag_ids', async () => {
      const res = await createRecipe({ tag_ids: [0] });
      expect(res.status).toBe(400);
    });
  });

  describe('Route registration in app.js', () => {
    it('categories routes are registered at /api/categories', async () => {
      const res = await request(app).get('/api/categories');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('categories');
    });

    it('tags routes are registered at /api/tags', async () => {
      const res = await request(app).get('/api/tags');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('tags');
    });

    it('recipes routes are registered at /api/recipes', async () => {
      const cat = await createCategory('Test');
      const recipe = await createRecipe({
        category_ids: [cat.body.category.id],
      });
      const res = await request(app).get(`/api/recipes/${recipe.body.recipe.id}`);
      expect(res.status).toBe(200);
      expect(res.body.recipe).toHaveProperty('categories');
      expect(res.body.recipe).toHaveProperty('tags');
    });
  });
});
