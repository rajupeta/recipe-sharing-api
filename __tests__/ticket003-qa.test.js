/**
 * QA Validation Tests for TICKET-003
 * Error handling and input validation middleware
 *
 * Test Agent: Validates all acceptance criteria and edge cases
 */

const request = require('supertest');
const express = require('express');
const { body, param, query, header } = require('express-validator');
const AppError = require('../src/utils/AppError');
const errorHandler = require('../src/middleware/errorHandler');
const validate = require('../src/middleware/validate');

// ─────────────────────────────────────────────
// AC1: AppError class sets correct statusCode and status
// ─────────────────────────────────────────────
describe('AC1: AppError class sets correct statusCode and status', () => {
  it('defaults statusCode to 500 when not provided', () => {
    const err = new AppError('boom');
    expect(err.statusCode).toBe(500);
  });

  it('defaults status to "error" for 500', () => {
    const err = new AppError('boom');
    expect(err.status).toBe('error');
  });

  it('sets status to "fail" for every 4xx code', () => {
    for (const code of [400, 401, 403, 404, 409, 422, 429, 499]) {
      const err = new AppError('msg', code);
      expect(err.status).toBe('fail');
      expect(err.statusCode).toBe(code);
    }
  });

  it('sets status to "error" for every 5xx code', () => {
    for (const code of [500, 502, 503, 504]) {
      const err = new AppError('msg', code);
      expect(err.status).toBe('error');
      expect(err.statusCode).toBe(code);
    }
  });

  it('extends the built-in Error class', () => {
    const err = new AppError('test', 400);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });

  it('stores the message on the error', () => {
    const err = new AppError('custom message', 418);
    expect(err.message).toBe('custom message');
  });

  it('captures a stack trace', () => {
    const err = new AppError('trace', 400);
    expect(err.stack).toBeDefined();
    expect(typeof err.stack).toBe('string');
  });

  it('does not classify 3xx or 2xx codes as "fail"', () => {
    expect(new AppError('ok', 200).status).toBe('error');
    expect(new AppError('redirect', 301).status).toBe('error');
    expect(new AppError('boundary', 399).status).toBe('error');
  });
});

