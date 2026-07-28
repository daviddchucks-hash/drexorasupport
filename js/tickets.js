/**
 * tickets.js — ES6 Module
 * Ticket System: create, list, filter, detail panel, status management
 */

import { requireAuth, setupSidebar, toast, escHtml, formatDate, timeAgo } from './app.js';

/* ── Constants ──────────────────────────────────────────────── */
const STATUS_CONFIG = {
  open:     { label: 'Open',                badge: 'badge-info' },
  pending:  { label: 'Pending',             badge: 'badge-warning' },
  waiting:  { label: 'Waiting for Customer',badge: 'badge-muted' },
  resolved: { label: 'Resolved',            badge: 'badge-success' },
  closed:   { label: 'Closed',              badge: 'badge-muted' }
};

const PRIORITY_CONFIG = {
  low:    { label: 'Low',    badge: 'priority-low' },
  medium: { label: 'Medium', badge: 'priority-medium' },
  high:   { label: 'High',   badge: 'priority-high' },
  urgent: { label: 'Urgent', badge: 'priority-urgent' }
};

const CHANNEL_ICONS = {
  website:  '🌐',
  email:    '📧',
  whatsapp: '💬'
};

/* ── State ─────────────────────────────────────────────────── */
let currentUser = null;
let db = null;
let tickets = {};
let teamMembers = {};
let openTicketId = null;
let ticketCounter = 0;

/* ── Init ──────────────────────────────────────────────────── */
requireAuth(user => {
  currentUser = user;
  db = firebase.database();
  setupSidebar(user);
  loadTeamMembers();
  loadTickets();
  bindEvents();
});

/* ── Load team members for agent dropdown ───────────────────── */
function loadTeamMembers() {
  db.ref(`businesses/${currentUser.uid}/team/members`).on('value', snap => {
    teamMembers = snap.val() || {};
    populateAgentDropdown();
  });
}

function populateAgentDropdown() {
  const sel = document.getElementById('nt-agent');
  if (!sel) return;
  const agents = Object.entries(teamMembers).filter(([,m]) => m.role === 'agent' || m.role === 'admin' || m.role === 'owner');
  sel.innerHTML = `<option value="">Unassigned</option>` +
    agents.map(([id, m]) => `<option value="${escHtml(id)}">${escHtml(m.name||m.email)}</option>`).join('');
}

/* ── Load tickets ───────────────────────────────────────────── */
function loadTickets() {
  db.ref(`businesses/${currentUser.uid}/tickets`).on('value', snap => {
    tickets = snap.val() || {};
    ticketCounter = Object.keys(tickets).length;
    renderTickets();
    updateStats();
  });
}

/* ── Generate ticket ID ─────────────────────────────────────── */
async function generateTicketId() {
  const snap = await db.ref(`businesses/${currentUser.uid}/ticketCounter`).transaction(n => (n || 0) + 1);
  const num = snap.snapshot.val();
  return `DXS-${String(num).padStart(6, '0')}`;
}

