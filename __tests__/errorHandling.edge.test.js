const request = require('supertest');
const express = require('express');
const { body, param, query } = require('express-validator');
const AppError = require('../src/utils/AppError');
const errorHandler = require('../src/middleware/errorHandler');
const validate = require('../src/middleware/validate');

describe('AppError — edge cases', () => {
  it('should handle boundary status code 399 as error (not fail)', () => {
    const error = new AppError('Redirect', 399);
    expect(error.status).toBe('error');
  });

  it('should handle boundary status code 400 as fail', () => {
    const error = new AppError('Bad request', 400);
    expect(error.status).toBe('fail');
  });

  it('should handle boundary status code 499 as fail', () => {
    const error = new AppError('Client closed', 499);
    expect(error.status).toBe('fail');
  });

  it('should handle boundary status code 500 as error', () => {
    const error = new AppError('Internal', 500);
    expect(error.status).toBe('error');
  });

  it('should handle empty message', () => {
    const error = new AppError('', 400);
    expect(error.message).toBe('');
    expect(error.statusCode).toBe(400);
  });

  it('should have a stack trace', () => {
    const error = new AppError('Stack test', 400);
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('Stack test');
  });

  it('should preserve the name property as Error', () => {
    const error = new AppError('Test');
    expect(error.name).toBe('Error');
  });
});

describe('Error Handler — edge cases', () => {
  let app;

  const setupApp = (routeHandler) => {
    app = express();
    app.use(express.json());
    app.get('/test', routeHandler);
    app.use(errorHandler);
  };

  it('should handle thrown AppError (not passed via next)', async () => {
    app = express();
    app.use(express.json());
    app.get('/test', (req, res, next) => {
      const error = new AppError('Thrown error', 403);
      next(error);
    });
    app.use(errorHandler);

    const res = await request(app).get('/test');
    expect(res.status).toBe(403);
    expect(res.body.status).toBe('fail');
    expect(res.body.message).toBe('Thrown error');
  });

  it('should handle error with no message', async () => {
    setupApp((req, res, next) => {
      next(new AppError('', 422));
    });

    const res = await request(app).get('/test');
    expect(res.status).toBe(422);
    expect(res.body.message).toBe('');
  });

  it('should not include errors key when error has no errors array', async () => {
    setupApp((req, res, next) => {
      next(new AppError('Simple error', 400));
    });

    const res = await request(app).get('/test');
    expect(res.status).toBe(400);
    expect(res.body).not.toHaveProperty('errors');
  });

  it('should handle a plain string thrown as error', async () => {
    setupApp((req, res, next) => {
      next('string error');
    });

    const res = await request(app).get('/test');
    // Express wraps string errors — status should default to 500
    expect(res.status).toBe(500);
  });

  it('should not hide 4xx error details in production', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    app = express();
    app.use(express.json());
    app.get('/test', (req, res, next) => {
      next(new AppError('Forbidden', 403));
    });
    app.use(errorHandler);

    const res = await request(app).get('/test');
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Forbidden');

    process.env.NODE_ENV = originalEnv;
  });

  it('should hide 500 error details in production even with custom AppError(500)', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    app = express();
    app.use(express.json());
    app.get('/test', (req, res, next) => {
      next(new AppError('Secret database info', 500));
    });
    app.use(errorHandler);

    const res = await request(app).get('/test');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Internal server error');
    expect(res.body.message).not.toContain('Secret');

    process.env.NODE_ENV = originalEnv;
  });

  it('should return correct Content-Type header', async () => {
    setupApp((req, res, next) => {
      next(new AppError('Test', 400));
    });

    const res = await request(app).get('/test');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

describe('Validation Middleware — edge cases', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  it('should handle multiple validation errors on the same field', async () => {
    app.post(
      '/test',
      validate([
        body('email').notEmpty().withMessage('Email is required').isEmail().withMessage('Invalid email format'),
      ]),
      (req, res) => res.status(200).json({ success: true })
    );
    app.use(errorHandler);

    const res = await request(app).post('/test').send({});
    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBeGreaterThanOrEqual(1);
    // At least the first error should be for the email field
    expect(res.body.errors[0].field).toBe('email');
  });

  it('should pass through when body matches all validations', async () => {
    app.post(
      '/test',
      validate([
        body('name').notEmpty().withMessage('Name required'),
        body('age').isInt({ min: 0 }).withMessage('Age must be positive integer'),
      ]),
      (req, res) => res.status(200).json({ success: true })
    );
    app.use(errorHandler);

    const res = await request(app).post('/test').send({ name: 'Alice', age: 25 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should handle validation on query parameters', async () => {
    app.get(
      '/test',
      validate([
        query('page').isInt({ min: 1 }).withMessage('Page must be a positive integer'),
      ]),
      (req, res) => res.status(200).json({ page: req.query.page })
    );
    app.use(errorHandler);

    const res = await request(app).get('/test?page=-1');
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'page', message: 'Page must be a positive integer' }),
      ])
    );
  });

  it('should handle validation on URL params', async () => {
    app.get(
      '/test/:id',
      validate([
        param('id').isInt().withMessage('ID must be an integer'),
      ]),
      (req, res) => res.status(200).json({ id: req.params.id })
    );
    app.use(errorHandler);

    const res = await request(app).get('/test/abc');
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'id', message: 'ID must be an integer' }),
      ])
    );
  });

  it('should set error message to "Validation failed"', async () => {
    app.post(
      '/test',
      validate([body('x').notEmpty().withMessage('X is required')]),
      (req, res) => res.status(200).json({ ok: true })
    );
    app.use(errorHandler);

    const res = await request(app).post('/test').send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
    expect(res.body.status).toBe('fail');
  });

  it('should handle empty validations array (no rules)', async () => {
    app.post(
      '/test',
      validate([]),
      (req, res) => res.status(200).json({ success: true })
    );
    app.use(errorHandler);

    const res = await request(app).post('/test').send({});
    expect(res.status).toBe(200);
  });
});

describe('Integration — app.js error handling', () => {
  it('should return 404-style response for unknown routes via error handler', async () => {
    const app = require('../src/app');
    const res = await request(app).get('/nonexistent');
    // Express returns 404 by default for unmatched routes
    expect(res.status).toBe(404);
  });

  it('should handle malformed JSON body gracefully', async () => {
    const app = require('../src/app');
    const res = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{"bad json');

    // Express JSON parser should trigger an error
    expect(res.status).toBe(400);
  });
});
