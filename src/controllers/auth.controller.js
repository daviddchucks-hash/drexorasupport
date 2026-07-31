/**
 * controllers/auth.controller.js — Request handlers for authentication routes.
 */

'use strict';

const authService = require('../services/auth.service');

/**
 * POST /api/v1/auth/register
 * Body: { email, password, displayName? }
 */
const register = async (req, res, next) => {
  try {
    const { email, password, displayName } = req.body;
    const user = await authService.registerUser({ email, password, displayName });

    res.status(201).json({
      success: true,
      message: 'User registered successfully. Please sign in with the Firebase client SDK.',
      data:    user,
    });
  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
      error.statusCode = 409;
      error.message    = 'An account with this email already exists.';
    }
    next(error);
  }
};

/**
 * POST /api/v1/auth/login
 *
 * The actual sign-in flow is handled on the CLIENT side using the Firebase JS SDK
 * (signInWithEmailAndPassword). This endpoint accepts the resulting ID token
 * and returns the enriched user profile stored in Firestore.
 *
 * Body: { idToken } — Firebase ID token from the client SDK
 */
const login = async (req, res, next) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: 'idToken is required. Sign in with the Firebase client SDK first.',
      });
    }

    const { auth } = require('../config/firebase');
    const decoded  = await auth.verifyIdToken(idToken);
    const profile  = await authService.getUserProfile(decoded.uid);

    res.json({ success: true, message: 'Login successful.', data: profile });
  } catch (error) {
    error.statusCode = 401;
    error.message    = 'Invalid or expired token.';
    next(error);
  }
};

/**
 * POST /api/v1/auth/logout
 * Revokes all refresh tokens — invalidates every active session.
 */
const logout = async (req, res, next) => {
  try {
    await authService.revokeTokens(req.user.uid);
    res.json({ success: true, message: 'Logged out successfully. All sessions invalidated.' });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/auth/me
 */
const me = async (req, res, next) => {
  try {
    const profile = await authService.getUserProfile(req.user.uid);
    res.json({ success: true, data: profile });
  } catch (error) {
    next(error);
  }
};

module.exports = { register, login, logout, me };
