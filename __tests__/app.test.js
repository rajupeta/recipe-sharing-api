const request = require('supertest');
const app = require('../src/app');

describe('Express App', () => {
  describe('GET /health', () => {
    it('should return 200 with status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });

  describe('Middleware', () => {
    it('should parse JSON bodies', async () => {
      const res = await request(app)
        .post('/health')
        .send({ test: true })
        .set('Content-Type', 'application/json');
      // POST to /health isn't defined, so 404 is expected,
      // but the request should not fail due to JSON parsing
      expect(res.status).toBe(404);
    });

    it('should include CORS headers', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['access-control-allow-origin']).toBe('*');
    });
  });
});

describe('Project structure', () => {
  const fs = require('fs');
  const path = require('path');
  const rootDir = path.resolve(__dirname, '..');

  const requiredDirs = [
    'src',
    'src/routes',
    'src/models',
    'src/middleware',
    'src/utils',
    'src/db',
    'data',
  ];

  it.each(requiredDirs)('directory %s should exist', (dir) => {
    expect(fs.existsSync(path.join(rootDir, dir))).toBe(true);
  });

  it('.env.example should contain required variables', () => {
    const content = fs.readFileSync(path.join(rootDir, '.env.example'), 'utf8');
    expect(content).toContain('PORT=');
    expect(content).toContain('JWT_SECRET=');
    expect(content).toContain('DATABASE_PATH=');
  });

  it('package.json should have all required dependencies', () => {
    const pkg = require(path.join(rootDir, 'package.json'));
    const requiredDeps = [
      'express', 'better-sqlite3', 'jsonwebtoken',
      'bcryptjs', 'cors', 'dotenv', 'express-validator',
    ];
    const requiredDevDeps = ['jest', 'supertest', 'eslint'];

    requiredDeps.forEach((dep) => {
      expect(pkg.dependencies).toHaveProperty(dep);
    });
    requiredDevDeps.forEach((dep) => {
      expect(pkg.devDependencies).toHaveProperty(dep);
    });
  });

  it('package.json should have required npm scripts', () => {
    const pkg = require(path.join(rootDir, 'package.json'));
    expect(pkg.scripts).toHaveProperty('start');
    expect(pkg.scripts).toHaveProperty('test');
    expect(pkg.scripts).toHaveProperty('lint');
  });
});
