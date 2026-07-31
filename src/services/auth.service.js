/**
 * services/auth.service.js — Firebase Auth business logic.
 *
 * All direct calls to the Firebase Admin SDK live here so that
 * controllers stay thin and logic is easy to test.
 */

'use strict';

const { auth, db } = require('../config/firebase');
const logger       = require('./logger.service');

/**
 * Create a new Firebase user and persist a matching Firestore document.
 *
 * @param {{ email: string, password: string, displayName?: string }}
 * @returns {Promise<{ uid, email, displayName }>}
 */
const registerUser = async ({ email, password, displayName = '' }) => {
  const userRecord = await auth.createUser({ email, password, displayName, emailVerified: false });

  await db.collection('users').doc(userRecord.uid).set({
    uid:         userRecord.uid,
    email,
    displayName: displayName || '',
    role:        'user',
    createdAt:   new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
  });

  logger.info(`New user registered: ${userRecord.uid} <${email}>`);
  return { uid: userRecord.uid, email: userRecord.email, displayName: userRecord.displayName };
};

/**
 * Retrieve the Firebase Auth user record + Firestore profile.
 *
 * @param {string} uid
 * @returns {Promise<object>}
 */
const getUserProfile = async (uid) => {
  const [userRecord, docSnap] = await Promise.all([
    auth.getUser(uid),
    db.collection('users').doc(uid).get(),
  ]);

  return {
    uid:           userRecord.uid,
    email:         userRecord.email,
    displayName:   userRecord.displayName,
    emailVerified: userRecord.emailVerified,
    ...(docSnap.exists ? docSnap.data() : {}),
  };
};

/**
 * Revoke all refresh tokens, effectively logging the user out of every session.
 *
 * @param {string} uid
 */
const revokeTokens = async (uid) => {
  await auth.revokeRefreshTokens(uid);
  logger.info(`Refresh tokens revoked for uid: ${uid}`);
};

module.exports = { registerUser, getUserProfile, revokeTokens };
