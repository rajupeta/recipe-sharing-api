const request = require('supertest');
const jwt = require('jsonwebtoken');
const db = require('../src/db/database');
const app = require('../src/app');

let authToken;
let userId;

const validRecipe = {
  title: 'Spaghetti Carbonara',
  description: 'Classic Italian pasta dish',
  ingredients: 'spaghetti, eggs, pancetta, parmesan',
  steps: 'Cook pasta. Mix eggs and cheese. Combine.',
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
    "INSERT INTO users (username, email, password_hash) VALUES ('testuser', 'test@example.com', 'hash')"
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

describe('POST /api/recipes', () => {
  it('should create a recipe and return 201', async () => {
    const res = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${authToken}`)
      .send(validRecipe);

    expect(res.status).toBe(201);
    expect(res.body.recipe).toHaveProperty('id');
    expect(res.body.recipe.title).toBe('Spaghetti Carbonara');
    expect(res.body.recipe.categories).toEqual([]);
    expect(res.body.recipe.tags).toEqual([]);
  });

  it('should create a recipe with category_ids and tag_ids', async () => {
    const cat = db.prepare("INSERT INTO categories (name) VALUES ('Italian')").run();
    const tag = db.prepare("INSERT INTO tags (name) VALUES ('pasta')").run();

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
    expect(res.body.recipe.categories[0].name).toBe('Italian');
    expect(res.body.recipe.tags).toHaveLength(1);
    expect(res.body.recipe.tags[0].name).toBe('pasta');
  });

  it('should return 401 without authentication', async () => {
    const res = await request(app)
      .post('/api/recipes')
      .send(validRecipe);

    expect(res.status).toBe(401);
  });

  it('should return 400 when title is missing', async () => {
    const { title, ...noTitle } = validRecipe;
    const res = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${authToken}`)
      .send(noTitle);

    expect(res.status).toBe(400);
  });

  it('should return 400 when ingredients are missing', async () => {
    const { ingredients, ...noIngredients } = validRecipe;
    const res = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${authToken}`)
      .send(noIngredients);

    expect(res.status).toBe(400);
  });
});

describe('GET /api/recipes/:id', () => {
  it('should return a recipe with categories and tags', async () => {
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

    const res = await request(app).get(`/api/recipes/${recipeId}`);
    expect(res.status).toBe(200);
    expect(res.body.recipe.title).toBe('Spaghetti Carbonara');
    expect(res.body.recipe.categories).toHaveLength(1);
    expect(res.body.recipe.categories[0].name).toBe('Italian');
    expect(res.body.recipe.tags).toHaveLength(1);
    expect(res.body.recipe.tags[0].name).toBe('pasta');
  });

  it('should return 404 for non-existent recipe', async () => {
    const res = await request(app).get('/api/recipes/99999');
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/recipes/:id', () => {
  it('should update a recipe and replace category/tag associations', async () => {
    const cat1 = db.prepare("INSERT INTO categories (name) VALUES ('Italian')").run();
    const cat2 = db.prepare("INSERT INTO categories (name) VALUES ('Mexican')").run();
    const tag1 = db.prepare("INSERT INTO tags (name) VALUES ('pasta')").run();
    const tag2 = db.prepare("INSERT INTO tags (name) VALUES ('spicy')").run();

    const createRes = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        ...validRecipe,
        category_ids: [cat1.lastInsertRowid],
        tag_ids: [tag1.lastInsertRowid],
      });

    const recipeId = createRes.body.recipe.id;

    const res = await request(app)
      .put(`/api/recipes/${recipeId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        ...validRecipe,
        title: 'Updated Recipe',
        category_ids: [cat2.lastInsertRowid],
        tag_ids: [tag2.lastInsertRowid],
      });

    expect(res.status).toBe(200);
    expect(res.body.recipe.title).toBe('Updated Recipe');
    expect(res.body.recipe.categories).toHaveLength(1);
    expect(res.body.recipe.categories[0].name).toBe('Mexican');
    expect(res.body.recipe.tags).toHaveLength(1);
    expect(res.body.recipe.tags[0].name).toBe('spicy');
  });

  it('should return 404 for non-existent recipe', async () => {
    const res = await request(app)
      .put('/api/recipes/99999')
      .set('Authorization', `Bearer ${authToken}`)
      .send(validRecipe);

    expect(res.status).toBe(404);
  });

  it('should return 403 when updating another user\'s recipe', async () => {
    const createRes = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${authToken}`)
      .send(validRecipe);

    const recipeId = createRes.body.recipe.id;

    const otherUser = db.prepare(
      "INSERT INTO users (username, email, password_hash) VALUES ('other', 'other@example.com', 'hash')"
    ).run();
    const otherToken = jwt.sign({ id: otherUser.lastInsertRowid }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });

    const res = await request(app)
      .put(`/api/recipes/${recipeId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send(validRecipe);

    expect(res.status).toBe(403);
  });

  it('should clear associations when empty arrays are passed', async () => {
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

    const res = await request(app)
      .put(`/api/recipes/${recipeId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        ...validRecipe,
        category_ids: [],
        tag_ids: [],
      });

    expect(res.status).toBe(200);
    expect(res.body.recipe.categories).toEqual([]);
    expect(res.body.recipe.tags).toEqual([]);
  });
});

describe('DELETE /api/recipes/:id', () => {
  it('should delete a recipe and return 204', async () => {
    const createRes = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${authToken}`)
      .send(validRecipe);

    const recipeId = createRes.body.recipe.id;

    const res = await request(app)
      .delete(`/api/recipes/${recipeId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(204);

    const getRes = await request(app).get(`/api/recipes/${recipeId}`);
    expect(getRes.status).toBe(404);
  });
});
