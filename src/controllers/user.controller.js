/**
 * controllers/user.controller.js — Request handlers for user management routes.
 */

'use strict';

const userService = require('../services/user.service');

/** GET /api/v1/users  (admin only) */
const listUsers = async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const users = await userService.listUsers(limit);
    res.json({ success: true, count: users.length, data: users });
  } catch (error) {
    next(error);
  }
};

/** GET /api/v1/users/:uid */
const getUser = async (req, res, next) => {
  try {
    const { uid } = req.params;

    // Non-admins may only read their own profile
    if (req.user.role !== 'admin' && req.user.uid !== uid) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You can only view your own profile.',
      });
    }

    const user = await userService.getUserByUid(uid);
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

/** PUT /api/v1/users/:uid */
const updateUser = async (req, res, next) => {
  try {
    const { uid } = req.params;

    if (req.user.role !== 'admin' && req.user.uid !== uid) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You can only update your own profile.',
      });
    }

    const updates = { ...req.body };
    // Prevent non-admins from escalating their own role
    if (req.user.role !== 'admin') delete updates.role;

    const updated = await userService.updateUser(uid, updates);
    res.json({ success: true, message: 'Profile updated successfully.', data: updated });
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/v1/users/:uid  (admin only) */
const deleteUser = async (req, res, next) => {
  try {
    const { uid } = req.params;

    if (uid === req.user.uid) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account via this endpoint.',
      });
    }

    await userService.deleteUser(uid);
    res.json({ success: true, message: `User ${uid} has been permanently deleted.` });
  } catch (error) {
    next(error);
  }
};

module.exports = { listUsers, getUser, updateUser, deleteUser };
