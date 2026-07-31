/**
 * routes/ticket.routes.js — Support ticket endpoints.
 *
 * POST   /api/v1/tickets          — open a new support ticket
 * GET    /api/v1/tickets          — list tickets (own or all if admin)
 * GET    /api/v1/tickets/:id      — get a single ticket
 * PATCH  /api/v1/tickets/:id      — update ticket (status or reply)
 * DELETE /api/v1/tickets/:id      — delete a ticket (admin only)
 */

'use strict';

const express                      = require('express');
const { body }                     = require('express-validator');
const ticketController             = require('../controllers/ticket.controller');
const { verifyToken, requireRole } = require('../middleware/auth');
const validate                     = require('../middleware/validate');

const router = express.Router();

router.use(verifyToken);

const createRules = [
  body('subject')
    .trim().notEmpty().withMessage('Subject is required.')
    .isLength({ max: 120 }).withMessage('Subject must be 120 characters or fewer.'),
  body('message')
    .trim().notEmpty().withMessage('Message is required.')
    .isLength({ max: 2000 }).withMessage('Message must be 2000 characters or fewer.'),
  body('category')
    .optional()
    .isIn(['general', 'billing', 'technical', 'account'])
    .withMessage('Category must be one of: general, billing, technical, account.'),
];

const updateRules = [
  body('status')
    .optional()
    .isIn(['open', 'in-progress', 'resolved', 'closed'])
    .withMessage('Status must be one of: open, in-progress, resolved, closed.'),
  body('reply')
    .optional().trim()
    .isLength({ max: 2000 }).withMessage('Reply must be 2000 characters or fewer.'),
];

router.post('/',      createRules, validate, ticketController.createTicket);
router.get('/',       ticketController.listTickets);
router.get('/:id',    ticketController.getTicket);
router.patch('/:id',  updateRules, validate, ticketController.updateTicket);
router.delete('/:id', requireRole('admin'), ticketController.deleteTicket);

module.exports = router;
