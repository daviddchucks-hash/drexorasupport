/**
 * middleware/rateLimiter.js — IP-based rate limiter.
 *
 * Protects all /api routes from brute-force and abuse.
 * Window and max-requests are configurable via environment variables.
 */

'use strict';

const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  // Default: 15-minute window
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),

  // Default: 100 requests per window per IP
  max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),

  // Return rate-limit info in standard headers (RateLimit-*)
  standardHeaders: true,

  // Disable the deprecated X-RateLimit-* headers
  legacyHeaders: false,

  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
  },
});

module.exports = limiter;
