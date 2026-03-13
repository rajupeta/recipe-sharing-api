const path = require('path');
const fs = require('fs');
const os = require('os');

describe('Favorite model', () => {
  let tmpDir;
  let db;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-test-'));
    process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');
    jest.resetModules();

    db = require('../src/db/database');

    // Seed a user and a recipe
    db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)').run('alice', 'alice@test.com', 'hash1');
    db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)').run('bob', 'bob@test.com', 'hash2');
    db.prepare('INSERT INTO recipes (user_id, title, description, ingredients, steps, cook_time, servings) VALUES (?, ?, ?, ?, ?, ?, ?)').run(1, 'Pasta', 'Delicious pasta', 'pasta,sauce', 'boil,mix', 20, 2);
    db.prepare('INSERT INTO recipes (user_id, title, description, ingredients, steps, cook_time, servings) VALUES (?, ?, ?, ?, ?, ?, ?)').run(1, 'Salad', 'Fresh salad', 'lettuce,tomato', 'chop,mix', 10, 1);
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

  test('addFavorite creates a favorite and returns it', () => {
    const { addFavorite } = require('../src/models/favorite');
    const fav = addFavorite(1, 1);
    expect(fav).toBeDefined();
    expect(fav.user_id).toBe(1);
    expect(fav.recipe_id).toBe(1);
    expect(fav.id).toBeDefined();
    expect(fav.created_at).toBeDefined();
  });

  test('addFavorite enforces UNIQUE(user_id, recipe_id)', () => {
    const { addFavorite } = require('../src/models/favorite');
    addFavorite(1, 1);
    expect(() => addFavorite(1, 1)).toThrow();
  });

  test('addFavorite allows different users to favorite same recipe', () => {
    const { addFavorite } = require('../src/models/favorite');
    const fav1 = addFavorite(1, 1);
    const fav2 = addFavorite(2, 1);
    expect(fav1.id).not.toBe(fav2.id);
  });

  test('removeFavorite returns true when favorite exists', () => {
    const { addFavorite, removeFavorite } = require('../src/models/favorite');
    addFavorite(1, 1);
    const result = removeFavorite(1, 1);
    expect(result).toBe(true);
  });

  test('removeFavorite returns false when favorite does not exist', () => {
    const { removeFavorite } = require('../src/models/favorite');
    const result = removeFavorite(1, 999);
    expect(result).toBe(false);
  });

  test('getUserFavorites returns favorites with recipe details and total', () => {
    const { addFavorite, getUserFavorites } = require('../src/models/favorite');
    addFavorite(1, 1);
    addFavorite(1, 2);

    const result = getUserFavorites(1);
    expect(result.total).toBe(2);
    expect(result.favorites).toHaveLength(2);
    expect(result.favorites[0].title).toBeDefined();
    expect(result.favorites[0].description).toBeDefined();
    expect(result.favorites[0].ingredients).toBeDefined();
  });

  test('getUserFavorites supports pagination', () => {
    const { addFavorite, getUserFavorites } = require('../src/models/favorite');
    addFavorite(1, 1);
    addFavorite(1, 2);

    const page1 = getUserFavorites(1, { page: 1, limit: 1 });
    expect(page1.total).toBe(2);
    expect(page1.favorites).toHaveLength(1);

    const page2 = getUserFavorites(1, { page: 2, limit: 1 });
    expect(page2.favorites).toHaveLength(1);
    expect(page2.favorites[0].recipe_id).not.toBe(page1.favorites[0].recipe_id);
  });

  test('getUserFavorites returns empty for user with no favorites', () => {
    const { getUserFavorites } = require('../src/models/favorite');
    const result = getUserFavorites(2);
    expect(result.total).toBe(0);
    expect(result.favorites).toHaveLength(0);
  });

  test('isFavorited returns true when favorited', () => {
    const { addFavorite, isFavorited } = require('../src/models/favorite');
    addFavorite(1, 1);
    expect(isFavorited(1, 1)).toBe(true);
  });

  test('isFavorited returns false when not favorited', () => {
    const { isFavorited } = require('../src/models/favorite');
    expect(isFavorited(1, 1)).toBe(false);
  });

  test('ON DELETE CASCADE removes favorites when user is deleted', () => {
    const { addFavorite } = require('../src/models/favorite');
    addFavorite(1, 1);

    db.prepare('DELETE FROM users WHERE id = ?').run(1);
    const rows = db.prepare('SELECT * FROM favorites WHERE user_id = ?').all(1);
    expect(rows).toHaveLength(0);
  });

  test('ON DELETE CASCADE removes favorites when recipe is deleted', () => {
    const { addFavorite } = require('../src/models/favorite');
    addFavorite(1, 1);

    db.prepare('DELETE FROM recipes WHERE id = ?').run(1);
    const rows = db.prepare('SELECT * FROM favorites WHERE recipe_id = ?').all(1);
    expect(rows).toHaveLength(0);
  });
});
