const path = require('path');
const fs = require('fs');
const os = require('os');

describe('Categories and Tags — edge cases', () => {
  let tmpDir;
  let db;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-edge-'));
    process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');
    jest.resetModules();
    db = require('../src/db/database');
  });

  afterEach(() => {
    db.close();
    try {
      const files = fs.readdirSync(tmpDir);
      for (const file of files) {
        fs.unlinkSync(path.join(tmpDir, file));
      }
      fs.rmdirSync(tmpDir);
    } catch (e) {
      // ignore cleanup errors
    }
  });

  function createUserAndRecipe(suffix = '') {
    const user = db.prepare(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
    ).run('testuser' + suffix, 'test' + suffix + '@example.com', 'hash');
    const recipe = db.prepare(
      'INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)'
    ).run(user.lastInsertRowid, 'Recipe' + suffix, 'ing', 'step');
    return { userId: user.lastInsertRowid, recipeId: recipe.lastInsertRowid };
  }

  describe('Junction table constraints', () => {
    test('recipe_categories composite PK rejects duplicate (recipe_id, category_id) pair', () => {
      const { recipeId } = createUserAndRecipe();
      const categoryModel = require('../src/models/category');
      const cat = categoryModel.createCategory('Italian');

      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.id);
      expect(() => {
        db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.id);
      }).toThrow();
    });

    test('recipe_tags composite PK rejects duplicate (recipe_id, tag_id) pair', () => {
      const { recipeId } = createUserAndRecipe();
      const tagModel = require('../src/models/tag');
      const tag = tagModel.createTag('vegan');

      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);
      expect(() => {
        db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);
      }).toThrow();
    });

    test('recipe_categories FK rejects non-existent recipe_id', () => {
      const categoryModel = require('../src/models/category');
      const cat = categoryModel.createCategory('Orphan');

      expect(() => {
        db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(9999, cat.id);
      }).toThrow();
    });

    test('recipe_categories FK rejects non-existent category_id', () => {
      const { recipeId } = createUserAndRecipe();

      expect(() => {
        db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, 9999);
      }).toThrow();
    });

    test('recipe_tags FK rejects non-existent recipe_id', () => {
      const tagModel = require('../src/models/tag');
      const tag = tagModel.createTag('orphan-tag');

      expect(() => {
        db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(9999, tag.id);
      }).toThrow();
    });

    test('recipe_tags FK rejects non-existent tag_id', () => {
      const { recipeId } = createUserAndRecipe();

      expect(() => {
        db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, 9999);
      }).toThrow();
    });
  });

  describe('Model edge cases', () => {
    test('createCategory with empty string name still inserts (NOT NULL satisfied)', () => {
      const categoryModel = require('../src/models/category');
      const cat = categoryModel.createCategory('');
      expect(cat).toEqual({ id: expect.any(Number), name: '' });
    });

    test('createTag with empty string name still inserts (NOT NULL satisfied)', () => {
      const tagModel = require('../src/models/tag');
      const tag = tagModel.createTag('');
      expect(tag).toEqual({ id: expect.any(Number), name: '' });
    });

    test('categories.id auto-increments', () => {
      const categoryModel = require('../src/models/category');
      const c1 = categoryModel.createCategory('First');
      const c2 = categoryModel.createCategory('Second');
      expect(c2.id).toBeGreaterThan(c1.id);
    });

    test('tags.id auto-increments', () => {
      const tagModel = require('../src/models/tag');
      const t1 = tagModel.createTag('first');
      const t2 = tagModel.createTag('second');
      expect(t2.id).toBeGreaterThan(t1.id);
    });

    test('getCategoriesByRecipeId only returns categories for the specified recipe', () => {
      const { recipeId: recipe1 } = createUserAndRecipe('1');
      const { recipeId: recipe2 } = createUserAndRecipe('2');
      const categoryModel = require('../src/models/category');

      const shared = categoryModel.createCategory('Shared');
      const onlyR1 = categoryModel.createCategory('OnlyRecipe1');
      const onlyR2 = categoryModel.createCategory('OnlyRecipe2');

      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipe1, shared.id);
      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipe1, onlyR1.id);
      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipe2, shared.id);
      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipe2, onlyR2.id);

      const r1Cats = categoryModel.getCategoriesByRecipeId(recipe1);
      expect(r1Cats).toHaveLength(2);
      expect(r1Cats.map(c => c.name).sort()).toEqual(['OnlyRecipe1', 'Shared']);

      const r2Cats = categoryModel.getCategoriesByRecipeId(recipe2);
      expect(r2Cats).toHaveLength(2);
      expect(r2Cats.map(c => c.name).sort()).toEqual(['OnlyRecipe2', 'Shared']);
    });

    test('getTagsByRecipeId only returns tags for the specified recipe', () => {
      const { recipeId: recipe1 } = createUserAndRecipe('a');
      const { recipeId: recipe2 } = createUserAndRecipe('b');
      const tagModel = require('../src/models/tag');

      const shared = tagModel.createTag('shared');
      const onlyR1 = tagModel.createTag('only-r1');
      const onlyR2 = tagModel.createTag('only-r2');

      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipe1, shared.id);
      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipe1, onlyR1.id);
      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipe2, shared.id);
      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipe2, onlyR2.id);

      const r1Tags = tagModel.getTagsByRecipeId(recipe1);
      expect(r1Tags).toHaveLength(2);
      expect(r1Tags.map(t => t.name).sort()).toEqual(['only-r1', 'shared']);

      const r2Tags = tagModel.getTagsByRecipeId(recipe2);
      expect(r2Tags).toHaveLength(2);
      expect(r2Tags.map(t => t.name).sort()).toEqual(['only-r2', 'shared']);
    });

    test('getCategoriesByRecipeId returns id and name fields', () => {
      const { recipeId } = createUserAndRecipe();
      const categoryModel = require('../src/models/category');
      const cat = categoryModel.createCategory('TestCat');
      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.id);

      const result = categoryModel.getCategoriesByRecipeId(recipeId);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('name');
      expect(Object.keys(result[0])).toHaveLength(2);
    });

    test('getTagsByRecipeId returns id and name fields', () => {
      const { recipeId } = createUserAndRecipe();
      const tagModel = require('../src/models/tag');
      const tag = tagModel.createTag('test-tag');
      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);

      const result = tagModel.getTagsByRecipeId(recipeId);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('name');
      expect(Object.keys(result[0])).toHaveLength(2);
    });
  });

  describe('ON DELETE CASCADE — user deletion cascades through recipes to junction tables', () => {
    test('deleting a user cascades through recipes to remove recipe_categories', () => {
      const { userId, recipeId } = createUserAndRecipe();
      const categoryModel = require('../src/models/category');
      const cat = categoryModel.createCategory('CascadeTest');
      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.id);

      // Delete the user — should cascade to recipes — should cascade to recipe_categories
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);

      const recipes = db.prepare('SELECT * FROM recipes WHERE user_id = ?').all(userId);
      expect(recipes).toHaveLength(0);

      const junctionRows = db.prepare('SELECT * FROM recipe_categories WHERE recipe_id = ?').all(recipeId);
      expect(junctionRows).toHaveLength(0);

      // Category itself should still exist
      const cats = categoryModel.getAllCategories();
      expect(cats).toHaveLength(1);
    });

    test('deleting a user cascades through recipes to remove recipe_tags', () => {
      const { userId, recipeId } = createUserAndRecipe();
      const tagModel = require('../src/models/tag');
      const tag = tagModel.createTag('cascade-tag');
      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);

      db.prepare('DELETE FROM users WHERE id = ?').run(userId);

      const junctionRows = db.prepare('SELECT * FROM recipe_tags WHERE recipe_id = ?').all(recipeId);
      expect(junctionRows).toHaveLength(0);

      // Tag itself should still exist
      const tags = tagModel.getAllTags();
      expect(tags).toHaveLength(1);
    });
  });
});
