/**
 * tickets.js — ES6 Module
 * Workspace-aware Ticket System.
 */

import {
  requireAuth, setupSidebar, toast, escHtml, formatDate, timeAgo,
  getWorkspaceUid, getCurrentUserRole, getUserRecord, logActivity
} from './app.js';

const STATUS_CONFIG = {
  open:     { label: 'Open',                 badge: 'badge-info'    },
  pending:  { label: 'Pending',              badge: 'badge-warning' },
  waiting:  { label: 'Waiting for Customer', badge: 'badge-muted'   },
  resolved: { label: 'Resolved',             badge: 'badge-success' },
  closed:   { label: 'Closed',               badge: 'badge-muted'   }
};
const PRIORITY_CONFIG = {
  low:    { label: 'Low',    badge: 'priority-low'    },
  medium: { label: 'Medium', badge: 'priority-medium' },
  high:   { label: 'High',   badge: 'priority-high'   },
  urgent: { label: 'Urgent', badge: 'priority-urgent' }
};

let currentUser  = null;
let workspaceUid = null;
let userRole     = null;
let userRec      = null;
let db           = null;
let tickets      = {};
let teamMembers  = {};
let openTicketId = null;

requireAuth(async (user, wid) => {
  currentUser  = user;
  workspaceUid = wid;
  userRole     = await getCurrentUserRole();
  userRec      = await getUserRecord();
  db           = firebase.database();
  setupSidebar(user);
  loadTeamMembers();
  loadTickets();
  bindEvents();
});

function loadTeamMembers() {
  db.ref(`businesses/${workspaceUid}/team/members`).on('value', snap => {
    teamMembers = snap.val() || {};
    populateAgentDropdown();
  });
}

function populateAgentDropdown() {
  const sel = document.getElementById('nt-agent');
  if (!sel) return;
  const agents = Object.entries(teamMembers).filter(([,m]) => ['agent','admin','owner'].includes(m.role));
  sel.innerHTML = `<option value="">Unassigned</option>` +
    agents.map(([id, m]) => `<option value="${escHtml(id)}">${escHtml(m.name||m.email)}</option>`).join('');
}

function loadTickets() {
  db.ref(`businesses/${workspaceUid}/tickets`).on('value', snap => {
    tickets = snap.val() || {};
    renderTickets();
    updateStats();
  });
}

async function generateTicketId() {
  const snap = await db.ref(`businesses/${workspaceUid}/ticketCounter`).transaction(n => (n || 0) + 1);
  const num  = snap.snapshot.val();
  return `DXS-${String(num).padStart(6, '0')}`;
}

