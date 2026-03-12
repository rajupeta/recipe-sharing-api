/**
 * TICKET-003 Final QA — Error handling and input validation middleware
 *
 * Comprehensive test-agent validation covering all acceptance criteria:
 *   AC1: AppError class sets correct statusCode and status
 *   AC2: Error handler returns JSON {status, message} with matching HTTP status code
 *   AC3: 500 errors hide internal details in production
 *   AC4: Validation middleware returns 400 with field-specific error messages array
 *   AC5: Error handler is the last middleware in app.js
 *   AC6: Tests verify error formatting and validation behavior
 */

const request = require('supertest');
const express = require('express');
const { body, param, query } = require('express-validator');
const AppError = require('../src/utils/AppError');
const errorHandler = require('../src/middleware/errorHandler');
const validate = require('../src/middleware/validate');

// Helper: build a mini Express app with error handler
const buildApp = (setupRoutes) => {
  const app = express();
  app.use(express.json());
  setupRoutes(app);
  app.use(errorHandler);
  return app;
};

// ─── AC1: AppError class ────────────────────────────────────────────────────
describe('AC1: AppError sets correct statusCode and status', () => {
  test('defaults statusCode to 500', () => {
    const err = new AppError('server issue');
    expect(err.statusCode).toBe(500);
  });

  test('defaults status to "error" when no statusCode provided', () => {
    const err = new AppError('server issue');
    expect(err.status).toBe('error');
  });

  test.each([400, 401, 403, 404, 409, 422, 429, 499])(
    'status is "fail" for %i',
    (code) => {
      const err = new AppError('msg', code);
      expect(err.status).toBe('fail');
      expect(err.statusCode).toBe(code);
    }
  );

  test.each([500, 502, 503, 504])(
    'status is "error" for %i',
    (code) => {
      const err = new AppError('msg', code);
      expect(err.status).toBe('error');
      expect(err.statusCode).toBe(code);
    }
  );

  test('inherits from Error', () => {
    const err = new AppError('test', 400);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });

  test('preserves the message', () => {
    const err = new AppError('my message', 418);
    expect(err.message).toBe('my message');
  });

  test('captures a stack trace', () => {
    const err = new AppError('trace', 400);
    expect(err.stack).toBeDefined();
    expect(typeof err.stack).toBe('string');
  });

  test('boundary: 399 → "error", 400 → "fail", 499 → "fail", 500 → "error"', () => {
    expect(new AppError('', 399).status).toBe('error');
    expect(new AppError('', 400).status).toBe('fail');
    expect(new AppError('', 499).status).toBe('fail');
    expect(new AppError('', 500).status).toBe('error');
  });
});

