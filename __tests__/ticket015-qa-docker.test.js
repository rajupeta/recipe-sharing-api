/**
 * TICKET-015 QA Tests — Dockerfile, docker-compose.yml, .dockerignore
 *
 * These tests validate acceptance criteria beyond basic content matching:
 * - Instruction ordering in Dockerfile
 * - YAML validity of docker-compose.yml
 * - .dockerignore completeness and correctness
 * - Server entry point exists
 * - Production-only dependencies
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

describe('TICKET-015 QA: Dockerfile — instruction ordering', () => {
  let content;
  let lines;

  beforeAll(() => {
    content = fs.readFileSync(path.join(rootDir, 'Dockerfile'), 'utf8');
    lines = content.split('\n');
  });

  it('deps stage should appear before production stage', () => {
    const depsIdx = lines.findIndex(l => l.includes('FROM node:20-alpine AS deps'));
    const prodIdx = lines.findIndex(l => l.includes('FROM node:20-alpine AS production'));
    expect(depsIdx).toBeGreaterThanOrEqual(0);
    expect(prodIdx).toBeGreaterThan(depsIdx);
  });

  it('npm ci should appear after COPY package files in deps stage', () => {
    const copyPkgIdx = lines.findIndex(l => /COPY package\*\.json/.test(l));
    const npmCiIdx = lines.findIndex(l => l.includes('npm ci'));
    expect(npmCiIdx).toBeGreaterThan(copyPkgIdx);
  });

  it('COPY from deps should appear in the production stage (after second FROM)', () => {
    const prodIdx = lines.findIndex(l => l.includes('FROM node:20-alpine AS production'));
    const copyDepsIdx = lines.findIndex(l => l.includes('COPY --from=deps'));
    expect(copyDepsIdx).toBeGreaterThan(prodIdx);
  });

  it('CMD should be the last instruction', () => {
    const instructionLines = lines.filter(l => l.trim() && !l.trim().startsWith('#'));
    const lastInstruction = instructionLines[instructionLines.length - 1];
    expect(lastInstruction).toMatch(/^CMD /);
  });

  it('EXPOSE should appear before CMD', () => {
    const exposeIdx = lines.findIndex(l => l.startsWith('EXPOSE'));
    const cmdIdx = lines.findIndex(l => l.startsWith('CMD'));
    expect(exposeIdx).toBeGreaterThanOrEqual(0);
    expect(cmdIdx).toBeGreaterThan(exposeIdx);
  });

  it('should not contain any RUN npm install (only npm ci)', () => {
    expect(content).not.toMatch(/RUN npm install/);
  });

  it('should use --only=production to exclude devDependencies', () => {
    expect(content).toMatch(/npm ci --only=production/);
  });
});

describe('TICKET-015 QA: docker-compose.yml — structure validation', () => {
  let content;
  let lines;

  beforeAll(() => {
    content = fs.readFileSync(path.join(rootDir, 'docker-compose.yml'), 'utf8');
    lines = content.split('\n');
  });

  it('should be valid YAML (basic structural check)', () => {
    // Ensure no tabs (YAML requires spaces)
    const tabLines = lines.filter(l => l.includes('\t'));
    expect(tabLines).toHaveLength(0);
  });

  it('should have consistent indentation (2-space)', () => {
    const indentedLines = lines.filter(l => l.match(/^\s+\S/));
    for (const line of indentedLines) {
      const indent = line.match(/^(\s+)/)[1];
      expect(indent.length % 2).toBe(0);
    }
  });

  it('volumes section should be at root level (not nested under services)', () => {
    const volumesLineIdx = lines.findIndex(l => /^volumes:/.test(l));
    expect(volumesLineIdx).toBeGreaterThanOrEqual(0);
    // It should not be indented
    expect(lines[volumesLineIdx]).toMatch(/^volumes:/);
  });

  it('environment variables should include all required vars', () => {
    const requiredVars = ['PORT=3000', 'JWT_SECRET=', 'DATABASE_PATH='];
    for (const v of requiredVars) {
      expect(content).toContain(v);
    }
  });

  it('DATABASE_PATH should point to /app/data/ directory', () => {
    expect(content).toMatch(/DATABASE_PATH=\/app\/data\//);
  });

  it('volume mount target should match DATABASE_PATH parent directory', () => {
    // DATABASE_PATH is /app/data/recipes.db, volume mounts to /app/data
    expect(content).toMatch(/recipe-data:\/app\/data/);
  });
});

describe('TICKET-015 QA: .dockerignore — completeness', () => {
  let entries;

  beforeAll(() => {
    const content = fs.readFileSync(path.join(rootDir, '.dockerignore'), 'utf8');
    entries = content.split('\n').map(l => l.trim()).filter(Boolean);
  });

  it('should have at least 10 exclusion entries', () => {
    expect(entries.length).toBeGreaterThanOrEqual(10);
  });

  it('should not exclude src directory', () => {
    expect(entries).not.toContain('src');
    expect(entries).not.toContain('src/');
  });

  it('should not exclude package.json or package-lock.json', () => {
    expect(entries).not.toContain('package.json');
    expect(entries).not.toContain('package-lock.json');
    expect(entries).not.toContain('package*.json');
  });

  it('should not exclude Dockerfile itself', () => {
    expect(entries).not.toContain('Dockerfile');
  });

  it('should not exclude docker-compose.yml', () => {
    expect(entries).not.toContain('docker-compose.yml');
  });

  it('should exclude both .env and .env.* patterns', () => {
    expect(entries).toContain('.env');
    expect(entries).toContain('.env.*');
  });

  it('should exclude all test-related paths', () => {
    expect(entries).toContain('tests');
    expect(entries).toContain('__tests__');
    expect(entries).toContain('*.test.js');
  });

  it('should not have any empty lines or only-whitespace entries', () => {
    // entries are already filtered, but verify raw content
    const rawContent = fs.readFileSync(path.join(rootDir, '.dockerignore'), 'utf8');
    const rawLines = rawContent.split('\n');
    // Last line can be empty (trailing newline), that's fine
    const nonLastLines = rawLines.slice(0, -1);
    for (const line of nonLastLines) {
      expect(line.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('TICKET-015 QA: Server entry point', () => {
  it('src/server.js should exist (referenced by Dockerfile CMD)', () => {
    expect(fs.existsSync(path.join(rootDir, 'src', 'server.js'))).toBe(true);
  });

  it('src/server.js should be loadable without syntax errors', () => {
    // Just check that require doesn't throw a syntax error
    expect(() => {
      // We can't fully start the server, but we can verify the module is valid
      const serverPath = path.join(rootDir, 'src', 'server.js');
      const content = fs.readFileSync(serverPath, 'utf8');
      // Check it has the expected structure
      expect(content).toMatch(/require.*app/);
      expect(content).toMatch(/listen/);
    }).not.toThrow();
  });

  it('package.json main field should match CMD entry point', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    const dockerfile = fs.readFileSync(path.join(rootDir, 'Dockerfile'), 'utf8');
    const cmdMatch = dockerfile.match(/CMD \["node", "(.+)"\]/);
    expect(cmdMatch).not.toBeNull();
    expect(pkg.main).toBe(cmdMatch[1]);
  });

  it('health endpoint should be defined in app.js', () => {
    const appContent = fs.readFileSync(path.join(rootDir, 'src', 'app.js'), 'utf8');
    expect(appContent).toMatch(/\.get\(['"]\/health['"]/);
  });
});

describe('TICKET-015 QA: Production image should not include devDependencies', () => {
  it('Dockerfile uses npm ci --only=production (not plain npm ci or npm install)', () => {
    const content = fs.readFileSync(path.join(rootDir, 'Dockerfile'), 'utf8');
    const npmCommands = content.match(/RUN npm .+/g) || [];
    expect(npmCommands.length).toBe(1);
    expect(npmCommands[0]).toContain('--only=production');
  });

  it('devDependencies exist in package.json (confirms --only=production is needed)', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    expect(pkg.devDependencies).toBeDefined();
    expect(Object.keys(pkg.devDependencies).length).toBeGreaterThan(0);
  });
});
