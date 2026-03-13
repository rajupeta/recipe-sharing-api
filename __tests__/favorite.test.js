const path = require('path');
const fs = require('fs');
const os = require('os');

describe('Favorite model', () => {
  let db;
  let favorite;
  let userId;
  let recipeId;
  let recipeId2;

  beforeEach(() => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-fav-test-'));
    process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');
    jest.resetModules();

    db = require('../src/db/database');
    favorite = require('../src/models/favorite');

    // Seed a user and recipes
    const userResult = db.prepare(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
    ).run('testuser', 'test@example.com', 'hash123');
    userId = userResult.lastInsertRowid;

    const r1 = db.prepare(
      'INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)'
    ).run(userId, 'Recipe One', 'ing1', 'step1');
    recipeId = r1.lastInsertRowid;

    const r2 = db.prepare(
      'INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)'
    ).run(userId, 'Recipe Two', 'ing2', 'step2');
    recipeId2 = r2.lastInsertRowid;
  });

  afterEach(() => {
    if (db && db.open) db.close();
  });

  test('addFavorite creates a favorite and returns it', () => {
    const fav = favorite.addFavorite(userId, recipeId);
    expect(fav).toBeDefined();
    expect(fav.user_id).toBe(userId);
    expect(fav.recipe_id).toBe(recipeId);
    expect(fav.id).toBeDefined();
    expect(fav.created_at).toBeDefined();
  });

  test('addFavorite enforces UNIQUE(user_id, recipe_id)', () => {
    favorite.addFavorite(userId, recipeId);
    expect(() => {
      favorite.addFavorite(userId, recipeId);
    }).toThrow();
  });

  test('removeFavorite returns true when favorite exists', () => {
    favorite.addFavorite(userId, recipeId);
    const result = favorite.removeFavorite(userId, recipeId);
    expect(result).toBe(true);
  });

  test('removeFavorite returns false when favorite does not exist', () => {
    const result = favorite.removeFavorite(userId, recipeId);
    expect(result).toBe(false);
  });

  test('removeFavorite actually removes the favorite', () => {
    favorite.addFavorite(userId, recipeId);
    favorite.removeFavorite(userId, recipeId);
    expect(favorite.isFavorited(userId, recipeId)).toBe(false);
  });

  test('isFavorited returns true when favorited', () => {
    favorite.addFavorite(userId, recipeId);
    expect(favorite.isFavorited(userId, recipeId)).toBe(true);
  });

  test('isFavorited returns false when not favorited', () => {
    expect(favorite.isFavorited(userId, recipeId)).toBe(false);
  });

  test('getUserFavorites returns favorites with recipe details and total', () => {
    favorite.addFavorite(userId, recipeId);
    favorite.addFavorite(userId, recipeId2);

    const result = favorite.getUserFavorites(userId);
    expect(result.total).toBe(2);
    expect(result.favorites).toHaveLength(2);
    expect(result.favorites[0].title).toBeDefined();
    expect(result.favorites[0].ingredients).toBeDefined();
  });

  test('getUserFavorites supports pagination', () => {
    favorite.addFavorite(userId, recipeId);
    favorite.addFavorite(userId, recipeId2);

    const page1 = favorite.getUserFavorites(userId, { page: 1, limit: 1 });
    expect(page1.total).toBe(2);
    expect(page1.favorites).toHaveLength(1);

    const page2 = favorite.getUserFavorites(userId, { page: 2, limit: 1 });
    expect(page2.favorites).toHaveLength(1);
    expect(page2.favorites[0].recipe_id).not.toBe(page1.favorites[0].recipe_id);
  });

  test('getUserFavorites returns empty for user with no favorites', () => {
    const result = favorite.getUserFavorites(userId);
    expect(result.total).toBe(0);
    expect(result.favorites).toHaveLength(0);
  });

  test('ON DELETE CASCADE removes favorites when user is deleted', () => {
    favorite.addFavorite(userId, recipeId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    const count = db.prepare('SELECT COUNT(*) as c FROM favorites').get().c;
    expect(count).toBe(0);
  });

  test('ON DELETE CASCADE removes favorites when recipe is deleted', () => {
    favorite.addFavorite(userId, recipeId);
    db.prepare('DELETE FROM recipes WHERE id = ?').run(recipeId);

    const count = db.prepare('SELECT COUNT(*) as c FROM favorites').get().c;
    expect(count).toBe(0);
  });
});
