/**
 * TICKET-008: Categories and Tags — Final QA Validation
 *
 * Validates all acceptance criteria:
 * 1. All four tables created with correct constraints
 * 2. createCategory/createTag insert and return new rows
 * 3. Duplicate names throw appropriate errors
 * 4. getAllCategories/getAllTags return all rows
 * 5. getCategoriesByRecipeId/getTagsByRecipeId return correct associations
 * 6. ON DELETE CASCADE removes junction rows when recipe is deleted
 * 7. All model functions and constraint behavior tested
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

let db;
const TEST_DB_PATH = path.join(__dirname, '..', 'data', `test-final-qa-${process.pid}.db`);

beforeAll(() => {
  process.env.DATABASE_PATH = TEST_DB_PATH;
  // Clear module cache to get fresh db instance
  Object.keys(require.cache).forEach(key => {
    if (key.includes('database') || key.includes('category') || key.includes('tag') || key.includes('schema')) {
      delete require.cache[key];
    }
  });
  db = require('../src/db/database');
});

afterAll(() => {
  if (db && db.open) {
    db.close();
  }
  try { fs.unlinkSync(TEST_DB_PATH); } catch (e) { /* ignore */ }
  try { fs.unlinkSync(TEST_DB_PATH + '-wal'); } catch (e) { /* ignore */ }
  try { fs.unlinkSync(TEST_DB_PATH + '-shm'); } catch (e) { /* ignore */ }
});

// Helper: create a user and recipe for junction table tests
function createTestUser(username = 'testuser') {
  const stmt = db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)');
  const result = stmt.run(username, `${username}@test.com`, 'hash123');
  return result.lastInsertRowid;
}

function createTestRecipe(userId, title = 'Test Recipe') {
  const stmt = db.prepare('INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)');
  const result = stmt.run(userId, title, '["flour"]', '["mix"]');
  return result.lastInsertRowid;
}

// =====================
// AC1: Table Creation
// =====================
describe('AC1: All four tables created on startup with correct constraints', () => {
  test('categories table exists with correct columns', () => {
    const info = db.prepare("PRAGMA table_info(categories)").all();
    const columns = info.map(c => c.name);
    expect(columns).toContain('id');
    expect(columns).toContain('name');

    const idCol = info.find(c => c.name === 'id');
    expect(idCol.pk).toBe(1);

    const nameCol = info.find(c => c.name === 'name');
    expect(nameCol.notnull).toBe(1);
  });

  test('tags table exists with correct columns', () => {
    const info = db.prepare("PRAGMA table_info(tags)").all();
    const columns = info.map(c => c.name);
    expect(columns).toContain('id');
    expect(columns).toContain('name');

    const nameCol = info.find(c => c.name === 'name');
    expect(nameCol.notnull).toBe(1);
  });

  test('recipe_categories junction table exists with correct columns', () => {
    const info = db.prepare("PRAGMA table_info(recipe_categories)").all();
    const columns = info.map(c => c.name);
    expect(columns).toContain('recipe_id');
    expect(columns).toContain('category_id');
  });

  test('recipe_tags junction table exists with correct columns', () => {
    const info = db.prepare("PRAGMA table_info(recipe_tags)").all();
    const columns = info.map(c => c.name);
    expect(columns).toContain('recipe_id');
    expect(columns).toContain('tag_id');
  });

  test('categories.name has UNIQUE constraint', () => {
    const indexes = db.prepare("PRAGMA index_list(categories)").all();
    const uniqueIndexes = indexes.filter(i => i.unique === 1);
    expect(uniqueIndexes.length).toBeGreaterThan(0);
  });

  test('tags.name has UNIQUE constraint', () => {
    const indexes = db.prepare("PRAGMA index_list(tags)").all();
    const uniqueIndexes = indexes.filter(i => i.unique === 1);
    expect(uniqueIndexes.length).toBeGreaterThan(0);
  });

  test('recipe_categories has composite primary key', () => {
    const info = db.prepare("PRAGMA table_info(recipe_categories)").all();
    const pkCols = info.filter(c => c.pk > 0).map(c => c.name);
    expect(pkCols).toContain('recipe_id');
    expect(pkCols).toContain('category_id');
  });

  test('recipe_tags has composite primary key', () => {
    const info = db.prepare("PRAGMA table_info(recipe_tags)").all();
    const pkCols = info.filter(c => c.pk > 0).map(c => c.name);
    expect(pkCols).toContain('recipe_id');
    expect(pkCols).toContain('tag_id');
  });

  test('foreign keys are enabled', () => {
    const fkStatus = db.prepare("PRAGMA foreign_keys").get();
    expect(fkStatus.foreign_keys).toBe(1);
  });

  test('recipe_categories has foreign key to recipes', () => {
    const fks = db.prepare("PRAGMA foreign_key_list(recipe_categories)").all();
    const recipeFK = fks.find(fk => fk.table === 'recipes');
    expect(recipeFK).toBeDefined();
    expect(recipeFK.from).toBe('recipe_id');
    expect(recipeFK.to).toBe('id');
  });

  test('recipe_categories has foreign key to categories', () => {
    const fks = db.prepare("PRAGMA foreign_key_list(recipe_categories)").all();
    const catFK = fks.find(fk => fk.table === 'categories');
    expect(catFK).toBeDefined();
    expect(catFK.from).toBe('category_id');
    expect(catFK.to).toBe('id');
  });

  test('recipe_tags has foreign key to tags', () => {
    const fks = db.prepare("PRAGMA foreign_key_list(recipe_tags)").all();
    const tagFK = fks.find(fk => fk.table === 'tags');
    expect(tagFK).toBeDefined();
    expect(tagFK.from).toBe('tag_id');
    expect(tagFK.to).toBe('id');
  });
});

