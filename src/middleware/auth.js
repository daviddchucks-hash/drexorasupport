/**
 * middleware/auth.js — Firebase ID-token verification middleware.
 *
 * Protects routes that require an authenticated Firebase user.
 * The client must send the Firebase ID token in the Authorization header:
 *   Authorization: Bearer <firebase-id-token>
 *
 * On success, sets req.user = { uid, email, role } and calls next().
 * On failure, responds with 401.
 */

'use strict';

const { auth } = require('../config/firebase');
const logger   = require('../services/logger.service');

/**
 * Verifies the Firebase ID token attached to the request.
 * Use this middleware on any route that needs authentication.
 */
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: No token provided.',
      });
    }

    const idToken = authHeader.split('Bearer ')[1];

    // Firebase Admin SDK verifies signature, expiry, and issuer
    const decoded = await auth.verifyIdToken(idToken);

    req.user = {
      uid:   decoded.uid,
      email: decoded.email,
      // Custom claim set via auth.setCustomUserClaims()
      role:  decoded.role || 'user',
    };

    next();
  } catch (error) {
    logger.warn(`Token verification failed: ${error.message}`);
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Invalid or expired token.',
    });
  }
};

/**
 * Role-based guard. Must be used AFTER verifyToken.
 * Usage: router.delete('/users/:id', verifyToken, requireRole('admin'), controller)
 */
const requireRole = (role) => (req, res, next) => {
  if (!req.user || req.user.role !== role) {
    return res.status(403).json({
      success: false,
      message: `Forbidden: '${role}' role required.`,
    });
  }
  next();
};

module.exports = { verifyToken, requireRole };
