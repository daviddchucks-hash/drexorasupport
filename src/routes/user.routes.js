/**
 * routes/user.routes.js — User management endpoints.
 *
 * GET    /api/v1/users          — list all users (admin only)
 * GET    /api/v1/users/:uid     — get a single user profile
 * PUT    /api/v1/users/:uid     — update user profile
 * DELETE /api/v1/users/:uid     — delete a user (admin only)
 */

'use strict';

const express                      = require('express');
const { body }                     = require('express-validator');
const userController               = require('../controllers/user.controller');
const { verifyToken, requireRole } = require('../middleware/auth');
const validate                     = require('../middleware/validate');

const router = express.Router();

// All user routes require a valid Firebase token
router.use(verifyToken);

const updateRules = [
  body('displayName')
    .optional().trim()
    .isLength({ min: 2 }).withMessage('Display name must be at least 2 characters.'),
  body('photoURL')
    .optional()
    .isURL().withMessage('Photo URL must be a valid URL.'),
];

router.get('/',       requireRole('admin'), userController.listUsers);
router.get('/:uid',   userController.getUser);
router.put('/:uid',   updateRules, validate, userController.updateUser);
router.delete('/:uid', requireRole('admin'), userController.deleteUser);

module.exports = router;
