/**
 * TICKET-001 Acceptance Criteria Validation
 *
 * Verifies every acceptance criterion from the ticket:
 * 1. npm install succeeds without errors
 * 2. npm start launches Express server on configured PORT
 * 3. GET /health returns 200 with {status: 'ok'}
 * 4. .env.example exists with PORT, JWT_SECRET, DATABASE_PATH
 * 5. Project structure directories exist
 * 6. package.json has all listed dependencies
 */

const request = require('supertest');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const app = require('../src/app');

// ---------- AC 1: npm install succeeds ----------
describe('AC1: npm install succeeds without errors', () => {
  it('node_modules directory should exist', () => {
    expect(fs.existsSync(path.join(rootDir, 'node_modules'))).toBe(true);
  });

  it('package-lock.json should exist', () => {
    expect(fs.existsSync(path.join(rootDir, 'package-lock.json'))).toBe(true);
  });

  it('all dependencies should be resolvable', () => {
    const pkg = require(path.join(rootDir, 'package.json'));
    const allDeps = Object.keys(pkg.dependencies);
    allDeps.forEach((dep) => {
      expect(() => require.resolve(dep)).not.toThrow();
    });
  });

  it('all devDependencies should be resolvable', () => {
    const pkg = require(path.join(rootDir, 'package.json'));
    const allDevDeps = Object.keys(pkg.devDependencies);
    allDevDeps.forEach((dep) => {
      expect(() => require.resolve(dep)).not.toThrow();
    });
  });
});