/* ── Render tickets table ───────────────────────────────────── */
function renderTickets() {
  const tbody = document.getElementById('tickets-tbody');
  const search    = (document.getElementById('ticket-search')?.value || '').toLowerCase();
  const fStatus   = document.getElementById('filter-status')?.value || '';
  const fPriority = document.getElementById('filter-priority')?.value || '';
  const fChannel  = document.getElementById('filter-channel')?.value || '';

  let arr = Object.entries(tickets).sort((a, b) => (b[1].createdAt||0) - (a[1].createdAt||0));

  // Filter
  arr = arr.filter(([id, t]) => {
    if (search && !`${t.ticketId||id} ${t.customerName||''} ${t.subject||''}`.toLowerCase().includes(search)) return false;
    if (fStatus && t.status !== fStatus) return false;
    if (fPriority && t.priority !== fPriority) return false;
    if (fChannel && t.channel !== fChannel) return false;
    return true;
  });

  if (!arr.length) {
    tbody.innerHTML = `<tr><td colspan="9">
      <div class="empty-state"><div class="empty-state-icon">🎫</div>
      <div class="empty-state-title">No Tickets Found</div>
      <div class="empty-state-desc">Create your first ticket or adjust your filters.</div>
      </div></td></tr>`;
    return;
  }

  tbody.innerHTML = arr.map(([id, t]) => {
    const status   = STATUS_CONFIG[t.status]   || STATUS_CONFIG.open;
    const priority = PRIORITY_CONFIG[t.priority] || PRIORITY_CONFIG.medium;
    const agent    = t.assignedAgent ? (teamMembers[t.assignedAgent]?.name || 'Unknown') : '—';
    const initials = (t.customerName || '?').slice(0, 2).toUpperCase();
    const channelIcon = CHANNEL_ICONS[t.channel] || '🌐';

    return `<tr class="ticket-row ${openTicketId === id ? 'ticket-row--active' : ''}" onclick="openTicketDetail('${id}')">
      <td><span class="ticket-id-badge">${escHtml(t.ticketId || id.slice(0,8))}</span></td>
      <td>
        <div class="member-cell">
          <div class="member-avatar"><div class="member-avatar-fallback" style="font-size:.75rem">${initials}</div></div>
          <div>
            <div class="member-name">${escHtml(t.customerName||'Unknown')}</div>
            <div class="member-email">${escHtml(t.customerEmail||'')}</div>
          </div>
        </div>
      </td>
      <td style="max-width:200px">
        <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(t.subject||'—')}</div>
      </td>
      <td><span class="channel-badge">${channelIcon} ${capitalize(t.channel||'website')}</span></td>
      <td class="${t.assignedAgent ? '' : 'text-muted'}">${escHtml(agent)}</td>
      <td><span class="badge ${priority.badge}">${priority.label}</span></td>
      <td><span class="badge ${status.badge}">${status.label}</span></td>
      <td class="text-muted" style="white-space:nowrap">${timeAgo(t.createdAt)}</td>
      <td>
        <div class="action-menu-wrap">
          <button class="action-menu-btn" onclick="event.stopPropagation();toggleTicketMenu(event,'${id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
          </button>
          <div class="action-menu" id="tmenu-${id}">
            <button class="action-menu-item" onclick="event.stopPropagation();quickChangeStatus('${id}','resolved')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>Mark Resolved
            </button>
            <button class="action-menu-item" onclick="event.stopPropagation();quickChangeStatus('${id}','closed')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Close Ticket
            </button>
            <div class="action-menu-divider"></div>
            <button class="action-menu-item action-menu-item--danger" onclick="event.stopPropagation();deleteTicket('${id}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>Delete
            </button>
          </div>
        </div>
      </td>
    </tr>`;
  }).join('');
}

/* ── Update stats ───────────────────────────────────────────── */
function updateStats() {
  const arr = Object.values(tickets);
  const open     = arr.filter(t => t.status === 'open').length;
  const pending  = arr.filter(t => t.status === 'pending').length;
  const resolved = arr.filter(t => t.status === 'resolved').length;
  const closed   = arr.filter(t => t.status === 'closed').length;
  const high     = arr.filter(t => t.priority === 'high' || t.priority === 'urgent').length;

  animateCounter('tstat-open', open);
  animateCounter('tstat-pending', pending);
  animateCounter('tstat-resolved', resolved);
  animateCounter('tstat-closed', closed);
  animateCounter('tstat-high', high);

  // Average response time (mock based on created vs updated)
  const responded = arr.filter(t => t.firstResponseAt && t.createdAt);
  if (responded.length) {
    const avgMs = responded.reduce((sum, t) => sum + (t.firstResponseAt - t.createdAt), 0) / responded.length;
    const avgMin = Math.round(avgMs / 60000);
    const el = document.getElementById('tstat-avg-response');
    if (el) el.textContent = avgMin < 60 ? `${avgMin}m` : `${Math.round(avgMin/60)}h`;
  } else {
    const el = document.getElementById('tstat-avg-response');
    if (el) el.textContent = '—';
  }
}

