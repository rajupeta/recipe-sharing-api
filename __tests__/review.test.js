const path = require('path');
const fs = require('fs');
const os = require('os');

describe('Review model', () => {
  let db;
  let review;
  let userId;
  let userId2;
  let recipeId;

  beforeEach(() => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-rev-test-'));
    process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');
    jest.resetModules();

    db = require('../src/db/database');
    review = require('../src/models/review');

    // Seed users and a recipe
    const u1 = db.prepare(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
    ).run('reviewer1', 'rev1@example.com', 'hash1');
    userId = u1.lastInsertRowid;

    const u2 = db.prepare(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
    ).run('reviewer2', 'rev2@example.com', 'hash2');
    userId2 = u2.lastInsertRowid;

    const r = db.prepare(
      'INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)'
    ).run(userId, 'Test Recipe', 'ing', 'step');
    recipeId = r.lastInsertRowid;
  });

  afterEach(() => {
    if (db && db.open) db.close();
  });

  test('createReview creates a review and returns it', () => {
    const rev = review.createReview({ userId, recipeId, rating: 4, comment: 'Great!' });
    expect(rev).toBeDefined();
    expect(rev.user_id).toBe(userId);
    expect(rev.recipe_id).toBe(recipeId);
    expect(rev.rating).toBe(4);
    expect(rev.comment).toBe('Great!');
    expect(rev.id).toBeDefined();
    expect(rev.created_at).toBeDefined();
  });

  test('createReview defaults comment to empty string', () => {
    const rev = review.createReview({ userId, recipeId, rating: 3 });
    expect(rev.comment).toBe('');
  });

  test('createReview enforces UNIQUE(user_id, recipe_id)', () => {
    review.createReview({ userId, recipeId, rating: 5 });
    expect(() => {
      review.createReview({ userId, recipeId, rating: 3 });
    }).toThrow();
  });

  test('CHECK constraint rejects rating below 1', () => {
    expect(() => {
      review.createReview({ userId, recipeId, rating: 0 });
    }).toThrow();
  });

  test('CHECK constraint rejects rating above 5', () => {
    expect(() => {
      review.createReview({ userId, recipeId, rating: 6 });
    }).toThrow();
  });

  test('CHECK constraint allows ratings 1 through 5', () => {
    for (let rating = 1; rating <= 5; rating++) {
      jest.resetModules();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-rev-rating-'));
      process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');

      const freshDb = require('../src/db/database');
      const freshReview = require('../src/models/review');

      const u = freshDb.prepare(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
      ).run(`user${rating}`, `u${rating}@example.com`, 'hash');
      const r = freshDb.prepare(
        'INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)'
      ).run(u.lastInsertRowid, 'Recipe', 'ing', 'step');

      const rev = freshReview.createReview({
        userId: u.lastInsertRowid,
        recipeId: r.lastInsertRowid,
        rating
      });
      expect(rev.rating).toBe(rating);
      freshDb.close();
    }
  });

  test('getRecipeReviews returns reviews with reviewer username and total', () => {
    review.createReview({ userId, recipeId, rating: 5, comment: 'Amazing' });
    review.createReview({ userId: userId2, recipeId, rating: 3, comment: 'OK' });

    const result = review.getRecipeReviews(recipeId);
    expect(result.total).toBe(2);
    expect(result.reviews).toHaveLength(2);
    expect(result.reviews[0].username).toBeDefined();
    expect(['reviewer1', 'reviewer2']).toContain(result.reviews[0].username);
  });

  test('getRecipeReviews supports pagination', () => {
    review.createReview({ userId, recipeId, rating: 5 });
    review.createReview({ userId: userId2, recipeId, rating: 3 });

    const page1 = review.getRecipeReviews(recipeId, { page: 1, limit: 1 });
    expect(page1.total).toBe(2);
    expect(page1.reviews).toHaveLength(1);

    const page2 = review.getRecipeReviews(recipeId, { page: 2, limit: 1 });
    expect(page2.reviews).toHaveLength(1);
    expect(page2.reviews[0].user_id).not.toBe(page1.reviews[0].user_id);
  });

  test('getRecipeReviews returns empty for recipe with no reviews', () => {
    const result = review.getRecipeReviews(recipeId);
    expect(result.total).toBe(0);
    expect(result.reviews).toHaveLength(0);
  });

  test('getAverageRating computes correct average', () => {
    review.createReview({ userId, recipeId, rating: 5 });
    review.createReview({ userId: userId2, recipeId, rating: 3 });

    const avg = review.getAverageRating(recipeId);
    expect(avg).toBe(4);
  });

  test('getAverageRating returns null for recipe with no reviews', () => {
    const avg = review.getAverageRating(recipeId);
    expect(avg).toBeNull();
  });

  test('ON DELETE CASCADE removes reviews when user is deleted', () => {
    review.createReview({ userId, recipeId, rating: 4 });
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    const count = db.prepare('SELECT COUNT(*) as c FROM reviews').get().c;
    expect(count).toBe(0);
  });

  test('ON DELETE CASCADE removes reviews when recipe is deleted', () => {
    review.createReview({ userId, recipeId, rating: 4 });
    db.prepare('DELETE FROM recipes WHERE id = ?').run(recipeId);

    const count = db.prepare('SELECT COUNT(*) as c FROM reviews').get().c;
    expect(count).toBe(0);
  });
});