// ---------- AC 2: npm start launches Express server on configured PORT ----------
describe('AC2: server configuration', () => {
  it('src/server.js should use process.env.PORT', () => {
    const content = fs.readFileSync(path.join(rootDir, 'src', 'server.js'), 'utf8');
    expect(content).toContain('process.env.PORT');
  });

  it('src/server.js should default to port 3000', () => {
    const content = fs.readFileSync(path.join(rootDir, 'src', 'server.js'), 'utf8');
    expect(content).toContain('3000');
  });

  it('src/server.js should call app.listen', () => {
    const content = fs.readFileSync(path.join(rootDir, 'src', 'server.js'), 'utf8');
    expect(content).toMatch(/app\.listen/);
  });

  it('src/server.js should import app from ./app', () => {
    const content = fs.readFileSync(path.join(rootDir, 'src', 'server.js'), 'utf8');
    expect(content).toContain("require('./app')");
  });

  it('src/server.js should load dotenv', () => {
    const content = fs.readFileSync(path.join(rootDir, 'src', 'server.js'), 'utf8');
    expect(content).toMatch(/require\(['"]dotenv['"]\)/);
  });

  it('package.json start script should run src/server.js', () => {
    const pkg = require(path.join(rootDir, 'package.json'));
    expect(pkg.scripts.start).toContain('src/server.js');
  });
});

// ---------- AC 3: GET /health returns 200 with {status: 'ok'} ----------
describe('AC3: GET /health returns 200 with {status: "ok"}', () => {
  it('should return HTTP 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  it('should return JSON content type', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('should return body with status key set to "ok"', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('should not include extra fields in the response', async () => {
    const res = await request(app).get('/health');
    const keys = Object.keys(res.body);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toBe('status');
  });

  it('should respond consistently on repeated calls', async () => {
    const results = await Promise.all([
      request(app).get('/health'),
      request(app).get('/health'),
      request(app).get('/health'),
    ]);
    results.forEach((res) => {
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });
});

// ---------- AC 4: .env.example exists with required vars ----------
describe('AC4: .env.example exists with PORT, JWT_SECRET, DATABASE_PATH', () => {
  let content;

  beforeAll(() => {
    content = fs.readFileSync(path.join(rootDir, '.env.example'), 'utf8');
  });

  it('.env.example file should exist', () => {
    expect(fs.existsSync(path.join(rootDir, '.env.example'))).toBe(true);
  });

  it('should contain PORT variable', () => {
    expect(content).toMatch(/^PORT=/m);
  });

  it('should contain JWT_SECRET variable', () => {
    expect(content).toMatch(/^JWT_SECRET=/m);
  });

  it('should contain DATABASE_PATH variable', () => {
    expect(content).toMatch(/^DATABASE_PATH=/m);
  });

  it('PORT should default to 3000', () => {
    expect(content).toContain('PORT=3000');
  });

  it('DATABASE_PATH should point to data/recipes.db', () => {
    expect(content).toMatch(/DATABASE_PATH=.*recipes\.db/);
  });
});

// ---------- AC 5: Project structure directories exist ----------
describe('AC5: Project structure directories exist', () => {
  const requiredDirs = [
    'src',
    'src/routes',
    'src/models',
    'src/middleware',
    'src/utils',
    'src/db',
    'data',
  ];

  it.each(requiredDirs)('%s should be a directory', (dir) => {
    const fullPath = path.join(rootDir, dir);
    expect(fs.existsSync(fullPath)).toBe(true);
    expect(fs.statSync(fullPath).isDirectory()).toBe(true);
  });
});

// ---------- AC 6: package.json has all listed dependencies ----------
describe('AC6: package.json has all listed dependencies', () => {
  let pkg;

  beforeAll(() => {
    pkg = require(path.join(rootDir, 'package.json'));
  });

  const requiredDeps = [
    'express',
    'better-sqlite3',
    'jsonwebtoken',
    'bcryptjs',
    'cors',
    'dotenv',
    'express-validator',
  ];

  const requiredDevDeps = ['jest', 'supertest', 'eslint'];

  it.each(requiredDeps)('should have dependency: %s', (dep) => {
    expect(pkg.dependencies).toHaveProperty(dep);
    expect(typeof pkg.dependencies[dep]).toBe('string');
  });

  it.each(requiredDevDeps)('should have devDependency: %s', (dep) => {
    expect(pkg.devDependencies).toHaveProperty(dep);
    expect(typeof pkg.devDependencies[dep]).toBe('string');
  });

  it('should have "start" script', () => {
    expect(pkg.scripts.start).toBeDefined();
  });

  it('should have "test" script using jest', () => {
    expect(pkg.scripts.test).toContain('jest');
  });

  it('should have "lint" script using eslint', () => {
    expect(pkg.scripts.lint).toContain('eslint');
  });
});

// ---------- Middleware configuration ----------
describe('Middleware configuration', () => {
  it('should use cors middleware (Access-Control-Allow-Origin header)', async () => {
    const res = await request(app).get('/health');
    expect(res.headers).toHaveProperty('access-control-allow-origin');
  });

  it('should respond to CORS preflight OPTIONS request', async () => {
    const res = await request(app)
      .options('/health')
      .set('Origin', 'http://example.com')
      .set('Access-Control-Request-Method', 'GET');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBeDefined();
  });

  it('should parse JSON request bodies (express.json())', async () => {
    const res = await request(app)
      .post('/nonexistent')
      .send({ key: 'value' })
      .set('Content-Type', 'application/json');
    // Route does not exist but JSON parsing should not error
    expect(res.status).toBe(404);
  });
});

// ---------- ESLint configuration ----------
describe('ESLint configuration', () => {
  it('.eslintrc.json should exist', () => {
    expect(fs.existsSync(path.join(rootDir, '.eslintrc.json'))).toBe(true);
  });

  it('.eslintrc.json should be valid JSON', () => {
    const content = fs.readFileSync(path.join(rootDir, '.eslintrc.json'), 'utf8');
    expect(() => JSON.parse(content)).not.toThrow();
  });

  it('.eslintrc.json should configure node environment', () => {
    const config = JSON.parse(
      fs.readFileSync(path.join(rootDir, '.eslintrc.json'), 'utf8')
    );
    expect(config.env).toHaveProperty('node', true);
  });

  it('.eslintrc.json should configure jest environment', () => {
    const config = JSON.parse(
      fs.readFileSync(path.join(rootDir, '.eslintrc.json'), 'utf8')
    );
    expect(config.env).toHaveProperty('jest', true);
  });
});