/* ── Animated counter ───────────────────────────────────────── */
function animateCounter(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = parseInt(el.textContent) || 0;
  if (start === target) { el.textContent = target; return; }
  const step = Math.ceil(Math.abs(target - start) / 20);
  let current = start;
  const interval = setInterval(() => {
    current = current < target ? Math.min(current + step, target) : Math.max(current - step, target);
    el.textContent = current;
    if (current === target) clearInterval(interval);
  }, 30);
}

/* ── Open ticket detail panel ───────────────────────────────── */
window.openTicketDetail = function(ticketId) {
  const t = tickets[ticketId];
  if (!t) return;
  openTicketId = ticketId;
  renderTickets(); // refresh to show active row

  const panel = document.getElementById('ticket-detail-panel');
  const overlay = document.getElementById('tdp-overlay');
  const status   = STATUS_CONFIG[t.status]   || STATUS_CONFIG.open;
  const priority = PRIORITY_CONFIG[t.priority] || PRIORITY_CONFIG.medium;
  const agent    = t.assignedAgent ? (teamMembers[t.assignedAgent]?.name || 'Unknown') : 'Unassigned';
  const channelIcon = CHANNEL_ICONS[t.channel] || '🌐';

  document.getElementById('tdp-ticket-id').textContent = t.ticketId || ticketId.slice(0,8);
  document.getElementById('tdp-subject').textContent = t.subject || '—';

  // Build timeline / conversation
  const messages = t.messages ? Object.values(t.messages).sort((a,b) => a.ts - b.ts) : [];
  const notes = t.notes ? Object.values(t.notes).sort((a,b) => a.ts - b.ts) : [];

  document.getElementById('tdp-body').innerHTML = `
    <!-- Customer Info -->
    <div class="tdp-section">
      <div class="tdp-section-title">Customer</div>
      <div class="tdp-info-grid">
        <div class="tdp-info-item"><span class="tdp-info-label">Name</span><span>${escHtml(t.customerName||'—')}</span></div>
        <div class="tdp-info-item"><span class="tdp-info-label">Email</span><span>${escHtml(t.customerEmail||'—')}</span></div>
        <div class="tdp-info-item"><span class="tdp-info-label">Phone</span><span>${escHtml(t.customerPhone||'—')}</span></div>
        <div class="tdp-info-item"><span class="tdp-info-label">Channel</span><span>${channelIcon} ${capitalize(t.channel||'website')}</span></div>
      </div>
    </div>

    <!-- Ticket Meta -->
    <div class="tdp-section">
      <div class="tdp-section-title">Details</div>
      <div class="tdp-meta-row">
        <div class="tdp-meta-item">
          <span class="tdp-info-label">Status</span>
          <select class="form-input form-select" style="padding:5px 10px;font-size:.8rem" onchange="updateTicketField('${ticketId}','status',this.value)">
            ${Object.entries(STATUS_CONFIG).map(([k,v]) => `<option value="${k}" ${t.status===k?'selected':''}>${v.label}</option>`).join('')}
          </select>
        </div>
        <div class="tdp-meta-item">
          <span class="tdp-info-label">Priority</span>
          <select class="form-input form-select" style="padding:5px 10px;font-size:.8rem" onchange="updateTicketField('${ticketId}','priority',this.value)">
            ${Object.entries(PRIORITY_CONFIG).map(([k,v]) => `<option value="${k}" ${t.priority===k?'selected':''}>${v.label}</option>`).join('')}
          </select>
        </div>
        <div class="tdp-meta-item">
          <span class="tdp-info-label">Assigned Agent</span>
          <select class="form-input form-select" style="padding:5px 10px;font-size:.8rem" onchange="updateTicketField('${ticketId}','assignedAgent',this.value)">
            <option value="">Unassigned</option>
            ${Object.entries(teamMembers).map(([id,m]) => `<option value="${id}" ${t.assignedAgent===id?'selected':''}>${escHtml(m.name||m.email)}</option>`).join('')}
          </select>
        </div>
        <div class="tdp-meta-item">
          <span class="tdp-info-label">Category</span>
          <span>${capitalize(t.category||'general')}</span>
        </div>
        <div class="tdp-meta-item">
          <span class="tdp-info-label">Created</span>
          <span>${t.createdAt ? new Date(t.createdAt).toLocaleString() : '—'}</span>
        </div>
        <div class="tdp-meta-item">
          <span class="tdp-info-label">Last Updated</span>
          <span>${t.updatedAt ? timeAgo(t.updatedAt) : '—'}</span>
        </div>
      </div>
    </div>

    <!-- Description -->
    ${t.description ? `<div class="tdp-section">
      <div class="tdp-section-title">Description</div>
      <div style="font-size:.875rem;color:var(--text-secondary);line-height:1.6">${escHtml(t.description)}</div>
    </div>` : ''}

    <!-- Conversation History -->
    <div class="tdp-section">
      <div class="tdp-section-title">Conversation</div>
      <div class="tdp-messages" id="tdp-messages">
        ${messages.length ? messages.map(msg => `
          <div class="tdp-msg ${msg.sender==='agent'?'tdp-msg--agent':'tdp-msg--customer'}">
            <div class="tdp-msg-header">
              <strong>${escHtml(msg.senderName||msg.sender)}</strong>
              <span class="text-muted" style="font-size:.75rem">${timeAgo(msg.ts)}</span>
            </div>
            <div class="tdp-msg-body">${escHtml(msg.text||'')}</div>
          </div>`).join('')
          : '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:.875rem">No messages yet</div>'}
      </div>
      <div class="tdp-reply-box">
        <textarea class="form-input form-textarea" id="tdp-reply-text" placeholder="Type your reply…" rows="3" style="margin-bottom:10px"></textarea>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-ghost btn-sm" onclick="addInternalNote('${ticketId}')">+ Internal Note</button>
          <button class="btn btn-primary btn-sm" onclick="sendReply('${ticketId}')">Send Reply</button>
        </div>
      </div>
    </div>

    <!-- Internal Notes -->
    ${notes.length ? `<div class="tdp-section">
      <div class="tdp-section-title">Internal Notes <span style="font-size:.75rem;color:var(--text-muted)">(Visible to team only)</span></div>
      ${notes.map(note => `<div class="tdp-note">
        <div class="tdp-msg-header"><strong>${escHtml(note.authorName||'Agent')}</strong><span class="text-muted" style="font-size:.75rem">${timeAgo(note.ts)}</span></div>
        <div>${escHtml(note.text||'')}</div>
      </div>`).join('')}
    </div>` : ''}

    <!-- Tags -->
    <div class="tdp-section">
      <div class="tdp-section-title">Tags</div>
      <div class="tdp-tags-wrap">
        ${(t.tags||[]).map(tag => `<span class="tdp-tag">${escHtml(tag)}</span>`).join('')}
        <input class="tdp-tag-input" type="text" placeholder="Add tag…" onkeydown="addTag(event,'${ticketId}')">
      </div>
    </div>

    <!-- Action buttons -->
    <div class="tdp-actions">
      <button class="btn btn-success btn-sm" onclick="quickChangeStatus('${ticketId}','resolved')">✓ Resolve</button>
      <button class="btn btn-ghost btn-sm" onclick="quickChangeStatus('${ticketId}','closed')">Close</button>
      <button class="btn btn-danger btn-sm" onclick="deleteTicket('${ticketId}')">Delete</button>
    </div>`;

  panel.classList.add('open');
  overlay.classList.add('open');
};