// =====================
// AC2: createCategory/createTag
// =====================
describe('AC2: createCategory/createTag insert and return new rows', () => {
  let categoryModel, tagModel;

  beforeAll(() => {
    Object.keys(require.cache).forEach(key => {
      if (key.includes('category') || key.includes('tag')) {
        delete require.cache[key];
      }
    });
    categoryModel = require('../src/models/category');
    tagModel = require('../src/models/tag');
  });

  test('createCategory returns object with id and name', () => {
    const cat = categoryModel.createCategory('Italian');
    expect(cat).toHaveProperty('id');
    expect(cat).toHaveProperty('name', 'Italian');
    expect(typeof cat.id).toBe('number');
    expect(cat.id).toBeGreaterThan(0);
  });

  test('createTag returns object with id and name', () => {
    const tag = tagModel.createTag('quick');
    expect(tag).toHaveProperty('id');
    expect(tag).toHaveProperty('name', 'quick');
    expect(typeof tag.id).toBe('number');
    expect(tag.id).toBeGreaterThan(0);
  });

  test('created category is persisted in database', () => {
    const cat = categoryModel.createCategory('Mexican');
    const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(cat.id);
    expect(row).toBeDefined();
    expect(row.name).toBe('Mexican');
  });

  test('created tag is persisted in database', () => {
    const tag = tagModel.createTag('healthy');
    const row = db.prepare('SELECT * FROM tags WHERE id = ?').get(tag.id);
    expect(row).toBeDefined();
    expect(row.name).toBe('healthy');
  });

  test('multiple categories get unique auto-incrementing IDs', () => {
    const cat1 = categoryModel.createCategory('Thai');
    const cat2 = categoryModel.createCategory('French');
    expect(cat2.id).toBeGreaterThan(cat1.id);
  });

  test('multiple tags get unique auto-incrementing IDs', () => {
    const tag1 = tagModel.createTag('vegan');
    const tag2 = tagModel.createTag('gluten-free');
    expect(tag2.id).toBeGreaterThan(tag1.id);
  });
});

