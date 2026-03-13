const path = require('path');
const fs = require('fs');
const os = require('os');

describe('TICKET-008 QA — edge cases and additional coverage', () => {
  let tmpDir;
  let db;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-test-008-'));
    process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');
    jest.resetModules();
    db = require('../src/db/database');
  });

  afterEach(() => {
    db.close();
    try {
      for (const file of fs.readdirSync(tmpDir)) {
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
    ).run(`user${suffix}`, `user${suffix}@test.com`, 'hash');
    const recipe = db.prepare(
      'INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)'
    ).run(user.lastInsertRowid, `Recipe${suffix}`, 'ing', 'steps');
    return { userId: user.lastInsertRowid, recipeId: recipe.lastInsertRowid };
  }

  describe('Schema constraints', () => {
    test('categories.name UNIQUE constraint prevents duplicates at SQL level', () => {
      db.prepare('INSERT INTO categories (name) VALUES (?)').run('Unique');
      expect(() => {
        db.prepare('INSERT INTO categories (name) VALUES (?)').run('Unique');
      }).toThrow();
    });

    test('tags.name UNIQUE constraint prevents duplicates at SQL level', () => {
      db.prepare('INSERT INTO tags (name) VALUES (?)').run('Unique');
      expect(() => {
        db.prepare('INSERT INTO tags (name) VALUES (?)').run('Unique');
      }).toThrow();
    });

    test('categories.name NOT NULL rejects null', () => {
      expect(() => {
        db.prepare('INSERT INTO categories (name) VALUES (?)').run(null);
      }).toThrow();
    });

    test('tags.name NOT NULL rejects null', () => {
      expect(() => {
        db.prepare('INSERT INTO tags (name) VALUES (?)').run(null);
      }).toThrow();
    });

    test('recipe_categories composite primary key prevents duplicate associations', () => {
      const { recipeId } = createUserAndRecipe();
      const cat = db.prepare('INSERT INTO categories (name) VALUES (?)').run('Cat1');
      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.lastInsertRowid);
      expect(() => {
        db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.lastInsertRowid);
      }).toThrow();
    });

    test('recipe_tags composite primary key prevents duplicate associations', () => {
      const { recipeId } = createUserAndRecipe();
      const tag = db.prepare('INSERT INTO tags (name) VALUES (?)').run('Tag1');
      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.lastInsertRowid);
      expect(() => {
        db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.lastInsertRowid);
      }).toThrow();
    });

    test('recipe_categories FK rejects non-existent recipe_id', () => {
      const cat = db.prepare('INSERT INTO categories (name) VALUES (?)').run('Orphan');
      expect(() => {
        db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(9999, cat.lastInsertRowid);
      }).toThrow();
    });

    test('recipe_categories FK rejects non-existent category_id', () => {
      const { recipeId } = createUserAndRecipe();
      expect(() => {
        db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, 9999);
      }).toThrow();
    });

    test('recipe_tags FK rejects non-existent recipe_id', () => {
      const tag = db.prepare('INSERT INTO tags (name) VALUES (?)').run('OrphanTag');
      expect(() => {
        db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(9999, tag.lastInsertRowid);
      }).toThrow();
    });

    test('recipe_tags FK rejects non-existent tag_id', () => {
      const { recipeId } = createUserAndRecipe();
      expect(() => {
        db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, 9999);
      }).toThrow();
    });
  });

  describe('Category model — edge cases', () => {
    let categoryModel;

    beforeEach(() => {
      categoryModel = require('../src/models/category');
    });

    test('createCategory returns correct id type (number)', () => {
      const cat = categoryModel.createCategory('TestId');
      expect(typeof cat.id).toBe('number');
      expect(cat.id).toBeGreaterThan(0);
    });

    test('createCategory with empty string still inserts (name is NOT NULL but empty is allowed)', () => {
      const cat = categoryModel.createCategory('');
      expect(cat).toEqual({ id: expect.any(Number), name: '' });
    });

    test('createCategory with special characters', () => {
      const cat = categoryModel.createCategory("Aunt's Favorites & More <html>");
      expect(cat.name).toBe("Aunt's Favorites & More <html>");
    });

    test('createCategory with unicode characters', () => {
      const cat = categoryModel.createCategory('日本料理');
      expect(cat.name).toBe('日本料理');
    });

    test('getAllCategories returns rows with id and name fields', () => {
      categoryModel.createCategory('First');
      const all = categoryModel.getAllCategories();
      expect(all[0]).toHaveProperty('id');
      expect(all[0]).toHaveProperty('name');
    });

    test('getCategoriesByRecipeId with non-existent recipe returns empty array', () => {
      expect(categoryModel.getCategoriesByRecipeId(99999)).toEqual([]);
    });

    test('multiple recipes can share the same category', () => {
      const r1 = createUserAndRecipe('a');
      const r2 = createUserAndRecipe('b');
      const cat = categoryModel.createCategory('Shared');
      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(r1.recipeId, cat.id);
      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(r2.recipeId, cat.id);

      expect(categoryModel.getCategoriesByRecipeId(r1.recipeId)).toHaveLength(1);
      expect(categoryModel.getCategoriesByRecipeId(r2.recipeId)).toHaveLength(1);
    });
  });

  describe('Tag model — edge cases', () => {
    let tagModel;

    beforeEach(() => {
      tagModel = require('../src/models/tag');
    });

    test('createTag returns correct id type (number)', () => {
      const tag = tagModel.createTag('TestId');
      expect(typeof tag.id).toBe('number');
      expect(tag.id).toBeGreaterThan(0);
    });

    test('createTag with special characters', () => {
      const tag = tagModel.createTag("low-carb & high-fiber");
      expect(tag.name).toBe("low-carb & high-fiber");
    });

    test('createTag with unicode characters', () => {
      const tag = tagModel.createTag('végétalien');
      expect(tag.name).toBe('végétalien');
    });

    test('getTagsByRecipeId with non-existent recipe returns empty array', () => {
      expect(tagModel.getTagsByRecipeId(99999)).toEqual([]);
    });

    test('multiple recipes can share the same tag', () => {
      const r1 = createUserAndRecipe('x');
      const r2 = createUserAndRecipe('y');
      const tag = tagModel.createTag('shared-tag');
      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(r1.recipeId, tag.id);
      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(r2.recipeId, tag.id);

      expect(tagModel.getTagsByRecipeId(r1.recipeId)).toHaveLength(1);
      expect(tagModel.getTagsByRecipeId(r2.recipeId)).toHaveLength(1);
    });
  });

  describe('ON DELETE CASCADE — additional coverage', () => {
    test('deleting a recipe with both categories AND tags cleans up all junction rows', () => {
      const { recipeId } = createUserAndRecipe();
      const categoryModel = require('../src/models/category');
      const tagModel = require('../src/models/tag');

      const cat = categoryModel.createCategory('Mixed');
      const tag = tagModel.createTag('mixed-tag');

      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.id);
      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);

      db.prepare('DELETE FROM recipes WHERE id = ?').run(recipeId);

      expect(db.prepare('SELECT * FROM recipe_categories WHERE recipe_id = ?').all(recipeId)).toHaveLength(0);
      expect(db.prepare('SELECT * FROM recipe_tags WHERE recipe_id = ?').all(recipeId)).toHaveLength(0);
      // category and tag themselves should still exist
      expect(categoryModel.getAllCategories()).toHaveLength(1);
      expect(tagModel.getAllTags()).toHaveLength(1);
    });

    test('deleting a user cascades through recipes and cleans up junction rows', () => {
      const { userId, recipeId } = createUserAndRecipe();
      const categoryModel = require('../src/models/category');
      const tagModel = require('../src/models/tag');

      const cat = categoryModel.createCategory('Cascade');
      const tag = tagModel.createTag('cascade-tag');

      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.id);
      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);

      // Delete the user — should cascade: user → recipe → junction rows
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);

      expect(db.prepare('SELECT * FROM recipes WHERE id = ?').all(recipeId)).toHaveLength(0);
      expect(db.prepare('SELECT * FROM recipe_categories WHERE recipe_id = ?').all(recipeId)).toHaveLength(0);
      expect(db.prepare('SELECT * FROM recipe_tags WHERE recipe_id = ?').all(recipeId)).toHaveLength(0);
    });
  });

  describe('Schema idempotency for new tables', () => {
    test('re-executing schema does not error and preserves existing data', () => {
      const categoryModel = require('../src/models/category');
      categoryModel.createCategory('Persist');

      const schemaPath = path.join(__dirname, '..', 'src', 'db', 'schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf-8');
      expect(() => db.exec(schema)).not.toThrow();

      expect(categoryModel.getAllCategories()).toHaveLength(1);
      expect(categoryModel.getAllCategories()[0].name).toBe('Persist');
    });
  });
});
