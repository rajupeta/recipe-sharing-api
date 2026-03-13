const path = require('path');
const fs = require('fs');
const os = require('os');

describe('Review model', () => {
  let tmpDir;
  let db;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-test-'));
    process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');
    jest.resetModules();

    db = require('../src/db/database');

    // Seed users and recipes
    db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)').run('alice', 'alice@test.com', 'hash1');
    db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)').run('bob', 'bob@test.com', 'hash2');
    db.prepare('INSERT INTO recipes (user_id, title, description, ingredients, steps, cook_time, servings) VALUES (?, ?, ?, ?, ?, ?, ?)').run(1, 'Pasta', 'Delicious pasta', 'pasta,sauce', 'boil,mix', 20, 2);
  });

  afterEach(() => {
    try {
      db.close();
      const files = fs.readdirSync(tmpDir);
      for (const file of files) {
        fs.unlinkSync(path.join(tmpDir, file));
      }
      fs.rmdirSync(tmpDir);
    } catch (e) { /* ignore */ }
  });

  test('createReview creates a review and returns it', () => {
    const { createReview } = require('../src/models/review');
    const review = createReview({ userId: 1, recipeId: 1, rating: 5, comment: 'Great!' });
    expect(review).toBeDefined();
    expect(review.user_id).toBe(1);
    expect(review.recipe_id).toBe(1);
    expect(review.rating).toBe(5);
    expect(review.comment).toBe('Great!');
    expect(review.id).toBeDefined();
    expect(review.created_at).toBeDefined();
  });

  test('createReview uses empty string as default comment', () => {
    const { createReview } = require('../src/models/review');
    const review = createReview({ userId: 1, recipeId: 1, rating: 3 });
    expect(review.comment).toBe('');
  });

  test('createReview enforces UNIQUE(user_id, recipe_id)', () => {
    const { createReview } = require('../src/models/review');
    createReview({ userId: 1, recipeId: 1, rating: 5 });
    expect(() => createReview({ userId: 1, recipeId: 1, rating: 3 })).toThrow();
  });

  test('createReview enforces CHECK(rating >= 1 AND rating <= 5)', () => {
    const { createReview } = require('../src/models/review');
    expect(() => createReview({ userId: 1, recipeId: 1, rating: 0 })).toThrow();
    expect(() => createReview({ userId: 1, recipeId: 1, rating: 6 })).toThrow();
  });

  test('createReview allows ratings 1 through 5', () => {
    const { createReview } = require('../src/models/review');
    // Need separate users for unique constraint — use same user different recipes
    db.prepare('INSERT INTO recipes (user_id, title, description, ingredients, steps) VALUES (?, ?, ?, ?, ?)').run(1, 'R2', 'd', 'i', 's');
    db.prepare('INSERT INTO recipes (user_id, title, description, ingredients, steps) VALUES (?, ?, ?, ?, ?)').run(1, 'R3', 'd', 'i', 's');
    db.prepare('INSERT INTO recipes (user_id, title, description, ingredients, steps) VALUES (?, ?, ?, ?, ?)').run(1, 'R4', 'd', 'i', 's');
    db.prepare('INSERT INTO recipes (user_id, title, description, ingredients, steps) VALUES (?, ?, ?, ?, ?)').run(1, 'R5', 'd', 'i', 's');

    expect(() => createReview({ userId: 1, recipeId: 1, rating: 1 })).not.toThrow();
    expect(() => createReview({ userId: 1, recipeId: 2, rating: 2 })).not.toThrow();
    expect(() => createReview({ userId: 1, recipeId: 3, rating: 3 })).not.toThrow();
    expect(() => createReview({ userId: 1, recipeId: 4, rating: 4 })).not.toThrow();
    expect(() => createReview({ userId: 1, recipeId: 5, rating: 5 })).not.toThrow();
  });

  test('getRecipeReviews returns reviews with reviewer username and total', () => {
    const { createReview, getRecipeReviews } = require('../src/models/review');
    createReview({ userId: 1, recipeId: 1, rating: 5, comment: 'Excellent' });
    createReview({ userId: 2, recipeId: 1, rating: 4, comment: 'Good' });

    const result = getRecipeReviews(1);
    expect(result.total).toBe(2);
    expect(result.reviews).toHaveLength(2);
    expect(result.reviews[0].username).toBeDefined();
    expect(['alice', 'bob']).toContain(result.reviews[0].username);
  });

  test('getRecipeReviews supports pagination', () => {
    const { createReview, getRecipeReviews } = require('../src/models/review');
    createReview({ userId: 1, recipeId: 1, rating: 5 });
    createReview({ userId: 2, recipeId: 1, rating: 4 });

    const page1 = getRecipeReviews(1, { page: 1, limit: 1 });
    expect(page1.total).toBe(2);
    expect(page1.reviews).toHaveLength(1);

    const page2 = getRecipeReviews(1, { page: 2, limit: 1 });
    expect(page2.reviews).toHaveLength(1);
    expect(page2.reviews[0].user_id).not.toBe(page1.reviews[0].user_id);
  });

  test('getRecipeReviews returns empty for recipe with no reviews', () => {
    const { getRecipeReviews } = require('../src/models/review');
    const result = getRecipeReviews(999);
    expect(result.total).toBe(0);
    expect(result.reviews).toHaveLength(0);
  });

  test('getAverageRating computes correct average', () => {
    const { createReview, getAverageRating } = require('../src/models/review');
    createReview({ userId: 1, recipeId: 1, rating: 5 });
    createReview({ userId: 2, recipeId: 1, rating: 3 });

    const avg = getAverageRating(1);
    expect(avg).toBe(4);
  });

  test('getAverageRating returns null for recipe with no reviews', () => {
    const { getAverageRating } = require('../src/models/review');
    const avg = getAverageRating(999);
    expect(avg).toBeNull();
  });

  test('ON DELETE CASCADE removes reviews when user is deleted', () => {
    const { createReview } = require('../src/models/review');
    createReview({ userId: 1, recipeId: 1, rating: 5 });

    db.prepare('DELETE FROM users WHERE id = ?').run(1);
    const rows = db.prepare('SELECT * FROM reviews WHERE user_id = ?').all(1);
    expect(rows).toHaveLength(0);
  });

  test('ON DELETE CASCADE removes reviews when recipe is deleted', () => {
    const { createReview } = require('../src/models/review');
    createReview({ userId: 1, recipeId: 1, rating: 5 });

    db.prepare('DELETE FROM recipes WHERE id = ?').run(1);
    const rows = db.prepare('SELECT * FROM reviews WHERE recipe_id = ?').all(1);
    expect(rows).toHaveLength(0);
  });
});
