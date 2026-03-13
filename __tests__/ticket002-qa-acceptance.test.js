/**
 * TICKET-002 QA Acceptance Test Suite
 *
 * Final QA validation of all acceptance criteria:
 * AC1: Database file is created automatically on first run
 * AC2: Users and recipes tables exist with all specified columns and constraints
 * AC3: Foreign key from recipes.user_id to users.id is enforced
 * AC4: Schema runs idempotently (safe to run multiple times)
 * AC5: Database module exports a working better-sqlite3 instance
 * AC6: WAL mode and foreign keys are enabled
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

describe('TICKET-002 QA Acceptance Criteria', () => {
  let tmpDir;
  let testDbPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ticket002-qa-'));
    testDbPath = path.join(tmpDir, 'qa.db');
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

  // ── AC1: Database file is created automatically on first run ──

  describe('AC1: Database file auto-creation', () => {
    test('database file does not exist before module load', () => {
      expect(fs.existsSync(testDbPath)).toBe(false);
    });

    test('database file exists after requiring the module', () => {
      loadDb();
      expect(fs.existsSync(testDbPath)).toBe(true);
    });

    test('database file is created in a deeply nested path', () => {
      const deepPath = path.join(tmpDir, 'deep', 'nested', 'dir', 'test.db');
      process.env.DATABASE_PATH = deepPath;
      jest.resetModules();
      require('../src/db/database');
      expect(fs.existsSync(deepPath)).toBe(true);
    });

    test('database file is a valid SQLite database', () => {
      const db = loadDb();
      const result = db.prepare("SELECT 1 AS val").get();
      expect(result.val).toBe(1);
      db.close();
    });
  });

  // ── AC2: Users and recipes tables with all columns and constraints ──

  describe('AC2: Table structure and constraints', () => {
    describe('users table', () => {
      test('users table exists', () => {
        const db = loadDb();
        const table = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
        ).get();
        expect(table).toBeDefined();
        expect(table.name).toBe('users');
        db.close();
      });

      test('users has all required columns: id, username, email, password_hash, bio, created_at', () => {
        const db = loadDb();
        const columns = db.pragma('table_info(users)');
        const names = columns.map(c => c.name);
        expect(names).toEqual(expect.arrayContaining([
          'id', 'username', 'email', 'password_hash', 'bio', 'created_at'
        ]));
        expect(columns.length).toBe(6);
        db.close();
      });

      test('users.id is INTEGER PRIMARY KEY AUTOINCREMENT', () => {
        const db = loadDb();
        const col = db.pragma('table_info(users)').find(c => c.name === 'id');
        expect(col.type).toBe('INTEGER');
        expect(col.pk).toBe(1);
        db.close();
      });

      test('users.username is TEXT UNIQUE NOT NULL', () => {
        const db = loadDb();
        const col = db.pragma('table_info(users)').find(c => c.name === 'username');
        expect(col.type).toBe('TEXT');
        expect(col.notnull).toBe(1);

        // Verify UNIQUE via index
        const indexes = db.prepare(
          "SELECT * FROM sqlite_master WHERE type='index' AND tbl_name='users'"
        ).all();
        const usernameIdx = indexes.find(idx => {
          const info = db.pragma(`index_info(${idx.name})`);
          return info.some(i => i.name === 'username');
        });
        expect(usernameIdx).toBeDefined();
        db.close();
      });

      test('users.email is TEXT UNIQUE NOT NULL', () => {
        const db = loadDb();
        const col = db.pragma('table_info(users)').find(c => c.name === 'email');
        expect(col.type).toBe('TEXT');
        expect(col.notnull).toBe(1);
        db.close();
      });

      test('users.password_hash is TEXT NOT NULL', () => {
        const db = loadDb();
        const col = db.pragma('table_info(users)').find(c => c.name === 'password_hash');
        expect(col.type).toBe('TEXT');
        expect(col.notnull).toBe(1);
        db.close();
      });

      test("users.bio defaults to empty string ''", () => {
        const db = loadDb();
        const col = db.pragma('table_info(users)').find(c => c.name === 'bio');
        expect(col.type).toBe('TEXT');
        expect(col.dflt_value).toBe("''");
        db.close();
      });

      test('users.created_at defaults to CURRENT_TIMESTAMP', () => {
        const db = loadDb();
        const col = db.pragma('table_info(users)').find(c => c.name === 'created_at');
        expect(col.type).toBe('DATETIME');
        expect(col.dflt_value).toBe('CURRENT_TIMESTAMP');
        db.close();
      });

      test('username UNIQUE constraint rejects duplicates', () => {
        const db = loadDb();
        const insert = db.prepare(
          'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
        );
        insert.run('unique_user', 'a@test.com', 'hash');
        expect(() => insert.run('unique_user', 'b@test.com', 'hash')).toThrow();
        db.close();
      });

      test('email UNIQUE constraint rejects duplicates', () => {
        const db = loadDb();
        const insert = db.prepare(
          'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
        );
        insert.run('u1', 'dup@test.com', 'hash');
        expect(() => insert.run('u2', 'dup@test.com', 'hash')).toThrow();
        db.close();
      });

      test('NOT NULL constraints reject null values for required fields', () => {
        const db = loadDb();
        expect(() => {
          db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run('e@t.com', 'h');
        }).toThrow();
        expect(() => {
          db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('u', 'h');
        }).toThrow();
        expect(() => {
          db.prepare('INSERT INTO users (username, email) VALUES (?, ?)').run('u', 'e@t.com');
        }).toThrow();
        db.close();
      });
    });

    describe('recipes table', () => {
      test('recipes table exists', () => {
        const db = loadDb();
        const table = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='recipes'"
        ).get();
        expect(table).toBeDefined();
        expect(table.name).toBe('recipes');
        db.close();
      });

      test('recipes has all required columns', () => {
        const db = loadDb();
        const columns = db.pragma('table_info(recipes)');
        const names = columns.map(c => c.name);
        expect(names).toEqual(expect.arrayContaining([
          'id', 'user_id', 'title', 'description', 'ingredients',
          'steps', 'cook_time', 'servings', 'created_at', 'updated_at'
        ]));
        expect(columns.length).toBe(10);
        db.close();
      });

      test('recipes.user_id is INTEGER NOT NULL', () => {
        const db = loadDb();
        const col = db.pragma('table_info(recipes)').find(c => c.name === 'user_id');
        expect(col.type).toBe('INTEGER');
        expect(col.notnull).toBe(1);
        db.close();
      });

      test('recipes.title is TEXT NOT NULL', () => {
        const db = loadDb();
        const col = db.pragma('table_info(recipes)').find(c => c.name === 'title');
        expect(col.type).toBe('TEXT');
        expect(col.notnull).toBe(1);
        db.close();
      });

      test("recipes.description defaults to ''", () => {
        const db = loadDb();
        const col = db.pragma('table_info(recipes)').find(c => c.name === 'description');
        expect(col.dflt_value).toBe("''");
        db.close();
      });

      test('recipes.ingredients is TEXT NOT NULL', () => {
        const db = loadDb();
        const col = db.pragma('table_info(recipes)').find(c => c.name === 'ingredients');
        expect(col.type).toBe('TEXT');
        expect(col.notnull).toBe(1);
        db.close();
      });

      test('recipes.steps is TEXT NOT NULL', () => {
        const db = loadDb();
        const col = db.pragma('table_info(recipes)').find(c => c.name === 'steps');
        expect(col.type).toBe('TEXT');
        expect(col.notnull).toBe(1);
        db.close();
      });

      test('recipes.cook_time is INTEGER (nullable)', () => {
        const db = loadDb();
        const col = db.pragma('table_info(recipes)').find(c => c.name === 'cook_time');
        expect(col.type).toBe('INTEGER');
        expect(col.notnull).toBe(0);
        db.close();
      });

      test('recipes.servings is INTEGER (nullable)', () => {
        const db = loadDb();
        const col = db.pragma('table_info(recipes)').find(c => c.name === 'servings');
        expect(col.type).toBe('INTEGER');
        expect(col.notnull).toBe(0);
        db.close();
      });

      test('recipes.created_at defaults to CURRENT_TIMESTAMP', () => {
        const db = loadDb();
        const col = db.pragma('table_info(recipes)').find(c => c.name === 'created_at');
        expect(col.dflt_value).toBe('CURRENT_TIMESTAMP');
        db.close();
      });

      test('recipes.updated_at defaults to CURRENT_TIMESTAMP', () => {
        const db = loadDb();
        const col = db.pragma('table_info(recipes)').find(c => c.name === 'updated_at');
        expect(col.dflt_value).toBe('CURRENT_TIMESTAMP');
        db.close();
      });

      test('NOT NULL constraints reject null for required recipe fields', () => {
        const db = loadDb();
        db.prepare(
          'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
        ).run('recipeowner', 'ro@t.com', 'h');
        const uid = db.prepare('SELECT id FROM users WHERE username = ?').get('recipeowner').id;

        // Missing title
        expect(() => {
          db.prepare('INSERT INTO recipes (user_id, ingredients, steps) VALUES (?, ?, ?)').run(uid, 'i', 's');
        }).toThrow();

        // Missing ingredients
        expect(() => {
          db.prepare('INSERT INTO recipes (user_id, title, steps) VALUES (?, ?, ?)').run(uid, 't', 's');
        }).toThrow();

        // Missing steps
        expect(() => {
          db.prepare('INSERT INTO recipes (user_id, title, ingredients) VALUES (?, ?, ?)').run(uid, 't', 'i');
        }).toThrow();

        db.close();
      });
    });
  });

  // ── AC3: Foreign key from recipes.user_id to users.id is enforced ──

  describe('AC3: Foreign key enforcement', () => {
    test('foreign key metadata links recipes.user_id to users.id', () => {
      const db = loadDb();
      const fkeys = db.pragma('foreign_key_list(recipes)');
      const fk = fkeys.find(f => f.from === 'user_id');
      expect(fk).toBeDefined();
      expect(fk.table).toBe('users');
      expect(fk.to).toBe('id');
      expect(fk.on_delete).toBe('CASCADE');
      db.close();
    });

    test('inserting recipe with non-existent user_id fails', () => {
      const db = loadDb();
      expect(() => {
        db.prepare(
          'INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)'
        ).run(99999, 'Ghost', 'i', 's');
      }).toThrow();
      db.close();
    });

    test('inserting recipe with valid user_id succeeds', () => {
      const db = loadDb();
      const uid = db.prepare(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
      ).run('validuser', 'v@t.com', 'h').lastInsertRowid;

      const result = db.prepare(
        'INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)'
      ).run(uid, 'Valid Recipe', 'i', 's');
      expect(result.changes).toBe(1);
      db.close();
    });

    test('ON DELETE CASCADE removes recipes when user is deleted', () => {
      const db = loadDb();
      const uid = db.prepare(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
      ).run('cascader', 'c@t.com', 'h').lastInsertRowid;

      const ins = db.prepare(
        'INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)'
      );
      ins.run(uid, 'R1', 'i', 's');
      ins.run(uid, 'R2', 'i', 's');

      expect(db.prepare('SELECT COUNT(*) AS cnt FROM recipes WHERE user_id = ?').get(uid).cnt).toBe(2);

      db.prepare('DELETE FROM users WHERE id = ?').run(uid);

      expect(db.prepare('SELECT COUNT(*) AS cnt FROM recipes WHERE user_id = ?').get(uid).cnt).toBe(0);
      db.close();
    });

    test('updating recipe user_id to non-existent user fails', () => {
      const db = loadDb();
      const uid = db.prepare(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
      ).run('origowner', 'oo@t.com', 'h').lastInsertRowid;

      db.prepare(
        'INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)'
      ).run(uid, 'Owned Recipe', 'i', 's');

      expect(() => {
        db.prepare('UPDATE recipes SET user_id = ? WHERE title = ?').run(99999, 'Owned Recipe');
      }).toThrow();
      db.close();
    });
  });

  // ── AC4: Schema runs idempotently ──

  describe('AC4: Schema idempotency', () => {
    test('re-executing schema does not throw', () => {
      const db = loadDb();
      const schemaPath = path.join(__dirname, '..', 'src', 'db', 'schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf-8');

      expect(() => db.exec(schema)).not.toThrow();
      expect(() => db.exec(schema)).not.toThrow();
      expect(() => db.exec(schema)).not.toThrow();
      db.close();
    });

    test('data persists after schema re-execution', () => {
      const db = loadDb();
      db.prepare(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
      ).run('survivor', 'surv@t.com', 'h');

      const schemaPath = path.join(__dirname, '..', 'src', 'db', 'schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf-8');
      db.exec(schema);

      const user = db.prepare('SELECT * FROM users WHERE username = ?').get('survivor');
      expect(user).toBeDefined();
      expect(user.email).toBe('surv@t.com');
      db.close();
    });

    test('table count remains 2 after re-execution', () => {
      const db = loadDb();
      const schemaPath = path.join(__dirname, '..', 'src', 'db', 'schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf-8');
      db.exec(schema);

      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users', 'recipes')"
      ).all();
      expect(tables.length).toBe(2);
      db.close();
    });

    test('reloading the module works cleanly with existing database', () => {
      // First load creates db and schema
      const db1 = loadDb();
      db1.prepare(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
      ).run('persist', 'p@t.com', 'h');
      db1.close();

      // Second load should initialize without error
      jest.resetModules();
      const db2 = require('../src/db/database');
      const user = db2.prepare('SELECT * FROM users WHERE username = ?').get('persist');
      expect(user).toBeDefined();
      db2.close();
    });
  });

  // ── AC5: Database module exports a working better-sqlite3 instance ──

  describe('AC5: Module exports', () => {
    test('module.exports is an object with better-sqlite3 methods', () => {
      const db = loadDb();
      expect(db).toBeDefined();
      expect(typeof db.prepare).toBe('function');
      expect(typeof db.exec).toBe('function');
      expect(typeof db.pragma).toBe('function');
      expect(typeof db.transaction).toBe('function');
      expect(typeof db.close).toBe('function');
      db.close();
    });

    test('exported instance is open and usable', () => {
      const db = loadDb();
      expect(db.open).toBe(true);
      const result = db.prepare('SELECT 42 AS answer').get();
      expect(result.answer).toBe(42);
      db.close();
    });

    test('exported instance can perform prepared statement operations', () => {
      const db = loadDb();
      const stmt = db.prepare(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
      );
      const result = stmt.run('stmtuser', 'stmt@t.com', 'h');
      expect(result.changes).toBe(1);
      expect(result.lastInsertRowid).toBeGreaterThan(0);
      db.close();
    });

    test('exported instance supports transactions', () => {
      const db = loadDb();
      const insert = db.prepare(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
      );
      const txn = db.transaction((items) => {
        for (const item of items) {
          insert.run(item.username, item.email, 'h');
        }
      });

      txn([
        { username: 'txn1', email: 'txn1@t.com' },
        { username: 'txn2', email: 'txn2@t.com' },
      ]);

      const count = db.prepare('SELECT COUNT(*) AS cnt FROM users').get().cnt;
      expect(count).toBe(2);
      db.close();
    });
  });

  // ── AC6: WAL mode and foreign keys are enabled ──

  describe('AC6: WAL mode and foreign keys', () => {
    test('journal_mode is WAL', () => {
      const db = loadDb();
      const mode = db.pragma('journal_mode', { simple: true });
      expect(mode).toBe('wal');
      db.close();
    });

    test('foreign_keys pragma is ON (1)', () => {
      const db = loadDb();
      const fk = db.pragma('foreign_keys', { simple: true });
      expect(fk).toBe(1);
      db.close();
    });

    test('WAL mode persists after write operations', () => {
      const db = loadDb();
      db.prepare(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
      ).run('walcheck', 'wal@t.com', 'h');
      const mode = db.pragma('journal_mode', { simple: true });
      expect(mode).toBe('wal');
      db.close();
    });

    test('foreign key enforcement persists after multiple operations', () => {
      const db = loadDb();
      db.prepare(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
      ).run('fkcheck', 'fk@t.com', 'h');

      // FK should still be enforced
      expect(() => {
        db.prepare(
          'INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)'
        ).run(99999, 'BadFK', 'i', 's');
      }).toThrow();
      db.close();
    });
  });

  // ── Additional edge cases for complete QA ──

  describe('Edge cases', () => {
    test('database.js source references default path ./data/recipes.db', () => {
      const src = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'db', 'database.js'), 'utf-8'
      );
      expect(src).toContain('DATABASE_PATH');
      expect(src).toContain('recipes.db');
    });

    test('schema.sql uses CREATE TABLE IF NOT EXISTS for both tables', () => {
      const schema = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'db', 'schema.sql'), 'utf-8'
      );
      const matches = schema.match(/CREATE TABLE IF NOT EXISTS/gi);
      expect(matches).not.toBeNull();
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    test('inserting a full recipe with all fields works correctly', () => {
      const db = loadDb();
      const uid = db.prepare(
        'INSERT INTO users (username, email, password_hash, bio) VALUES (?, ?, ?, ?)'
      ).run('fullchef', 'full@t.com', 'hash123', 'A great chef').lastInsertRowid;

      const rid = db.prepare(
        'INSERT INTO recipes (user_id, title, description, ingredients, steps, cook_time, servings) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(uid, 'Full Recipe', 'A complete recipe', 'flour, eggs, sugar', '1. Mix 2. Bake', 45, 8).lastInsertRowid;

      const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(rid);
      expect(recipe.user_id).toBe(Number(uid));
      expect(recipe.title).toBe('Full Recipe');
      expect(recipe.description).toBe('A complete recipe');
      expect(recipe.ingredients).toBe('flour, eggs, sugar');
      expect(recipe.steps).toBe('1. Mix 2. Bake');
      expect(recipe.cook_time).toBe(45);
      expect(recipe.servings).toBe(8);
      expect(recipe.created_at).toBeTruthy();
      expect(recipe.updated_at).toBeTruthy();
      db.close();
    });

    test('multiple users with multiple recipes maintain referential integrity', () => {
      const db = loadDb();
      const ins = db.prepare(
        'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
      );
      const u1 = ins.run('chef1', 'c1@t.com', 'h').lastInsertRowid;
      const u2 = ins.run('chef2', 'c2@t.com', 'h').lastInsertRowid;

      const insR = db.prepare(
        'INSERT INTO recipes (user_id, title, ingredients, steps) VALUES (?, ?, ?, ?)'
      );
      insR.run(u1, 'R1', 'i', 's');
      insR.run(u1, 'R2', 'i', 's');
      insR.run(u2, 'R3', 'i', 's');

      // Delete user1 — only user1's recipes gone
      db.prepare('DELETE FROM users WHERE id = ?').run(u1);

      expect(db.prepare('SELECT COUNT(*) AS c FROM recipes WHERE user_id = ?').get(u1).c).toBe(0);
      expect(db.prepare('SELECT COUNT(*) AS c FROM recipes WHERE user_id = ?').get(u2).c).toBe(1);
      expect(db.prepare('SELECT COUNT(*) AS c FROM users').get().c).toBe(1);
      db.close();
    });
  });
});
