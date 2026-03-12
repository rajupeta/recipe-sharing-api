/**
 * TICKET-003 — Test Agent Coverage Tests
 *
 * Additional test coverage for error handling and input validation middleware.
 * Focuses on acceptance criteria verification and edge cases.
 */

const request = require('supertest');
const express = require('express');
const { body, param, query, header } = require('express-validator');
const AppError = require('../src/utils/AppError');
const errorHandler = require('../src/middleware/errorHandler');
const validate = require('../src/middleware/validate');

const buildApp = (setupRoutes) => {
  const app = express();
  app.use(express.json());
  setupRoutes(app);
  app.use(errorHandler);
  return app;
};

// ─── AppError: status boundary exhaustive ────────────────────────────────────
describe('AppError status classification', () => {
  test.each([
    [100, 'error'], [200, 'error'], [301, 'error'], [399, 'error'],
    [400, 'fail'], [450, 'fail'], [499, 'fail'],
    [500, 'error'], [501, 'error'], [599, 'error'],
  ])('statusCode %i → status "%s"', (code, expected) => {
    expect(new AppError('test', code).status).toBe(expected);
  });

  test('stack trace excludes AppError constructor frame', () => {
    const err = new AppError('trace check', 400);
    expect(err.stack).not.toContain('new AppError');
  });

  test('is JSON-serializable with expected keys', () => {
    const err = new AppError('serialize test', 404);
    const json = JSON.parse(JSON.stringify(err));
    expect(json.statusCode).toBe(404);
    expect(json.status).toBe('fail');
  });
});

// ─── Error handler: concurrent errors on different HTTP methods ─────────────
describe('Error handler across HTTP methods', () => {
  test.each(['get', 'post', 'put', 'patch', 'delete'])(
    '%s request errors are handled correctly',
    async (method) => {
      const app = buildApp((a) =>
        a[method]('/err', (req, res, next) => next(new AppError(`${method} error`, 400)))
      );
      const res = await request(app)[method]('/err');
      expect(res.status).toBe(400);
      expect(res.body.status).toBe('fail');
      expect(res.body.message).toBe(`${method} error`);
    }
  );
});

// ─── Error handler: production vs non-production for various 5xx codes ──────
describe('Error handler production behavior for 5xx codes', () => {
  let origEnv;
  beforeEach(() => { origEnv = process.env.NODE_ENV; });
  afterEach(() => { process.env.NODE_ENV = origEnv; });

  test('production: only 500 hides details, other 5xx show real message', async () => {
    process.env.NODE_ENV = 'production';
    // 500 should hide
    const app500 = buildApp((a) =>
      a.get('/err', (req, res, next) => next(new AppError('secret', 500)))
    );
    const res500 = await request(app500).get('/err');
    expect(res500.body.message).toBe('Internal server error');

    // 502 should show
    const app502 = buildApp((a) =>
      a.get('/err', (req, res, next) => next(new AppError('bad gateway detail', 502)))
    );
    const res502 = await request(app502).get('/err');
    expect(res502.body.message).toBe('bad gateway detail');
  });

  test('non-production: 500 shows full details', async () => {
    process.env.NODE_ENV = 'development';
    const app = buildApp((a) =>
      a.get('/err', (req, res, next) => next(new AppError('dev debug info', 500)))
    );
    const res = await request(app).get('/err');
    expect(res.body.message).toBe('dev debug info');
  });

  test('NODE_ENV unset: 500 shows full details', async () => {
    delete process.env.NODE_ENV;
    const app = buildApp((a) =>
      a.get('/err', (req, res, next) => next(new Error('unset env detail')))
    );
    const res = await request(app).get('/err');
    expect(res.body.message).toBe('unset env detail');
  });

  test('production: 500 response has exactly {status, message} keys', async () => {
    process.env.NODE_ENV = 'production';
    const app = buildApp((a) =>
      a.get('/err', (req, res, next) => {
        const err = new Error('leak');
        err.errors = [{ field: 'x', message: 'y' }];
        err.extraProp = 'should not appear';
        next(err);
      })
    );
    const res = await request(app).get('/err');
    expect(Object.keys(res.body).sort()).toEqual(['message', 'status']);
  });
});

