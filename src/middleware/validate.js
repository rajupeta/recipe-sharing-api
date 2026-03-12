const { validationResult } = require('express-validator');
const AppError = require('../utils/AppError');

const validate = (validations) => {
  return async (req, res, next) => {
    for (const validation of validations) {
      await validation.run(req);
    }

    const result = validationResult(req);

    if (!result.isEmpty()) {
      const errors = result.array().map((err) => ({
        field: err.path,
        message: err.msg,
      }));

      const error = new AppError('Validation failed', 400);
      error.errors = errors;
      return next(error);
    }

    next();
  };
};

module.exports = validate;
