/**
 * TICKET-003 — Test Agent QA Validation
 *
 * Additional edge-case tests that close coverage gaps found during QA review.
 */

const request = require('supertest');
const express = require('express');
const { body } = require('express-validator');
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

describe('Production 500 must not leak errors array', () => {
  let origEnv;
  beforeEach(() => { origEnv = process.env.NODE_ENV; process.env.NODE_ENV = 'production'; });
  afterEach(() => { process.env.NODE_ENV = origEnv; });

  test('errors array is stripped from 500 response in production', async () => {
    const app = buildApp((a) =>
      a.get('/err', (req, res, next) => {
        const err = new AppError('secret', 500);
        err.errors = [{ field: 'db', message: 'connection string leaked' }];
        next(err);
      })
    );
    const res = await request(app).get('/err');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Internal server error');
    expect(res.body).not.toHaveProperty('errors');
  });

  test('generic Error with errors property still hidden in production', async () => {
    const app = buildApp((a) =>
      a.get('/err', (req, res, next) => {
        const err = new Error('internal details');
        err.errors = [{ field: 'secret', message: 'should not appear' }];
        next(err);
      })
    );
    const res = await request(app).get('/err');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Internal server error');
    expect(res.body).not.toHaveProperty('errors');
  });
});

describe('Non-500 5xx errors in production show real details', () => {
  let origEnv;
  beforeEach(() => { origEnv = process.env.NODE_ENV; process.env.NODE_ENV = 'production'; });
  afterEach(() => { process.env.NODE_ENV = origEnv; });

  test.each([502, 503, 504])('%i in production shows real message', async (code) => {
    const app = buildApp((a) =>
      a.get('/err', (req, res, next) => next(new AppError('upstream failed', code)))
    );
    const res = await request(app).get('/err');
    expect(res.status).toBe(code);
    expect(res.body.message).toBe('upstream failed');
    expect(res.body.status).toBe('error');
  });
});

describe('Validate middleware end-to-end through app error handler', () => {
  test('validation errors flow through the error handler and return proper format', async () => {
    const app = buildApp((a) =>
      a.post(
        '/recipes',
        validate([
          body('title').notEmpty().withMessage('Title is required'),
          body('cook_time').isInt({ min: 1 }).withMessage('Cook time must be positive'),
        ]),
        (req, res) => res.json({ ok: true })
      )
    );

    const res = await request(app).post('/recipes').send({});
    expect(res.status).toBe(400);
    expect(res.body.status).toBe('fail');
    expect(res.body.message).toBe('Validation failed');
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        { field: 'title', message: 'Title is required' },
        { field: 'cook_time', message: 'Cook time must be positive' },
      ])
    );
    // Ensure no extra keys leak into the response
    expect(Object.keys(res.body).sort()).toEqual(['errors', 'message', 'status']);
  });
});

describe('AppError constructor edge cases', () => {
  test('statusCode is enumerable', () => {
    const err = new AppError('test', 404);
    expect(Object.keys(err)).toContain('statusCode');
    expect(Object.keys(err)).toContain('status');
  });

  test('message with special characters is preserved', () => {
    const msg = 'Error: <script>alert("xss")</script> & "quotes"';
    const err = new AppError(msg, 400);
    expect(err.message).toBe(msg);
  });

  test('works with try/catch pattern', () => {
    try {
      throw new AppError('thrown', 403);
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect(e).toBeInstanceOf(Error);
      expect(e.statusCode).toBe(403);
      expect(e.status).toBe('fail');
      expect(e.message).toBe('thrown');
    }
  });
});

describe('Error handler does not call next after responding', () => {
  test('response is sent once (no double-send)', async () => {
    const app = buildApp((a) =>
      a.get('/err', (req, res, next) => next(new AppError('once', 400)))
    );
    // If double-send occurred, supertest would throw or get wrong status
    const res = await request(app).get('/err');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ status: 'fail', message: 'once' });
  });
});

describe('Validate middleware module exports', () => {
  test('exports a function', () => {
    expect(typeof validate).toBe('function');
  });

  test('calling validate() returns an async middleware function', () => {
    const middleware = validate([]);
    expect(typeof middleware).toBe('function');
    // Express middleware has 3 params (req, res, next)
    expect(middleware.length).toBe(3);
  });
});

describe('Error handler module exports', () => {
  test('exports a function with 4 parameters (err, req, res, next)', () => {
    expect(typeof errorHandler).toBe('function');
    expect(errorHandler.length).toBe(4);
  });
});
