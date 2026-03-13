const path = require('path');
const fs = require('fs');
const os = require('os');

describe('TICKET-008 QA — additional edge-case tests', () => {
  let tmpDir;
  let db;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-qa-'));
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
    ).run(`user${suffix}`, `user${suffix}@example.com`, 'hash');
    const recipe = db.prepare(
      'INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)'
    ).run(user.lastInsertRowid, `Recipe${suffix}`, 'ing', 'step');
    return { userId: user.lastInsertRowid, recipeId: recipe.lastInsertRowid };
  }

  describe('Schema — UNIQUE index verification', () => {
    test('categories.name has a UNIQUE index', () => {
      const indexes = db.pragma('index_list(categories)');
      const uniqueIndexes = indexes.filter(i => i.unique === 1);
      expect(uniqueIndexes.length).toBeGreaterThanOrEqual(1);
      // Verify the unique index covers the name column
      const indexInfo = db.pragma(`index_info(${uniqueIndexes[0].name})`);
      expect(indexInfo.map(c => c.name)).toContain('name');
    });

    test('tags.name has a UNIQUE index', () => {
      const indexes = db.pragma('index_list(tags)');
      const uniqueIndexes = indexes.filter(i => i.unique === 1);
      expect(uniqueIndexes.length).toBeGreaterThanOrEqual(1);
      const indexInfo = db.pragma(`index_info(${uniqueIndexes[0].name})`);
      expect(indexInfo.map(c => c.name)).toContain('name');
    });

    test('recipe_categories has composite primary key (recipe_id, category_id)', () => {
      const columns = db.pragma('table_info(recipe_categories)');
      const pkCols = columns.filter(c => c.pk > 0).map(c => c.name).sort();
      expect(pkCols).toEqual(['category_id', 'recipe_id']);
    });

    test('recipe_tags has composite primary key (recipe_id, tag_id)', () => {
      const columns = db.pragma('table_info(recipe_tags)');
      const pkCols = columns.filter(c => c.pk > 0).map(c => c.name).sort();
      expect(pkCols).toEqual(['recipe_id', 'tag_id']);
    });
  });

  describe('Schema — AUTOINCREMENT for categories and tags', () => {
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
  });

  describe('Junction table — composite PK prevents duplicates', () => {
    test('inserting duplicate recipe_categories pair throws', () => {
      const { recipeId } = createUserAndRecipe();
      const categoryModel = require('../src/models/category');
      const cat = categoryModel.createCategory('Dup');
      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.id);
      expect(() => {
        db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.id);
      }).toThrow();
    });

    test('inserting duplicate recipe_tags pair throws', () => {
      const { recipeId } = createUserAndRecipe();
      const tagModel = require('../src/models/tag');
      const tag = tagModel.createTag('dup');
      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);
      expect(() => {
        db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);
      }).toThrow();
    });
  });

  describe('Junction table — FK enforcement on insert', () => {
    test('recipe_categories rejects non-existent recipe_id', () => {
      const categoryModel = require('../src/models/category');
      const cat = categoryModel.createCategory('Valid');
      expect(() => {
        db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(9999, cat.id);
      }).toThrow();
    });

    test('recipe_categories rejects non-existent category_id', () => {
      const { recipeId } = createUserAndRecipe();
      expect(() => {
        db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, 9999);
      }).toThrow();
    });

    test('recipe_tags rejects non-existent recipe_id', () => {
      const tagModel = require('../src/models/tag');
      const tag = tagModel.createTag('valid');
      expect(() => {
        db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(9999, tag.id);
      }).toThrow();
    });

    test('recipe_tags rejects non-existent tag_id', () => {
      const { recipeId } = createUserAndRecipe();
      expect(() => {
        db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, 9999);
      }).toThrow();
    });
  });

  describe('Many-to-many — multiple recipes share categories and tags', () => {
    test('two recipes can share the same category', () => {
      const { recipeId: r1 } = createUserAndRecipe('1');
      const { recipeId: r2 } = createUserAndRecipe('2');
      const categoryModel = require('../src/models/category');
      const cat = categoryModel.createCategory('Shared');

      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(r1, cat.id);
      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(r2, cat.id);

      expect(categoryModel.getCategoriesByRecipeId(r1)).toHaveLength(1);
      expect(categoryModel.getCategoriesByRecipeId(r2)).toHaveLength(1);
      expect(categoryModel.getCategoriesByRecipeId(r1)[0].name).toBe('Shared');
      expect(categoryModel.getCategoriesByRecipeId(r2)[0].name).toBe('Shared');
    });

    test('two recipes can share the same tag', () => {
      const { recipeId: r1 } = createUserAndRecipe('a');
      const { recipeId: r2 } = createUserAndRecipe('b');
      const tagModel = require('../src/models/tag');
      const tag = tagModel.createTag('shared');

      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(r1, tag.id);
      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(r2, tag.id);

      expect(tagModel.getTagsByRecipeId(r1)).toHaveLength(1);
      expect(tagModel.getTagsByRecipeId(r2)).toHaveLength(1);
    });
  });

  describe('Cascade chain — user deletion cascades through recipes to junctions', () => {
    test('deleting a user removes recipe_categories junction rows via recipe cascade', () => {
      const { userId, recipeId } = createUserAndRecipe();
      const categoryModel = require('../src/models/category');
      const cat = categoryModel.createCategory('Chain');

      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.id);

      // Verify junction row exists
      let rows = db.prepare('SELECT * FROM recipe_categories WHERE recipe_id = ?').all(recipeId);
      expect(rows).toHaveLength(1);

      // Delete the user — should cascade: user -> recipes -> recipe_categories
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);

      rows = db.prepare('SELECT * FROM recipe_categories WHERE recipe_id = ?').all(recipeId);
      expect(rows).toHaveLength(0);

      // Category itself should still exist
      expect(categoryModel.getAllCategories()).toHaveLength(1);
    });

    test('deleting a user removes recipe_tags junction rows via recipe cascade', () => {
      const { userId, recipeId } = createUserAndRecipe();
      const tagModel = require('../src/models/tag');
      const tag = tagModel.createTag('chain');

      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);

      let rows = db.prepare('SELECT * FROM recipe_tags WHERE recipe_id = ?').all(recipeId);
      expect(rows).toHaveLength(1);

      db.prepare('DELETE FROM users WHERE id = ?').run(userId);

      rows = db.prepare('SELECT * FROM recipe_tags WHERE recipe_id = ?').all(recipeId);
      expect(rows).toHaveLength(0);

      // Tag itself should still exist
      expect(tagModel.getAllTags()).toHaveLength(1);
    });
  });

  describe('Model — error message quality', () => {
    test('createCategory duplicate error includes the name', () => {
      const categoryModel = require('../src/models/category');
      categoryModel.createCategory('Pizza');
      try {
        categoryModel.createCategory('Pizza');
        fail('Expected an error');
      } catch (err) {
        expect(err.message).toContain('Pizza');
        expect(err.message).toContain('already exists');
      }
    });

    test('createTag duplicate error includes the name', () => {
      const tagModel = require('../src/models/tag');
      tagModel.createTag('organic');
      try {
        tagModel.createTag('organic');
        fail('Expected an error');
      } catch (err) {
        expect(err.message).toContain('organic');
        expect(err.message).toContain('already exists');
      }
    });
  });

  describe('Model — return value shape', () => {
    test('createCategory returns object with exactly id and name', () => {
      const categoryModel = require('../src/models/category');
      const cat = categoryModel.createCategory('Shape');
      expect(Object.keys(cat).sort()).toEqual(['id', 'name']);
      expect(typeof cat.id).toBe('number');
      expect(typeof cat.name).toBe('string');
    });

    test('createTag returns object with exactly id and name', () => {
      const tagModel = require('../src/models/tag');
      const tag = tagModel.createTag('shape');
      expect(Object.keys(tag).sort()).toEqual(['id', 'name']);
      expect(typeof tag.id).toBe('number');
      expect(typeof tag.name).toBe('string');
    });

    test('getAllCategories returns array of objects with id and name', () => {
      const categoryModel = require('../src/models/category');
      categoryModel.createCategory('One');
      categoryModel.createCategory('Two');
      const all = categoryModel.getAllCategories();
      expect(Array.isArray(all)).toBe(true);
      for (const cat of all) {
        expect(cat).toHaveProperty('id');
        expect(cat).toHaveProperty('name');
      }
    });

    test('getAllTags returns array of objects with id and name', () => {
      const tagModel = require('../src/models/tag');
      tagModel.createTag('one');
      tagModel.createTag('two');
      const all = tagModel.getAllTags();
      expect(Array.isArray(all)).toBe(true);
      for (const tag of all) {
        expect(tag).toHaveProperty('id');
        expect(tag).toHaveProperty('name');
      }
    });

    test('getCategoriesByRecipeId returns objects with id and name only', () => {
      const { recipeId } = createUserAndRecipe();
      const categoryModel = require('../src/models/category');
      const cat = categoryModel.createCategory('Verify');
      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.id);

      const result = categoryModel.getCategoriesByRecipeId(recipeId);
      expect(result).toHaveLength(1);
      expect(Object.keys(result[0]).sort()).toEqual(['id', 'name']);
    });

    test('getTagsByRecipeId returns objects with id and name only', () => {
      const { recipeId } = createUserAndRecipe();
      const tagModel = require('../src/models/tag');
      const tag = tagModel.createTag('verify');
      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);

      const result = tagModel.getTagsByRecipeId(recipeId);
      expect(result).toHaveLength(1);
      expect(Object.keys(result[0]).sort()).toEqual(['id', 'name']);
    });
  });

  describe('Schema — all six tables exist on startup', () => {
    test('all expected tables are created', () => {
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      ).all().map(r => r.name);
      expect(tables).toContain('users');
      expect(tables).toContain('recipes');
      expect(tables).toContain('categories');
      expect(tables).toContain('tags');
      expect(tables).toContain('recipe_categories');
      expect(tables).toContain('recipe_tags');
    });
  });
});
