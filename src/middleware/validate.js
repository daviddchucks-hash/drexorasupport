/**
 * middleware/validate.js — express-validator result handler.
 *
 * Place this middleware AFTER your validation rule array so that
 * validation errors are caught and returned before the controller runs.
 *
 * Usage:
 *   router.post('/register',
 *     [body('email').isEmail(), body('password').isLength({ min: 6 })],
 *     validate,
 *     authController.register
 *   );
 */

'use strict';

const { validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed.',
      errors:  errors.array().map((e) => ({
        field:   e.path,
        message: e.msg,
      })),
    });
  }

  next();
};

module.exports = validate;