/* ── Close detail panel ─────────────────────────────────────── */
window.closeTicketPanel = function() {
  document.getElementById('ticket-detail-panel').classList.remove('open');
  document.getElementById('tdp-overlay').classList.remove('open');
  openTicketId = null;
  renderTickets();
};

/* ── Reply to ticket ────────────────────────────────────────── */
window.sendReply = async function(ticketId) {
  const text = document.getElementById('tdp-reply-text')?.value?.trim();
  if (!text) return;
  const uid = currentUser.uid;
  const t = tickets[ticketId];

  try {
    const msgRef = db.ref(`businesses/${uid}/tickets/${ticketId}/messages`).push();
    await msgRef.set({ text, sender: 'agent', senderName: currentUser.email.split('@')[0], ts: Date.now() });
    const updates = { updatedAt: Date.now() };
    if (!t?.firstResponseAt) updates.firstResponseAt = Date.now();
    await db.ref(`businesses/${uid}/tickets/${ticketId}`).update(updates);
    document.getElementById('tdp-reply-text').value = '';
    toast('Reply sent.', 'success');
  } catch {
    toast('Failed to send reply.', 'error');
  }
};

/* ── Add internal note ──────────────────────────────────────── */
window.addInternalNote = async function(ticketId) {
  const text = document.getElementById('tdp-reply-text')?.value?.trim();
  if (!text) { toast('Type a note first.', 'warning'); return; }
  try {
    const noteRef = db.ref(`businesses/${currentUser.uid}/tickets/${ticketId}/notes`).push();
    await noteRef.set({ text, authorName: currentUser.email.split('@')[0], ts: Date.now() });
    document.getElementById('tdp-reply-text').value = '';
    toast('Internal note added.', 'success');
  } catch {
    toast('Failed to add note.', 'error');
  }
};

