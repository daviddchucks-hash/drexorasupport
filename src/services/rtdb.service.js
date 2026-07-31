/**
 * services/rtdb.service.js — Firebase Realtime Database helpers.
 *
 * Use the Realtime Database for features that need sub-second latency:
 *   - User online/presence tracking
 *   - Live ticket status updates
 *   - Real-time notifications
 *
 * For structured data with complex queries (user profiles, ticket history),
 * keep using Firestore via the other services.
 *
 * Project database: https://drexorasupport-default-rtdb.firebaseio.com
 */

'use strict';

const { rtdb }  = require('../config/firebase');
const logger    = require('./logger.service');

// ── Presence ───────────────────────────────────────────────────────────────

/**
 * Mark a user as online in the Realtime Database.
 * Call this after the user successfully authenticates.
 *
 * @param {string} uid — Firebase UID
 */
const setUserOnline = async (uid) => {
  const ref = rtdb.ref(`presence/${uid}`);
  await ref.set({
    online:    true,
    lastSeen:  new Date().toISOString(),
  });
  logger.info(`Presence: uid=${uid} is online`);
};

/**
 * Mark a user as offline.
 *
 * @param {string} uid
 */
const setUserOffline = async (uid) => {
  const ref = rtdb.ref(`presence/${uid}`);
  await ref.update({
    online:   false,
    lastSeen: new Date().toISOString(),
  });
  logger.info(`Presence: uid=${uid} is offline`);
};

/**
 * Get the current presence record for a user.
 *
 * @param {string} uid
 * @returns {Promise<{ online: boolean, lastSeen: string } | null>}
 */
const getUserPresence = async (uid) => {
  const snapshot = await rtdb.ref(`presence/${uid}`).get();
  return snapshot.exists() ? snapshot.val() : null;
};

// ── Live ticket notifications ──────────────────────────────────────────────

/**
 * Push a notification event to the Realtime Database so connected
 * clients can react immediately without polling.
 *
 * Path: notifications/<uid>/<pushKey>
 *
 * @param {string} uid        — recipient user UID
 * @param {object} payload    — { type, ticketId, message }
 */
const pushNotification = async (uid, payload) => {
  const ref = rtdb.ref(`notifications/${uid}`);
  await ref.push({
    ...payload,
    read:      false,
    createdAt: new Date().toISOString(),
  });
  logger.info(`Notification pushed to uid=${uid}: ${JSON.stringify(payload)}`);
};

/**
 * Mark all notifications for a user as read.
 *
 * @param {string} uid
 */
const markNotificationsRead = async (uid) => {
  const snapshot = await rtdb.ref(`notifications/${uid}`).get();
  if (!snapshot.exists()) return;

  const updates = {};
  snapshot.forEach((child) => {
    updates[`${child.key}/read`] = true;
  });

  await rtdb.ref(`notifications/${uid}`).update(updates);
};

module.exports = {
  setUserOnline,
  setUserOffline,
  getUserPresence,
  pushNotification,
  markNotificationsRead,
};
