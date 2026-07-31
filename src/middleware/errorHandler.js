/**
 * middleware/errorHandler.js — Centralised Express error handler.
 *
 * All errors thrown or passed via next(err) arrive here.
 * Responds with a consistent JSON envelope and keeps stack traces
 * out of production responses.
 */

'use strict';

const logger = require('../services/logger.service');

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;

  logger.error({
    message: err.message,
    statusCode,
    method:  req.method,
    url:     req.originalUrl,
    stack:   process.env.NODE_ENV !== 'production' ? err.stack : undefined,
  });

  // Never leak stack traces to the client in production
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

module.exports = errorHandler;
