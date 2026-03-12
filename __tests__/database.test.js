const path = require('path');
const fs = require('fs');
const os = require('os');
const Database = require('better-sqlite3');

describe('Database module', () => {
  let tmpDir;
  let testDbPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-test-'));
    testDbPath = path.join(tmpDir, 'test-recipes.db');
    process.env.DATABASE_PATH = testDbPath;
    // Clear require cache so database.js re-initializes with new path
    jest.resetModules();
  });

  afterEach(() => {
    // Clean up temp files
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
    const db = require('../src/db/database');
    return db;
  }

  test('creates the database file automatically', () => {
    const db = loadDb();
    expect(fs.existsSync(testDbPath)).toBe(true);
    db.close();
  });

  test('exports a working better-sqlite3 instance', () => {
    const db = loadDb();
    expect(db).toBeDefined();
    expect(db.open).toBe(true);
    expect(typeof db.prepare).toBe('function');
    expect(typeof db.exec).toBe('function');
    expect(typeof db.pragma).toBe('function');
    db.close();
  });

  test('enables WAL mode', () => {
    const db = loadDb();
    const result = db.pragma('journal_mode', { simple: true });
    expect(result).toBe('wal');
    db.close();
  });

  test('enables foreign keys', () => {
    const db = loadDb();
    const result = db.pragma('foreign_keys', { simple: true });
    expect(result).toBe(1);
    db.close();
  });

  test('creates users table with correct columns', () => {
    const db = loadDb();
    const columns = db.pragma('table_info(users)');
    const columnNames = columns.map(c => c.name);

    expect(columnNames).toContain('id');
    expect(columnNames).toContain('username');
    expect(columnNames).toContain('email');
    expect(columnNames).toContain('password_hash');
    expect(columnNames).toContain('bio');
    expect(columnNames).toContain('created_at');

    const idCol = columns.find(c => c.name === 'id');
    expect(idCol.pk).toBe(1);

    const usernameCol = columns.find(c => c.name === 'username');
    expect(usernameCol.notnull).toBe(1);

    const emailCol = columns.find(c => c.name === 'email');
    expect(emailCol.notnull).toBe(1);

    const passwordCol = columns.find(c => c.name === 'password_hash');
    expect(passwordCol.notnull).toBe(1);

    const bioCol = columns.find(c => c.name === 'bio');
    expect(bioCol.dflt_value).toBe("''");

    db.close();
  });

  test('creates recipes table with correct columns', () => {
    const db = loadDb();
    const columns = db.pragma('table_info(recipes)');
    const columnNames = columns.map(c => c.name);

    expect(columnNames).toContain('id');
    expect(columnNames).toContain('user_id');
    expect(columnNames).toContain('title');
    expect(columnNames).toContain('description');
    expect(columnNames).toContain('ingredients');
    expect(columnNames).toContain('steps');
    expect(columnNames).toContain('cook_time');
    expect(columnNames).toContain('servings');
    expect(columnNames).toContain('created_at');
    expect(columnNames).toContain('updated_at');

    const userIdCol = columns.find(c => c.name === 'user_id');
    expect(userIdCol.notnull).toBe(1);

    const titleCol = columns.find(c => c.name === 'title');
    expect(titleCol.notnull).toBe(1);

    const ingredientsCol = columns.find(c => c.name === 'ingredients');
    expect(ingredientsCol.notnull).toBe(1);

    const stepsCol = columns.find(c => c.name === 'steps');
    expect(stepsCol.notnull).toBe(1);

    db.close();
  });

  test('enforces foreign key from recipes.user_id to users.id', () => {
    const db = loadDb();
    const fkeys = db.pragma('foreign_key_list(recipes)');
    expect(fkeys.length).toBeGreaterThan(0);

    const userFk = fkeys.find(fk => fk.from === 'user_id');
    expect(userFk).toBeDefined();
    expect(userFk.table).toBe('users');
    expect(userFk.to).toBe('id');
    expect(userFk.on_delete).toBe('CASCADE');
    db.close();
  });

  test('foreign key constraint is enforced at runtime', () => {
    const db = loadDb();
    const stmt = db.prepare(
      'INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)'
    );
    expect(() => {
      stmt.run(9999, 'Test Recipe', 'ingredient1', 'step1');
    }).toThrow();
    db.close();
  });

  test('username uniqueness is enforced', () => {
    const db = loadDb();
    const insert = db.prepare(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
    );
    insert.run('testuser', 'test1@example.com', 'hash123');

    expect(() => {
      insert.run('testuser', 'test2@example.com', 'hash456');
    }).toThrow();
    db.close();
  });

  test('email uniqueness is enforced', () => {
    const db = loadDb();
    const insert = db.prepare(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
    );
    insert.run('user1', 'same@example.com', 'hash123');

    expect(() => {
      insert.run('user2', 'same@example.com', 'hash456');
    }).toThrow();
    db.close();
  });

  test('schema is idempotent (safe to run multiple times)', () => {
    const db = loadDb();
    const schemaPath = path.join(__dirname, '..', 'src', 'db', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    expect(() => {
      db.exec(schema);
    }).not.toThrow();

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users', 'recipes')"
    ).all();
    expect(tables.length).toBe(2);
    db.close();
  });

  test('ON DELETE CASCADE removes recipes when user is deleted', () => {
    const db = loadDb();

    const insertUser = db.prepare(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
    );
    const userResult = insertUser.run('cascadeuser', 'cascade@example.com', 'hash');

    const insertRecipe = db.prepare(
      'INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)'
    );
    insertRecipe.run(userResult.lastInsertRowid, 'Cascade Recipe', 'ing', 'step');

    let recipes = db.prepare('SELECT * FROM recipes WHERE user_id = ?').all(userResult.lastInsertRowid);
    expect(recipes.length).toBe(1);

    db.prepare('DELETE FROM users WHERE id = ?').run(userResult.lastInsertRowid);

    recipes = db.prepare('SELECT * FROM recipes WHERE user_id = ?').all(userResult.lastInsertRowid);
    expect(recipes.length).toBe(0);

    db.close();
  });
});