// =====================
// AC3: Duplicate names throw errors
// =====================
describe('AC3: Duplicate names throw or return appropriate errors', () => {
  let categoryModel, tagModel;

  beforeAll(() => {
    Object.keys(require.cache).forEach(key => {
      if (key.includes('category') || key.includes('tag')) {
        delete require.cache[key];
      }
    });
    categoryModel = require('../src/models/category');
    tagModel = require('../src/models/tag');
  });

  test('duplicate category name throws descriptive error', () => {
    const name = 'DupCat_' + Date.now();
    categoryModel.createCategory(name);
    expect(() => categoryModel.createCategory(name)).toThrow(/already exists/);
  });

  test('duplicate tag name throws descriptive error', () => {
    const name = 'DupTag_' + Date.now();
    tagModel.createTag(name);
    expect(() => tagModel.createTag(name)).toThrow(/already exists/);
  });

  test('duplicate category error includes the category name', () => {
    const name = 'UniqueTestCat_' + Date.now();
    categoryModel.createCategory(name);
    try {
      categoryModel.createCategory(name);
      fail('Should have thrown');
    } catch (err) {
      expect(err.message).toContain(name);
    }
  });

  test('duplicate tag error includes the tag name', () => {
    const name = 'UniqueTestTag_' + Date.now();
    tagModel.createTag(name);
    try {
      tagModel.createTag(name);
      fail('Should have thrown');
    } catch (err) {
      expect(err.message).toContain(name);
    }
  });
});

// =====================
// AC4: getAllCategories/getAllTags
// =====================
describe('AC4: getAllCategories/getAllTags return all rows', () => {
  let categoryModel, tagModel;

  beforeAll(() => {
    Object.keys(require.cache).forEach(key => {
      if (key.includes('category') || key.includes('tag')) {
        delete require.cache[key];
      }
    });
    categoryModel = require('../src/models/category');
    tagModel = require('../src/models/tag');
  });

  test('getAllCategories returns an array', () => {
    const cats = categoryModel.getAllCategories();
    expect(Array.isArray(cats)).toBe(true);
  });

  test('getAllTags returns an array', () => {
    const tags = tagModel.getAllTags();
    expect(Array.isArray(tags)).toBe(true);
  });

  test('getAllCategories includes previously created categories', () => {
    const name = 'GetAllCat_' + Date.now();
    categoryModel.createCategory(name);
    const all = categoryModel.getAllCategories();
    const found = all.find(c => c.name === name);
    expect(found).toBeDefined();
    expect(found).toHaveProperty('id');
    expect(found).toHaveProperty('name', name);
  });

  test('getAllTags includes previously created tags', () => {
    const name = 'GetAllTag_' + Date.now();
    tagModel.createTag(name);
    const all = tagModel.getAllTags();
    const found = all.find(t => t.name === name);
    expect(found).toBeDefined();
    expect(found).toHaveProperty('id');
    expect(found).toHaveProperty('name', name);
  });

  test('getAllCategories returns objects with id and name fields', () => {
    const cats = categoryModel.getAllCategories();
    if (cats.length > 0) {
      expect(cats[0]).toHaveProperty('id');
      expect(cats[0]).toHaveProperty('name');
    }
  });

  test('getAllTags returns objects with id and name fields', () => {
    const tags = tagModel.getAllTags();
    if (tags.length > 0) {
      expect(tags[0]).toHaveProperty('id');
      expect(tags[0]).toHaveProperty('name');
    }
  });
});