/* ── Update ticket field ────────────────────────────────────── */
window.updateTicketField = async function(ticketId, field, value) {
  try {
    await db.ref(`businesses/${currentUser.uid}/tickets/${ticketId}`).update({ [field]: value, updatedAt: Date.now() });
    toast(`${capitalize(field)} updated.`, 'success');
  } catch {
    toast('Failed to update.', 'error');
  }
};

/* ── Add tag ────────────────────────────────────────────────── */
window.addTag = async function(event, ticketId) {
  if (event.key !== 'Enter') return;
  const tag = event.target.value.trim();
  if (!tag) return;
  const t = tickets[ticketId];
  const tags = [...(t?.tags || [])];
  if (!tags.includes(tag)) tags.push(tag);
  try {
    await db.ref(`businesses/${currentUser.uid}/tickets/${ticketId}`).update({ tags, updatedAt: Date.now() });
    event.target.value = '';
  } catch {
    toast('Failed to add tag.', 'error');
  }
};

/* ── Quick change status ────────────────────────────────────── */
window.quickChangeStatus = async function(ticketId, status) {
  closeAllMenus();
  try {
    await db.ref(`businesses/${currentUser.uid}/tickets/${ticketId}`).update({ status, updatedAt: Date.now() });
    toast(`Ticket marked as ${status}.`, 'success');
    if (openTicketId === ticketId) openTicketDetail(ticketId);
  } catch {
    toast('Failed to update status.', 'error');
  }
};

/* ── Delete ticket ──────────────────────────────────────────── */
window.deleteTicket = async function(ticketId) {
  closeAllMenus();
  if (!confirm('Delete this ticket? This cannot be undone.')) return;
  try {
    await db.ref(`businesses/${currentUser.uid}/tickets/${ticketId}`).remove();
    if (openTicketId === ticketId) window.closeTicketPanel();
    toast('Ticket deleted.', 'info');
  } catch {
    toast('Failed to delete ticket.', 'error');
  }
};