function renderTickets() {
  const tbody    = document.getElementById('tickets-tbody');
  const search   = (document.getElementById('ticket-search')?.value || '').toLowerCase();
  const fStatus  = document.getElementById('filter-status')?.value  || '';
  const fPri     = document.getElementById('filter-priority')?.value || '';
  const fChannel = document.getElementById('filter-channel')?.value  || '';

  let arr = Object.entries(tickets).sort((a,b) => (b[1].createdAt||0)-(a[1].createdAt||0));
  arr = arr.filter(([id,t]) => {
    if (search && !`${t.ticketId||id} ${t.customerName||''} ${t.subject||''}`.toLowerCase().includes(search)) return false;
    if (fStatus  && t.status   !== fStatus)  return false;
    if (fPri     && t.priority !== fPri)     return false;
    if (fChannel && t.channel  !== fChannel) return false;
    return true;
  });

  if (!arr.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="empty-state-icon">🎫</div>
      <div class="empty-state-title">No Tickets Found</div>
      <div class="empty-state-desc">Create your first ticket or adjust filters.</div></div></td></tr>`;
    return;
  }

  const CHAN_ICONS = { website:'🌐', email:'📧', whatsapp:'💬' };
  tbody.innerHTML = arr.map(([id, t]) => {
    const sc  = STATUS_CONFIG[t.status]   || STATUS_CONFIG.open;
    const pc  = PRIORITY_CONFIG[t.priority] || PRIORITY_CONFIG.medium;
    const agent = t.assignedAgent ? (teamMembers[t.assignedAgent]?.name || 'Agent') : 'Unassigned';
    return `
      <tr onclick="openTicketPanel('${escHtml(id)}')" style="cursor:pointer">
        <td><strong style="font-size:.82rem;font-family:monospace">${escHtml(t.ticketId||id)}</strong></td>
        <td>${escHtml(t.customerName||'—')}</td>
        <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(t.subject||'—')}</td>
        <td><span class="badge ${sc.badge}">${sc.label}</span></td>
        <td><span class="badge ${pc.badge}">${pc.label}</span></td>
        <td>${CHAN_ICONS[t.channel]||''} ${escHtml(t.channel||'—')}</td>
        <td>${escHtml(agent)}</td>
        <td style="font-size:.8rem;color:var(--text-muted)">${timeAgo(t.updatedAt||t.createdAt)}</td>
        <td>
          <div class="action-menu-wrap">
            <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();toggleTicketMenu(event,'${escHtml(id)}')">⋯</button>
            <div class="action-menu" id="tmenu-${escHtml(id)}">
              <button class="action-menu-item" onclick="event.stopPropagation();updateTicketStatus('${escHtml(id)}','resolved')">✅ Resolve</button>
              <button class="action-menu-item" onclick="event.stopPropagation();updateTicketStatus('${escHtml(id)}','closed')">🔒 Close</button>
              <button class="action-menu-item danger" onclick="event.stopPropagation();deleteTicket('${escHtml(id)}')">🗑 Delete</button>
            </div>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function updateStats() {
  const arr = Object.values(tickets);
  const set = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  set('stat-total-tickets', arr.length);
  set('stat-open-tickets', arr.filter(t=>t.status==='open').length);
  set('stat-pending-tickets', arr.filter(t=>t.status==='pending').length);
  set('stat-resolved-tickets', arr.filter(t=>t.status==='resolved').length);
}

async function createTicket() {
  const get = id => document.getElementById(id)?.value.trim();
  const customerName  = get('nt-customer');
  const customerEmail = get('nt-email');
  const subject       = get('nt-subject');
  const description   = get('nt-description');
  const priority      = document.getElementById('nt-priority')?.value || 'medium';
  const category      = document.getElementById('nt-category')?.value || 'general';
  const channel       = document.getElementById('nt-channel')?.value  || 'website';
  const assignedAgent = document.getElementById('nt-agent')?.value    || '';

  if (!customerName) { toast('Customer name is required.', 'warning'); return; }
  if (!subject)      { toast('Subject is required.', 'warning'); return; }

  const btn = document.getElementById('create-ticket-btn');
  if (btn) { btn.disabled=true; btn.textContent='Creating…'; }

  try {
    const tid = await generateTicketId();
    await db.ref(`businesses/${workspaceUid}/tickets/${tid}`).set({
      ticketId:       tid,
      customerName,   customerEmail,
      subject,        description,
      status:         'open',
      priority,       category, channel,
      assignedAgent,
      createdBy:      currentUser.uid,
      createdAt:      firebase.database.ServerValue.TIMESTAMP,
      updatedAt:      firebase.database.ServerValue.TIMESTAMP,
      messages:       {},
      notes:          {}
    });

    if (assignedAgent && teamMembers[assignedAgent]) {
      const snap = await db.ref(`businesses/${workspaceUid}/team/members/${assignedAgent}/assignedTickets`).once('value');
      await db.ref(`businesses/${workspaceUid}/team/members/${assignedAgent}/assignedTickets`)
        .set((snap.val()||0)+1);
    }

    await logActivity(workspaceUid, `${userRec?.name||'Agent'} created ticket ${tid}: ${subject}`, { type: 'ticket_created', ticketId: tid });
    toast(`Ticket ${tid} created.`, 'success');
    closeModal('new-ticket-modal');
    resetNewTicketForm();
  } catch (err) {
    toast('Failed to create ticket: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled=false; btn.textContent='Create Ticket'; }
  }
}

window.openTicketPanel = function(ticketId) {
  openTicketId = ticketId;
  const t = tickets[ticketId];
  if (!t) return;

  const panel  = document.getElementById('ticket-detail-panel');
  const overlay = document.getElementById('tdp-overlay');
  if (panel)   panel.classList.add('open');
  if (overlay) overlay.classList.add('open');

  const sc  = STATUS_CONFIG[t.status]   || STATUS_CONFIG.open;
  const pc  = PRIORITY_CONFIG[t.priority] || PRIORITY_CONFIG.medium;
  const msgs  = Object.values(t.messages||{}).sort((a,b)=>(a.timestamp||0)-(b.timestamp||0));
  const notes = Object.values(t.notes||{}).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));

  const agentOpts = Object.entries(teamMembers)
    .filter(([,m])=>['owner','admin','agent'].includes(m.role))
    .map(([id,m])=>`<option value="${id}" ${t.assignedAgent===id?'selected':''}>${escHtml(m.name||m.email)}</option>`)
    .join('');

  const panelBody = document.getElementById('tdp-body');
  if (!panelBody) return;

  panelBody.innerHTML = `
    <!-- Ticket header -->
    <div style="padding:16px 20px;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
        <code style="font-size:.82rem;background:var(--glass-active);padding:3px 8px;border-radius:4px">${escHtml(t.ticketId||ticketId)}</code>
        <span class="badge ${sc.badge}">${sc.label}</span>
        <span class="badge ${pc.badge}">${pc.label}</span>
      </div>
      <div style="font-size:1rem;font-weight:700;margin-bottom:4px">${escHtml(t.subject||'—')}</div>
      <div style="font-size:.8rem;color:var(--text-muted)">
        ${escHtml(t.customerName||'—')} · ${escHtml(t.customerEmail||'—')} · Created ${timeAgo(t.createdAt)}
      </div>
    </div>

    <!-- Meta grid -->
    <div style="padding:14px 20px;border-bottom:1px solid var(--border);display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div>
        <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:5px">Status</div>
        <select class="form-input form-select" id="tdp-status-sel" style="font-size:.82rem;padding:6px 10px">
          ${Object.entries(STATUS_CONFIG).map(([v,s])=>`<option value="${v}" ${t.status===v?'selected':''}>${s.label}</option>`).join('')}
        </select>
      </div>
      <div>
        <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:5px">Priority</div>
        <select class="form-input form-select" id="tdp-priority-sel" style="font-size:.82rem;padding:6px 10px">
          ${Object.entries(PRIORITY_CONFIG).map(([v,p])=>`<option value="${v}" ${t.priority===v?'selected':''}>${p.label}</option>`).join('')}
        </select>
      </div>
      <div>
        <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:5px">Assigned To</div>
        <select class="form-input form-select" id="tdp-agent-sel" style="font-size:.82rem;padding:6px 10px">
          <option value="">Unassigned</option>${agentOpts}
        </select>
      </div>
      <div>
        <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:5px">Channel</div>
        <div style="font-size:.88rem;font-weight:600;padding:7px 0">${escHtml(t.channel||'—')}</div>
      </div>
    </div>
    <div style="padding:8px 20px;border-bottom:1px solid var(--border)">
      <button class="btn btn-primary btn-sm" id="tdp-save-meta-btn">Save Changes</button>
    </div>

    <!-- Description -->
    ${t.description ? `
    <div style="padding:14px 20px;border-bottom:1px solid var(--border)">
      <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px">Description</div>
      <div style="font-size:.88rem;line-height:1.6;color:var(--text-secondary)">${escHtml(t.description)}</div>
    </div>` : ''}

    <!-- Messages timeline -->
    <div style="padding:14px 20px;border-bottom:1px solid var(--border)">
      <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px">Messages (${msgs.length})</div>
      <div style="display:flex;flex-direction:column;gap:8px;max-height:200px;overflow-y:auto" id="tdp-msgs">
        ${msgs.map(m=>`
          <div style="background:${m.role==='agent'?'rgba(201,162,39,.08)':'var(--surface-raised)'};
                      border-radius:8px;padding:10px 12px;font-size:.85rem">
            <div style="font-size:.72rem;font-weight:600;color:var(--text-muted);margin-bottom:3px">
              ${escHtml(m.role==='agent'?(m.agentName||'Agent'):'Customer')} · ${timeAgo(m.timestamp)}
            </div>
            ${escHtml(m.text||'')}
          </div>`).join('')}
        ${!msgs.length?'<div style="color:var(--text-muted);font-size:.85rem">No messages yet.</div>':''}
      </div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <textarea id="tdp-msg-input" rows="2" placeholder="Reply to customer…"
                  style="flex:1;resize:none;padding:9px 12px;background:var(--input-bg);border:1px solid var(--border);
                         border-radius:8px;color:var(--text-primary);font-size:.875rem;font-family:inherit;outline:none"></textarea>
        <button id="tdp-msg-send" class="btn btn-primary btn-sm">Send</button>
      </div>
    </div>

    <!-- Internal notes -->
    <div style="padding:14px 20px">
      <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px">Internal Notes (${notes.length})</div>
      <div style="display:flex;flex-direction:column;gap:8px;max-height:180px;overflow-y:auto" id="tdp-notes">
        ${notes.map(n=>`
          <div style="background:rgba(201,162,39,.06);border:1px solid rgba(201,162,39,.15);border-radius:8px;padding:10px 12px;font-size:.85rem">
            <div style="font-size:.72rem;font-weight:600;color:var(--primary);margin-bottom:3px">
              📝 ${escHtml(n.agentName||'Agent')} · ${timeAgo(n.createdAt)}
            </div>
            ${escHtml(n.text||'')}
          </div>`).join('')}
        ${!notes.length?'<div style="color:var(--text-muted);font-size:.85rem">No notes yet.</div>':''}
      </div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <textarea id="tdp-note-input" rows="2" placeholder="Write an internal note (only visible to team)…"
                  style="flex:1;resize:none;padding:9px 12px;background:var(--input-bg);border:1px solid var(--border);
                         border-radius:8px;color:var(--text-primary);font-size:.875rem;font-family:inherit;outline:none"></textarea>
        <button id="tdp-note-add" class="btn btn-ghost btn-sm">Add Note</button>
      </div>
    </div>`;

  // Save meta
  document.getElementById('tdp-save-meta-btn')?.addEventListener('click', async () => {
    const status = document.getElementById('tdp-status-sel')?.value;
    const priority = document.getElementById('tdp-priority-sel')?.value;
    const agent    = document.getElementById('tdp-agent-sel')?.value;
    await db.ref(`businesses/${workspaceUid}/tickets/${ticketId}`).update({
      status, priority, assignedAgent: agent || '',
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
    await logActivity(workspaceUid, `${userRec?.name||'Agent'} updated ticket ${t.ticketId||ticketId}`, { type: 'ticket_updated', ticketId });
    toast('Ticket updated.', 'success');
  });

  // Send message
  document.getElementById('tdp-msg-send')?.addEventListener('click', async () => {
    const ta = document.getElementById('tdp-msg-input');
    const text = ta?.value.trim();
    if (!text) return;
    ta.value = '';
    await db.ref(`businesses/${workspaceUid}/tickets/${ticketId}/messages`).push({
      role: 'agent', text,
      agentUid: currentUser.uid,
      agentName: userRec?.name || 'Agent',
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });
    await db.ref(`businesses/${workspaceUid}/tickets/${ticketId}`).update({ updatedAt: firebase.database.ServerValue.TIMESTAMP });
    toast('Message sent.', 'success');
  });

  // Add note
  document.getElementById('tdp-note-add')?.addEventListener('click', async () => {
    const ta = document.getElementById('tdp-note-input');
    const text = ta?.value.trim();
    if (!text) return;
    ta.value = '';
    await db.ref(`businesses/${workspaceUid}/tickets/${ticketId}/notes`).push({
      agentUid:  currentUser.uid,
      agentName: userRec?.name || 'Agent',
      text, createdAt: firebase.database.ServerValue.TIMESTAMP
    });
    toast('Note added.', 'success');
  });
};

window.closeTicketPanel = function() {
  openTicketId = null;
  document.getElementById('ticket-detail-panel')?.classList.remove('open');
  document.getElementById('tdp-overlay')?.classList.remove('open');
};

window.updateTicketStatus = async function(ticketId, status) {
  document.querySelectorAll('.action-menu.open').forEach(m => m.classList.remove('open'));
  await db.ref(`businesses/${workspaceUid}/tickets/${ticketId}`).update({ status, updatedAt: firebase.database.ServerValue.TIMESTAMP });
  await logActivity(workspaceUid, `${userRec?.name||'Agent'} ${status} ticket ${tickets[ticketId]?.ticketId||ticketId}`, { type: `ticket_${status}`, ticketId });
  toast(`Ticket ${status}.`, 'success');
};

window.deleteTicket = async function(ticketId) {
  document.querySelectorAll('.action-menu.open').forEach(m => m.classList.remove('open'));
  if (!confirm('Delete this ticket? This cannot be undone.')) return;
  await db.ref(`businesses/${workspaceUid}/tickets/${ticketId}`).remove();
  if (openTicketId === ticketId) window.closeTicketPanel();
  toast('Ticket deleted.', 'success');
};

window.toggleTicketMenu = function(e, ticketId) {
  e.stopPropagation();
  document.querySelectorAll('.action-menu.open').forEach(m => {
    if (m.id !== `tmenu-${ticketId}`) m.classList.remove('open');
  });
  document.getElementById(`tmenu-${ticketId}`)?.classList.toggle('open');
};

function resetNewTicketForm() {
  ['nt-customer','nt-email','nt-subject','nt-description'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('nt-priority').value = 'medium';
  document.getElementById('nt-category').value = 'general';
  document.getElementById('nt-channel').value  = 'website';
  document.getElementById('nt-agent').value    = '';
}

function bindEvents() {
  document.getElementById('new-ticket-btn')?.addEventListener('click', () => openModal('new-ticket-modal'));
  document.getElementById('close-new-ticket-modal')?.addEventListener('click', () => closeModal('new-ticket-modal'));
  document.getElementById('cancel-new-ticket-btn')?.addEventListener('click', () => closeModal('new-ticket-modal'));
  document.getElementById('new-ticket-modal')?.addEventListener('click', e => { if(e.target.id==='new-ticket-modal') closeModal('new-ticket-modal'); });
  document.getElementById('create-ticket-btn')?.addEventListener('click', createTicket);
  document.getElementById('close-tdp')?.addEventListener('click', window.closeTicketPanel);
  document.getElementById('tdp-overlay')?.addEventListener('click', window.closeTicketPanel);
  document.getElementById('ticket-search')?.addEventListener('input', renderTickets);
  document.getElementById('filter-status')?.addEventListener('change', renderTickets);
  document.getElementById('filter-priority')?.addEventListener('change', renderTickets);
  document.getElementById('filter-channel')?.addEventListener('change', renderTickets);
  document.addEventListener('click', e => {
    if (!e.target.closest('.action-menu-wrap')) document.querySelectorAll('.action-menu.open').forEach(m => m.classList.remove('open'));
  });
}

function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
