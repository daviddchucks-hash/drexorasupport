/**
 * routes/auth.routes.js — Authentication endpoints.
 *
 * POST /api/v1/auth/register  — create a new Firebase user
 * POST /api/v1/auth/login     — verify Firebase ID token, return user profile
 * POST /api/v1/auth/logout    — revoke refresh tokens for a user
 * GET  /api/v1/auth/me        — return the currently authenticated user
 */

'use strict';

const express         = require('express');
const { body }        = require('express-validator');
const authController  = require('../controllers/auth.controller');
const { verifyToken } = require('../middleware/auth');
const validate        = require('../middleware/validate');

const router = express.Router();

const registerRules = [
  body('email')
    .isEmail().withMessage('A valid email address is required.')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters.'),
  body('displayName')
    .optional().trim()
    .isLength({ min: 2 }).withMessage('Display name must be at least 2 characters.'),
];

router.post('/register', registerRules, validate, authController.register);
router.post('/login',    authController.login);
router.post('/logout',   verifyToken, authController.logout);
router.get('/me',        verifyToken, authController.me);

module.exports = router;