// =====================
// AC5: getCategoriesByRecipeId/getTagsByRecipeId
// =====================
describe('AC5: getCategoriesByRecipeId/getTagsByRecipeId via junction tables', () => {
  let categoryModel, tagModel;
  let userId, recipeId;

  beforeAll(() => {
    Object.keys(require.cache).forEach(key => {
      if (key.includes('category') || key.includes('tag')) {
        delete require.cache[key];
      }
    });
    categoryModel = require('../src/models/category');
    tagModel = require('../src/models/tag');
    userId = createTestUser('junction_user_' + Date.now());
    recipeId = createTestRecipe(userId, 'Junction Test Recipe');
  });

  test('getCategoriesByRecipeId returns empty array when no categories assigned', () => {
    const cats = categoryModel.getCategoriesByRecipeId(recipeId);
    expect(Array.isArray(cats)).toBe(true);
    expect(cats).toHaveLength(0);
  });

  test('getTagsByRecipeId returns empty array when no tags assigned', () => {
    const tags = tagModel.getTagsByRecipeId(recipeId);
    expect(Array.isArray(tags)).toBe(true);
    expect(tags).toHaveLength(0);
  });

  test('getCategoriesByRecipeId returns assigned categories', () => {
    const cat = categoryModel.createCategory('JunctionCat_' + Date.now());
    db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.id);

    const cats = categoryModel.getCategoriesByRecipeId(recipeId);
    expect(cats.length).toBeGreaterThanOrEqual(1);
    const found = cats.find(c => c.id === cat.id);
    expect(found).toBeDefined();
    expect(found.name).toBe(cat.name);
  });

  test('getTagsByRecipeId returns assigned tags', () => {
    const tag = tagModel.createTag('JunctionTag_' + Date.now());
    db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);

    const tags = tagModel.getTagsByRecipeId(recipeId);
    expect(tags.length).toBeGreaterThanOrEqual(1);
    const found = tags.find(t => t.id === tag.id);
    expect(found).toBeDefined();
    expect(found.name).toBe(tag.name);
  });

  test('getCategoriesByRecipeId returns multiple categories', () => {
    const newRecipeId = createTestRecipe(userId, 'Multi Cat Recipe');
    const cat1 = categoryModel.createCategory('MultiCat1_' + Date.now());
    const cat2 = categoryModel.createCategory('MultiCat2_' + Date.now());
    db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(newRecipeId, cat1.id);
    db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(newRecipeId, cat2.id);

    const cats = categoryModel.getCategoriesByRecipeId(newRecipeId);
    expect(cats.length).toBe(2);
  });

  test('getTagsByRecipeId returns multiple tags', () => {
    const newRecipeId = createTestRecipe(userId, 'Multi Tag Recipe');
    const tag1 = tagModel.createTag('MultiTag1_' + Date.now());
    const tag2 = tagModel.createTag('MultiTag2_' + Date.now());
    db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(newRecipeId, tag1.id);
    db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(newRecipeId, tag2.id);

    const tags = tagModel.getTagsByRecipeId(newRecipeId);
    expect(tags.length).toBe(2);
  });

  test('getCategoriesByRecipeId only returns categories for the specific recipe', () => {
    const recipe1 = createTestRecipe(userId, 'Isolation Cat Recipe 1');
    const recipe2 = createTestRecipe(userId, 'Isolation Cat Recipe 2');
    const cat1 = categoryModel.createCategory('IsolationCat1_' + Date.now());
    const cat2 = categoryModel.createCategory('IsolationCat2_' + Date.now());
    db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipe1, cat1.id);
    db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipe2, cat2.id);

    const cats1 = categoryModel.getCategoriesByRecipeId(recipe1);
    expect(cats1.length).toBe(1);
    expect(cats1[0].id).toBe(cat1.id);

    const cats2 = categoryModel.getCategoriesByRecipeId(recipe2);
    expect(cats2.length).toBe(1);
    expect(cats2[0].id).toBe(cat2.id);
  });

  test('getCategoriesByRecipeId returns empty for non-existent recipe', () => {
    const cats = categoryModel.getCategoriesByRecipeId(999999);
    expect(cats).toEqual([]);
  });

  test('getTagsByRecipeId returns empty for non-existent recipe', () => {
    const tags = tagModel.getTagsByRecipeId(999999);
    expect(tags).toEqual([]);
  });
});

