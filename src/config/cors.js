/**
 * config/cors.js — CORS configuration.
 *
 * Reads allowed origins from the ALLOWED_ORIGINS environment variable
 * (comma-separated list). Add your GitHub Pages domain there.
 *
 * Example: ALLOWED_ORIGINS=https://daviddchucks-hash.github.io,http://localhost:3000
 */

'use strict';

const cors = require('cors');

// Parse the comma-separated list; strip whitespace around each entry
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    // Allow requests with no Origin header (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin '${origin}' is not allowed`));
    }
  },

  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

  // Allow Authorization header, Content-Type, and custom headers
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],

  // Expose the rate-limit headers so the client can read them
  exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],

  // Required for cookies / credentials
  credentials: true,

  // Cache preflight for 10 minutes
  maxAge: 600,
};

module.exports = cors(corsOptions);
