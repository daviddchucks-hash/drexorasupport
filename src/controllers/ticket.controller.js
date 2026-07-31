/**
 * controllers/ticket.controller.js — Request handlers for support ticket routes.
 */

'use strict';

const ticketService = require('../services/ticket.service');

/** POST /api/v1/tickets */
const createTicket = async (req, res, next) => {
  try {
    const { subject, message, category } = req.body;
    const ticket = await ticketService.createTicket({
      uid: req.user.uid,
      subject,
      message,
      category,
    });
    res.status(201).json({
      success: true,
      message: 'Support ticket created successfully.',
      data:    ticket,
    });
  } catch (error) {
    next(error);
  }
};

/** GET /api/v1/tickets */
const listTickets = async (req, res, next) => {
  try {
    const limit   = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const tickets = await ticketService.listTickets({
      uid:  req.user.uid,
      role: req.user.role,
      limit,
    });
    res.json({ success: true, count: tickets.length, data: tickets });
  } catch (error) {
    next(error);
  }
};

/** GET /api/v1/tickets/:id */
const getTicket = async (req, res, next) => {
  try {
    const ticket = await ticketService.getTicketById(
      req.params.id,
      { uid: req.user.uid, role: req.user.role },
    );
    res.json({ success: true, data: ticket });
  } catch (error) {
    next(error);
  }
};

/** PATCH /api/v1/tickets/:id */
const updateTicket = async (req, res, next) => {
  try {
    const updated = await ticketService.updateTicket(
      req.params.id,
      req.body,
      { uid: req.user.uid, role: req.user.role },
    );
    res.json({ success: true, message: 'Ticket updated.', data: updated });
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/v1/tickets/:id  (admin only) */
const deleteTicket = async (req, res, next) => {
  try {
    await ticketService.deleteTicket(req.params.id);
    res.json({ success: true, message: `Ticket ${req.params.id} has been deleted.` });
  } catch (error) {
    next(error);
  }
};

module.exports = { createTicket, listTickets, getTicket, updateTicket, deleteTicket };
