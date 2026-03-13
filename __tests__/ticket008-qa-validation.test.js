/**
 * TICKET-008 QA Validation — Categories and Tags Database Schema and Models
 *
 * Systematic validation of all acceptance criteria:
 * 1. All four tables created on startup with correct constraints
 * 2. createCategory/createTag inserts and returns new rows
 * 3. Duplicate names throw appropriate errors
 * 4. getAllCategories/getAllTags return all rows
 * 5. getCategoriesByRecipeId/getTagsByRecipeId return correct associations via junction tables
 * 6. ON DELETE CASCADE works — deleting a recipe removes junction rows
 * 7. Tests verify all model functions and constraint behavior
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

describe('TICKET-008 QA Validation — Categories and Tags', () => {
  let tmpDir;
  let db;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-ticket008-'));
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

  function createUser(suffix = '') {
    const result = db.prepare(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
    ).run(`user${suffix}`, `user${suffix}@test.com`, 'hashedpw');
    return result.lastInsertRowid;
  }

  function createRecipe(userId, title = 'Test Recipe') {
    const result = db.prepare(
      'INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)'
    ).run(userId, title, '["flour","sugar"]', '["mix","bake"]');
    return result.lastInsertRowid;
  }

  // ── AC 1: All four tables created on startup with correct constraints ──

  describe('AC1: Table creation on startup', () => {
    test('categories table exists with id (PK, AUTOINCREMENT) and name (UNIQUE NOT NULL)', () => {
      const cols = db.pragma('table_info(categories)');
      expect(cols).toHaveLength(2);

      const idCol = cols.find(c => c.name === 'id');
      expect(idCol).toBeDefined();
      expect(idCol.type).toBe('INTEGER');
      expect(idCol.pk).toBe(1);

      const nameCol = cols.find(c => c.name === 'name');
      expect(nameCol).toBeDefined();
      expect(nameCol.type).toBe('TEXT');
      expect(nameCol.notnull).toBe(1);
    });

    test('tags table exists with id (PK, AUTOINCREMENT) and name (UNIQUE NOT NULL)', () => {
      const cols = db.pragma('table_info(tags)');
      expect(cols).toHaveLength(2);

      const idCol = cols.find(c => c.name === 'id');
      expect(idCol).toBeDefined();
      expect(idCol.type).toBe('INTEGER');
      expect(idCol.pk).toBe(1);

      const nameCol = cols.find(c => c.name === 'name');
      expect(nameCol).toBeDefined();
      expect(nameCol.type).toBe('TEXT');
      expect(nameCol.notnull).toBe(1);
    });

    test('recipe_categories junction table has correct columns and composite PK', () => {
      const cols = db.pragma('table_info(recipe_categories)');
      expect(cols).toHaveLength(2);

      const recipeIdCol = cols.find(c => c.name === 'recipe_id');
      expect(recipeIdCol).toBeDefined();
      expect(recipeIdCol.notnull).toBe(1);
      expect(recipeIdCol.pk).toBeGreaterThan(0); // part of composite PK

      const categoryIdCol = cols.find(c => c.name === 'category_id');
      expect(categoryIdCol).toBeDefined();
      expect(categoryIdCol.notnull).toBe(1);
      expect(categoryIdCol.pk).toBeGreaterThan(0);
    });

    test('recipe_tags junction table has correct columns and composite PK', () => {
      const cols = db.pragma('table_info(recipe_tags)');
      expect(cols).toHaveLength(2);

      const recipeIdCol = cols.find(c => c.name === 'recipe_id');
      expect(recipeIdCol).toBeDefined();
      expect(recipeIdCol.notnull).toBe(1);
      expect(recipeIdCol.pk).toBeGreaterThan(0);

      const tagIdCol = cols.find(c => c.name === 'tag_id');
      expect(tagIdCol).toBeDefined();
      expect(tagIdCol.notnull).toBe(1);
      expect(tagIdCol.pk).toBeGreaterThan(0);
    });

    test('recipe_categories has correct foreign keys with ON DELETE CASCADE', () => {
      const fkeys = db.pragma('foreign_key_list(recipe_categories)');
      expect(fkeys).toHaveLength(2);

      const recipeFk = fkeys.find(fk => fk.from === 'recipe_id');
      expect(recipeFk.table).toBe('recipes');
      expect(recipeFk.to).toBe('id');
      expect(recipeFk.on_delete).toBe('CASCADE');

      const categoryFk = fkeys.find(fk => fk.from === 'category_id');
      expect(categoryFk.table).toBe('categories');
      expect(categoryFk.to).toBe('id');
      expect(categoryFk.on_delete).toBe('CASCADE');
    });

    test('recipe_tags has correct foreign keys with ON DELETE CASCADE', () => {
      const fkeys = db.pragma('foreign_key_list(recipe_tags)');
      expect(fkeys).toHaveLength(2);

      const recipeFk = fkeys.find(fk => fk.from === 'recipe_id');
      expect(recipeFk.table).toBe('recipes');
      expect(recipeFk.to).toBe('id');
      expect(recipeFk.on_delete).toBe('CASCADE');

      const tagFk = fkeys.find(fk => fk.from === 'tag_id');
      expect(tagFk.table).toBe('tags');
      expect(tagFk.to).toBe('id');
      expect(tagFk.on_delete).toBe('CASCADE');
    });

    test('foreign keys are enforced (PRAGMA foreign_keys = ON)', () => {
      const fkStatus = db.pragma('foreign_keys');
      expect(fkStatus[0].foreign_keys).toBe(1);
    });
  });

  // ── AC 2: createCategory/createTag inserts and returns new rows ──

  describe('AC2: Create functions insert and return new rows', () => {
    test('createCategory returns object with id and name', () => {
      const categoryModel = require('../src/models/category');
      const cat = categoryModel.createCategory('Italian');
      expect(cat).toEqual({ id: expect.any(Number), name: 'Italian' });
      expect(cat.id).toBeGreaterThan(0);
    });

    test('createCategory actually persists the row in the database', () => {
      const categoryModel = require('../src/models/category');
      const cat = categoryModel.createCategory('Persisted');
      const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(cat.id);
      expect(row).toBeDefined();
      expect(row.name).toBe('Persisted');
    });

    test('createTag returns object with id and name', () => {
      const tagModel = require('../src/models/tag');
      const tag = tagModel.createTag('vegan');
      expect(tag).toEqual({ id: expect.any(Number), name: 'vegan' });
      expect(tag.id).toBeGreaterThan(0);
    });

    test('createTag actually persists the row in the database', () => {
      const tagModel = require('../src/models/tag');
      const tag = tagModel.createTag('persisted-tag');
      const row = db.prepare('SELECT * FROM tags WHERE id = ?').get(tag.id);
      expect(row).toBeDefined();
      expect(row.name).toBe('persisted-tag');
    });

    test('createCategory auto-increments ids', () => {
      const categoryModel = require('../src/models/category');
      const c1 = categoryModel.createCategory('First');
      const c2 = categoryModel.createCategory('Second');
      const c3 = categoryModel.createCategory('Third');
      expect(c2.id).toBeGreaterThan(c1.id);
      expect(c3.id).toBeGreaterThan(c2.id);
    });

    test('createTag auto-increments ids', () => {
      const tagModel = require('../src/models/tag');
      const t1 = tagModel.createTag('a');
      const t2 = tagModel.createTag('b');
      const t3 = tagModel.createTag('c');
      expect(t2.id).toBeGreaterThan(t1.id);
      expect(t3.id).toBeGreaterThan(t2.id);
    });
  });

  // ── AC 3: Duplicate names throw or return appropriate errors ──

  describe('AC3: Duplicate names throw descriptive errors', () => {
    test('createCategory throws descriptive error on duplicate name', () => {
      const categoryModel = require('../src/models/category');
      categoryModel.createCategory('Breakfast');
      expect(() => categoryModel.createCategory('Breakfast')).toThrow(
        /Category with name "Breakfast" already exists/
      );
    });

    test('createTag throws descriptive error on duplicate name', () => {
      const tagModel = require('../src/models/tag');
      tagModel.createTag('gluten-free');
      expect(() => tagModel.createTag('gluten-free')).toThrow(
        /Tag with name "gluten-free" already exists/
      );
    });

    test('duplicate category error does not corrupt state — original row still exists', () => {
      const categoryModel = require('../src/models/category');
      const original = categoryModel.createCategory('Original');
      try {
        categoryModel.createCategory('Original');
      } catch (e) {
        // expected
      }
      const all = categoryModel.getAllCategories();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe(original.id);
    });

    test('duplicate tag error does not corrupt state — original row still exists', () => {
      const tagModel = require('../src/models/tag');
      const original = tagModel.createTag('original');
      try {
        tagModel.createTag('original');
      } catch (e) {
        // expected
      }
      const all = tagModel.getAllTags();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe(original.id);
    });

    test('UNIQUE constraint is case-sensitive (SQLite default)', () => {
      const categoryModel = require('../src/models/category');
      const lower = categoryModel.createCategory('dessert');
      const upper = categoryModel.createCategory('Dessert');
      expect(lower.id).not.toBe(upper.id);
    });
  });

  // ── AC 4: getAllCategories/getAllTags return all rows ──

  describe('AC4: getAll functions return all rows', () => {
    test('getAllCategories returns empty array when no categories exist', () => {
      const categoryModel = require('../src/models/category');
      expect(categoryModel.getAllCategories()).toEqual([]);
    });

    test('getAllCategories returns all inserted categories', () => {
      const categoryModel = require('../src/models/category');
      categoryModel.createCategory('A');
      categoryModel.createCategory('B');
      categoryModel.createCategory('C');
      categoryModel.createCategory('D');
      const all = categoryModel.getAllCategories();
      expect(all).toHaveLength(4);
      expect(all.map(c => c.name)).toEqual(expect.arrayContaining(['A', 'B', 'C', 'D']));
    });

    test('getAllTags returns empty array when no tags exist', () => {
      const tagModel = require('../src/models/tag');
      expect(tagModel.getAllTags()).toEqual([]);
    });

    test('getAllTags returns all inserted tags', () => {
      const tagModel = require('../src/models/tag');
      tagModel.createTag('x');
      tagModel.createTag('y');
      tagModel.createTag('z');
      const all = tagModel.getAllTags();
      expect(all).toHaveLength(3);
      expect(all.map(t => t.name)).toEqual(expect.arrayContaining(['x', 'y', 'z']));
    });

    test('getAllCategories returns rows with correct shape', () => {
      const categoryModel = require('../src/models/category');
      categoryModel.createCategory('Test');
      const rows = categoryModel.getAllCategories();
      expect(rows[0]).toHaveProperty('id');
      expect(rows[0]).toHaveProperty('name');
      expect(typeof rows[0].id).toBe('number');
      expect(typeof rows[0].name).toBe('string');
    });

    test('getAllTags returns rows with correct shape', () => {
      const tagModel = require('../src/models/tag');
      tagModel.createTag('test');
      const rows = tagModel.getAllTags();
      expect(rows[0]).toHaveProperty('id');
      expect(rows[0]).toHaveProperty('name');
      expect(typeof rows[0].id).toBe('number');
      expect(typeof rows[0].name).toBe('string');
    });
  });

  // ── AC 5: getByRecipeId returns correct associations via junction tables ──

  describe('AC5: Junction table queries return correct associations', () => {
    test('getCategoriesByRecipeId returns categories linked to a recipe', () => {
      const categoryModel = require('../src/models/category');
      const userId = createUser();
      const recipeId = createRecipe(userId);

      const cat1 = categoryModel.createCategory('Italian');
      const cat2 = categoryModel.createCategory('Quick Meals');
      categoryModel.createCategory('Unlinked');

      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat1.id);
      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat2.id);

      const result = categoryModel.getCategoriesByRecipeId(recipeId);
      expect(result).toHaveLength(2);
      expect(result.map(c => c.name).sort()).toEqual(['Italian', 'Quick Meals']);
    });

    test('getTagsByRecipeId returns tags linked to a recipe', () => {
      const tagModel = require('../src/models/tag');
      const userId = createUser();
      const recipeId = createRecipe(userId);

      const tag1 = tagModel.createTag('spicy');
      const tag2 = tagModel.createTag('easy');
      tagModel.createTag('unlinked');

      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag1.id);
      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag2.id);

      const result = tagModel.getTagsByRecipeId(recipeId);
      expect(result).toHaveLength(2);
      expect(result.map(t => t.name).sort()).toEqual(['easy', 'spicy']);
    });

    test('getCategoriesByRecipeId returns empty for recipe with no categories', () => {
      const categoryModel = require('../src/models/category');
      const userId = createUser();
      const recipeId = createRecipe(userId);
      expect(categoryModel.getCategoriesByRecipeId(recipeId)).toEqual([]);
    });

    test('getTagsByRecipeId returns empty for recipe with no tags', () => {
      const tagModel = require('../src/models/tag');
      const userId = createUser();
      const recipeId = createRecipe(userId);
      expect(tagModel.getTagsByRecipeId(recipeId)).toEqual([]);
    });

    test('getCategoriesByRecipeId returns only id and name fields', () => {
      const categoryModel = require('../src/models/category');
      const userId = createUser();
      const recipeId = createRecipe(userId);
      const cat = categoryModel.createCategory('Check');
      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.id);

      const result = categoryModel.getCategoriesByRecipeId(recipeId);
      expect(Object.keys(result[0]).sort()).toEqual(['id', 'name']);
    });

    test('getTagsByRecipeId returns only id and name fields', () => {
      const tagModel = require('../src/models/tag');
      const userId = createUser();
      const recipeId = createRecipe(userId);
      const tag = tagModel.createTag('check');
      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);

      const result = tagModel.getTagsByRecipeId(recipeId);
      expect(Object.keys(result[0]).sort()).toEqual(['id', 'name']);
    });

    test('categories are not shared across recipes unless explicitly linked', () => {
      const categoryModel = require('../src/models/category');
      const userId = createUser();
      const recipe1 = createRecipe(userId, 'Recipe 1');
      const recipe2 = createRecipe(userId, 'Recipe 2');

      const sharedCat = categoryModel.createCategory('Shared');
      const r1Only = categoryModel.createCategory('Recipe1Only');

      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipe1, sharedCat.id);
      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipe1, r1Only.id);
      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipe2, sharedCat.id);

      expect(categoryModel.getCategoriesByRecipeId(recipe1)).toHaveLength(2);
      expect(categoryModel.getCategoriesByRecipeId(recipe2)).toHaveLength(1);
      expect(categoryModel.getCategoriesByRecipeId(recipe2)[0].name).toBe('Shared');
    });

    test('tags are not shared across recipes unless explicitly linked', () => {
      const tagModel = require('../src/models/tag');
      const userId = createUser();
      const recipe1 = createRecipe(userId, 'Recipe 1');
      const recipe2 = createRecipe(userId, 'Recipe 2');

      const sharedTag = tagModel.createTag('shared');
      const r1Only = tagModel.createTag('r1-only');

      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipe1, sharedTag.id);
      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipe1, r1Only.id);
      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipe2, sharedTag.id);

      expect(tagModel.getTagsByRecipeId(recipe1)).toHaveLength(2);
      expect(tagModel.getTagsByRecipeId(recipe2)).toHaveLength(1);
      expect(tagModel.getTagsByRecipeId(recipe2)[0].name).toBe('shared');
    });
  });

  // ── AC 6: ON DELETE CASCADE works ──

  describe('AC6: ON DELETE CASCADE removes junction rows', () => {
    test('deleting a recipe removes its recipe_categories rows', () => {
      const categoryModel = require('../src/models/category');
      const userId = createUser();
      const recipeId = createRecipe(userId);
      const cat = categoryModel.createCategory('CascadeTest');

      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.id);
      expect(db.prepare('SELECT COUNT(*) AS cnt FROM recipe_categories WHERE recipe_id = ?').get(recipeId).cnt).toBe(1);

      db.prepare('DELETE FROM recipes WHERE id = ?').run(recipeId);
      expect(db.prepare('SELECT COUNT(*) AS cnt FROM recipe_categories WHERE recipe_id = ?').get(recipeId).cnt).toBe(0);

      // The category itself should survive
      expect(categoryModel.getAllCategories()).toHaveLength(1);
    });

    test('deleting a recipe removes its recipe_tags rows', () => {
      const tagModel = require('../src/models/tag');
      const userId = createUser();
      const recipeId = createRecipe(userId);
      const tag = tagModel.createTag('cascade-test');

      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);
      expect(db.prepare('SELECT COUNT(*) AS cnt FROM recipe_tags WHERE recipe_id = ?').get(recipeId).cnt).toBe(1);

      db.prepare('DELETE FROM recipes WHERE id = ?').run(recipeId);
      expect(db.prepare('SELECT COUNT(*) AS cnt FROM recipe_tags WHERE recipe_id = ?').get(recipeId).cnt).toBe(0);

      // The tag itself should survive
      expect(tagModel.getAllTags()).toHaveLength(1);
    });

    test('deleting a category removes its recipe_categories rows', () => {
      const categoryModel = require('../src/models/category');
      const userId = createUser();
      const recipeId = createRecipe(userId);
      const cat = categoryModel.createCategory('WillBeDeleted');

      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.id);
      db.prepare('DELETE FROM categories WHERE id = ?').run(cat.id);
      expect(db.prepare('SELECT COUNT(*) AS cnt FROM recipe_categories WHERE category_id = ?').get(cat.id).cnt).toBe(0);
    });

    test('deleting a tag removes its recipe_tags rows', () => {
      const tagModel = require('../src/models/tag');
      const userId = createUser();
      const recipeId = createRecipe(userId);
      const tag = tagModel.createTag('will-be-deleted');

      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);
      db.prepare('DELETE FROM tags WHERE id = ?').run(tag.id);
      expect(db.prepare('SELECT COUNT(*) AS cnt FROM recipe_tags WHERE tag_id = ?').get(tag.id).cnt).toBe(0);
    });

    test('deleting a recipe with both categories and tags cleans up all junction rows', () => {
      const categoryModel = require('../src/models/category');
      const tagModel = require('../src/models/tag');
      const userId = createUser();
      const recipeId = createRecipe(userId);

      const cat1 = categoryModel.createCategory('Cat1');
      const cat2 = categoryModel.createCategory('Cat2');
      const tag1 = tagModel.createTag('tag1');
      const tag2 = tagModel.createTag('tag2');

      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat1.id);
      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat2.id);
      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag1.id);
      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag2.id);

      db.prepare('DELETE FROM recipes WHERE id = ?').run(recipeId);

      expect(db.prepare('SELECT COUNT(*) AS cnt FROM recipe_categories WHERE recipe_id = ?').get(recipeId).cnt).toBe(0);
      expect(db.prepare('SELECT COUNT(*) AS cnt FROM recipe_tags WHERE recipe_id = ?').get(recipeId).cnt).toBe(0);

      // Categories and tags themselves survive
      expect(categoryModel.getAllCategories()).toHaveLength(2);
      expect(tagModel.getAllTags()).toHaveLength(2);
    });

    test('cascade from user deletion propagates through recipes to junction rows', () => {
      const categoryModel = require('../src/models/category');
      const tagModel = require('../src/models/tag');
      const userId = createUser();
      const recipeId = createRecipe(userId);

      const cat = categoryModel.createCategory('UserCascade');
      const tag = tagModel.createTag('user-cascade');
      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.id);
      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);

      // Delete user → cascades to recipes → cascades to junction rows
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);

      expect(db.prepare('SELECT COUNT(*) AS cnt FROM recipes WHERE id = ?').get(recipeId).cnt).toBe(0);
      expect(db.prepare('SELECT COUNT(*) AS cnt FROM recipe_categories WHERE recipe_id = ?').get(recipeId).cnt).toBe(0);
      expect(db.prepare('SELECT COUNT(*) AS cnt FROM recipe_tags WHERE recipe_id = ?').get(recipeId).cnt).toBe(0);
    });
  });

  // ── AC 7: Additional constraint and model behavior tests ──

  describe('AC7: Constraint enforcement and model robustness', () => {
    test('recipe_categories rejects duplicate (recipe_id, category_id) pair', () => {
      const categoryModel = require('../src/models/category');
      const userId = createUser();
      const recipeId = createRecipe(userId);
      const cat = categoryModel.createCategory('NoDupes');

      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.id);
      expect(() => {
        db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.id);
      }).toThrow();
    });

    test('recipe_tags rejects duplicate (recipe_id, tag_id) pair', () => {
      const tagModel = require('../src/models/tag');
      const userId = createUser();
      const recipeId = createRecipe(userId);
      const tag = tagModel.createTag('no-dupes');

      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);
      expect(() => {
        db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);
      }).toThrow();
    });

    test('recipe_categories FK rejects non-existent recipe_id', () => {
      const categoryModel = require('../src/models/category');
      const cat = categoryModel.createCategory('OrphanCat');
      expect(() => {
        db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(99999, cat.id);
      }).toThrow();
    });

    test('recipe_tags FK rejects non-existent tag_id', () => {
      const userId = createUser();
      const recipeId = createRecipe(userId);
      expect(() => {
        db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, 99999);
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

    test('categories UNIQUE index verified via index_list pragma', () => {
      const indexes = db.pragma('index_list(categories)');
      const uniqueIndex = indexes.find(idx => idx.unique === 1);
      expect(uniqueIndex).toBeDefined();
    });

    test('tags UNIQUE index verified via index_list pragma', () => {
      const indexes = db.pragma('index_list(tags)');
      const uniqueIndex = indexes.find(idx => idx.unique === 1);
      expect(uniqueIndex).toBeDefined();
    });

    test('schema is idempotent — re-executing does not error or lose data', () => {
      const categoryModel = require('../src/models/category');
      const tagModel = require('../src/models/tag');
      categoryModel.createCategory('Survivor');
      tagModel.createTag('survivor');

      const schemaPath = path.join(__dirname, '..', 'src', 'db', 'schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf-8');
      expect(() => db.exec(schema)).not.toThrow();

      expect(categoryModel.getAllCategories()).toHaveLength(1);
      expect(tagModel.getAllTags()).toHaveLength(1);
    });

    test('createCategory with very long name succeeds', () => {
      const categoryModel = require('../src/models/category');
      const longName = 'A'.repeat(1000);
      const cat = categoryModel.createCategory(longName);
      expect(cat.name).toBe(longName);
      expect(cat.name).toHaveLength(1000);
    });

    test('createTag with very long name succeeds', () => {
      const tagModel = require('../src/models/tag');
      const longName = 'b'.repeat(1000);
      const tag = tagModel.createTag(longName);
      expect(tag.name).toBe(longName);
    });

    test('model modules export the expected functions', () => {
      const categoryModel = require('../src/models/category');
      const tagModel = require('../src/models/tag');

      expect(typeof categoryModel.getAllCategories).toBe('function');
      expect(typeof categoryModel.createCategory).toBe('function');
      expect(typeof categoryModel.getCategoriesByRecipeId).toBe('function');

      expect(typeof tagModel.getAllTags).toBe('function');
      expect(typeof tagModel.createTag).toBe('function');
      expect(typeof tagModel.getTagsByRecipeId).toBe('function');
    });
  });
});