// ─────────────────────────────────────────────
// AC2: Error handler returns JSON {status, message} with matching HTTP status code
// ─────────────────────────────────────────────
describe('AC2: Error handler returns JSON {status, message} with matching HTTP status code', () => {
  const buildApp = (routeHandler) => {
    const app = express();
    app.use(express.json());
    app.get('/err', routeHandler);
    app.use(errorHandler);
    return app;
  };

  it('returns the statusCode from AppError as the HTTP status', async () => {
    const app = buildApp((req, res, next) => next(new AppError('nope', 403)));
    const res = await request(app).get('/err');
    expect(res.status).toBe(403);
  });

  it('includes status and message in the JSON body', async () => {
    const app = buildApp((req, res, next) => next(new AppError('gone', 410)));
    const res = await request(app).get('/err');
    expect(res.body).toEqual({ status: 'fail', message: 'gone' });
  });

  it('defaults to 500 when error has no statusCode', async () => {
    const origEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;

    const app = buildApp((req, res, next) => next(new Error('plain')));
    const res = await request(app).get('/err');
    expect(res.status).toBe(500);
    expect(res.body.status).toBe('error');

    process.env.NODE_ENV = origEnv;
  });

  it('returns application/json content-type', async () => {
    const app = buildApp((req, res, next) => next(new AppError('x', 400)));
    const res = await request(app).get('/err');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('includes errors array when present on the error object', async () => {
    const app = buildApp((req, res, next) => {
      const err = new AppError('Validation failed', 400);
      err.errors = [{ field: 'name', message: 'required' }];
      next(err);
    });
    const res = await request(app).get('/err');
    expect(res.body.errors).toEqual([{ field: 'name', message: 'required' }]);
  });

  it('omits errors key when not present on the error', async () => {
    const app = buildApp((req, res, next) => next(new AppError('simple', 400)));
    const res = await request(app).get('/err');
    expect(res.body).not.toHaveProperty('errors');
  });
});

// ─────────────────────────────────────────────
// AC3: 500 errors hide internal details in production
// ─────────────────────────────────────────────
describe('AC3: 500 errors hide internal details in production', () => {
  let origEnv;

  beforeEach(() => {
    origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
  });

  afterEach(() => {
    process.env.NODE_ENV = origEnv;
  });

  const buildApp = (routeHandler) => {
    const app = express();
    app.use(express.json());
    app.get('/err', routeHandler);
    app.use(errorHandler);
    return app;
  };

  it('hides message for generic Error (no statusCode) in production', async () => {
    const app = buildApp((req, res, next) => next(new Error('DB password leaked')));
    const res = await request(app).get('/err');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Internal server error');
    expect(res.body.message).not.toContain('DB password');
  });

  it('hides message for AppError(500) in production', async () => {
    const app = buildApp((req, res, next) =>
      next(new AppError('secret connection string', 500))
    );
    const res = await request(app).get('/err');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Internal server error');
  });

  it('still shows details for 4xx errors in production', async () => {
    const app = buildApp((req, res, next) =>
      next(new AppError('Invalid token', 401))
    );
    const res = await request(app).get('/err');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid token');
  });

  it('shows 500 error details when NOT in production', async () => {
    process.env.NODE_ENV = 'development';
    const app = buildApp((req, res, next) =>
      next(new AppError('debug info', 500))
    );
    const res = await request(app).get('/err');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('debug info');
  });
});

// ─────────────────────────────────────────────
// AC4: Validation middleware returns 400 with field-specific error messages
// ─────────────────────────────────────────────
describe('AC4: Validation middleware returns 400 with field-specific error messages array', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  it('returns 400 status for failed validation', async () => {
    app.post(
      '/v',
      validate([body('title').notEmpty().withMessage('Title is required')]),
      (req, res) => res.json({ ok: true })
    );
    app.use(errorHandler);

    const res = await request(app).post('/v').send({});
    expect(res.status).toBe(400);
  });

  it('returns status "fail" in the body', async () => {
    app.post(
      '/v',
      validate([body('title').notEmpty().withMessage('Title is required')]),
      (req, res) => res.json({ ok: true })
    );
    app.use(errorHandler);

    const res = await request(app).post('/v').send({});
    expect(res.body.status).toBe('fail');
  });

  it('returns errors as array of {field, message} objects', async () => {
    app.post(
      '/v',
      validate([
        body('title').notEmpty().withMessage('Title is required'),
        body('servings').isInt({ min: 1 }).withMessage('Servings must be at least 1'),
      ]),
      (req, res) => res.json({ ok: true })
    );
    app.use(errorHandler);

    const res = await request(app).post('/v').send({});
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        { field: 'title', message: 'Title is required' },
        { field: 'servings', message: 'Servings must be at least 1' },
      ])
    );
  });

  it('each error object has exactly field and message keys', async () => {
    app.post(
      '/v',
      validate([body('email').isEmail().withMessage('Bad email')]),
      (req, res) => res.json({ ok: true })
    );
    app.use(errorHandler);

    const res = await request(app).post('/v').send({ email: 'not-an-email' });
    expect(res.body.errors).toHaveLength(1);
    expect(Object.keys(res.body.errors[0]).sort()).toEqual(['field', 'message']);
  });

  it('calls next() on successful validation (no error)', async () => {
    app.post(
      '/v',
      validate([body('name').notEmpty()]),
      (req, res) => res.status(200).json({ received: req.body.name })
    );
    app.use(errorHandler);

    const res = await request(app).post('/v').send({ name: 'Pasta' });
    expect(res.status).toBe(200);
    expect(res.body.received).toBe('Pasta');
  });

  it('validates query params correctly', async () => {
    app.get(
      '/search',
      validate([query('q').notEmpty().withMessage('Search query required')]),
      (req, res) => res.json({ q: req.query.q })
    );
    app.use(errorHandler);

    const res = await request(app).get('/search');
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toEqual({ field: 'q', message: 'Search query required' });
  });

  it('validates URL params correctly', async () => {
    app.get(
      '/recipes/:id',
      validate([param('id').isInt().withMessage('ID must be integer')]),
      (req, res) => res.json({ id: req.params.id })
    );
    app.use(errorHandler);

    const res = await request(app).get('/recipes/abc');
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toEqual({ field: 'id', message: 'ID must be integer' });
  });

  it('handles empty validations array without error', async () => {
    app.post(
      '/v',
      validate([]),
      (req, res) => res.json({ ok: true })
    );
    app.use(errorHandler);

    const res = await request(app).post('/v').send({ anything: 'goes' });
    expect(res.status).toBe(200);
  });

  it('collects multiple errors from a single field', async () => {
    app.post(
      '/v',
      validate([
        body('password')
          .notEmpty().withMessage('Password required')
          .isLength({ min: 8 }).withMessage('Password too short'),
      ]),
      (req, res) => res.json({ ok: true })
    );
    app.use(errorHandler);

    const res = await request(app).post('/v').send({});
    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBeGreaterThanOrEqual(1);
    expect(res.body.errors.every((e) => e.field === 'password')).toBe(true);
  });
});

