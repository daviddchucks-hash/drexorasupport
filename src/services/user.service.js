/**
 * services/user.service.js — User CRUD business logic.
 */

'use strict';

const { auth, db } = require('../config/firebase');
const logger       = require('./logger.service');

/**
 * List users stored in Firestore (admin-only).
 *
 * @param {number} [limit=20]
 * @returns {Promise<object[]>}
 */
const listUsers = async (limit = 20) => {
  const snapshot = await db.collection('users')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return snapshot.docs.map((doc) => doc.data());
};

/**
 * Fetch a single user by UID.
 *
 * @param {string} uid
 * @returns {Promise<object>}
 */
const getUserByUid = async (uid) => {
  const docSnap = await db.collection('users').doc(uid).get();
  if (!docSnap.exists) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    throw err;
  }
  return docSnap.data();
};

/**
 * Update user fields in Firebase Auth and Firestore.
 *
 * @param {string} uid
 * @param {object} updates — { displayName?, photoURL?, ... }
 * @returns {Promise<object>}
 */
const updateUser = async (uid, updates) => {
  const allowedAuthFields = ['displayName', 'photoURL', 'email', 'password'];
  const authUpdates = {};

  for (const field of allowedAuthFields) {
    if (updates[field] !== undefined) authUpdates[field] = updates[field];
  }

  if (Object.keys(authUpdates).length) await auth.updateUser(uid, authUpdates);

  await db.collection('users').doc(uid).update({ ...updates, updatedAt: new Date().toISOString() });
  logger.info(`User updated: ${uid}`);

  return getUserByUid(uid);
};

/**
 * Permanently delete a user from Firebase Auth and Firestore.
 *
 * @param {string} uid
 */
const deleteUser = async (uid) => {
  await Promise.all([
    auth.deleteUser(uid),
    db.collection('users').doc(uid).delete(),
  ]);
  logger.info(`User deleted: ${uid}`);
};

module.exports = { listUsers, getUserByUid, updateUser, deleteUser };
