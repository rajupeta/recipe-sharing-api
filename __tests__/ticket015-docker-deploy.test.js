/**
 * TICKET-015 Docker Deployment Validation — Test Agent QA
 *
 * Comprehensive tests validating Docker deployment configuration:
 * - Dockerfile multi-stage build correctness
 * - docker-compose.yml service configuration
 * - .dockerignore completeness
 * - Health endpoint availability
 * - Cross-file consistency for deployment readiness
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const request = require('supertest');

const rootDir = path.resolve(__dirname, '..');

function readFile(name) {
  return fs.readFileSync(path.join(rootDir, name), 'utf8');
}

describe('TICKET-015: Dockerfile multi-stage build', () => {
  let dockerfile;
  let lines;

  beforeAll(() => {
    dockerfile = readFile('Dockerfile');
    lines = dockerfile.split('\n');
  });

  it('has exactly two build stages', () => {
    const stages = lines.filter(l => /^FROM\s/.test(l));
    expect(stages).toHaveLength(2);
  });

  it('first stage is named "deps"', () => {
    const firstFrom = lines.find(l => /^FROM\s/.test(l));
    expect(firstFrom).toMatch(/AS deps$/);
  });

  it('second stage is named "production"', () => {
    const fromLines = lines.filter(l => /^FROM\s/.test(l));
    expect(fromLines[1]).toMatch(/AS production$/);
  });

  it('both stages use identical base image node:20-alpine', () => {
    const fromLines = lines.filter(l => /^FROM\s/.test(l));
    fromLines.forEach(line => {
      expect(line).toMatch(/^FROM node:20-alpine\s/);
    });
  });

  it('deps stage copies package files before npm ci', () => {
    const depsStageStart = lines.findIndex(l => l.includes('AS deps'));
    const prodStageStart = lines.findIndex(l => l.includes('AS production'));
    const depsStage = lines.slice(depsStageStart, prodStageStart);
    const copyIdx = depsStage.findIndex(l => /COPY package/.test(l));
    const npmIdx = depsStage.findIndex(l => /npm ci/.test(l));
    expect(copyIdx).toBeGreaterThan(-1);
    expect(npmIdx).toBeGreaterThan(copyIdx);
  });

  it('production stage copies node_modules from deps', () => {
    const prodStageStart = lines.findIndex(l => l.includes('AS production'));
    const prodStage = lines.slice(prodStageStart);
    const copyFromDeps = prodStage.find(l => /COPY --from=deps/.test(l));
    expect(copyFromDeps).toBeDefined();
    expect(copyFromDeps).toContain('node_modules');
  });

  it('production stage copies application source code', () => {
    const prodStageStart = lines.findIndex(l => l.includes('AS production'));
    const prodStage = lines.slice(prodStageStart);
    const copyAll = prodStage.find(l => l.trim() === 'COPY . .');
    expect(copyAll).toBeDefined();
  });

  it('creates data directory for SQLite persistence', () => {
    expect(dockerfile).toContain('mkdir -p data');
  });

  it('does not use npm install anywhere', () => {
    const npmInstallLines = lines.filter(l => /npm install/.test(l));
    expect(npmInstallLines).toHaveLength(0);
  });

  it('does not contain ENV instructions with secrets', () => {
    const envLines = lines.filter(l => /^ENV\s/.test(l));
    envLines.forEach(line => {
      expect(line).not.toMatch(/secret|password|token|key/i);
    });
  });

  it('does not contain ADD instructions (COPY is preferred)', () => {
    const addLines = lines.filter(l => /^ADD\s/.test(l));
    expect(addLines).toHaveLength(0);
  });
});

describe('TICKET-015: docker-compose.yml configuration', () => {
  let compose;
  let lines;

  beforeAll(() => {
    compose = readFile('docker-compose.yml');
    lines = compose.split('\n');
  });

  it('specifies version 3.8', () => {
    expect(lines[0]).toMatch(/^version:\s+['"]3\.8['"]/);
  });

  it('defines services section', () => {
    expect(compose).toMatch(/^services:/m);
  });

  it('app service builds from current directory', () => {
    expect(compose).toMatch(/build:\s*\./);
  });

  it('maps host port 3000 to container port 3000', () => {
    expect(compose).toMatch(/['"]3000:3000['"]/);
  });

  it('sets PORT environment variable to 3000', () => {
    expect(compose).toContain('PORT=3000');
  });

  it('sets JWT_SECRET placeholder', () => {
    expect(compose).toContain('JWT_SECRET=change_me_in_production');
  });

  it('sets DATABASE_PATH to /app/data/recipes.db', () => {
    expect(compose).toContain('DATABASE_PATH=/app/data/recipes.db');
  });

  it('mounts recipe-data volume to /app/data', () => {
    expect(compose).toMatch(/recipe-data:\/app\/data/);
  });

  it('uses unless-stopped restart policy', () => {
    expect(compose).toMatch(/restart:\s*unless-stopped/);
  });

  it('declares recipe-data as top-level named volume', () => {
    const topLevelVolumes = lines.findIndex(l => /^volumes:/.test(l));
    expect(topLevelVolumes).toBeGreaterThan(-1);
    const nextLine = lines[topLevelVolumes + 1];
    expect(nextLine).toMatch(/\s+recipe-data:/);
  });

  it('uses spaces for indentation (no tabs)', () => {
    lines.forEach(line => {
      expect(line).not.toContain('\t');
    });
  });

  it('does not define healthcheck (not required)', () => {
    expect(compose).not.toMatch(/healthcheck:/);
  });
});

describe('TICKET-015: .dockerignore entries', () => {
  let entries;

  beforeAll(() => {
    const content = readFile('.dockerignore');
    entries = content.split('\n').map(l => l.trim()).filter(Boolean);
  });

  const requiredExclusions = [
    'node_modules',
    '.git',
    '.env',
    '.env.*',
    'tests',
    '__tests__',
    '*.test.js',
    '.github',
    '.eslintrc*',
    'coverage',
    '.nyc_output',
    'data/*.db',
  ];

  it.each(requiredExclusions)('excludes %s', (entry) => {
    expect(entries).toContain(entry);
  });

  const mustNotExclude = [
    'src',
    'src/',
    'package.json',
    'package-lock.json',
    'Dockerfile',
    'docker-compose.yml',
    '*.js',
  ];

  it.each(mustNotExclude)('does NOT exclude %s', (entry) => {
    expect(entries).not.toContain(entry);
  });

  it('has at least 10 entries for thorough exclusion', () => {
    expect(entries.length).toBeGreaterThanOrEqual(10);
  });
});

describe('TICKET-015: Health endpoint integration', () => {
  let app;

  beforeAll(() => {
    app = require(path.join(rootDir, 'src', 'app'));
  });

  it('GET /health returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  it('GET /health returns { status: "ok" }', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /health returns JSON content type', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['content-type']).toMatch(/json/);
  });

  it('GET /health responds quickly (under 500ms)', async () => {
    const start = Date.now();
    await request(app).get('/health');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500);
  });
});

describe('TICKET-015: Deployment file consistency', () => {
  it('Dockerfile EXPOSE matches docker-compose port and PORT env', () => {
    const dockerfile = readFile('Dockerfile');
    const compose = readFile('docker-compose.yml');
    const exposed = dockerfile.match(/EXPOSE (\d+)/);
    expect(exposed).not.toBeNull();
    expect(compose).toContain(`${exposed[1]}:${exposed[1]}`);
    expect(compose).toContain(`PORT=${exposed[1]}`);
  });

  it('Dockerfile CMD matches package.json start script and main', () => {
    const dockerfile = readFile('Dockerfile');
    const pkg = JSON.parse(readFile('package.json'));
    const cmd = dockerfile.match(/CMD \["node", "(.+)"\]/);
    expect(cmd).not.toBeNull();
    expect(pkg.scripts.start).toBe(`node ${cmd[1]}`);
    expect(pkg.main).toBe(cmd[1]);
  });

  it('docker-compose DATABASE_PATH is inside the volume mount', () => {
    const compose = readFile('docker-compose.yml');
    const dbPath = compose.match(/DATABASE_PATH=(\/\S+)/);
    const mount = compose.match(/recipe-data:(\/\S+)/);
    expect(dbPath).not.toBeNull();
    expect(mount).not.toBeNull();
    expect(dbPath[1].startsWith(mount[1])).toBe(true);
  });

  it('server entry point exists on disk', () => {
    const dockerfile = readFile('Dockerfile');
    const cmd = dockerfile.match(/CMD \["node", "(.+)"\]/);
    expect(cmd).not.toBeNull();
    const entryPoint = path.join(rootDir, cmd[1]);
    expect(fs.existsSync(entryPoint)).toBe(true);
  });

  it('all required production dependencies are in package.json', () => {
    const pkg = JSON.parse(readFile('package.json'));
    const required = ['express', 'cors', 'dotenv', 'better-sqlite3', 'jsonwebtoken', 'bcryptjs'];
    required.forEach(dep => {
      expect(pkg.dependencies[dep]).toBeDefined();
    });
  });

  it('devDependencies exist and would be excluded by --only=production', () => {
    const pkg = JSON.parse(readFile('package.json'));
    expect(Object.keys(pkg.devDependencies).length).toBeGreaterThan(0);
    const dockerfile = readFile('Dockerfile');
    expect(dockerfile).toContain('--only=production');
  });
});

describe('TICKET-015: All three deployment files exist', () => {
  const deploymentFiles = ['Dockerfile', 'docker-compose.yml', '.dockerignore'];

  it.each(deploymentFiles)('%s exists and is non-empty', (file) => {
    const filePath = path.join(rootDir, file);
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content.trim().length).toBeGreaterThan(0);
  });
});
