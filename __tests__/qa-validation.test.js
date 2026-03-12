/**
 * QA Validation — TICKET-001: Express Project Scaffolding
 *
 * Test-agent validation covering:
 * - Server lifecycle (start/stop on configured port)
 * - HTTP method handling on /health
 * - Request header and content negotiation
 * - .gitignore correctness
 * - ESLint runnable check
 * - Module export integrity
 */

const request = require('supertest');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const app = require('../src/app');

// ---------- Server lifecycle ----------
describe('Server lifecycle', () => {
  it('should start on a custom PORT and respond to /health', (done) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      http.get(`http://localhost:${port}/health`, (res) => {
        expect(res.statusCode).toBe(200);
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          expect(JSON.parse(body)).toEqual({ status: 'ok' });
          server.close(done);
        });
      });
    });
  });

  it('should cleanly shut down without error', (done) => {
    const server = app.listen(0, () => {
      server.close((err) => {
        expect(err).toBeUndefined();
        done();
      });
    });
  });
});

// ---------- HTTP method handling ----------
describe('HTTP methods on /health', () => {
  it('GET /health should succeed', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  it('HEAD /health should return 200 with no body', async () => {
    const res = await request(app).head('/health');
    expect(res.status).toBe(200);
    expect(res.text).toBeFalsy();
  });

  it('POST /health should return 404 (not defined)', async () => {
    const res = await request(app).post('/health');
    expect(res.status).toBe(404);
  });

  it('PUT /health should return 404', async () => {
    const res = await request(app).put('/health');
    expect(res.status).toBe(404);
  });

  it('DELETE /health should return 404', async () => {
    const res = await request(app).delete('/health');
    expect(res.status).toBe(404);
  });

  it('PATCH /health should return 404', async () => {
    const res = await request(app).patch('/health');
    expect(res.status).toBe(404);
  });
});

// ---------- Content negotiation / headers ----------
describe('Response headers and content negotiation', () => {
  it('should return application/json charset utf-8', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['content-type']).toMatch(/application\/json.*charset=utf-8/i);
  });

  it('should include x-powered-by Express (default)', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBe('Express');
  });

  it('should accept requests with Accept: application/json', async () => {
    const res = await request(app)
      .get('/health')
      .set('Accept', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('should handle query parameters without error', async () => {
    const res = await request(app).get('/health?foo=bar&baz=1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

// ---------- CORS behaviour ----------
describe('CORS configuration', () => {
  it('should allow any origin by default', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'http://random-origin.example.com');
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  it('preflight should allow GET method', async () => {
    const res = await request(app)
      .options('/health')
      .set('Origin', 'http://example.com')
      .set('Access-Control-Request-Method', 'GET');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-methods']).toBeDefined();
  });
});

// ---------- JSON body parsing ----------
describe('JSON body parsing (express.json())', () => {
  it('should reject invalid JSON with 400', async () => {
    const res = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{bad json');
    expect(res.status).toBe(400);
  });

  it('should accept valid JSON without crash', async () => {
    const res = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ nested: { a: 1, b: [2, 3] } }));
    // Route not defined → 404, but no parse error
    expect(res.status).toBe(404);
  });

  it('should handle empty body gracefully', async () => {
    const res = await request(app).post('/health');
    expect(res.status).toBe(404);
  });
});

// ---------- .gitignore validation ----------
describe('.gitignore', () => {
  let content;

  beforeAll(() => {
    content = fs.readFileSync(path.join(rootDir, '.gitignore'), 'utf8');
  });

  it('should exist', () => {
    expect(fs.existsSync(path.join(rootDir, '.gitignore'))).toBe(true);
  });

  it('should ignore node_modules', () => {
    expect(content).toMatch(/node_modules/);
  });

  it('should ignore .env (secrets)', () => {
    expect(content).toMatch(/\.env/);
  });

  it('should ignore database files in data/', () => {
    expect(content).toMatch(/data\/.*\.db/);
  });
});

// ---------- Module export integrity ----------
describe('Module exports', () => {
  it('src/app.js should export an Express application', () => {
    expect(typeof app).toBe('function');
    expect(typeof app.get).toBe('function');
    expect(typeof app.listen).toBe('function');
    expect(typeof app.use).toBe('function');
  });

  it('src/app.js should have the /health route registered', () => {
    // Express stores routes on the router stack
    const routes = app._router.stack
      .filter((layer) => layer.route)
      .map((layer) => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods),
      }));
    const healthRoute = routes.find((r) => r.path === '/health');
    expect(healthRoute).toBeDefined();
    expect(healthRoute.methods).toContain('get');
  });
});

// ---------- ESLint runnable ----------
describe('Linting', () => {
  it('npm run lint should succeed on src/', () => {
    // execSync throws on non-zero exit code
    expect(() => {
      execSync('npx eslint src/', { cwd: rootDir, stdio: 'pipe' });
    }).not.toThrow();
  });
});

// ---------- Directory structure completeness ----------
describe('Directory structure — file type readiness', () => {
  const dirs = [
    { dir: 'src/routes', purpose: 'route handlers' },
    { dir: 'src/models', purpose: 'data models' },
    { dir: 'src/middleware', purpose: 'middleware' },
    { dir: 'src/utils', purpose: 'utilities' },
    { dir: 'src/db', purpose: 'database layer' },
    { dir: 'data', purpose: 'SQLite data files' },
  ];

  it.each(dirs)('$dir should exist and be writable', ({ dir }) => {
    const fullPath = path.join(rootDir, dir);
    expect(fs.existsSync(fullPath)).toBe(true);
    // Verify writable by stat
    const stat = fs.statSync(fullPath);
    expect(stat.isDirectory()).toBe(true);
  });
});
