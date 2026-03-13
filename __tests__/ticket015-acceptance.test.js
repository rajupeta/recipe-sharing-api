/**
 * TICKET-015 Acceptance Criteria Tests — Test Agent Final QA
 *
 * Validates all acceptance criteria for the Docker deployment ticket:
 * 1. docker build produces a working image (validated structurally)
 * 2. docker compose up starts the app (validated via config correctness)
 * 3. GET /health returns 200 (validated via supertest)
 * 4. .dockerignore excludes required paths
 * 5. SQLite data persists via volume mount (validated via compose config)
 * 6. Image uses node:20-alpine base
 * 7. Production image does not include devDependencies
 */

const fs = require('fs');
const path = require('path');
const request = require('supertest');

const rootDir = path.resolve(__dirname, '..');

function readProjectFile(name) {
  return fs.readFileSync(path.join(rootDir, name), 'utf8');
}

describe('TICKET-015 AC: Health endpoint returns 200', () => {
  let app;

  beforeAll(() => {
    app = require(path.join(rootDir, 'src', 'app'));
  });

  it('GET /health should return 200 status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  it('GET /health should return JSON with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /health should have content-type application/json', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

describe('TICKET-015 AC: docker build produces a working image', () => {
  let dockerfile;

  beforeAll(() => {
    dockerfile = readProjectFile('Dockerfile');
  });

  it('Dockerfile exists and is non-empty', () => {
    expect(dockerfile.trim().length).toBeGreaterThan(0);
  });

  it('uses node:20-alpine base image in both stages', () => {
    const fromLines = dockerfile.split('\n').filter(l => l.startsWith('FROM '));
    expect(fromLines).toHaveLength(2);
    fromLines.forEach(line => {
      expect(line).toMatch(/node:20-alpine/);
    });
  });

  it('multi-stage build copies only production deps to final image', () => {
    expect(dockerfile).toMatch(/FROM node:20-alpine AS deps/);
    expect(dockerfile).toMatch(/npm ci --only=production/);
    expect(dockerfile).toMatch(/COPY --from=deps \/app\/node_modules/);
  });

  it('sets up working directory in both stages', () => {
    const lines = dockerfile.split('\n');
    const workdirCount = lines.filter(l => l.trim() === 'WORKDIR /app').length;
    expect(workdirCount).toBe(2);
  });

  it('creates data directory for SQLite', () => {
    expect(dockerfile).toMatch(/mkdir -p data/);
  });

  it('exposes port 3000', () => {
    expect(dockerfile).toMatch(/EXPOSE 3000/);
  });

  it('CMD runs node src/server.js', () => {
    expect(dockerfile).toMatch(/CMD \["node", "src\/server\.js"\]/);
  });

  it('entry point file src/server.js exists and is valid', () => {
    const serverPath = path.join(rootDir, 'src', 'server.js');
    expect(fs.existsSync(serverPath)).toBe(true);
    const content = fs.readFileSync(serverPath, 'utf8');
    expect(content).toContain('require');
    expect(content).toContain('listen');
  });

  it('package.json has all production dependencies needed at runtime', () => {
    const pkg = JSON.parse(readProjectFile('package.json'));
    const requiredDeps = ['express', 'cors', 'dotenv', 'better-sqlite3', 'jsonwebtoken', 'bcryptjs'];
    for (const dep of requiredDeps) {
      expect(pkg.dependencies[dep]).toBeDefined();
    }
  });
});

describe('TICKET-015 AC: docker compose up starts the app', () => {
  let compose;

  beforeAll(() => {
    compose = readProjectFile('docker-compose.yml');
  });

  it('docker-compose.yml exists and is non-empty', () => {
    expect(compose.trim().length).toBeGreaterThan(0);
  });

  it('uses version 3.8', () => {
    expect(compose).toMatch(/^version:\s+['"]3\.8['"]/m);
  });

  it('defines an app service that builds from current directory', () => {
    expect(compose).toMatch(/services:\s+app:/m);
    expect(compose).toMatch(/build:\s*\./);
  });

  it('maps port 3000:3000', () => {
    expect(compose).toMatch(/['"]?3000:3000['"]?/);
  });

  it('sets all required environment variables', () => {
    expect(compose).toContain('PORT=3000');
    expect(compose).toContain('JWT_SECRET=change_me_in_production');
    expect(compose).toContain('DATABASE_PATH=/app/data/recipes.db');
  });

  it('uses unless-stopped restart policy for reliability', () => {
    expect(compose).toMatch(/restart:\s*unless-stopped/);
  });
});

describe('TICKET-015 AC: SQLite data persists via volume mount', () => {
  let compose;

  beforeAll(() => {
    compose = readProjectFile('docker-compose.yml');
  });

  it('mounts named volume recipe-data to /app/data', () => {
    expect(compose).toMatch(/recipe-data:\/app\/data/);
  });

  it('declares recipe-data as a named volume at top level', () => {
    expect(compose).toMatch(/^volumes:\s+recipe-data:/m);
  });

  it('DATABASE_PATH points to a file within the mounted volume', () => {
    const dbPathMatch = compose.match(/DATABASE_PATH=(\/\S+)/);
    expect(dbPathMatch).not.toBeNull();
    expect(dbPathMatch[1]).toBe('/app/data/recipes.db');
    // /app/data/recipes.db is inside the /app/data mount point
    expect(dbPathMatch[1].startsWith('/app/data/')).toBe(true);
  });

  it('Dockerfile creates the data directory that the volume will mount to', () => {
    const dockerfile = readProjectFile('Dockerfile');
    expect(dockerfile).toMatch(/mkdir -p data/);
  });
});

describe('TICKET-015 AC: .dockerignore excludes required paths', () => {
  let entries;

  beforeAll(() => {
    const content = readProjectFile('.dockerignore');
    entries = content.split('\n').map(l => l.trim()).filter(Boolean);
  });

  it('excludes node_modules', () => {
    expect(entries).toContain('node_modules');
  });

  it('excludes .git', () => {
    expect(entries).toContain('.git');
  });

  it('excludes .env and .env.* files', () => {
    expect(entries).toContain('.env');
    expect(entries).toContain('.env.*');
  });

  it('excludes test directories and test files', () => {
    expect(entries).toContain('tests');
    expect(entries).toContain('__tests__');
    expect(entries).toContain('*.test.js');
  });

  it('excludes database files', () => {
    expect(entries).toContain('data/*.db');
  });

  it('excludes coverage and CI artifacts', () => {
    expect(entries).toContain('coverage');
    expect(entries).toContain('.nyc_output');
  });

  it('excludes .github directory', () => {
    expect(entries).toContain('.github');
  });

  it('excludes eslint config', () => {
    expect(entries).toContain('.eslintrc*');
  });

  it('does NOT exclude essential runtime files', () => {
    const critical = ['src', 'src/', 'package.json', 'package-lock.json', 'Dockerfile'];
    for (const f of critical) {
      expect(entries).not.toContain(f);
    }
  });
});

describe('TICKET-015 AC: Production image uses node:20-alpine', () => {
  it('both FROM statements use node:20-alpine (not node:20, not node:latest)', () => {
    const dockerfile = readProjectFile('Dockerfile');
    const fromLines = dockerfile.split('\n').filter(l => l.startsWith('FROM'));
    expect(fromLines.length).toBe(2);
    for (const line of fromLines) {
      expect(line).toMatch(/^FROM node:20-alpine/);
    }
  });
});

describe('TICKET-015 AC: Production image excludes devDependencies', () => {
  it('npm ci uses --only=production flag', () => {
    const dockerfile = readProjectFile('Dockerfile');
    expect(dockerfile).toMatch(/npm ci --only=production/);
  });

  it('does not run npm install anywhere in Dockerfile', () => {
    const dockerfile = readProjectFile('Dockerfile');
    expect(dockerfile).not.toMatch(/npm install/);
  });

  it('devDependencies are listed in package.json (confirming they exist and need exclusion)', () => {
    const pkg = JSON.parse(readProjectFile('package.json'));
    expect(Object.keys(pkg.devDependencies)).toEqual(
      expect.arrayContaining(['jest', 'supertest', 'eslint'])
    );
  });

  it('test script is not referenced in Dockerfile (no test running in production)', () => {
    const dockerfile = readProjectFile('Dockerfile');
    expect(dockerfile).not.toMatch(/npm test/);
    expect(dockerfile).not.toMatch(/npx jest/);
  });
});

describe('TICKET-015 AC: Cross-file consistency checks', () => {
  it('Dockerfile CMD matches package.json start script', () => {
    const dockerfile = readProjectFile('Dockerfile');
    const pkg = JSON.parse(readProjectFile('package.json'));
    const cmdMatch = dockerfile.match(/CMD \["node", "(.+)"\]/);
    expect(cmdMatch).not.toBeNull();
    expect(pkg.scripts.start).toBe(`node ${cmdMatch[1]}`);
  });

  it('Dockerfile CMD matches package.json main field', () => {
    const dockerfile = readProjectFile('Dockerfile');
    const pkg = JSON.parse(readProjectFile('package.json'));
    const cmdMatch = dockerfile.match(/CMD \["node", "(.+)"\]/);
    expect(cmdMatch).not.toBeNull();
    expect(pkg.main).toBe(cmdMatch[1]);
  });

  it('Dockerfile EXPOSE port matches docker-compose port mapping and PORT env', () => {
    const dockerfile = readProjectFile('Dockerfile');
    const compose = readProjectFile('docker-compose.yml');
    const exposeMatch = dockerfile.match(/EXPOSE (\d+)/);
    expect(exposeMatch).not.toBeNull();
    const port = exposeMatch[1];
    expect(compose).toContain(`${port}:${port}`);
    expect(compose).toContain(`PORT=${port}`);
  });

  it('docker-compose volume mount aligns with DATABASE_PATH', () => {
    const compose = readProjectFile('docker-compose.yml');
    const dbPath = compose.match(/DATABASE_PATH=(\/\S+)/);
    const volumeMount = compose.match(/recipe-data:(\/\S+)/);
    expect(dbPath).not.toBeNull();
    expect(volumeMount).not.toBeNull();
    // Database file should be inside the volume mount directory
    expect(dbPath[1].startsWith(volumeMount[1])).toBe(true);
  });
});