/* ── Create new ticket ──────────────────────────────────────── */
async function createTicket() {
  const customerName  = document.getElementById('nt-customer-name').value.trim();
  const customerEmail = document.getElementById('nt-customer-email').value.trim();
  const customerPhone = document.getElementById('nt-customer-phone').value.trim();
  const subject       = document.getElementById('nt-subject').value.trim();
  const description   = document.getElementById('nt-description').value.trim();
  const priority      = document.getElementById('nt-priority').value;
  const category      = document.getElementById('nt-category').value;
  const channel       = document.getElementById('nt-channel').value;
  const assignedAgent = document.getElementById('nt-agent').value;

  if (!customerName) { toast('Customer name is required.', 'error'); return; }
  if (!customerEmail) { toast('Customer email is required.', 'error'); return; }
  if (!subject)       { toast('Subject is required.', 'error'); return; }

  const btn = document.getElementById('create-ticket-btn');
  btn.disabled = true;
  btn.textContent = 'Creating…';

  try {
    const ticketId = await generateTicketId();
    const ticketRef = db.ref(`businesses/${currentUser.uid}/tickets`).push();
    await ticketRef.set({
      ticketId,
      customerName, customerEmail, customerPhone,
      subject, description,
      priority, category, channel,
      assignedAgent: assignedAgent || null,
      status: 'open',
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: currentUser.uid
    });

    // Update agent's assignedTickets count
    if (assignedAgent) {
      const agentRef = db.ref(`businesses/${currentUser.uid}/team/members/${assignedAgent}/assignedTickets`);
      agentRef.transaction(n => (n || 0) + 1);
    }

    toast(`Ticket ${ticketId} created!`, 'success');
    closeModal('new-ticket-modal');
    clearNewTicketForm();
  } catch (err) {
    console.error(err);
    toast('Failed to create ticket. Try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Ticket';
  }
}

function clearNewTicketForm() {
  ['nt-customer-name','nt-customer-email','nt-customer-phone','nt-subject','nt-description'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('nt-priority').value = 'medium';
  document.getElementById('nt-category').value = 'general';
  document.getElementById('nt-channel').value = 'website';
  document.getElementById('nt-agent').value = '';
}

/* ── Toggle ticket action menu ──────────────────────────────── */
window.toggleTicketMenu = function(e, ticketId) {
  e.stopPropagation();
  document.querySelectorAll('.action-menu.open').forEach(m => {
    if (m.id !== `tmenu-${ticketId}`) m.classList.remove('open');
  });
  document.getElementById(`tmenu-${ticketId}`)?.classList.toggle('open');
};

/* ── Bind events ────────────────────────────────────────────── */
function bindEvents() {
  // New ticket modal
  document.getElementById('new-ticket-btn').addEventListener('click', () => openModal('new-ticket-modal'));
  document.getElementById('close-new-ticket-modal').addEventListener('click', () => closeModal('new-ticket-modal'));
  document.getElementById('cancel-new-ticket-btn').addEventListener('click', () => closeModal('new-ticket-modal'));
  document.getElementById('new-ticket-modal').addEventListener('click', e => { if (e.target.id === 'new-ticket-modal') closeModal('new-ticket-modal'); });
  document.getElementById('create-ticket-btn').addEventListener('click', createTicket);

  // Detail panel close
  document.getElementById('close-tdp').addEventListener('click', window.closeTicketPanel);
  document.getElementById('tdp-overlay').addEventListener('click', window.closeTicketPanel);

  // Filters
  document.getElementById('ticket-search').addEventListener('input', renderTickets);
  document.getElementById('filter-status').addEventListener('change', renderTickets);
  document.getElementById('filter-priority').addEventListener('change', renderTickets);
  document.getElementById('filter-channel').addEventListener('change', renderTickets);

  // Close menus on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('.action-menu-wrap')) {
      document.querySelectorAll('.action-menu.open').forEach(m => m.classList.remove('open'));
    }
  });
}

/* ── Helpers ────────────────────────────────────────────────── */
function openModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
function closeAllMenus() { document.querySelectorAll('.action-menu.open').forEach(m => m.classList.remove('open')); }
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
