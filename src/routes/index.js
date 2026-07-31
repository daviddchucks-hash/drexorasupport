/**
 * routes/index.js — Root router.
 *
 * Mounts the health-check endpoint at GET / and namespaces
 * all feature routes under /api/v1/.
 */

'use strict';

const express      = require('express');
const authRoutes   = require('./auth.routes');
const userRoutes   = require('./user.routes');
const ticketRoutes = require('./ticket.routes');
const rtdbRoutes   = require('./rtdb.routes');

const router = express.Router();

// ── Health check ───────────────────────────────────────────────────────────
/**
 * GET /
 * Public. Used by Render (and any monitoring tool) to verify the service is up.
 */
router.get('/', (req, res) => {
  res.json({
    success:   true,
    message:   'Drexora Support API is running',
    version:   '1.0.0',
    timestamp: new Date().toISOString(),
    env:       process.env.NODE_ENV || 'development',
  });
});

// ── Feature routes ─────────────────────────────────────────────────────────
router.use('/api/v1/auth',    authRoutes);
router.use('/api/v1/users',   userRoutes);
router.use('/api/v1/tickets', ticketRoutes);
router.use('/api/v1/rtdb',    rtdbRoutes);

// ── 404 catch-all ─────────────────────────────────────────────────────────
router.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

module.exports = router;