// =====================
// AC6: ON DELETE CASCADE
// =====================
describe('AC6: ON DELETE CASCADE removes junction rows when recipe is deleted', () => {
  let categoryModel, tagModel;
  let userId;

  beforeAll(() => {
    Object.keys(require.cache).forEach(key => {
      if (key.includes('category') || key.includes('tag')) {
        delete require.cache[key];
      }
    });
    categoryModel = require('../src/models/category');
    tagModel = require('../src/models/tag');
    userId = createTestUser('cascade_user_' + Date.now());
  });

  test('deleting a recipe removes its recipe_categories entries', () => {
    const recipeId = createTestRecipe(userId, 'Cascade Cat Test');
    const cat = categoryModel.createCategory('CascadeCat_' + Date.now());
    db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.id);

    // Verify junction row exists
    let junctions = db.prepare('SELECT * FROM recipe_categories WHERE recipe_id = ?').all(recipeId);
    expect(junctions.length).toBe(1);

    // Delete recipe
    db.prepare('DELETE FROM recipes WHERE id = ?').run(recipeId);

    // Junction row should be gone
    junctions = db.prepare('SELECT * FROM recipe_categories WHERE recipe_id = ?').all(recipeId);
    expect(junctions.length).toBe(0);
  });

  test('deleting a recipe removes its recipe_tags entries', () => {
    const recipeId = createTestRecipe(userId, 'Cascade Tag Test');
    const tag = tagModel.createTag('CascadeTag_' + Date.now());
    db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);

    // Verify junction row exists
    let junctions = db.prepare('SELECT * FROM recipe_tags WHERE recipe_id = ?').all(recipeId);
    expect(junctions.length).toBe(1);

    // Delete recipe
    db.prepare('DELETE FROM recipes WHERE id = ?').run(recipeId);

    // Junction row should be gone
    junctions = db.prepare('SELECT * FROM recipe_tags WHERE recipe_id = ?').all(recipeId);
    expect(junctions.length).toBe(0);
  });

  test('deleting a recipe does NOT remove the category itself', () => {
    const recipeId = createTestRecipe(userId, 'Cascade Preserve Cat');
    const cat = categoryModel.createCategory('PreserveCat_' + Date.now());
    db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.id);

    db.prepare('DELETE FROM recipes WHERE id = ?').run(recipeId);

    const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(cat.id);
    expect(row).toBeDefined();
    expect(row.name).toBe(cat.name);
  });

  test('deleting a recipe does NOT remove the tag itself', () => {
    const recipeId = createTestRecipe(userId, 'Cascade Preserve Tag');
    const tag = tagModel.createTag('PreserveTag_' + Date.now());
    db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);

    db.prepare('DELETE FROM recipes WHERE id = ?').run(recipeId);

    const row = db.prepare('SELECT * FROM tags WHERE id = ?').get(tag.id);
    expect(row).toBeDefined();
    expect(row.name).toBe(tag.name);
  });

  test('deleting recipe with multiple categories/tags removes all junction rows', () => {
    const recipeId = createTestRecipe(userId, 'Cascade Multi Test');
    const cat1 = categoryModel.createCategory('CascadeMultiCat1_' + Date.now());
    const cat2 = categoryModel.createCategory('CascadeMultiCat2_' + Date.now());
    const tag1 = tagModel.createTag('CascadeMultiTag1_' + Date.now());
    const tag2 = tagModel.createTag('CascadeMultiTag2_' + Date.now());

    db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat1.id);
    db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat2.id);
    db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag1.id);
    db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag2.id);

    db.prepare('DELETE FROM recipes WHERE id = ?').run(recipeId);

    const catJunctions = db.prepare('SELECT * FROM recipe_categories WHERE recipe_id = ?').all(recipeId);
    const tagJunctions = db.prepare('SELECT * FROM recipe_tags WHERE recipe_id = ?').all(recipeId);
    expect(catJunctions.length).toBe(0);
    expect(tagJunctions.length).toBe(0);
  });
});