// ─── AC2: Error handler returns JSON {status, message} ──────────────────────
describe('AC2: Error handler returns JSON {status, message} with correct HTTP status', () => {
  test('HTTP status matches AppError.statusCode', async () => {
    const app = buildApp((a) =>
      a.get('/err', (req, res, next) => next(new AppError('forbidden', 403)))
    );
    const res = await request(app).get('/err');
    expect(res.status).toBe(403);
  });

  test('body contains status and message fields', async () => {
    const app = buildApp((a) =>
      a.get('/err', (req, res, next) => next(new AppError('gone', 410)))
    );
    const res = await request(app).get('/err');
    expect(res.body).toEqual({ status: 'fail', message: 'gone' });
  });

  test('defaults to 500 for plain Error objects', async () => {
    const origEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    const app = buildApp((a) =>
      a.get('/err', (req, res, next) => next(new Error('oops')))
    );
    const res = await request(app).get('/err');
    expect(res.status).toBe(500);
    expect(res.body.status).toBe('error');
    process.env.NODE_ENV = origEnv;
  });

  test('content-type is application/json', async () => {
    const app = buildApp((a) =>
      a.get('/err', (req, res, next) => next(new AppError('x', 400)))
    );
    const res = await request(app).get('/err');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  test('includes errors array when present on error', async () => {
    const app = buildApp((a) =>
      a.get('/err', (req, res, next) => {
        const err = new AppError('Validation failed', 400);
        err.errors = [{ field: 'name', message: 'required' }];
        next(err);
      })
    );
    const res = await request(app).get('/err');
    expect(res.body.errors).toEqual([{ field: 'name', message: 'required' }]);
  });

  test('omits errors key when not set', async () => {
    const app = buildApp((a) =>
      a.get('/err', (req, res, next) => next(new AppError('simple', 400)))
    );
    const res = await request(app).get('/err');
    expect(res.body).not.toHaveProperty('errors');
  });
});

// ─── AC3: 500 errors hide internal details in production ────────────────────
describe('AC3: 500 errors hide internal details in production', () => {
  let origEnv;
  beforeEach(() => { origEnv = process.env.NODE_ENV; });
  afterEach(() => { process.env.NODE_ENV = origEnv; });

  test('production: generic Error (500) shows "Internal server error"', async () => {
    process.env.NODE_ENV = 'production';
    const app = buildApp((a) =>
      a.get('/err', (req, res, next) => next(new Error('DB password leaked')))
    );
    const res = await request(app).get('/err');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Internal server error');
    expect(res.body.message).not.toContain('DB password');
  });

  test('production: AppError(500) also hides details', async () => {
    process.env.NODE_ENV = 'production';
    const app = buildApp((a) =>
      a.get('/err', (req, res, next) => next(new AppError('secret info', 500)))
    );
    const res = await request(app).get('/err');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Internal server error');
  });

  test('production: 4xx errors still show real message', async () => {
    process.env.NODE_ENV = 'production';
    const app = buildApp((a) =>
      a.get('/err', (req, res, next) => next(new AppError('Unauthorized', 401)))
    );
    const res = await request(app).get('/err');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Unauthorized');
  });

  test('development: 500 errors show full details', async () => {
    process.env.NODE_ENV = 'development';
    const app = buildApp((a) =>
      a.get('/err', (req, res, next) => next(new AppError('debug info', 500)))
    );
    const res = await request(app).get('/err');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('debug info');
  });
});

// ─── AC4: Validation middleware ─────────────────────────────────────────────
describe('AC4: Validation middleware returns 400 with field-specific errors', () => {
  test('returns 400 on failed validation', async () => {
    const app = buildApp((a) =>
      a.post('/v', validate([body('title').notEmpty().withMessage('Title required')]),
        (req, res) => res.json({ ok: true }))
    );
    const res = await request(app).post('/v').send({});
    expect(res.status).toBe(400);
  });

  test('status is "fail" in body', async () => {
    const app = buildApp((a) =>
      a.post('/v', validate([body('title').notEmpty().withMessage('Title required')]),
        (req, res) => res.json({ ok: true }))
    );
    const res = await request(app).post('/v').send({});
    expect(res.body.status).toBe('fail');
  });

  test('message is "Validation failed"', async () => {
    const app = buildApp((a) =>
      a.post('/v', validate([body('x').notEmpty().withMessage('X required')]),
        (req, res) => res.json({ ok: true }))
    );
    const res = await request(app).post('/v').send({});
    expect(res.body.message).toBe('Validation failed');
  });

  test('errors is array of {field, message} objects', async () => {
    const app = buildApp((a) =>
      a.post('/v', validate([
        body('title').notEmpty().withMessage('Title required'),
        body('servings').isInt({ min: 1 }).withMessage('Servings must be ≥1'),
      ]), (req, res) => res.json({ ok: true }))
    );
    const res = await request(app).post('/v').send({});
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        { field: 'title', message: 'Title required' },
        { field: 'servings', message: 'Servings must be ≥1' },
      ])
    );
  });

  test('each error has exactly field and message keys', async () => {
    const app = buildApp((a) =>
      a.post('/v', validate([body('email').isEmail().withMessage('Bad email')]),
        (req, res) => res.json({ ok: true }))
    );
    const res = await request(app).post('/v').send({ email: 'nope' });
    expect(res.body.errors).toHaveLength(1);
    expect(Object.keys(res.body.errors[0]).sort()).toEqual(['field', 'message']);
  });

  test('valid input passes through to route handler', async () => {
    const app = buildApp((a) =>
      a.post('/v', validate([body('name').notEmpty()]),
        (req, res) => res.status(200).json({ name: req.body.name }))
    );
    const res = await request(app).post('/v').send({ name: 'Pasta' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Pasta');
  });

  test('validates query params', async () => {
    const app = buildApp((a) =>
      a.get('/search', validate([query('q').notEmpty().withMessage('q required')]),
        (req, res) => res.json({ q: req.query.q }))
    );
    const res = await request(app).get('/search');
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toEqual({ field: 'q', message: 'q required' });
  });

  test('validates URL params', async () => {
    const app = buildApp((a) =>
      a.get('/items/:id', validate([param('id').isInt().withMessage('ID must be int')]),
        (req, res) => res.json({ id: req.params.id }))
    );
    const res = await request(app).get('/items/abc');
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toEqual({ field: 'id', message: 'ID must be int' });
  });

  test('empty validations array passes through', async () => {
    const app = buildApp((a) =>
      a.post('/v', validate([]), (req, res) => res.json({ ok: true }))
    );
    const res = await request(app).post('/v').send({});
    expect(res.status).toBe(200);
  });

  test('multiple errors from single field are collected', async () => {
    const app = buildApp((a) =>
      a.post('/v', validate([
        body('pw').notEmpty().withMessage('PW required').isLength({ min: 8 }).withMessage('PW too short'),
      ]), (req, res) => res.json({ ok: true }))
    );
    const res = await request(app).post('/v').send({});
    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBeGreaterThanOrEqual(1);
    expect(res.body.errors.every((e) => e.field === 'pw')).toBe(true);
  });

  test('multiple fields with multiple errors', async () => {
    const app = buildApp((a) =>
      a.post('/v', validate([
        body('title').notEmpty().withMessage('Title required'),
        body('cook_time').isInt({ min: 1 }).withMessage('Cook time must be positive'),
        body('servings').isInt({ min: 1 }).withMessage('Servings must be positive'),
      ]), (req, res) => res.json({ ok: true }))
    );
    const res = await request(app).post('/v').send({});
    expect(res.status).toBe(400);
    const fields = res.body.errors.map((e) => e.field);
    expect(fields).toContain('title');
    expect(fields).toContain('cook_time');
    expect(fields).toContain('servings');
  });
});

// ─── AC5: Error handler is last middleware in app.js ────────────────────────
describe('AC5: Error handler is the last middleware in app.js', () => {
  test('last layer in app._router.stack has 4 parameters (error handler signature)', () => {
    const app = require('../src/app');
    const stack = app._router.stack;
    const last = stack[stack.length - 1];
    expect(last.handle.length).toBe(4);
  });

  test('error handler is registered (catches errors in routes)', async () => {
    const testApp = buildApp((a) =>
      a.get('/throw', (req, res, next) => next(new AppError('caught', 422)))
    );
    const res = await request(testApp).get('/throw');
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ status: 'fail', message: 'caught' });
  });
});

