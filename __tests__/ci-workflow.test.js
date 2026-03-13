const fs = require('fs');
const path = require('path');

describe('CI Workflow', () => {
  const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'ci.yml');
  let workflowContent;

  beforeAll(() => {
    workflowContent = fs.readFileSync(workflowPath, 'utf8');
  });

  test('workflow file exists at .github/workflows/ci.yml', () => {
    expect(fs.existsSync(workflowPath)).toBe(true);
  });

  test('workflow is named CI', () => {
    expect(workflowContent).toMatch(/^name:\s*CI$/m);
  });

  test('triggers on push to main', () => {
    expect(workflowContent).toMatch(/on:/);
    expect(workflowContent).toMatch(/push:/);
    expect(workflowContent).toMatch(/branches:\s*\[main\]/);
  });

  test('triggers on pull_request to main', () => {
    expect(workflowContent).toMatch(/pull_request:/);
  });

  test('has a test job that runs on ubuntu-latest', () => {
    expect(workflowContent).toMatch(/jobs:/);
    expect(workflowContent).toMatch(/test:/);
    expect(workflowContent).toMatch(/runs-on:\s*ubuntu-latest/);
  });

  test('uses actions/checkout@v4', () => {
    expect(workflowContent).toMatch(/uses:\s*actions\/checkout@v4/);
  });

  test('uses actions/setup-node@v4 with node-version 20', () => {
    expect(workflowContent).toMatch(/uses:\s*actions\/setup-node@v4/);
    expect(workflowContent).toMatch(/node-version:\s*20/);
  });

  test('caches npm dependencies using actions/cache', () => {
    expect(workflowContent).toMatch(/uses:\s*actions\/cache@v4/);
    expect(workflowContent).toMatch(/path:\s*~\/\.npm/);
    expect(workflowContent).toMatch(/key:.*hashFiles\('package-lock\.json'\)/);
  });

  test('runs npm ci to install dependencies', () => {
    expect(workflowContent).toMatch(/run:\s*npm ci/);
  });

  test('runs npm run lint', () => {
    expect(workflowContent).toMatch(/run:\s*npm run lint/);
  });

  test('runs npm test', () => {
    expect(workflowContent).toMatch(/run:\s*npm test/);
  });

  test('steps are in correct order: checkout, setup-node, cache, install, lint, test', () => {
    const checkoutIdx = workflowContent.indexOf('actions/checkout@v4');
    const setupNodeIdx = workflowContent.indexOf('actions/setup-node@v4');
    const cacheIdx = workflowContent.indexOf('actions/cache@v4');
    const installIdx = workflowContent.indexOf('npm ci');
    const lintIdx = workflowContent.indexOf('npm run lint');
    const testIdx = workflowContent.indexOf('npm test');

    expect(checkoutIdx).toBeLessThan(setupNodeIdx);
    expect(setupNodeIdx).toBeLessThan(cacheIdx);
    expect(cacheIdx).toBeLessThan(installIdx);
    expect(installIdx).toBeLessThan(lintIdx);
    expect(lintIdx).toBeLessThan(testIdx);
  });
});

describe('package.json scripts', () => {
  const pkgPath = path.join(__dirname, '..', 'package.json');
  let pkg;

  beforeAll(() => {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  });

  test('has a lint script defined', () => {
    expect(pkg.scripts).toHaveProperty('lint');
    expect(pkg.scripts.lint).toBeTruthy();
  });

  test('has a test script defined', () => {
    expect(pkg.scripts).toHaveProperty('test');
    expect(pkg.scripts.test).toBeTruthy();
  });

  test('has eslint as a devDependency', () => {
    expect(pkg.devDependencies).toHaveProperty('eslint');
  });
});

describe('ESLint configuration', () => {
  const eslintPath = path.join(__dirname, '..', '.eslintrc.json');

  test('.eslintrc.json exists', () => {
    expect(fs.existsSync(eslintPath)).toBe(true);
  });

  test('extends eslint:recommended', () => {
    const config = JSON.parse(fs.readFileSync(eslintPath, 'utf8'));
    expect(config.extends).toMatch(/eslint:recommended/);
  });

  test('has node environment enabled', () => {
    const config = JSON.parse(fs.readFileSync(eslintPath, 'utf8'));
    expect(config.env.node).toBe(true);
  });
});
