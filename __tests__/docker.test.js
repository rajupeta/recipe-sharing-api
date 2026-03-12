const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

describe('Dockerfile', () => {
  let content;

  beforeAll(() => {
    content = fs.readFileSync(path.join(rootDir, 'Dockerfile'), 'utf8');
  });

  it('should exist', () => {
    expect(fs.existsSync(path.join(rootDir, 'Dockerfile'))).toBe(true);
  });

  it('should use node:20-alpine as base image', () => {
    expect(content).toMatch(/FROM node:20-alpine/);
  });

  it('should use multi-stage build with deps and production stages', () => {
    expect(content).toMatch(/FROM node:20-alpine AS deps/);
    expect(content).toMatch(/FROM node:20-alpine AS production/);
  });

  it('should set WORKDIR to /app', () => {
    expect(content).toMatch(/WORKDIR \/app/);
  });

  it('should copy package files and run npm ci with production only', () => {
    expect(content).toMatch(/COPY package\*\.json \.\/$/m);
    expect(content).toMatch(/RUN npm ci --only=production/);
  });

  it('should copy node_modules from deps stage', () => {
    expect(content).toMatch(/COPY --from=deps \/app\/node_modules \.\/node_modules/);
  });

  it('should copy application source', () => {
    expect(content).toMatch(/COPY \. \./);
  });

  it('should create data directory', () => {
    expect(content).toMatch(/RUN mkdir -p data/);
  });

  it('should expose port 3000', () => {
    expect(content).toMatch(/EXPOSE 3000/);
  });

  it('should use node src/server.js as CMD', () => {
    expect(content).toMatch(/CMD \["node", "src\/server\.js"\]/);
  });
});

describe('docker-compose.yml', () => {
  let content;

  beforeAll(() => {
    content = fs.readFileSync(path.join(rootDir, 'docker-compose.yml'), 'utf8');
  });

  it('should exist', () => {
    expect(fs.existsSync(path.join(rootDir, 'docker-compose.yml'))).toBe(true);
  });

  it('should use version 3.8', () => {
    expect(content).toMatch(/version: ['"]3\.8['"]/);
  });

  it('should define app service', () => {
    expect(content).toMatch(/services:\s+app:/m);
  });

  it('should build from current directory', () => {
    expect(content).toMatch(/build: \./);
  });

  it('should map port 3000:3000', () => {
    expect(content).toMatch(/['"]?3000:3000['"]?/);
  });

  it('should set PORT environment variable', () => {
    expect(content).toMatch(/PORT=3000/);
  });

  it('should set JWT_SECRET environment variable', () => {
    expect(content).toMatch(/JWT_SECRET=change_me_in_production/);
  });

  it('should set DATABASE_PATH environment variable', () => {
    expect(content).toMatch(/DATABASE_PATH=\/app\/data\/recipes\.db/);
  });

  it('should mount recipe-data volume to /app/data', () => {
    expect(content).toMatch(/recipe-data:\/app\/data/);
  });

  it('should use restart unless-stopped policy', () => {
    expect(content).toMatch(/restart: unless-stopped/);
  });

  it('should declare recipe-data named volume', () => {
    expect(content).toMatch(/^volumes:\s+recipe-data:/m);
  });
});

describe('.dockerignore', () => {
  let content;

  beforeAll(() => {
    content = fs.readFileSync(path.join(rootDir, '.dockerignore'), 'utf8');
  });

  it('should exist', () => {
    expect(fs.existsSync(path.join(rootDir, '.dockerignore'))).toBe(true);
  });

  it('should exclude node_modules', () => {
    expect(content).toMatch(/^node_modules$/m);
  });

  it('should exclude .git', () => {
    expect(content).toMatch(/^\.git$/m);
  });

  it('should exclude .env files', () => {
    expect(content).toMatch(/^\.env$/m);
    expect(content).toMatch(/^\.env\.\*$/m);
  });

  it('should exclude test directories and files', () => {
    expect(content).toMatch(/^tests$/m);
    expect(content).toMatch(/^__tests__$/m);
    expect(content).toMatch(/^\*\.test\.js$/m);
  });

  it('should exclude .github directory', () => {
    expect(content).toMatch(/^\.github$/m);
  });

  it('should exclude eslint config', () => {
    expect(content).toMatch(/^\.eslintrc\*$/m);
  });

  it('should exclude coverage directories', () => {
    expect(content).toMatch(/^coverage$/m);
    expect(content).toMatch(/^\.nyc_output$/m);
  });

  it('should exclude database files', () => {
    expect(content).toMatch(/^data\/\*\.db$/m);
  });
});