// ─── Validate middleware: chained validators ────────────────────────────────
describe('Validate middleware chained and complex validators', () => {
  test('optional field that is present but invalid triggers error', async () => {
    const app = buildApp((a) =>
      a.post('/v', validate([
        body('email').optional().isEmail().withMessage('Must be valid email'),
      ]), (req, res) => res.json({ ok: true }))
    );
    const res = await request(app).post('/v').send({ email: 'not-email' });
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toEqual({ field: 'email', message: 'Must be valid email' });
  });

  test('optional field that is absent passes validation', async () => {
    const app = buildApp((a) =>
      a.post('/v', validate([
        body('email').optional().isEmail().withMessage('Must be valid email'),
      ]), (req, res) => res.json({ ok: true }))
    );
    const res = await request(app).post('/v').send({});
    expect(res.status).toBe(200);
  });

  test('custom validator via .custom()', async () => {
    const app = buildApp((a) =>
      a.post('/v', validate([
        body('tags').custom((val) => {
          if (!Array.isArray(val)) throw new Error('Tags must be an array');
          return true;
        }),
      ]), (req, res) => res.json({ ok: true }))
    );
    const res = await request(app).post('/v').send({ tags: 'not-array' });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('tags');
    expect(res.body.errors[0].message).toBe('Tags must be an array');
  });

  test('isLength validator with min and max', async () => {
    const app = buildApp((a) =>
      a.post('/v', validate([
        body('password')
          .isLength({ min: 8, max: 64 })
          .withMessage('Password must be 8-64 characters'),
      ]), (req, res) => res.json({ ok: true }))
    );

    const resShort = await request(app).post('/v').send({ password: 'abc' });
    expect(resShort.status).toBe(400);
    expect(resShort.body.errors[0].message).toBe('Password must be 8-64 characters');

    const resOk = await request(app).post('/v').send({ password: 'validpass' });
    expect(resOk.status).toBe(200);
  });

  test('header validation works', async () => {
    const app = buildApp((a) =>
      a.get('/v', validate([
        header('x-api-key').notEmpty().withMessage('API key required'),
      ]), (req, res) => res.json({ ok: true }))
    );
    const res = await request(app).get('/v');
    expect(res.status).toBe(400);
    expect(res.body.errors[0].message).toBe('API key required');
  });
});

// ─── Validate middleware: error object shape ────────────────────────────────
describe('Validate middleware error shape', () => {
  test('error passed to handler is an AppError with statusCode 400', async () => {
    let capturedError;
    const app = express();
    app.use(express.json());
    app.post('/v',
      validate([body('x').notEmpty().withMessage('required')]),
      (req, res) => res.json({ ok: true })
    );
    app.use((err, req, res, next) => {
      capturedError = err;
      res.status(err.statusCode).json({ caught: true });
    });

    await request(app).post('/v').send({});
    expect(capturedError).toBeInstanceOf(AppError);
    expect(capturedError.statusCode).toBe(400);
    expect(capturedError.status).toBe('fail');
    expect(capturedError.message).toBe('Validation failed');
    expect(capturedError.errors).toEqual([{ field: 'x', message: 'required' }]);
  });
});

// ─── Integration: app.js error handler position ─────────────────────────────
describe('app.js error handler integration', () => {
  test('error handler is last in the middleware stack', () => {
    const app = require('../src/app');
    const stack = app._router.stack;
    const lastLayer = stack[stack.length - 1];
    expect(lastLayer.handle.length).toBe(4);
    expect(lastLayer.name).toBe('errorHandler');
  });

  test('app exports errorHandler module', () => {
    const appSrc = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'src', 'app.js'), 'utf8'
    );
    expect(appSrc).toContain("require('./middleware/errorHandler')");
    expect(appSrc).toContain('app.use(errorHandler)');
  });

  test('health endpoint works normally (error handler does not interfere)', async () => {
    const app = require('../src/app');
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