// =====================
// AC7: Edge cases & constraint behavior
// =====================
describe('AC7: Additional constraint and edge case validation', () => {
  let categoryModel, tagModel;

  beforeAll(() => {
    Object.keys(require.cache).forEach(key => {
      if (key.includes('category') || key.includes('tag')) {
        delete require.cache[key];
      }
    });
    categoryModel = require('../src/models/category');
    tagModel = require('../src/models/tag');
  });

  test('cannot insert NULL category name directly', () => {
    expect(() => {
      db.prepare('INSERT INTO categories (name) VALUES (?)').run(null);
    }).toThrow();
  });

  test('cannot insert NULL tag name directly', () => {
    expect(() => {
      db.prepare('INSERT INTO tags (name) VALUES (?)').run(null);
    }).toThrow();
  });

  test('duplicate recipe_categories entry is rejected (composite PK)', () => {
    const userId = createTestUser('dup_rc_user_' + Date.now());
    const recipeId = createTestRecipe(userId, 'Dup RC Test');
    const cat = categoryModel.createCategory('DupRC_Cat_' + Date.now());

    db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.id);
    expect(() => {
      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.id);
    }).toThrow();
  });

  test('duplicate recipe_tags entry is rejected (composite PK)', () => {
    const userId = createTestUser('dup_rt_user_' + Date.now());
    const recipeId = createTestRecipe(userId, 'Dup RT Test');
    const tag = tagModel.createTag('DupRT_Tag_' + Date.now());

    db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);
    expect(() => {
      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);
    }).toThrow();
  });

  test('recipe_categories rejects invalid recipe_id (FK constraint)', () => {
    const cat = categoryModel.createCategory('FK_RC_Cat_' + Date.now());
    expect(() => {
      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(999999, cat.id);
    }).toThrow();
  });

  test('recipe_tags rejects invalid recipe_id (FK constraint)', () => {
    const tag = tagModel.createTag('FK_RT_Tag_' + Date.now());
    expect(() => {
      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(999999, tag.id);
    }).toThrow();
  });

  test('recipe_categories rejects invalid category_id (FK constraint)', () => {
    const userId = createTestUser('fk_cat_user_' + Date.now());
    const recipeId = createTestRecipe(userId, 'FK Cat Test');
    expect(() => {
      db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, 999999);
    }).toThrow();
  });

  test('recipe_tags rejects invalid tag_id (FK constraint)', () => {
    const userId = createTestUser('fk_tag_user_' + Date.now());
    const recipeId = createTestRecipe(userId, 'FK Tag Test');
    expect(() => {
      db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, 999999);
    }).toThrow();
  });

  test('category and tag can share the same name', () => {
    const name = 'SharedName_' + Date.now();
    const cat = categoryModel.createCategory(name);
    const tag = tagModel.createTag(name);
    expect(cat.name).toBe(name);
    expect(tag.name).toBe(name);
  });

  test('same category can be assigned to multiple recipes', () => {
    const userId = createTestUser('multi_recipe_cat_' + Date.now());
    const recipe1 = createTestRecipe(userId, 'Multi Recipe Cat 1');
    const recipe2 = createTestRecipe(userId, 'Multi Recipe Cat 2');
    const cat = categoryModel.createCategory('SharedCat_' + Date.now());

    db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipe1, cat.id);
    db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipe2, cat.id);

    const cats1 = categoryModel.getCategoriesByRecipeId(recipe1);
    const cats2 = categoryModel.getCategoriesByRecipeId(recipe2);
    expect(cats1.find(c => c.id === cat.id)).toBeDefined();
    expect(cats2.find(c => c.id === cat.id)).toBeDefined();
  });

  test('same tag can be assigned to multiple recipes', () => {
    const userId = createTestUser('multi_recipe_tag_' + Date.now());
    const recipe1 = createTestRecipe(userId, 'Multi Recipe Tag 1');
    const recipe2 = createTestRecipe(userId, 'Multi Recipe Tag 2');
    const tag = tagModel.createTag('SharedTag_' + Date.now());

    db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipe1, tag.id);
    db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipe2, tag.id);

    const tags1 = tagModel.getTagsByRecipeId(recipe1);
    const tags2 = tagModel.getTagsByRecipeId(recipe2);
    expect(tags1.find(t => t.id === tag.id)).toBeDefined();
    expect(tags2.find(t => t.id === tag.id)).toBeDefined();
  });

  test('deleting a category cascades to recipe_categories junction rows', () => {
    const userId = createTestUser('cat_cascade_user_' + Date.now());
    const recipeId = createTestRecipe(userId, 'Cat Cascade Test');
    const cat = categoryModel.createCategory('CatCascade_' + Date.now());
    db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.id);

    expect(db.prepare('SELECT * FROM recipe_categories WHERE category_id = ?').all(cat.id)).toHaveLength(1);
    db.prepare('DELETE FROM categories WHERE id = ?').run(cat.id);
    expect(db.prepare('SELECT * FROM recipe_categories WHERE category_id = ?').all(cat.id)).toHaveLength(0);
  });

  test('deleting a tag cascades to recipe_tags junction rows', () => {
    const userId = createTestUser('tag_cascade_user_' + Date.now());
    const recipeId = createTestRecipe(userId, 'Tag Cascade Test');
    const tag = tagModel.createTag('TagCascade_' + Date.now());
    db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);

    expect(db.prepare('SELECT * FROM recipe_tags WHERE tag_id = ?').all(tag.id)).toHaveLength(1);
    db.prepare('DELETE FROM tags WHERE id = ?').run(tag.id);
    expect(db.prepare('SELECT * FROM recipe_tags WHERE tag_id = ?').all(tag.id)).toHaveLength(0);
  });

  test('user cascade chain: deleting user removes recipes and all junction rows', () => {
    const userId = createTestUser('chain_user_' + Date.now());
    const recipeId = createTestRecipe(userId, 'Chain Test');
    const cat = categoryModel.createCategory('ChainCat_' + Date.now());
    const tag = tagModel.createTag('ChainTag_' + Date.now());

    db.prepare('INSERT INTO recipe_categories (recipe_id, category_id) VALUES (?, ?)').run(recipeId, cat.id);
    db.prepare('INSERT INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').run(recipeId, tag.id);

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    expect(db.prepare('SELECT * FROM recipes WHERE id = ?').all(recipeId)).toHaveLength(0);
    expect(db.prepare('SELECT * FROM recipe_categories WHERE recipe_id = ?').all(recipeId)).toHaveLength(0);
    expect(db.prepare('SELECT * FROM recipe_tags WHERE recipe_id = ?').all(recipeId)).toHaveLength(0);
    // Standalone entities remain
    expect(db.prepare('SELECT * FROM categories WHERE id = ?').get(cat.id)).toBeDefined();
    expect(db.prepare('SELECT * FROM tags WHERE id = ?').get(tag.id)).toBeDefined();
  });

  test('schema is idempotent — re-executing CREATE IF NOT EXISTS preserves data', () => {
    const name = 'Idempotent_' + Date.now();
    categoryModel.createCategory(name);

    const schemaPath = path.join(__dirname, '..', 'src', 'db', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    expect(() => db.exec(schema)).not.toThrow();

    const all = categoryModel.getAllCategories();
    expect(all.find(c => c.name === name)).toBeDefined();
  });

  test('special characters preserved in category and tag names', () => {
    const catName = "Chef's Special <Appetizer> & Dessert #1 @Home!";
    const tagName = '日本語-タグ_with-dashes & spaces';
    const cat = categoryModel.createCategory(catName);
    const tag = tagModel.createTag(tagName);
    expect(cat.name).toBe(catName);
    expect(tag.name).toBe(tagName);
  });

  test('module exports correct functions for category model', () => {
    expect(typeof categoryModel.getAllCategories).toBe('function');
    expect(typeof categoryModel.createCategory).toBe('function');
    expect(typeof categoryModel.getCategoriesByRecipeId).toBe('function');
  });

  test('module exports correct functions for tag model', () => {
    expect(typeof tagModel.getAllTags).toBe('function');
    expect(typeof tagModel.createTag).toBe('function');
    expect(typeof tagModel.getTagsByRecipeId).toBe('function');
  });
});
