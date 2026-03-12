const path = require('path');
const fs = require('fs');
const os = require('os');

describe('Categories and Tags', () => {
  let tmpDir;
  let db;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-test-'));
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

  // Helper to create a user and recipe for junction table tests
  function createUserAndRecipe() {
    const user = db.prepare(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
    ).run('testuser', 'test@example.com', 'hash');
    const recipe = db.prepare(
      'INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)'
    ).run(user.lastInsertRowid, 'Test Recipe', 'ing', 'step');
    return { userId: user.lastInsertRowid, recipeId: recipe.lastInsertRowid };
  }

  describe('Schema — table creation', () => {
    test('creates categories table with correct columns', () => {
      const columns = db.pragma('table_info(categories)');
      const names = columns.map(c => c.name);
      expect(names).toEqual(['id', 'name']);

      const idCol = columns.find(c => c.name === 'id');
      expect(idCol.pk).toBe(1);

      const nameCol = columns.find(c => c.name === 'name');
      expect(nameCol.notnull).toBe(1);
    });

    test('creates tags table with correct columns', () => {
      const columns = db.pragma('table_info(tags)');
      const names = columns.map(c => c.name);
      expect(names).toEqual(['id', 'name']);

      const idCol = columns.find(c => c.name === 'id');
      expect(idCol.pk).toBe(1);

      const nameCol = columns.find(c => c.name === 'name');
      expect(nameCol.notnull).toBe(1);
    });

    test('creates recipe_categories junction table with correct foreign keys', () => {
      const fkeys = db.pragma('foreign_key_list(recipe_categories)');
      expect(fkeys.length).toBe(2);

      const recipeFk = fkeys.find(fk => fk.from === 'recipe_id');
      expect(recipeFk.table).toBe('recipes');
      expect(recipeFk.to).toBe('id');
      expect(recipeFk.on_delete).toBe('CASCADE');

      const categoryFk = fkeys.find(fk => fk.from === 'category_id');
      expect(categoryFk.table).toBe('categories');
      expect(categoryFk.to).toBe('id');
      expect(categoryFk.on_delete).toBe('CASCADE');
    });

    test('creates recipe_tags junction table with correct foreign keys', () => {
      const fkeys = db.pragma('foreign_key_list(recipe_tags)');
      expect(fkeys.length).toBe(2);

      const recipeFk = fkeys.find(fk => fk.from === 'recipe_id');
      expect(recipeFk.table).toBe('recipes');
      expect(recipeFk.to).toBe('id');
      expect(recipeFk.on_delete).toBe('CASCADE');

      const tagFk = fkeys.find(fk => fk.from === 'tag_id');
      expect(tagFk.table).toBe('tags');
      expect(tagFk.to).toBe('id');
      expect(tagFk.on_delete).toBe('CASCADE');
    });
  });

  describe('Category model', () => {
    let categoryModel;

    beforeEach(() => {
      categoryModel = require('../src/models/category');
    });

    test('createCategory inserts and returns a new category', () => {
      const cat = categoryModel.createCategory('Desserts');
      expect(cat).toEqual({ id: expect.any(Number), name: 'Desserts' });
    });

    test('createCategory throws on duplicate name', () => {
      categoryModel.createCategory('Breakfast');
      expect(() => categoryModel.createCategory('Breakfast')).toThrow(
        'Category with name "Breakfast" already exists'
      );
    });

    test('getAllCategories returns all rows', () => {
      categoryModel.createCategory('A');
      categoryModel.createCategory('B');
      categoryModel.createCategory('C');
      const all = categoryModel.getAllCategories();
      expect(all).toHaveLength(3);
      expect(all.map(c => c.name)).toEqual(['A', 'B', 'C']);
    });

    test('getAllCategories returns empty array when none exist', () => {
      expect(categoryModel.getAllCategories()).toEqual([]);
    });

    test('getCategoriesByRecipeId returns categories for a recipe via junction table', () => {
      const { recipeId } = createUserAndRecipe();
      const cat1 = categoryModel.createCategory('Italian');
      const cat2 = categoryModel.createCategory('Quick Meals');
      categoryModel.createCategory('Unrelated');

      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat1.id);
      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat2.id);

      const result = categoryModel.getCategoriesByRecipeId(recipeId);
      expect(result).toHaveLength(2);
      expect(result.map(c => c.name).sort()).toEqual(['Italian', 'Quick Meals']);
    });

    test('getCategoriesByRecipeId returns empty array for recipe with no categories', () => {
      const { recipeId } = createUserAndRecipe();
      expect(categoryModel.getCategoriesByRecipeId(recipeId)).toEqual([]);
    });
  });

  describe('Tag model', () => {
    let tagModel;

    beforeEach(() => {
      tagModel = require('../src/models/tag');
    });

    test('createTag inserts and returns a new tag', () => {
      const tag = tagModel.createTag('vegan');
      expect(tag).toEqual({ id: expect.any(Number), name: 'vegan' });
    });

    test('createTag throws on duplicate name', () => {
      tagModel.createTag('gluten-free');
      expect(() => tagModel.createTag('gluten-free')).toThrow(
        'Tag with name "gluten-free" already exists'
      );
    });

    test('getAllTags returns all rows', () => {
      tagModel.createTag('x');
      tagModel.createTag('y');
      const all = tagModel.getAllTags();
      expect(all).toHaveLength(2);
      expect(all.map(t => t.name)).toEqual(['x', 'y']);
    });

    test('getAllTags returns empty array when none exist', () => {
      expect(tagModel.getAllTags()).toEqual([]);
    });

    test('getTagsByRecipeId returns tags for a recipe via junction table', () => {
      const { recipeId } = createUserAndRecipe();
      const tag1 = tagModel.createTag('spicy');
      const tag2 = tagModel.createTag('easy');
      tagModel.createTag('unused');

      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag1.id);
      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag2.id);

      const result = tagModel.getTagsByRecipeId(recipeId);
      expect(result).toHaveLength(2);
      expect(result.map(t => t.name).sort()).toEqual(['easy', 'spicy']);
    });

    test('getTagsByRecipeId returns empty array for recipe with no tags', () => {
      const { recipeId } = createUserAndRecipe();
      expect(tagModel.getTagsByRecipeId(recipeId)).toEqual([]);
    });
  });

  describe('ON DELETE CASCADE', () => {
    test('deleting a recipe removes its recipe_categories junction rows', () => {
      const { recipeId } = createUserAndRecipe();
      const categoryModel = require('../src/models/category');
      const cat = categoryModel.createCategory('ToDelete');

      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.id);
      let rows = db.prepare('SELECT * FROM recipe_categories WHERE recipe_id = ?').all(recipeId);
      expect(rows).toHaveLength(1);

      db.prepare('DELETE FROM recipes WHERE id = ?').run(recipeId);
      rows = db.prepare('SELECT * FROM recipe_categories WHERE recipe_id = ?').all(recipeId);
      expect(rows).toHaveLength(0);
    });

    test('deleting a recipe removes its recipe_tags junction rows', () => {
      const { recipeId } = createUserAndRecipe();
      const tagModel = require('../src/models/tag');
      const tag = tagModel.createTag('to-delete');

      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);
      let rows = db.prepare('SELECT * FROM recipe_tags WHERE recipe_id = ?').all(recipeId);
      expect(rows).toHaveLength(1);

      db.prepare('DELETE FROM recipes WHERE id = ?').run(recipeId);
      rows = db.prepare('SELECT * FROM recipe_tags WHERE recipe_id = ?').all(recipeId);
      expect(rows).toHaveLength(0);
    });

    test('deleting a category removes its recipe_categories junction rows', () => {
      const { recipeId } = createUserAndRecipe();
      const categoryModel = require('../src/models/category');
      const cat = categoryModel.createCategory('Temporary');

      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.id);
      db.prepare('DELETE FROM categories WHERE id = ?').run(cat.id);

      const rows = db.prepare('SELECT * FROM recipe_categories WHERE category_id = ?').all(cat.id);
      expect(rows).toHaveLength(0);
    });

    test('deleting a tag removes its recipe_tags junction rows', () => {
      const { recipeId } = createUserAndRecipe();
      const tagModel = require('../src/models/tag');
      const tag = tagModel.createTag('temp');

      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);
      db.prepare('DELETE FROM tags WHERE id = ?').run(tag.id);

      const rows = db.prepare('SELECT * FROM recipe_tags WHERE tag_id = ?').all(tag.id);
      expect(rows).toHaveLength(0);
    });
  });
});
