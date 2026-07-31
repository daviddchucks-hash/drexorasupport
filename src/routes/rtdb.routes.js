/**
 * routes/rtdb.routes.js — Realtime Database helper endpoints.
 *
 * GET  /api/v1/rtdb/presence/:uid          — get a user's online status
 * POST /api/v1/rtdb/presence/online        — mark the current user online
 * POST /api/v1/rtdb/presence/offline       — mark the current user offline
 * GET  /api/v1/rtdb/notifications          — list own unread notifications
 * POST /api/v1/rtdb/notifications/read     — mark all notifications as read
 */

'use strict';

const express         = require('express');
const { verifyToken } = require('../middleware/auth');
const rtdbService     = require('../services/rtdb.service');

const router = express.Router();

// All RTDB routes require authentication
router.use(verifyToken);

/** Mark the authenticated user as online */
router.post('/presence/online', async (req, res, next) => {
  try {
    await rtdbService.setUserOnline(req.user.uid);
    res.json({ success: true, message: 'Marked as online.' });
  } catch (err) { next(err); }
});

/** Mark the authenticated user as offline */
router.post('/presence/offline', async (req, res, next) => {
  try {
    await rtdbService.setUserOffline(req.user.uid);
    res.json({ success: true, message: 'Marked as offline.' });
  } catch (err) { next(err); }
});

/** Get any user's presence (own, or admin for others) */
router.get('/presence/:uid', async (req, res, next) => {
  try {
    const { uid } = req.params;

    // Non-admins can only query their own presence
    if (req.user.role !== 'admin' && req.user.uid !== uid) {
      return res.status(403).json({ success: false, message: 'Forbidden.' });
    }

    const presence = await rtdbService.getUserPresence(uid);
    res.json({ success: true, data: presence || { online: false, lastSeen: null } });
  } catch (err) { next(err); }
});

/** Get own notifications */
router.get('/notifications', async (req, res, next) => {
  try {
    const { rtdb } = require('../config/firebase');
    const snapshot = await rtdb.ref(`notifications/${req.user.uid}`).get();

    const notifications = [];
    if (snapshot.exists()) {
      snapshot.forEach((child) => {
        notifications.push({ id: child.key, ...child.val() });
      });
    }

    // Newest first
    notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ success: true, count: notifications.length, data: notifications });
  } catch (err) { next(err); }
});

/** Mark all own notifications as read */
router.post('/notifications/read', async (req, res, next) => {
  try {
    await rtdbService.markNotificationsRead(req.user.uid);
    res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (err) { next(err); }
});

module.exports = router;