// ─── AC6: Integration tests through the actual app ──────────────────────────
describe('AC6: Integration — error formatting through app.js', () => {
  test('malformed JSON triggers 400 via error handler', async () => {
    const app = require('../src/app');
    const res = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{invalid');
    expect(res.status).toBe(400);
  });

  test('unknown route returns 404', async () => {
    const app = require('../src/app');
    const res = await request(app).get('/no-such-route');
    expect(res.status).toBe(404);
  });

  test('health endpoint unaffected by error handler', async () => {
    const app = require('../src/app');
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

// ─── Additional edge cases ──────────────────────────────────────────────────
describe('Edge cases — error handler robustness', () => {
  test('handles error with null message', async () => {
    const app = buildApp((a) =>
      a.get('/err', (req, res, next) => next(new AppError(null, 400)))
    );
    const res = await request(app).get('/err');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('status', 'fail');
  });

  test('handles plain Error with custom statusCode property', async () => {
    const origEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    const app = buildApp((a) =>
      a.get('/err', (req, res, next) => {
        const err = new Error('raw');
        err.statusCode = 503;
        next(err);
      })
    );
    const res = await request(app).get('/err');
    expect(res.status).toBe(503);
    process.env.NODE_ENV = origEnv;
  });

  test('POST errors handled same as GET', async () => {
    const app = buildApp((a) =>
      a.post('/err', (req, res, next) => next(new AppError('post err', 400)))
    );
    const res = await request(app).post('/err');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('post err');
  });

  test('string passed to next() results in 500', async () => {
    const app = buildApp((a) =>
      a.get('/err', (req, res, next) => next('string error'))
    );
    const res = await request(app).get('/err');
    expect(res.status).toBe(500);
  });

  test('empty message AppError', async () => {
    const app = buildApp((a) =>
      a.get('/err', (req, res, next) => next(new AppError('', 422)))
    );
    const res = await request(app).get('/err');
    expect(res.status).toBe(422);
    expect(res.body.message).toBe('');
  });
});
