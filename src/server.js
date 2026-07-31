/**
 * server.js — Application entry point.
 *
 * Loads environment variables, initialises Express, wires up
 * global middleware (security headers, CORS, logging, rate-limiting),
 * mounts the API router, and starts the HTTP server.
 */

'use strict';

// Load .env before anything else
require('dotenv').config();

const express = require('express');
const helmet  = require('helmet');
const morgan  = require('morgan');

const corsMiddleware  = require('./config/cors');
const rateLimiter    = require('./middleware/rateLimiter');
const errorHandler   = require('./middleware/errorHandler');
const router         = require('./routes');
const logger         = require('./services/logger.service');

// ── App setup ──────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 5000;

// ── Security headers (Content-Security-Policy, X-Frame-Options, etc.) ─────
app.use(helmet());

// ── CORS — only the origins listed in ALLOWED_ORIGINS are permitted ────────
app.use(corsMiddleware);

// ── HTTP request logging (uses 'combined' Apache format in production) ─────
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
  stream: { write: (message) => logger.http(message.trim()) },
}));

// ── Parse incoming JSON bodies (limit 10 kb to prevent payload attacks) ───
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ── Global rate limiter (protects all /api/* routes) ──────────────────────
app.use('/api', rateLimiter);

// ── Mount API routes ───────────────────────────────────────────────────────
app.use('/', router);

// ── Centralised error handler (must be last middleware) ───────────────────
app.use(errorHandler);

// ── Start server ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`Drexora Support API running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

module.exports = app;
