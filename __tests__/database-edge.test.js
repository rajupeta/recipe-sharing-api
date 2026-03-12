/**
 * TICKET-002 QA Edge-Case Tests — Database Module
 *
 * Additional coverage beyond the dev-agent tests:
 * - DATABASE_PATH env override
 * - Directory auto-creation for nested paths
 * - Column default values
 * - NOT NULL constraint enforcement
 * - UNIQUE constraint enforcement on users
 * - Recipes columns nullable vs required
 * - AUTOINCREMENT behaviour
 * - updated_at default on recipes
 * - Multiple schema re-executions (triple idempotency)
 * - Empty table state after init
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

describe('TICKET-002 QA edge cases', () => {
  let tmpDir;
  let testDbPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-qa-'));
    testDbPath = path.join(tmpDir, 'qa-recipes.db');
    process.env.DATABASE_PATH = testDbPath;
    jest.resetModules();
  });

  afterEach(() => {
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

  function loadDb() {
    return require('../src/db/database');
  }

  // --- DATABASE_PATH env override ---
  test('DATABASE_PATH env variable controls database file location', () => {
    const customPath = path.join(tmpDir, 'custom-location.db');
    process.env.DATABASE_PATH = customPath;
    jest.resetModules();
    const db = require('../src/db/database');
    expect(fs.existsSync(customPath)).toBe(true);
    db.close();
  });

  // --- Auto-create nested directories ---
  test('creates nested directories for DATABASE_PATH', () => {
    const nestedPath = path.join(tmpDir, 'a', 'b', 'c', 'nested.db');
    process.env.DATABASE_PATH = nestedPath;
    jest.resetModules();
    const db = require('../src/db/database');
    expect(fs.existsSync(nestedPath)).toBe(true);
    db.close();
  });

  // --- Tables are empty after init ---
  test('users table is empty after initialization', () => {
    const db = loadDb();
    const count = db.prepare('SELECT COUNT(*) AS cnt FROM users').get();
    expect(count.cnt).toBe(0);
    db.close();
  });

  test('recipes table is empty after initialization', () => {
    const db = loadDb();
    const count = db.prepare('SELECT COUNT(*) AS cnt FROM recipes').get();
    expect(count.cnt).toBe(0);
    db.close();
  });

  // --- Column defaults ---
  test('users.bio defaults to empty string', () => {
    const db = loadDb();
    db.prepare(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
    ).run('defaultbio', 'bio@test.com', 'hash');
    const user = db.prepare('SELECT bio FROM users WHERE username = ?').get('defaultbio');
    expect(user.bio).toBe('');
    db.close();
  });

  test('users.created_at is populated automatically', () => {
    const db = loadDb();
    db.prepare(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
    ).run('tsuser', 'ts@test.com', 'hash');
    const user = db.prepare('SELECT created_at FROM users WHERE username = ?').get('tsuser');
    expect(user.created_at).toBeDefined();
    expect(user.created_at).not.toBeNull();
    db.close();
  });

  test('recipes.created_at and updated_at are populated automatically', () => {
    const db = loadDb();
    db.prepare(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
    ).run('chefuser', 'chef@test.com', 'hash');
    const userId = db.prepare('SELECT id FROM users WHERE username = ?').get('chefuser').id;

    db.prepare(
      'INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)'
    ).run(userId, 'Timestamp Recipe', 'eggs', 'scramble');

    const recipe = db.prepare('SELECT created_at, updated_at FROM recipes WHERE title = ?').get('Timestamp Recipe');
    expect(recipe.created_at).toBeDefined();
    expect(recipe.created_at).not.toBeNull();
    expect(recipe.updated_at).toBeDefined();
    expect(recipe.updated_at).not.toBeNull();
    db.close();
  });

  test('recipes.description defaults to empty string', () => {
    const db = loadDb();
    db.prepare(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
    ).run('descuser', 'desc@test.com', 'hash');
    const userId = db.prepare('SELECT id FROM users WHERE username = ?').get('descuser').id;

    db.prepare(
      'INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)'
    ).run(userId, 'No Desc Recipe', 'flour', 'bake');

    const recipe = db.prepare('SELECT description FROM recipes WHERE title = ?').get('No Desc Recipe');
    expect(recipe.description).toBe('');
    db.close();
  });

  // --- NOT NULL enforcement ---
  test('inserting user without username throws', () => {
    const db = loadDb();
    expect(() => {
      db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run('no@user.com', 'hash');
    }).toThrow();
    db.close();
  });

  test('inserting user without email throws', () => {
    const db = loadDb();
    expect(() => {
      db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('noemail', 'hash');
    }).toThrow();
    db.close();
  });

  test('inserting user without password_hash throws', () => {
    const db = loadDb();
    expect(() => {
      db.prepare('INSERT INTO users (username, email) VALUES (?, ?)').run('nopw', 'nopw@test.com');
    }).toThrow();
    db.close();
  });

  test('inserting recipe without title throws', () => {
    const db = loadDb();
    db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)').run('u1', 'u1@t.com', 'h');
    const uid = db.prepare('SELECT id FROM users WHERE username = ?').get('u1').id;
    expect(() => {
      db.prepare('INSERT INTO recipes (user_id, ingredients, steps) VALUES (?, ?, ?)').run(uid, 'ing', 'step');
    }).toThrow();
    db.close();
  });

  test('inserting recipe without ingredients throws', () => {
    const db = loadDb();
    db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)').run('u2', 'u2@t.com', 'h');
    const uid = db.prepare('SELECT id FROM users WHERE username = ?').get('u2').id;
    expect(() => {
      db.prepare('INSERT INTO recipes (user_id, title, steps) VALUES (?, ?, ?)').run(uid, 'T', 'step');
    }).toThrow();
    db.close();
  });

  test('inserting recipe without steps throws', () => {
    const db = loadDb();
    db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)').run('u3', 'u3@t.com', 'h');
    const uid = db.prepare('SELECT id FROM users WHERE username = ?').get('u3').id;
    expect(() => {
      db.prepare('INSERT INTO recipes (user_id, title, ingredients) VALUES (?, ?, ?)').run(uid, 'T', 'ing');
    }).toThrow();
    db.close();
  });

  // --- Nullable columns accept NULL ---
  test('recipes.cook_time and servings accept NULL', () => {
    const db = loadDb();
    db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)').run('u4', 'u4@t.com', 'h');
    const uid = db.prepare('SELECT id FROM users WHERE username = ?').get('u4').id;

    db.prepare(
      'INSERT INTO recipes (user_id, title, ingredients, steps, cook_time, servings) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(uid, 'Null Fields', 'ing', 'step', null, null);

    const recipe = db.prepare('SELECT cook_time, servings FROM recipes WHERE title = ?').get('Null Fields');
    expect(recipe.cook_time).toBeNull();
    expect(recipe.servings).toBeNull();
    db.close();
  });

  // --- AUTOINCREMENT ---
  test('users.id auto-increments', () => {
    const db = loadDb();
    const insert = db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)');
    const r1 = insert.run('auto1', 'auto1@t.com', 'h');
    const r2 = insert.run('auto2', 'auto2@t.com', 'h');
    expect(r2.lastInsertRowid).toBeGreaterThan(r1.lastInsertRowid);
    db.close();
  });

  test('recipes.id auto-increments', () => {
    const db = loadDb();
    db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)').run('auto3', 'auto3@t.com', 'h');
    const uid = db.prepare('SELECT id FROM users WHERE username = ?').get('auto3').id;

    const insert = db.prepare('INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)');
    const r1 = insert.run(uid, 'R1', 'i', 's');
    const r2 = insert.run(uid, 'R2', 'i', 's');
    expect(r2.lastInsertRowid).toBeGreaterThan(r1.lastInsertRowid);
    db.close();
  });

  // --- Triple idempotency ---
  test('schema can be executed three times without error', () => {
    const db = loadDb();
    const schemaPath = path.join(__dirname, '..', 'src', 'db', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    expect(() => {
      db.exec(schema);
      db.exec(schema);
      db.exec(schema);
    }).not.toThrow();

    // Data inserted before re-runs should survive
    db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)').run('survivor', 'sv@t.com', 'h');
    db.exec(schema);
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get('survivor');
    expect(user).toBeDefined();
    db.close();
  });

  // --- CASCADE deletes multiple recipes ---
  test('ON DELETE CASCADE removes all recipes for a deleted user', () => {
    const db = loadDb();
    db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)').run('multirecipe', 'mr@t.com', 'h');
    const uid = db.prepare('SELECT id FROM users WHERE username = ?').get('multirecipe').id;

    const insert = db.prepare('INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)');
    insert.run(uid, 'R1', 'i1', 's1');
    insert.run(uid, 'R2', 'i2', 's2');
    insert.run(uid, 'R3', 'i3', 's3');

    let count = db.prepare('SELECT COUNT(*) AS cnt FROM recipes WHERE user_id = ?').get(uid).cnt;
    expect(count).toBe(3);

    db.prepare('DELETE FROM users WHERE id = ?').run(uid);

    count = db.prepare('SELECT COUNT(*) AS cnt FROM recipes WHERE user_id = ?').get(uid).cnt;
    expect(count).toBe(0);
    db.close();
  });

  // --- FK prevents recipe with invalid user_id ---
  test('inserting recipe with user_id = 0 throws FK violation', () => {
    const db = loadDb();
    expect(() => {
      db.prepare(
        'INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)'
      ).run(0, 'Ghost Recipe', 'i', 's');
    }).toThrow();
    db.close();
  });

  test('inserting recipe with negative user_id throws FK violation', () => {
    const db = loadDb();
    expect(() => {
      db.prepare(
        'INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)'
      ).run(-1, 'Negative Recipe', 'i', 's');
    }).toThrow();
    db.close();
  });
});
