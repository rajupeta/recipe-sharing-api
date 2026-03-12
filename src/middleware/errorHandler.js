// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const status = err.status || 'error';

  if (statusCode === 500 && process.env.NODE_ENV === 'production') {
    return res.status(statusCode).json({
      status: 'error',
      message: 'Internal server error',
    });
  }

  const response = {
    status,
    message: err.message,
  };

  if (err.errors) {
    response.errors = err.errors;
  }

  res.status(statusCode).json(response);
};

module.exports = errorHandler;
