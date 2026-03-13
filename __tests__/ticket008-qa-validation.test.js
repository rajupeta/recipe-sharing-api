/**
 * TICKET-008 QA Validation — Categories and Tags Database Schema and Models
 *
 * Test-agent acceptance-criteria validation covering:
 * AC1: All four tables created on startup with correct constraints
 * AC2: createCategory/createTag inserts and returns new rows
 * AC3: Duplicate names throw appropriate errors
 * AC4: getAllCategories/getAllTags return all rows
 * AC5: getCategoriesByRecipeId/getTagsByRecipeId return correct associations via junction tables
 * AC6: ON DELETE CASCADE works — deleting a recipe removes junction rows
 * AC7: Edge cases — concurrent associations, large datasets, boundary inputs
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

describe('TICKET-008 QA Validation — Categories & Tags', () => {
  let tmpDir;
  let db;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-008-'));
    process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');
    jest.resetModules();
    db = require('../src/db/database');
  });

  afterEach(() => {
    if (db && db.open) db.close();
    try {
      for (const file of fs.readdirSync(tmpDir)) {
        fs.unlinkSync(path.join(tmpDir, file));
      }
      fs.rmdirSync(tmpDir);
    } catch (_) { /* cleanup best-effort */ }
  });

  function createUser(suffix = '') {
    return db.prepare(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
    ).run(`user${suffix}`, `user${suffix}@test.com`, 'hash123');
  }

  function createRecipe(userId, suffix = '') {
    return db.prepare(
      'INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)'
    ).run(userId, `Recipe${suffix}`, 'flour, eggs', 'mix and bake');
  }

  function createUserAndRecipe(suffix = '') {
    const user = createUser(suffix);
    const recipe = createRecipe(user.lastInsertRowid, suffix);
    return { userId: user.lastInsertRowid, recipeId: recipe.lastInsertRowid };
  }

  // ──────────────────────────────────────────────
  // AC1: All four tables created with correct constraints
  // ──────────────────────────────────────────────

  describe('AC1: Table creation and constraints', () => {
    test('all four new tables exist', () => {
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('categories','tags','recipe_categories','recipe_tags') ORDER BY name"
      ).all();
      expect(tables.map(t => t.name)).toEqual([
        'categories', 'recipe_categories', 'recipe_tags', 'tags'
      ]);
    });

    test('categories table: id is INTEGER PRIMARY KEY AUTOINCREMENT', () => {
      const cols = db.pragma('table_info(categories)');
      const id = cols.find(c => c.name === 'id');
      expect(id).toBeDefined();
      expect(id.type).toBe('INTEGER');
      expect(id.pk).toBe(1);
    });

    test('categories table: name is TEXT UNIQUE NOT NULL', () => {
      const cols = db.pragma('table_info(categories)');
      const name = cols.find(c => c.name === 'name');
      expect(name).toBeDefined();
      expect(name.type).toBe('TEXT');
      expect(name.notnull).toBe(1);

      // UNIQUE verified by attempting duplicate insert
      db.prepare('INSERT INTO categories (name) VALUES (?)').run('UniqueTest');
      expect(() => {
        db.prepare('INSERT INTO categories (name) VALUES (?)').run('UniqueTest');
      }).toThrow();
    });

    test('tags table: id is INTEGER PRIMARY KEY AUTOINCREMENT', () => {
      const cols = db.pragma('table_info(tags)');
      const id = cols.find(c => c.name === 'id');
      expect(id).toBeDefined();
      expect(id.type).toBe('INTEGER');
      expect(id.pk).toBe(1);
    });

    test('tags table: name is TEXT UNIQUE NOT NULL', () => {
      const cols = db.pragma('table_info(tags)');
      const name = cols.find(c => c.name === 'name');
      expect(name).toBeDefined();
      expect(name.type).toBe('TEXT');
      expect(name.notnull).toBe(1);

      db.prepare('INSERT INTO tags (name) VALUES (?)').run('UniqueTagTest');
      expect(() => {
        db.prepare('INSERT INTO tags (name) VALUES (?)').run('UniqueTagTest');
      }).toThrow();
    });

    test('recipe_categories: composite PK on (recipe_id, category_id)', () => {
      const cols = db.pragma('table_info(recipe_categories)');
      const pkCols = cols.filter(c => c.pk > 0).map(c => c.name).sort();
      expect(pkCols).toEqual(['category_id', 'recipe_id']);
    });

    test('recipe_categories: FK to recipes(id) with ON DELETE CASCADE', () => {
      const fks = db.pragma('foreign_key_list(recipe_categories)');
      const recipeFk = fks.find(fk => fk.from === 'recipe_id');
      expect(recipeFk).toBeDefined();
      expect(recipeFk.table).toBe('recipes');
      expect(recipeFk.to).toBe('id');
      expect(recipeFk.on_delete).toBe('CASCADE');
    });

    test('recipe_categories: FK to categories(id) with ON DELETE CASCADE', () => {
      const fks = db.pragma('foreign_key_list(recipe_categories)');
      const catFk = fks.find(fk => fk.from === 'category_id');
      expect(catFk).toBeDefined();
      expect(catFk.table).toBe('categories');
      expect(catFk.to).toBe('id');
      expect(catFk.on_delete).toBe('CASCADE');
    });

    test('recipe_tags: composite PK on (recipe_id, tag_id)', () => {
      const cols = db.pragma('table_info(recipe_tags)');
      const pkCols = cols.filter(c => c.pk > 0).map(c => c.name).sort();
      expect(pkCols).toEqual(['recipe_id', 'tag_id']);
    });

    test('recipe_tags: FK to recipes(id) with ON DELETE CASCADE', () => {
      const fks = db.pragma('foreign_key_list(recipe_tags)');
      const recipeFk = fks.find(fk => fk.from === 'recipe_id');
      expect(recipeFk).toBeDefined();
      expect(recipeFk.table).toBe('recipes');
      expect(recipeFk.to).toBe('id');
      expect(recipeFk.on_delete).toBe('CASCADE');
    });

    test('recipe_tags: FK to tags(id) with ON DELETE CASCADE', () => {
      const fks = db.pragma('foreign_key_list(recipe_tags)');
      const tagFk = fks.find(fk => fk.from === 'tag_id');
      expect(tagFk).toBeDefined();
      expect(tagFk.table).toBe('tags');
      expect(tagFk.to).toBe('id');
      expect(tagFk.on_delete).toBe('CASCADE');
    });

    test('foreign keys are enforced (pragma foreign_keys = ON)', () => {
      const fk = db.pragma('foreign_keys');
      expect(fk[0].foreign_keys).toBe(1);
    });
  });

  // ──────────────────────────────────────────────
  // AC2: createCategory/createTag inserts and returns new rows
  // ──────────────────────────────────────────────

  describe('AC2: Create functions return new rows', () => {
    test('createCategory returns object with numeric id and the given name', () => {
      const categoryModel = require('../src/models/category');
      const result = categoryModel.createCategory('Italian');
      expect(result).toEqual({ id: expect.any(Number), name: 'Italian' });
      expect(result.id).toBeGreaterThan(0);
    });

    test('createCategory persists row to database', () => {
      const categoryModel = require('../src/models/category');
      const result = categoryModel.createCategory('Mexican');
      const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.id);
      expect(row).toBeDefined();
      expect(row.name).toBe('Mexican');
    });

    test('createTag returns object with numeric id and the given name', () => {
      const tagModel = require('../src/models/tag');
      const result = tagModel.createTag('vegan');
      expect(result).toEqual({ id: expect.any(Number), name: 'vegan' });
      expect(result.id).toBeGreaterThan(0);
    });

    test('createTag persists row to database', () => {
      const tagModel = require('../src/models/tag');
      const result = tagModel.createTag('keto');
      const row = db.prepare('SELECT * FROM tags WHERE id = ?').get(result.id);
      expect(row).toBeDefined();
      expect(row.name).toBe('keto');
    });

    test('successive createCategory calls return incrementing ids', () => {
      const categoryModel = require('../src/models/category');
      const a = categoryModel.createCategory('A');
      const b = categoryModel.createCategory('B');
      expect(b.id).toBeGreaterThan(a.id);
    });

    test('successive createTag calls return incrementing ids', () => {
      const tagModel = require('../src/models/tag');
      const a = tagModel.createTag('a');
      const b = tagModel.createTag('b');
      expect(b.id).toBeGreaterThan(a.id);
    });
  });

  // ──────────────────────────────────────────────
  // AC3: Duplicate names throw descriptive errors
  // ──────────────────────────────────────────────

  describe('AC3: Duplicate name handling', () => {
    test('createCategory throws descriptive error on duplicate name', () => {
      const categoryModel = require('../src/models/category');
      categoryModel.createCategory('Breakfast');
      expect(() => categoryModel.createCategory('Breakfast'))
        .toThrow(/Category with name "Breakfast" already exists/);
    });

    test('createTag throws descriptive error on duplicate name', () => {
      const tagModel = require('../src/models/tag');
      tagModel.createTag('spicy');
      expect(() => tagModel.createTag('spicy'))
        .toThrow(/Tag with name "spicy" already exists/);
    });

    test('duplicate category error is an instance of Error', () => {
      const categoryModel = require('../src/models/category');
      categoryModel.createCategory('Dup');
      try {
        categoryModel.createCategory('Dup');
        fail('Expected an error');
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
      }
    });

    test('duplicate tag error is an instance of Error', () => {
      const tagModel = require('../src/models/tag');
      tagModel.createTag('dup');
      try {
        tagModel.createTag('dup');
        fail('Expected an error');
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
      }
    });

    test('category names are case-sensitive (SQLite default)', () => {
      const categoryModel = require('../src/models/category');
      const a = categoryModel.createCategory('Dessert');
      const b = categoryModel.createCategory('dessert');
      expect(a.id).not.toBe(b.id);
    });

    test('tag names are case-sensitive (SQLite default)', () => {
      const tagModel = require('../src/models/tag');
      const a = tagModel.createTag('Quick');
      const b = tagModel.createTag('quick');
      expect(a.id).not.toBe(b.id);
    });
  });

  // ──────────────────────────────────────────────
  // AC4: getAll returns all rows
  // ──────────────────────────────────────────────

  describe('AC4: getAll functions', () => {
    test('getAllCategories returns empty array when no categories', () => {
      const categoryModel = require('../src/models/category');
      expect(categoryModel.getAllCategories()).toEqual([]);
    });

    test('getAllCategories returns all inserted categories', () => {
      const categoryModel = require('../src/models/category');
      categoryModel.createCategory('A');
      categoryModel.createCategory('B');
      categoryModel.createCategory('C');
      const all = categoryModel.getAllCategories();
      expect(all).toHaveLength(3);
      expect(all.map(c => c.name)).toEqual(expect.arrayContaining(['A', 'B', 'C']));
    });

    test('getAllCategories rows have id and name properties', () => {
      const categoryModel = require('../src/models/category');
      categoryModel.createCategory('Test');
      const all = categoryModel.getAllCategories();
      expect(all[0]).toHaveProperty('id');
      expect(all[0]).toHaveProperty('name');
    });

    test('getAllTags returns empty array when no tags', () => {
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

    test('getAllTags rows have id and name properties', () => {
      const tagModel = require('../src/models/tag');
      tagModel.createTag('test');
      const all = tagModel.getAllTags();
      expect(all[0]).toHaveProperty('id');
      expect(all[0]).toHaveProperty('name');
    });
  });

  // ──────────────────────────────────────────────
  // AC5: Junction table queries return correct associations
  // ──────────────────────────────────────────────

  describe('AC5: Junction table association queries', () => {
    test('getCategoriesByRecipeId returns only categories linked to the recipe', () => {
      const categoryModel = require('../src/models/category');
      const { recipeId } = createUserAndRecipe('ac5cat');
      const linked = categoryModel.createCategory('Linked');
      categoryModel.createCategory('NotLinked');

      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)')
        .run(recipeId, linked.id);

      const result = categoryModel.getCategoriesByRecipeId(recipeId);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Linked');
      expect(result[0].id).toBe(linked.id);
    });

    test('getCategoriesByRecipeId returns multiple categories', () => {
      const categoryModel = require('../src/models/category');
      const { recipeId } = createUserAndRecipe('ac5multi');
      const cats = ['A', 'B', 'C'].map(n => categoryModel.createCategory(n));

      for (const cat of cats) {
        db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)')
          .run(recipeId, cat.id);
      }

      const result = categoryModel.getCategoriesByRecipeId(recipeId);
      expect(result).toHaveLength(3);
      expect(result.map(c => c.name).sort()).toEqual(['A', 'B', 'C']);
    });

    test('getCategoriesByRecipeId returns empty for unlinked recipe', () => {
      const categoryModel = require('../src/models/category');
      const { recipeId } = createUserAndRecipe('ac5empty');
      categoryModel.createCategory('Orphan');
      expect(categoryModel.getCategoriesByRecipeId(recipeId)).toEqual([]);
    });

    test('getTagsByRecipeId returns only tags linked to the recipe', () => {
      const tagModel = require('../src/models/tag');
      const { recipeId } = createUserAndRecipe('ac5tag');
      const linked = tagModel.createTag('linked-tag');
      tagModel.createTag('not-linked-tag');

      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)')
        .run(recipeId, linked.id);

      const result = tagModel.getTagsByRecipeId(recipeId);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('linked-tag');
      expect(result[0].id).toBe(linked.id);
    });

    test('getTagsByRecipeId returns multiple tags', () => {
      const tagModel = require('../src/models/tag');
      const { recipeId } = createUserAndRecipe('ac5multitag');
      const tags = ['x', 'y', 'z'].map(n => tagModel.createTag(n));

      for (const tag of tags) {
        db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)')
          .run(recipeId, tag.id);
      }

      const result = tagModel.getTagsByRecipeId(recipeId);
      expect(result).toHaveLength(3);
      expect(result.map(t => t.name).sort()).toEqual(['x', 'y', 'z']);
    });

    test('getTagsByRecipeId returns empty for unlinked recipe', () => {
      const tagModel = require('../src/models/tag');
      const { recipeId } = createUserAndRecipe('ac5emptytag');
      tagModel.createTag('orphan-tag');
      expect(tagModel.getTagsByRecipeId(recipeId)).toEqual([]);
    });

    test('different recipes have independent category associations', () => {
      const categoryModel = require('../src/models/category');
      const r1 = createUserAndRecipe('r1');
      const r2 = createUserAndRecipe('r2');

      const catA = categoryModel.createCategory('OnlyR1');
      const catB = categoryModel.createCategory('OnlyR2');
      const catC = categoryModel.createCategory('Both');

      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(r1.recipeId, catA.id);
      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(r1.recipeId, catC.id);
      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(r2.recipeId, catB.id);
      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(r2.recipeId, catC.id);

      const r1cats = categoryModel.getCategoriesByRecipeId(r1.recipeId);
      const r2cats = categoryModel.getCategoriesByRecipeId(r2.recipeId);

      expect(r1cats.map(c => c.name).sort()).toEqual(['Both', 'OnlyR1']);
      expect(r2cats.map(c => c.name).sort()).toEqual(['Both', 'OnlyR2']);
    });

    test('different recipes have independent tag associations', () => {
      const tagModel = require('../src/models/tag');
      const r1 = createUserAndRecipe('tr1');
      const r2 = createUserAndRecipe('tr2');

      const tagA = tagModel.createTag('only-r1');
      const tagB = tagModel.createTag('only-r2');
      const tagC = tagModel.createTag('both');

      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(r1.recipeId, tagA.id);
      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(r1.recipeId, tagC.id);
      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(r2.recipeId, tagB.id);
      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(r2.recipeId, tagC.id);

      const r1tags = tagModel.getTagsByRecipeId(r1.recipeId);
      const r2tags = tagModel.getTagsByRecipeId(r2.recipeId);

      expect(r1tags.map(t => t.name).sort()).toEqual(['both', 'only-r1']);
      expect(r2tags.map(t => t.name).sort()).toEqual(['both', 'only-r2']);
    });
  });

  // ──────────────────────────────────────────────
  // AC6: ON DELETE CASCADE
  // ──────────────────────────────────────────────

  describe('AC6: ON DELETE CASCADE', () => {
    test('deleting a recipe removes recipe_categories rows', () => {
      const categoryModel = require('../src/models/category');
      const { recipeId } = createUserAndRecipe('cas1');
      const cat = categoryModel.createCategory('CascadeCat');

      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.id);
      expect(db.prepare('SELECT COUNT(*) AS c FROM recipe_categories WHERE recipe_id = ?').get(recipeId).c).toBe(1);

      db.prepare('DELETE FROM recipes WHERE id = ?').run(recipeId);
      expect(db.prepare('SELECT COUNT(*) AS c FROM recipe_categories WHERE recipe_id = ?').get(recipeId).c).toBe(0);
    });

    test('deleting a recipe removes recipe_tags rows', () => {
      const tagModel = require('../src/models/tag');
      const { recipeId } = createUserAndRecipe('cas2');
      const tag = tagModel.createTag('cascade-tag');

      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);
      expect(db.prepare('SELECT COUNT(*) AS c FROM recipe_tags WHERE recipe_id = ?').get(recipeId).c).toBe(1);

      db.prepare('DELETE FROM recipes WHERE id = ?').run(recipeId);
      expect(db.prepare('SELECT COUNT(*) AS c FROM recipe_tags WHERE recipe_id = ?').get(recipeId).c).toBe(0);
    });

    test('deleting a category removes recipe_categories rows but recipe survives', () => {
      const categoryModel = require('../src/models/category');
      const { recipeId } = createUserAndRecipe('cas3');
      const cat = categoryModel.createCategory('WillBeDeleted');

      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.id);
      db.prepare('DELETE FROM categories WHERE id = ?').run(cat.id);

      expect(db.prepare('SELECT COUNT(*) AS c FROM recipe_categories').get().c).toBe(0);
      expect(db.prepare('SELECT * FROM recipes WHERE id = ?').get(recipeId)).toBeDefined();
    });

    test('deleting a tag removes recipe_tags rows but recipe survives', () => {
      const tagModel = require('../src/models/tag');
      const { recipeId } = createUserAndRecipe('cas4');
      const tag = tagModel.createTag('will-be-deleted');

      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);
      db.prepare('DELETE FROM tags WHERE id = ?').run(tag.id);

      expect(db.prepare('SELECT COUNT(*) AS c FROM recipe_tags').get().c).toBe(0);
      expect(db.prepare('SELECT * FROM recipes WHERE id = ?').get(recipeId)).toBeDefined();
    });

    test('deleting a recipe with both categories and tags cleans up all junction rows', () => {
      const categoryModel = require('../src/models/category');
      const tagModel = require('../src/models/tag');
      const { recipeId } = createUserAndRecipe('cas5');

      const cat = categoryModel.createCategory('Combo');
      const tag = tagModel.createTag('combo-tag');
      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.id);
      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);

      db.prepare('DELETE FROM recipes WHERE id = ?').run(recipeId);

      expect(db.prepare('SELECT COUNT(*) AS c FROM recipe_categories WHERE recipe_id = ?').get(recipeId).c).toBe(0);
      expect(db.prepare('SELECT COUNT(*) AS c FROM recipe_tags WHERE recipe_id = ?').get(recipeId).c).toBe(0);
      // The category and tag entities should still exist
      expect(categoryModel.getAllCategories()).toHaveLength(1);
      expect(tagModel.getAllTags()).toHaveLength(1);
    });

    test('user deletion cascades through recipe to junction rows', () => {
      const categoryModel = require('../src/models/category');
      const tagModel = require('../src/models/tag');
      const { userId, recipeId } = createUserAndRecipe('cas6');

      const cat = categoryModel.createCategory('UserCascade');
      const tag = tagModel.createTag('user-cascade');
      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.id);
      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);

      db.prepare('DELETE FROM users WHERE id = ?').run(userId);

      expect(db.prepare('SELECT * FROM recipes WHERE id = ?').get(recipeId)).toBeUndefined();
      expect(db.prepare('SELECT COUNT(*) AS c FROM recipe_categories WHERE recipe_id = ?').get(recipeId).c).toBe(0);
      expect(db.prepare('SELECT COUNT(*) AS c FROM recipe_tags WHERE recipe_id = ?').get(recipeId).c).toBe(0);
    });
  });

  // ──────────────────────────────────────────────
  // AC7: Edge cases and robustness
  // ──────────────────────────────────────────────

  describe('AC7: Edge cases', () => {
    test('getCategoriesByRecipeId with non-existent recipe returns empty array', () => {
      const categoryModel = require('../src/models/category');
      expect(categoryModel.getCategoriesByRecipeId(99999)).toEqual([]);
    });

    test('getTagsByRecipeId with non-existent recipe returns empty array', () => {
      const tagModel = require('../src/models/tag');
      expect(tagModel.getTagsByRecipeId(99999)).toEqual([]);
    });

    test('junction table FK rejects non-existent recipe_id for categories', () => {
      const categoryModel = require('../src/models/category');
      const cat = categoryModel.createCategory('Orphan');
      expect(() => {
        db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(9999, cat.id);
      }).toThrow();
    });

    test('junction table FK rejects non-existent category_id', () => {
      const { recipeId } = createUserAndRecipe('fk1');
      expect(() => {
        db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, 9999);
      }).toThrow();
    });

    test('junction table FK rejects non-existent recipe_id for tags', () => {
      const tagModel = require('../src/models/tag');
      const tag = tagModel.createTag('orphan');
      expect(() => {
        db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(9999, tag.id);
      }).toThrow();
    });

    test('junction table FK rejects non-existent tag_id', () => {
      const { recipeId } = createUserAndRecipe('fk2');
      expect(() => {
        db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, 9999);
      }).toThrow();
    });

    test('duplicate junction row (recipe_id, category_id) is rejected', () => {
      const categoryModel = require('../src/models/category');
      const { recipeId } = createUserAndRecipe('dup1');
      const cat = categoryModel.createCategory('DupJunction');
      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.id);
      expect(() => {
        db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.id);
      }).toThrow();
    });

    test('duplicate junction row (recipe_id, tag_id) is rejected', () => {
      const tagModel = require('../src/models/tag');
      const { recipeId } = createUserAndRecipe('dup2');
      const tag = tagModel.createTag('dup-junction');
      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);
      expect(() => {
        db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);
      }).toThrow();
    });

    test('category with very long name is accepted', () => {
      const categoryModel = require('../src/models/category');
      const longName = 'A'.repeat(1000);
      const cat = categoryModel.createCategory(longName);
      expect(cat.name).toBe(longName);
      expect(categoryModel.getAllCategories()[0].name).toBe(longName);
    });

    test('tag with very long name is accepted', () => {
      const tagModel = require('../src/models/tag');
      const longName = 'T'.repeat(1000);
      const tag = tagModel.createTag(longName);
      expect(tag.name).toBe(longName);
      expect(tagModel.getAllTags()[0].name).toBe(longName);
    });

    test('createCategory with unicode and emoji', () => {
      const categoryModel = require('../src/models/category');
      const cat = categoryModel.createCategory('日本料理 🍣');
      expect(cat.name).toBe('日本料理 🍣');
    });

    test('createTag with unicode and emoji', () => {
      const tagModel = require('../src/models/tag');
      const tag = tagModel.createTag('végétalien 🌱');
      expect(tag.name).toBe('végétalien 🌱');
    });

    test('schema is idempotent — re-executing does not error or lose data', () => {
      const categoryModel = require('../src/models/category');
      const tagModel = require('../src/models/tag');
      categoryModel.createCategory('Persist');
      tagModel.createTag('persist');

      const schemaPath = path.join(__dirname, '..', 'src', 'db', 'schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf-8');
      expect(() => db.exec(schema)).not.toThrow();

      expect(categoryModel.getAllCategories()).toHaveLength(1);
      expect(tagModel.getAllTags()).toHaveLength(1);
    });

    test('many categories on one recipe', () => {
      const categoryModel = require('../src/models/category');
      const { recipeId } = createUserAndRecipe('many');
      const count = 50;
      for (let i = 0; i < count; i++) {
        const cat = categoryModel.createCategory(`Cat${i}`);
        db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.id);
      }
      expect(categoryModel.getCategoriesByRecipeId(recipeId)).toHaveLength(count);
    });

    test('many tags on one recipe', () => {
      const tagModel = require('../src/models/tag');
      const { recipeId } = createUserAndRecipe('manytags');
      const count = 50;
      for (let i = 0; i < count; i++) {
        const tag = tagModel.createTag(`tag${i}`);
        db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);
      }
      expect(tagModel.getTagsByRecipeId(recipeId)).toHaveLength(count);
    });
  });

  // ──────────────────────────────────────────────
  // Module exports verification
  // ──────────────────────────────────────────────

  describe('Module exports', () => {
    test('category model exports getAllCategories, createCategory, getCategoriesByRecipeId', () => {
      const categoryModel = require('../src/models/category');
      expect(typeof categoryModel.getAllCategories).toBe('function');
      expect(typeof categoryModel.createCategory).toBe('function');
      expect(typeof categoryModel.getCategoriesByRecipeId).toBe('function');
    });

    test('tag model exports getAllTags, createTag, getTagsByRecipeId', () => {
      const tagModel = require('../src/models/tag');
      expect(typeof tagModel.getAllTags).toBe('function');
      expect(typeof tagModel.createTag).toBe('function');
      expect(typeof tagModel.getTagsByRecipeId).toBe('function');
    });
  });
});