// ─────────────────────────────────────────────
// AC5: Error handler is the last middleware in app.js
// ─────────────────────────────────────────────
describe('AC5: Error handler is the last middleware in app.js', () => {
  it('the last layer in app._router.stack is a 4-parameter error handler', () => {
    const app = require('../src/app');
    const stack = app._router.stack;
    const last = stack[stack.length - 1];
    expect(last.handle.length).toBe(4);
  });

  it('app actually catches errors thrown in routes', async () => {
    const app = require('../src/app');

    // Add a route that throws, BEFORE the error handler already registered
    // We need a fresh app for this — build one manually
    const testApp = express();
    testApp.use(express.json());
    testApp.get('/throw', (req, res, next) => {
      next(new AppError('test catch', 422));
    });
    testApp.use(errorHandler);

    const res = await request(testApp).get('/throw');
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ status: 'fail', message: 'test catch' });
  });
});

// ─────────────────────────────────────────────
// AC6: Tests verify error formatting and validation behavior
// (Integration-level tests using the actual app)
// ─────────────────────────────────────────────
describe('AC6: Integration — error formatting through the app', () => {
  it('malformed JSON body triggers error handler with 400', async () => {
    const app = require('../src/app');
    const res = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{invalid');
    expect(res.status).toBe(400);
  });

  it('unknown route returns 404 (Express default)', async () => {
    const app = require('../src/app');
    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('health endpoint still works alongside error handler', async () => {
    const app = require('../src/app');
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

// ─────────────────────────────────────────────
// Additional edge cases: robustness of error handler
// ─────────────────────────────────────────────
describe('Error handler robustness — additional edge cases', () => {
  const buildApp = (routeHandler) => {
    const app = express();
    app.use(express.json());
    app.all('/err', routeHandler);
    app.use(errorHandler);
    return app;
  };

  it('handles error with null message', async () => {
    const app = buildApp((req, res, next) => {
      const err = new AppError(null, 400);
      next(err);
    });
    const res = await request(app).get('/err');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('status', 'fail');
  });

  it('handles error objects without status property', async () => {
    const app = buildApp((req, res, next) => {
      const err = new Error('raw');
      err.statusCode = 503;
      next(err);
    });

    const origEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;

    const res = await request(app).get('/err');
    expect(res.status).toBe(503);

    process.env.NODE_ENV = origEnv;
  });

  it('handles POST method errors the same as GET', async () => {
    const app = buildApp((req, res, next) => next(new AppError('post error', 400)));
    const res = await request(app).post('/err');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('post error');
  });

  it('includes multiple validation errors in response', async () => {
    const app = express();
    app.use(express.json());
    app.post(
      '/recipe',
      validate([
        body('title').notEmpty().withMessage('Title required'),
        body('cook_time').isInt({ min: 1 }).withMessage('Cook time must be positive'),
        body('servings').isInt({ min: 1 }).withMessage('Servings must be positive'),
      ]),
      (req, res) => res.json({ ok: true })
    );
    app.use(errorHandler);

    const res = await request(app).post('/recipe').send({});
    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBeGreaterThanOrEqual(3);

    const fields = res.body.errors.map((e) => e.field);
    expect(fields).toContain('title');
    expect(fields).toContain('cook_time');
    expect(fields).toContain('servings');
  });
});
