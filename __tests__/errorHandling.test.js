const request = require('supertest');
const express = require('express');
const { body } = require('express-validator');
const AppError = require('../src/utils/AppError');
const errorHandler = require('../src/middleware/errorHandler');
const validate = require('../src/middleware/validate');

describe('AppError', () => {
  it('should set default statusCode to 500', () => {
    const error = new AppError('Something went wrong');
    expect(error.statusCode).toBe(500);
    expect(error.status).toBe('error');
    expect(error.message).toBe('Something went wrong');
  });

  it('should set status to "fail" for 4xx status codes', () => {
    const error = new AppError('Not found', 404);
    expect(error.statusCode).toBe(404);
    expect(error.status).toBe('fail');
  });

  it('should set status to "error" for 5xx status codes', () => {
    const error = new AppError('Server error', 503);
    expect(error.statusCode).toBe(503);
    expect(error.status).toBe('error');
  });

  it('should set status to "fail" for 400', () => {
    const error = new AppError('Bad request', 400);
    expect(error.statusCode).toBe(400);
    expect(error.status).toBe('fail');
  });

  it('should set status to "fail" for 401', () => {
    const error = new AppError('Unauthorized', 401);
    expect(error.statusCode).toBe(401);
    expect(error.status).toBe('fail');
  });

  it('should be an instance of Error', () => {
    const error = new AppError('test');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
  });
});

describe('Error Handler Middleware', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  const setupErrorRoute = (error) => {
    app.get('/error', (req, res, next) => {
      next(error);
    });
    app.use(errorHandler);
  };

  it('should return JSON with status and message for AppError', async () => {
    setupErrorRoute(new AppError('Not found', 404));

    const res = await request(app).get('/error');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      status: 'fail',
      message: 'Not found',
    });
  });

  it('should return 500 for errors without statusCode', async () => {
    const originalEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;

    setupErrorRoute(new Error('Unexpected error'));

    const res = await request(app).get('/error');
    expect(res.status).toBe(500);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toBe('Unexpected error');

    process.env.NODE_ENV = originalEnv;
  });

  it('should hide internal error details in production for 500 errors', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    setupErrorRoute(new Error('Database connection leaked'));

    const res = await request(app).get('/error');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      status: 'error',
      message: 'Internal server error',
    });

    process.env.NODE_ENV = originalEnv;
  });

  it('should show error details in production for non-500 errors', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    setupErrorRoute(new AppError('Resource not found', 404));

    const res = await request(app).get('/error');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      status: 'fail',
      message: 'Resource not found',
    });

    process.env.NODE_ENV = originalEnv;
  });

  it('should include errors array when present on AppError', async () => {
    const error = new AppError('Validation failed', 400);
    error.errors = [{ field: 'email', message: 'Invalid email' }];
    setupErrorRoute(error);

    const res = await request(app).get('/error');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      status: 'fail',
      message: 'Validation failed',
      errors: [{ field: 'email', message: 'Invalid email' }],
    });
  });
});

describe('Validation Middleware', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  it('should pass through when validation succeeds', async () => {
    app.post(
      '/test',
      validate([body('name').notEmpty()]),
      (req, res) => {
        res.status(200).json({ success: true });
      }
    );
    app.use(errorHandler);

    const res = await request(app)
      .post('/test')
      .send({ name: 'Test' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it('should return 400 with field-specific errors on validation failure', async () => {
    app.post(
      '/test',
      validate([
        body('name').notEmpty().withMessage('Name is required'),
        body('email').isEmail().withMessage('Invalid email'),
      ]),
      (req, res) => {
        res.status(200).json({ success: true });
      }
    );
    app.use(errorHandler);

    const res = await request(app)
      .post('/test')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('fail');
    expect(res.body.message).toBe('Validation failed');
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'name', message: 'Name is required' }),
        expect.objectContaining({ field: 'email', message: 'Invalid email' }),
      ])
    );
  });

  it('should return errors with field and message keys', async () => {
    app.post(
      '/test',
      validate([body('age').isInt().withMessage('Age must be an integer')]),
      (req, res) => {
        res.status(200).json({ success: true });
      }
    );
    app.use(errorHandler);

    const res = await request(app)
      .post('/test')
      .send({ age: 'not-a-number' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0]).toHaveProperty('field', 'age');
    expect(res.body.errors[0]).toHaveProperty('message', 'Age must be an integer');
  });
});

describe('Error handler registered in app.js', () => {
  it('should be the last middleware in app.js', () => {
    const app = require('../src/app');
    const stack = app._router.stack;
    const lastLayer = stack[stack.length - 1];
    // Error handlers have 4 params (err, req, res, next)
    expect(lastLayer.handle.length).toBe(4);
  });
});
