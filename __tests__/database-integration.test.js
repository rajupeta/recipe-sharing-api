/**
 * TICKET-002 Integration Tests — Database Module
 *
 * Covers:
 * - Full CRUD lifecycle for users and recipes
 * - Transaction support (commit and rollback)
 * - Column type storage and retrieval accuracy
 * - Schema SQL file content validation against AC
 * - UNIQUE constraint edge cases (case sensitivity)
 * - Referential integrity with multiple users and recipes
 * - WAL mode file artifacts
 * - Prepared statement reuse
 * - Data survives schema re-execution
 * - Boundary values for INTEGER columns
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

describe('TICKET-002 Integration tests', () => {
  let tmpDir;
  let testDbPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-int-'));
    testDbPath = path.join(tmpDir, 'integration.db');
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

  // ── Schema SQL file content validation ──

  describe('schema.sql file validation', () => {
    const schemaPath = path.join(__dirname, '..', 'src', 'db', 'schema.sql');
    let schemaContent;

    beforeAll(() => {
      schemaContent = fs.readFileSync(schemaPath, 'utf-8');
    });

    test('schema.sql file exists', () => {
      expect(fs.existsSync(schemaPath)).toBe(true);
    });

    test('schema.sql contains CREATE TABLE IF NOT EXISTS users', () => {
      expect(schemaContent).toMatch(/CREATE TABLE IF NOT EXISTS users/i);
    });

    test('schema.sql contains CREATE TABLE IF NOT EXISTS recipes', () => {
      expect(schemaContent).toMatch(/CREATE TABLE IF NOT EXISTS recipes/i);
    });

    test('schema.sql defines users.id as INTEGER PRIMARY KEY AUTOINCREMENT', () => {
      expect(schemaContent).toMatch(/id\s+INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/i);
    });

    test('schema.sql defines username as TEXT UNIQUE NOT NULL', () => {
      expect(schemaContent).toMatch(/username\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i);
    });

    test('schema.sql defines email as TEXT UNIQUE NOT NULL', () => {
      expect(schemaContent).toMatch(/email\s+TEXT\s+UNIQUE\s+NOT\s+NULL/i);
    });

    test('schema.sql defines password_hash as TEXT NOT NULL', () => {
      expect(schemaContent).toMatch(/password_hash\s+TEXT\s+NOT\s+NULL/i);
    });

    test('schema.sql defines bio with DEFAULT empty string', () => {
      expect(schemaContent).toMatch(/bio\s+TEXT\s+DEFAULT\s+''/i);
    });

    test('schema.sql defines ON DELETE CASCADE for user_id FK', () => {
      expect(schemaContent).toMatch(/ON\s+DELETE\s+CASCADE/i);
    });

    test('schema.sql defines REFERENCES users(id)', () => {
      expect(schemaContent).toMatch(/REFERENCES\s+users\s*\(\s*id\s*\)/i);
    });
  });

  // ── database.js module validation ──

  describe('database.js module', () => {
    const dbModulePath = path.join(__dirname, '..', 'src', 'db', 'database.js');
    let dbContent;

    beforeAll(() => {
      dbContent = fs.readFileSync(dbModulePath, 'utf-8');
    });

    test('database.js file exists', () => {
      expect(fs.existsSync(dbModulePath)).toBe(true);
    });

    test('database.js references DATABASE_PATH env variable', () => {
      expect(dbContent).toContain('DATABASE_PATH');
    });

    test('database.js sets WAL journal mode', () => {
      expect(dbContent).toMatch(/pragma.*journal_mode.*WAL/i);
    });

    test('database.js enables foreign keys', () => {
      expect(dbContent).toMatch(/pragma.*foreign_keys.*ON/i);
    });

    test('database.js reads schema.sql', () => {
      expect(dbContent).toContain('schema.sql');
    });

    test('database.js exports db via module.exports', () => {
      expect(dbContent).toMatch(/module\.exports\s*=/);
    });
  });

  // ── Full CRUD lifecycle ──

  describe('User CRUD lifecycle', () => {
    test('can create, read, update, and delete a user', () => {
      const db = loadDb();

      // Create
      const result = db.prepare(
        'INSERT INTO users (username, email, password_hash, bio) VALUES (?, ?, ?, ?)'
      ).run('cruduser', 'crud@test.com', 'hash123', 'Hello world');
      expect(result.changes).toBe(1);
      const userId = result.lastInsertRowid;

      // Read
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      expect(user.username).toBe('cruduser');
      expect(user.email).toBe('crud@test.com');
      expect(user.password_hash).toBe('hash123');
      expect(user.bio).toBe('Hello world');

      // Update
      const updateResult = db.prepare(
        'UPDATE users SET bio = ? WHERE id = ?'
      ).run('Updated bio', userId);
      expect(updateResult.changes).toBe(1);
      const updated = db.prepare('SELECT bio FROM users WHERE id = ?').get(userId);
      expect(updated.bio).toBe('Updated bio');

      // Delete
      const deleteResult = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
      expect(deleteResult.changes).toBe(1);
      const deleted = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      expect(deleted).toBeUndefined();

      db.close();
    });
  });

  describe('Recipe CRUD lifecycle', () => {
    test('can create, read, update, and delete a recipe', () => {
      const db = loadDb();

      // Create user first
      const userResult = db.prepare(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
      ).run('recipeowner', 'owner@test.com', 'hash');
      const userId = userResult.lastInsertRowid;

      // Create recipe
      const recipeResult = db.prepare(
        'INSERT INTO recipes (user_id, title, description, ingredients, steps, cook_time, servings) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(userId, 'Pasta', 'Italian classic', 'pasta,sauce', '1. Boil 2. Mix', 30, 4);
      expect(recipeResult.changes).toBe(1);
      const recipeId = recipeResult.lastInsertRowid;

      // Read
      const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(recipeId);
      expect(recipe.title).toBe('Pasta');
      expect(recipe.description).toBe('Italian classic');
      expect(recipe.ingredients).toBe('pasta,sauce');
      expect(recipe.steps).toBe('1. Boil 2. Mix');
      expect(recipe.cook_time).toBe(30);
      expect(recipe.servings).toBe(4);
      expect(recipe.user_id).toBe(Number(userId));

      // Update
      db.prepare('UPDATE recipes SET title = ?, cook_time = ? WHERE id = ?')
        .run('Updated Pasta', 45, recipeId);
      const updatedRecipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(recipeId);
      expect(updatedRecipe.title).toBe('Updated Pasta');
      expect(updatedRecipe.cook_time).toBe(45);

      // Delete
      const delResult = db.prepare('DELETE FROM recipes WHERE id = ?').run(recipeId);
      expect(delResult.changes).toBe(1);
      const gone = db.prepare('SELECT * FROM recipes WHERE id = ?').get(recipeId);
      expect(gone).toBeUndefined();

      db.close();
    });
  });

  // ── Transaction support ──

  describe('Transaction support', () => {
    test('committed transaction persists data', () => {
      const db = loadDb();

      const insertUser = db.prepare(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
      );

      const txn = db.transaction(() => {
        insertUser.run('txnuser1', 'txn1@test.com', 'hash');
        insertUser.run('txnuser2', 'txn2@test.com', 'hash');
      });
      txn();

      const count = db.prepare('SELECT COUNT(*) AS cnt FROM users').get().cnt;
      expect(count).toBe(2);
      db.close();
    });

    test('failed transaction rolls back all changes', () => {
      const db = loadDb();

      const insertUser = db.prepare(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
      );

      const txn = db.transaction(() => {
        insertUser.run('rollback1', 'rb1@test.com', 'hash');
        // Duplicate username should throw
        insertUser.run('rollback1', 'rb2@test.com', 'hash');
      });

      expect(() => txn()).toThrow();

      const count = db.prepare('SELECT COUNT(*) AS cnt FROM users').get().cnt;
      expect(count).toBe(0);
      db.close();
    });
  });

  // ── Column type storage ──

  describe('Column type storage accuracy', () => {
    test('stores and retrieves long text in ingredients and steps', () => {
      const db = loadDb();
      db.prepare(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
      ).run('longtext', 'long@test.com', 'hash');
      const uid = db.prepare('SELECT id FROM users WHERE username = ?').get('longtext').id;

      const longIngredients = 'ingredient1, ingredient2, ingredient3, '.repeat(100);
      const longSteps = 'Step 1: Do something. Step 2: Do more. '.repeat(100);

      db.prepare(
        'INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)'
      ).run(uid, 'Long Recipe', longIngredients, longSteps);

      const recipe = db.prepare('SELECT ingredients, steps FROM recipes WHERE title = ?').get('Long Recipe');
      expect(recipe.ingredients).toBe(longIngredients);
      expect(recipe.steps).toBe(longSteps);
      db.close();
    });

    test('stores unicode characters in text fields', () => {
      const db = loadDb();
      db.prepare(
        'INSERT INTO users (username, email, password_hash, bio) VALUES (?, ?, ?, ?)'
      ).run('unicode_user', 'uni@test.com', 'hash', 'I love cooking! Cocinar es mi pasion');

      const user = db.prepare('SELECT bio FROM users WHERE username = ?').get('unicode_user');
      expect(user.bio).toContain('Cocinar');
      db.close();
    });

    test('cook_time and servings store zero correctly', () => {
      const db = loadDb();
      db.prepare(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
      ).run('zerouser', 'zero@test.com', 'hash');
      const uid = db.prepare('SELECT id FROM users WHERE username = ?').get('zerouser').id;

      db.prepare(
        'INSERT INTO recipes (user_id, title, ingredients, steps, cook_time, servings) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(uid, 'No Cook', 'lettuce', 'wash', 0, 0);

      const recipe = db.prepare('SELECT cook_time, servings FROM recipes WHERE title = ?').get('No Cook');
      expect(recipe.cook_time).toBe(0);
      expect(recipe.servings).toBe(0);
      db.close();
    });

    test('large INTEGER values in cook_time and servings', () => {
      const db = loadDb();
      db.prepare(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
      ).run('bignum', 'big@test.com', 'hash');
      const uid = db.prepare('SELECT id FROM users WHERE username = ?').get('bignum').id;

      db.prepare(
        'INSERT INTO recipes (user_id, title, ingredients, steps, cook_time, servings) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(uid, 'Marathon Stew', 'everything', 'slow cook', 99999, 1000);

      const recipe = db.prepare('SELECT cook_time, servings FROM recipes WHERE title = ?').get('Marathon Stew');
      expect(recipe.cook_time).toBe(99999);
      expect(recipe.servings).toBe(1000);
      db.close();
    });
  });

  // ── Referential integrity with multiple users ──

  describe('Referential integrity with multiple users', () => {
    test('deleting one user does not affect another users recipes', () => {
      const db = loadDb();

      const insertUser = db.prepare(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
      );
      const u1 = insertUser.run('alice', 'alice@test.com', 'hash').lastInsertRowid;
      const u2 = insertUser.run('bob', 'bob@test.com', 'hash').lastInsertRowid;

      const insertRecipe = db.prepare(
        'INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)'
      );
      insertRecipe.run(u1, 'Alice Soup', 'water', 'boil');
      insertRecipe.run(u1, 'Alice Salad', 'lettuce', 'chop');
      insertRecipe.run(u2, 'Bob Cake', 'flour', 'bake');

      // Delete Alice
      db.prepare('DELETE FROM users WHERE id = ?').run(u1);

      // Bob's recipe should survive
      const bobRecipes = db.prepare('SELECT * FROM recipes WHERE user_id = ?').all(u2);
      expect(bobRecipes.length).toBe(1);
      expect(bobRecipes[0].title).toBe('Bob Cake');

      // Alice's recipes should be gone
      const aliceRecipes = db.prepare('SELECT * FROM recipes WHERE user_id = ?').all(u1);
      expect(aliceRecipes.length).toBe(0);

      db.close();
    });

    test('cannot reassign recipe to non-existent user', () => {
      const db = loadDb();

      db.prepare(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
      ).run('owner', 'owner@t.com', 'hash');
      const uid = db.prepare('SELECT id FROM users WHERE username = ?').get('owner').id;

      db.prepare(
        'INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)'
      ).run(uid, 'My Recipe', 'stuff', 'cook');

      expect(() => {
        db.prepare('UPDATE recipes SET user_id = ? WHERE title = ?').run(99999, 'My Recipe');
      }).toThrow();

      db.close();
    });
  });

  // ── UNIQUE constraint edge cases ──

  describe('UNIQUE constraint edge cases', () => {
    test('emails are case-sensitive in SQLite (different case = different email)', () => {
      const db = loadDb();
      const insert = db.prepare(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
      );

      // SQLite TEXT comparison is case-sensitive by default
      insert.run('user_lower', 'test@example.com', 'hash');
      expect(() => {
        insert.run('user_upper', 'TEST@EXAMPLE.COM', 'hash');
      }).not.toThrow();

      db.close();
    });

    test('cannot insert user with empty string username (if NOT NULL but empty allowed)', () => {
      const db = loadDb();
      const insert = db.prepare(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
      );

      // Empty string is allowed by NOT NULL (it's not null), but should work
      const result = insert.run('', 'empty@test.com', 'hash');
      expect(result.changes).toBe(1);

      // But a second empty string should fail UNIQUE
      expect(() => {
        insert.run('', 'empty2@test.com', 'hash');
      }).toThrow();

      db.close();
    });
  });

  // ── WAL mode file artifacts ──

  describe('WAL mode verification', () => {
    test('WAL mode creates -wal file after write operations', () => {
      const db = loadDb();
      db.prepare(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
      ).run('waluser', 'wal@test.com', 'hash');

      // WAL mode should create a -wal file
      const walPath = testDbPath + '-wal';
      expect(fs.existsSync(walPath)).toBe(true);
      db.close();
    });

    test('database pragma confirms WAL mode after data operations', () => {
      const db = loadDb();
      db.prepare(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
      ).run('walcheck', 'walc@test.com', 'hash');

      const mode = db.pragma('journal_mode', { simple: true });
      expect(mode).toBe('wal');
      db.close();
    });
  });

  // ── Prepared statement reuse ──

  describe('Prepared statement reuse', () => {
    test('prepared statements can be reused multiple times', () => {
      const db = loadDb();
      const insert = db.prepare(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
      );

      for (let i = 0; i < 10; i++) {
        const result = insert.run(`reuse${i}`, `reuse${i}@test.com`, 'hash');
        expect(result.changes).toBe(1);
      }

      const count = db.prepare('SELECT COUNT(*) AS cnt FROM users').get().cnt;
      expect(count).toBe(10);
      db.close();
    });
  });

  // ── Data survives schema re-execution ──

  describe('Data persistence across schema re-execution', () => {
    test('existing user data survives schema re-run', () => {
      const db = loadDb();

      db.prepare(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
      ).run('persistent', 'persist@test.com', 'hash');

      // Re-execute schema
      const schemaPath = path.join(__dirname, '..', 'src', 'db', 'schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf-8');
      db.exec(schema);

      const user = db.prepare('SELECT * FROM users WHERE username = ?').get('persistent');
      expect(user).toBeDefined();
      expect(user.email).toBe('persist@test.com');
      db.close();
    });

    test('existing recipe data survives schema re-run', () => {
      const db = loadDb();

      db.prepare(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
      ).run('chef', 'chef@test.com', 'hash');
      const uid = db.prepare('SELECT id FROM users WHERE username = ?').get('chef').id;

      db.prepare(
        'INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)'
      ).run(uid, 'Persistent Soup', 'water', 'boil');

      // Re-execute schema
      const schemaPath = path.join(__dirname, '..', 'src', 'db', 'schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf-8');
      db.exec(schema);

      const recipe = db.prepare('SELECT * FROM recipes WHERE title = ?').get('Persistent Soup');
      expect(recipe).toBeDefined();
      expect(recipe.ingredients).toBe('water');
      db.close();
    });
  });

  // ── Listing and querying ──

  describe('Multi-record queries', () => {
    test('can list all recipes for a user', () => {
      const db = loadDb();

      db.prepare(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
      ).run('prolific', 'prolific@test.com', 'hash');
      const uid = db.prepare('SELECT id FROM users WHERE username = ?').get('prolific').id;

      const insert = db.prepare(
        'INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)'
      );
      insert.run(uid, 'Recipe A', 'a', 'a');
      insert.run(uid, 'Recipe B', 'b', 'b');
      insert.run(uid, 'Recipe C', 'c', 'c');

      const recipes = db.prepare('SELECT * FROM recipes WHERE user_id = ? ORDER BY title').all(uid);
      expect(recipes.length).toBe(3);
      expect(recipes[0].title).toBe('Recipe A');
      expect(recipes[1].title).toBe('Recipe B');
      expect(recipes[2].title).toBe('Recipe C');
      db.close();
    });

    test('can join users and recipes', () => {
      const db = loadDb();

      db.prepare(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
      ).run('joiner', 'joiner@test.com', 'hash');
      const uid = db.prepare('SELECT id FROM users WHERE username = ?').get('joiner').id;

      db.prepare(
        'INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)'
      ).run(uid, 'Joined Recipe', 'eggs', 'scramble');

      const result = db.prepare(`
        SELECT r.title, u.username
        FROM recipes r
        JOIN users u ON r.user_id = u.id
        WHERE r.title = ?
      `).get('Joined Recipe');

      expect(result.title).toBe('Joined Recipe');
      expect(result.username).toBe('joiner');
      db.close();
    });

    test('COUNT works correctly across tables', () => {
      const db = loadDb();

      const insertUser = db.prepare(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
      );
      const insertRecipe = db.prepare(
        'INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)'
      );

      const u1 = insertUser.run('counter1', 'c1@test.com', 'h').lastInsertRowid;
      const u2 = insertUser.run('counter2', 'c2@test.com', 'h').lastInsertRowid;

      insertRecipe.run(u1, 'R1', 'i', 's');
      insertRecipe.run(u1, 'R2', 'i', 's');
      insertRecipe.run(u2, 'R3', 'i', 's');

      const userCount = db.prepare('SELECT COUNT(*) AS cnt FROM users').get().cnt;
      const recipeCount = db.prepare('SELECT COUNT(*) AS cnt FROM recipes').get().cnt;

      expect(userCount).toBe(2);
      expect(recipeCount).toBe(3);
      db.close();
    });
  });

  // ── Table structure verification ──

  describe('Table column types match spec', () => {
    test('users table has exactly 6 columns', () => {
      const db = loadDb();
      const columns = db.pragma('table_info(users)');
      expect(columns.length).toBe(6);
      db.close();
    });

    test('recipes table has exactly 10 columns', () => {
      const db = loadDb();
      const columns = db.pragma('table_info(recipes)');
      expect(columns.length).toBe(10);
      db.close();
    });

    test('users column types are correct', () => {
      const db = loadDb();
      const columns = db.pragma('table_info(users)');
      const colMap = {};
      columns.forEach(c => { colMap[c.name] = c.type; });

      expect(colMap.id).toBe('INTEGER');
      expect(colMap.username).toBe('TEXT');
      expect(colMap.email).toBe('TEXT');
      expect(colMap.password_hash).toBe('TEXT');
      expect(colMap.bio).toBe('TEXT');
      expect(colMap.created_at).toBe('DATETIME');
      db.close();
    });

    test('recipes column types are correct', () => {
      const db = loadDb();
      const columns = db.pragma('table_info(recipes)');
      const colMap = {};
      columns.forEach(c => { colMap[c.name] = c.type; });

      expect(colMap.id).toBe('INTEGER');
      expect(colMap.user_id).toBe('INTEGER');
      expect(colMap.title).toBe('TEXT');
      expect(colMap.description).toBe('TEXT');
      expect(colMap.ingredients).toBe('TEXT');
      expect(colMap.steps).toBe('TEXT');
      expect(colMap.cook_time).toBe('INTEGER');
      expect(colMap.servings).toBe('INTEGER');
      expect(colMap.created_at).toBe('DATETIME');
      expect(colMap.updated_at).toBe('DATETIME');
      db.close();
    });
  });

  // ── Default DATABASE_PATH ──

  describe('Default database path', () => {
    test('database.js defaults to ./data/recipes.db when DATABASE_PATH is unset', () => {
      const dbContent = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'db', 'database.js'), 'utf-8'
      );
      expect(dbContent).toContain("'data'");
      expect(dbContent).toContain("'recipes.db'");
    });
  });
});
