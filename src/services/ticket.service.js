/**
 * services/ticket.service.js — Support ticket business logic.
 *
 * Tickets are stored in Firestore under the 'tickets' collection.
 * Each document uses a UUID as its ID for predictable, URL-safe IDs.
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const { db }  = require('../config/firebase');
const logger  = require('./logger.service');

const COLLECTION = 'tickets';

/**
 * Create a new support ticket.
 */
const createTicket = async ({ uid, subject, message, category = 'general' }) => {
  const ticketId = uuidv4();
  const now      = new Date().toISOString();

  const ticket = {
    id:        ticketId,
    uid,
    subject,
    message,
    category,
    status:    'open',
    replies:   [],
    createdAt: now,
    updatedAt: now,
  };

  await db.collection(COLLECTION).doc(ticketId).set(ticket);
  logger.info(`Ticket created: ${ticketId} by uid=${uid}`);
  return ticket;
};

/**
 * List tickets. Admins see all; regular users see only their own.
 */
const listTickets = async ({ uid, role, limit = 50 }) => {
  let query = db.collection(COLLECTION).orderBy('createdAt', 'desc').limit(limit);
  if (role !== 'admin') query = query.where('uid', '==', uid);

  const snapshot = await query.get();
  return snapshot.docs.map((doc) => doc.data());
};

/**
 * Fetch a single ticket. Non-admins may only read their own.
 */
const getTicketById = async (ticketId, { uid, role }) => {
  const docSnap = await db.collection(COLLECTION).doc(ticketId).get();

  if (!docSnap.exists) {
    const err = new Error('Ticket not found.');
    err.statusCode = 404;
    throw err;
  }

  const ticket = docSnap.data();

  if (role !== 'admin' && ticket.uid !== uid) {
    const err = new Error('Forbidden: You do not have access to this ticket.');
    err.statusCode = 403;
    throw err;
  }

  return ticket;
};

/**
 * Update ticket status or append a reply.
 */
const updateTicket = async (ticketId, updates, requester) => {
  const ticket  = await getTicketById(ticketId, requester);
  const docRef  = db.collection(COLLECTION).doc(ticketId);
  const changes = { updatedAt: new Date().toISOString() };

  if (updates.status) {
    if (requester.role !== 'admin') {
      const err = new Error('Forbidden: Only admins can change ticket status.');
      err.statusCode = 403;
      throw err;
    }
    changes.status = updates.status;
  }

  if (updates.reply) {
    changes.replies = [
      ...(ticket.replies || []),
      { authorUid: requester.uid, message: updates.reply, createdAt: new Date().toISOString() },
    ];
  }

  await docRef.update(changes);
  logger.info(`Ticket updated: ${ticketId}`);
  return { ...ticket, ...changes };
};

/**
 * Permanently delete a ticket (admin only).
 */
const deleteTicket = async (ticketId) => {
  await db.collection(COLLECTION).doc(ticketId).delete();
  logger.info(`Ticket deleted: ${ticketId}`);
};

module.exports = { createTicket, listTickets, getTicketById, updateTicket, deleteTicket };
