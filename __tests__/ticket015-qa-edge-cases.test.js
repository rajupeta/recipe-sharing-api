/**
 * TICKET-015 QA Edge Cases — Test Agent validation
 *
 * Additional edge-case tests beyond what docker.test.js and
 * ticket015-qa-docker.test.js cover:
 * - Dockerfile security & best practices
 * - docker-compose.yml semantic correctness
 * - .dockerignore safety (does not exclude critical files)
 * - Cross-file consistency between Dockerfile, docker-compose, and package.json
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

function readFile(name) {
  return fs.readFileSync(path.join(rootDir, name), 'utf8');
}

describe('TICKET-015 QA Edge: Dockerfile best practices', () => {
  let content;
  let lines;

  beforeAll(() => {
    content = readFile('Dockerfile');
    lines = content.split('\n');
  });

  it('should not run as root (no USER instruction means default root — acceptable for alpine but noted)', () => {
    // This is informational — node:20-alpine defaults to root.
    // We just ensure the CMD doesn't use sudo or su.
    expect(content).not.toMatch(/sudo|su -/);
  });

  it('should not contain secrets or hardcoded JWT values', () => {
    expect(content).not.toMatch(/JWT_SECRET/i);
    expect(content).not.toMatch(/password/i);
    expect(content).not.toMatch(/secret/i);
  });

  it('should have exactly two FROM instructions (multi-stage)', () => {
    const fromLines = lines.filter(l => l.trim().startsWith('FROM '));
    expect(fromLines).toHaveLength(2);
  });

  it('WORKDIR should be set in both stages', () => {
    const fromIndices = [];
    lines.forEach((l, i) => {
      if (l.trim().startsWith('FROM ')) fromIndices.push(i);
    });
    // Each stage should have a WORKDIR after its FROM
    for (const fromIdx of fromIndices) {
      const stageLines = lines.slice(fromIdx + 1);
      const nextFromIdx = stageLines.findIndex(l => l.trim().startsWith('FROM '));
      const stageEnd = nextFromIdx === -1 ? stageLines.length : nextFromIdx;
      const stageSlice = stageLines.slice(0, stageEnd);
      const hasWorkdir = stageSlice.some(l => l.trim().startsWith('WORKDIR'));
      expect(hasWorkdir).toBe(true);
    }
  });

  it('should not copy .env files (handled by .dockerignore, but verify no explicit COPY .env)', () => {
    expect(content).not.toMatch(/COPY.*\.env/);
  });

  it('should not install devDependencies via npm install --dev or npm ci without --only=production', () => {
    const npmLines = lines.filter(l => l.includes('npm ci') || l.includes('npm install'));
    for (const line of npmLines) {
      // Each npm install/ci line should have --only=production
      expect(line).toMatch(/--only=production/);
    }
  });
});

describe('TICKET-015 QA Edge: docker-compose.yml semantic checks', () => {
  let content;
  let lines;

  beforeAll(() => {
    content = readFile('docker-compose.yml');
    lines = content.split('\n');
  });

  it('should only define one service (app)', () => {
    const serviceMatches = content.match(/^\s{2}\w+:/gm) || [];
    // Under services: we expect only 'app:'
    const servicesIdx = lines.findIndex(l => /^services:/.test(l));
    const volumesIdx = lines.findIndex(l => /^volumes:/.test(l));
    const serviceSection = lines.slice(servicesIdx + 1, volumesIdx === -1 ? lines.length : volumesIdx);
    const topLevelServices = serviceSection.filter(l => /^\s{2}\w+:/.test(l));
    expect(topLevelServices).toHaveLength(1);
    expect(topLevelServices[0].trim()).toBe('app:');
  });

  it('should not expose additional ports beyond 3000', () => {
    const portMatches = content.match(/\d+:\d+/g) || [];
    expect(portMatches).toHaveLength(1);
    expect(portMatches[0]).toBe('3000:3000');
  });

  it('JWT_SECRET should be a placeholder (not empty)', () => {
    const jwtLine = lines.find(l => l.includes('JWT_SECRET'));
    expect(jwtLine).toBeDefined();
    const value = jwtLine.split('JWT_SECRET=')[1];
    expect(value.trim().length).toBeGreaterThan(0);
  });

  it('should use named volume, not bind mount for data', () => {
    // Named volumes look like "volume-name:/path", not "./host-path:/path"
    const volumeMount = lines.find(l => l.includes('recipe-data:/app/data'));
    expect(volumeMount).toBeDefined();
    expect(volumeMount).not.toMatch(/\.\//);
  });

  it('restart policy should be exactly "unless-stopped"', () => {
    const restartLine = lines.find(l => l.includes('restart:'));
    expect(restartLine).toBeDefined();
    expect(restartLine.trim()).toBe('restart: unless-stopped');
  });

  it('should not contain any deprecated docker-compose options', () => {
    expect(content).not.toMatch(/links:/);
    expect(content).not.toMatch(/depends_on:/);
    expect(content).not.toMatch(/container_name:/);
  });
});

describe('TICKET-015 QA Edge: .dockerignore safety', () => {
  let entries;

  beforeAll(() => {
    const content = readFile('.dockerignore');
    entries = content.split('\n').map(l => l.trim()).filter(Boolean);
  });

  it('should not exclude src/', () => {
    const srcExclusions = entries.filter(e => e === 'src' || e === 'src/' || e === 'src/**');
    expect(srcExclusions).toHaveLength(0);
  });

  it('should not exclude server.js or app.js directly', () => {
    expect(entries).not.toContain('server.js');
    expect(entries).not.toContain('app.js');
    expect(entries).not.toContain('*.js');
  });

  it('should not exclude data/ directory itself (only *.db files inside it)', () => {
    expect(entries).not.toContain('data');
    expect(entries).not.toContain('data/');
    expect(entries).toContain('data/*.db');
  });

  it('should not use negation patterns (! prefix) that could re-include excluded files', () => {
    const negations = entries.filter(e => e.startsWith('!'));
    expect(negations).toHaveLength(0);
  });
});

describe('TICKET-015 QA Edge: Cross-file consistency', () => {
  it('Dockerfile EXPOSE port should match docker-compose port mapping', () => {
    const dockerfile = readFile('Dockerfile');
    const compose = readFile('docker-compose.yml');
    const exposeMatch = dockerfile.match(/EXPOSE (\d+)/);
    expect(exposeMatch).not.toBeNull();
    const exposedPort = exposeMatch[1];
    expect(compose).toContain(`${exposedPort}:${exposedPort}`);
  });

  it('Dockerfile CMD entry point should match package.json start script', () => {
    const dockerfile = readFile('Dockerfile');
    const pkg = JSON.parse(readFile('package.json'));
    const cmdMatch = dockerfile.match(/CMD \["node", "(.+)"\]/);
    expect(cmdMatch).not.toBeNull();
    expect(pkg.scripts.start).toContain(cmdMatch[1]);
  });

  it('docker-compose DATABASE_PATH directory should match volume mount point', () => {
    const compose = readFile('docker-compose.yml');
    const dbPathMatch = compose.match(/DATABASE_PATH=(\/[^\s]+)/);
    expect(dbPathMatch).not.toBeNull();
    const dbDir = path.dirname(dbPathMatch[1]);
    expect(compose).toContain(`recipe-data:${dbDir}`);
  });

  it('docker-compose PORT env should match EXPOSE in Dockerfile', () => {
    const compose = readFile('docker-compose.yml');
    const dockerfile = readFile('Dockerfile');
    const portEnvMatch = compose.match(/PORT=(\d+)/);
    expect(portEnvMatch).not.toBeNull();
    expect(dockerfile).toContain(`EXPOSE ${portEnvMatch[1]}`);
  });

  it('all files required for runtime are not in .dockerignore', () => {
    const dockerignore = readFile('.dockerignore');
    const ignoreEntries = dockerignore.split('\n').map(l => l.trim()).filter(Boolean);
    const criticalFiles = ['package.json', 'package-lock.json', 'src', 'Dockerfile'];
    for (const f of criticalFiles) {
      expect(ignoreEntries).not.toContain(f);
    }
  });
});
