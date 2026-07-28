/**
 * workspace.js — ES6 Module
 * Team Workspace: My Queue, Team Board, and Team Feed.
 * - My Queue: conversations + tickets assigned to the current logged-in member.
 * - Team Board: all agents with their workloads; owners/admins can reassign.
 * - Team Feed: internal team posts and replies (businesses/{wid}/workspace/teamFeed).
 */

import {
  requireAuth, setupSidebar, toast, escHtml, timeAgo,
  getWorkspaceUid, getCurrentUserRole, getUserRecord, logActivity, pushNotification
} from './app.js';

/* ── State ─────────────────────────────────────────────────── */
let currentUser  = null;
let workspaceUid = null;
let userRole     = null;
let userRec      = null;
let db           = null;

let allChats    = {};
let allTickets  = {};
let teamMembers = {};
let teamFeed    = {};

// Assign-modal state
let assignModalType = null; // 'chat' | 'ticket'
let assignModalId   = null;

/* ── Boot ──────────────────────────────────────────────────── */
requireAuth(async (user, wid) => {
  currentUser  = user;
  workspaceUid = wid;
  userRole     = await getCurrentUserRole();
  userRec      = await getUserRecord();
  db           = firebase.database();
  setupSidebar(user);
  bindTabs();
  bindFeedCompose();
  bindAssignModal();
  loadAll();
});

/* ── Load all data with real-time listeners ─────────────────── */
function loadAll() {
  db.ref(`businesses/${workspaceUid}/team/members`).on('value', snap => {
    teamMembers = snap.val() || {};
    renderMyQueue();
    renderTeamBoard();
    populateAssignModalAgents();
  });

  db.ref(`businesses/${workspaceUid}/chats`).on('value', snap => {
    allChats = snap.val() || {};
    renderMyQueue();
    renderTeamBoard();
  });

  db.ref(`businesses/${workspaceUid}/tickets`).on('value', snap => {
    allTickets = snap.val() || {};
    renderMyQueue();
  });

  db.ref(`businesses/${workspaceUid}/workspace/teamFeed`).on('value', snap => {
    teamFeed = snap.val() || {};
    renderTeamFeed();
  });
}

/* ══════════════════════════════════════════════════════════════
   MY QUEUE
   ══════════════════════════════════════════════════════════════ */
function renderMyQueue() {
  const myChats   = Object.entries(allChats).filter(([,c]) => c.assignedTo === currentUser.uid && !['resolved','closed'].includes(c.status));
  const myTickets = Object.entries(allTickets).filter(([,t]) => t.assignedAgent === currentUser.uid && !['resolved','closed'].includes(t.status));

  const waitingChats = myChats.filter(([,c]) => c.status === 'waiting_for_agent').length;

  // Today's resolved count
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const resolvedToday = [
    ...Object.values(allChats).filter(c => c.assignedTo === currentUser.uid && c.status === 'resolved' && (c.updatedAt||0) >= todayStart.getTime()),
    ...Object.values(allTickets).filter(t => t.assignedAgent === currentUser.uid && t.status === 'resolved' && (t.updatedAt||0) >= todayStart.getTime())
  ].length;

  // Stats
  _set('qs-chats',    myChats.length);
  _set('qs-tickets',  myTickets.length);
  _set('qs-resolved', resolvedToday);
  _set('qs-waiting',  waitingChats);
  _set('queue-chats-count',   myChats.length);
  _set('queue-tickets-count', myTickets.length);

  // Badge on tab
  const totalQueue = myChats.length + myTickets.length;
  const qBadge = document.getElementById('my-queue-badge');
  if (qBadge) {
    if (totalQueue > 0) { qBadge.textContent = totalQueue; qBadge.style.display = 'inline-flex'; }
    else qBadge.style.display = 'none';
  }

  // Chats
  const chatList = document.getElementById('queue-chats-list');
  if (chatList) {
    if (!myChats.length) {
      chatList.innerHTML = `<div class="ws-empty"><div class="ws-empty-icon">💬</div>
        <div class="ws-empty-title">No assigned conversations</div>
        <div class="ws-empty-desc">Conversations assigned to you will appear here.</div></div>`;
    } else {
      chatList.innerHTML = myChats
        .sort((a,b) => (b[1].updatedAt||b[1].createdAt||0) - (a[1].updatedAt||a[1].createdAt||0))
        .map(([id, chat]) => chatQueueCard(id, chat)).join('');
    }
  }

  // Tickets
  const ticketList = document.getElementById('queue-tickets-list');
  if (ticketList) {
    if (!myTickets.length) {
      ticketList.innerHTML = `<div class="ws-empty"><div class="ws-empty-icon">🎫</div>
        <div class="ws-empty-title">No assigned tickets</div>
        <div class="ws-empty-desc">Tickets assigned to you will appear here.</div></div>`;
    } else {
      ticketList.innerHTML = myTickets
        .sort((a,b) => (b[1].updatedAt||b[1].createdAt||0) - (a[1].updatedAt||a[1].createdAt||0))
        .map(([id, ticket]) => ticketQueueCard(id, ticket)).join('');
    }
  }
}

function chatQueueCard(id, chat) {
  const msgs    = Object.values(chat.messages||{}).sort((a,b)=>(a.timestamp||0)-(b.timestamp||0));
  const last    = msgs[msgs.length-1];
  const preview = last ? escHtml((last.text||'').slice(0,80)) : '<em>No messages</em>';
  const STATUS_LABELS = { ai:'🤖 AI Handling', waiting_for_agent:'⏳ Waiting', assigned:'👤 Assigned', resolved:'✅ Resolved', closed:'🔒 Closed', open:'💬 Open' };
  const STATUS_BADGE  = { waiting_for_agent:'badge-warning', assigned:'badge-primary', resolved:'badge-success', closed:'badge-muted', open:'badge-success', ai:'badge-info' };
  const status = chat.status || 'open';
  const canAct = ['owner','admin','agent'].includes(userRole);

  return `
    <div class="queue-card">
      <div class="queue-card-header">
        <div style="display:flex;align-items:center;gap:10px">
          <span class="queue-card-type">💬 Chat</span>
          <span class="badge ${STATUS_BADGE[status]||'badge-muted'}">${STATUS_LABELS[status]||status}</span>
          ${chat.priority ? `<span class="badge priority-${escHtml(chat.priority)}">${escHtml(chat.priority)}</span>` : ''}
        </div>
        <span style="font-size:.75rem;color:var(--text-muted)">${timeAgo(chat.updatedAt||chat.createdAt)}</span>
      </div>
      <div class="queue-card-title">${escHtml(chat.customerName||'Unknown Visitor')}</div>
      <div class="queue-card-meta">${escHtml(chat.customerEmail||chat.visitorId||'')}</div>
      <div style="font-size:.82rem;color:var(--text-secondary);margin-top:5px;line-height:1.5">${preview}</div>
      <div class="queue-card-actions">
        <a href="inbox.html" class="btn btn-primary btn-sm">Open in Inbox</a>
        ${canAct ? `<button class="btn btn-ghost btn-sm" onclick="openAssignModal('chat','${escHtml(id)}','${escHtml(chat.customerName||'Visitor')}')">🔄 Reassign</button>` : ''}
        ${status !== 'resolved' ? `<button class="btn btn-success btn-sm" onclick="resolveChat('${escHtml(id)}')">✅ Resolve</button>` : ''}
      </div>
    </div>`;
}

function ticketQueueCard(id, ticket) {
  const STATUS_LABELS = { open:'Open', pending:'Pending', waiting:'Waiting', resolved:'Resolved', closed:'Closed' };
  const STATUS_BADGE  = { open:'badge-info', pending:'badge-warning', waiting:'badge-muted', resolved:'badge-success', closed:'badge-muted' };
  const status = ticket.status || 'open';
  const canAct = ['owner','admin','agent'].includes(userRole);

  return `
    <div class="queue-card">
      <div class="queue-card-header">
        <div style="display:flex;align-items:center;gap:10px">
          <span class="queue-card-type">🎫 Ticket</span>
          <span class="badge ${STATUS_BADGE[status]||'badge-muted'}">${STATUS_LABELS[status]||status}</span>
          ${ticket.priority ? `<span class="badge priority-${escHtml(ticket.priority)}">${escHtml(ticket.priority)}</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <code style="font-size:.72rem;background:var(--glass-active);padding:2px 7px;border-radius:4px;color:var(--primary)">${escHtml(ticket.ticketId||id)}</code>
          <span style="font-size:.75rem;color:var(--text-muted)">${timeAgo(ticket.updatedAt||ticket.createdAt)}</span>
        </div>
      </div>
      <div class="queue-card-title">${escHtml(ticket.subject||'No subject')}</div>
      <div class="queue-card-meta">${escHtml(ticket.customerName||'—')} · ${escHtml(ticket.customerEmail||'—')}</div>
      ${ticket.description ? `<div style="font-size:.82rem;color:var(--text-secondary);margin-top:5px;line-height:1.5">${escHtml(ticket.description.slice(0,100))}${ticket.description.length>100?'…':''}</div>` : ''}
      <div class="queue-card-actions">
        <a href="tickets.html" class="btn btn-primary btn-sm">Open in Tickets</a>
        ${canAct ? `<button class="btn btn-ghost btn-sm" onclick="openAssignModal('ticket','${escHtml(id)}','${escHtml(ticket.subject||ticket.ticketId||id)}')">🔄 Reassign</button>` : ''}
        ${status === 'open' || status === 'pending' ? `<button class="btn btn-success btn-sm" onclick="resolveTicket('${escHtml(id)}')">✅ Resolve</button>` : ''}
      </div>
    </div>`;
}

window.resolveChat = async function(chatId) {
  if (!confirm('Mark this conversation as resolved?')) return;
  try {
    await db.ref(`businesses/${workspaceUid}/chats/${chatId}`).update({
      status: 'resolved',
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
    await logActivity(workspaceUid, `${userRec?.name||'Agent'} resolved a conversation`, { type:'resolved', chatId });
    toast('Conversation resolved.', 'success');
  } catch { toast('Failed to resolve.', 'error'); }
};

window.resolveTicket = async function(ticketId) {
  if (!confirm('Mark this ticket as resolved?')) return;
  try {
    await db.ref(`businesses/${workspaceUid}/tickets/${ticketId}`).update({
      status: 'resolved',
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
    await logActivity(workspaceUid, `${userRec?.name||'Agent'} resolved ticket ${ticketId}`, { type:'ticket_resolved', ticketId });
    toast('Ticket resolved.', 'success');
  } catch { toast('Failed to resolve.', 'error'); }
};

/* ══════════════════════════════════════════════════════════════
   TEAM BOARD
   ══════════════════════════════════════════════════════════════ */
function renderTeamBoard() {
  const grid = document.getElementById('agent-board-grid');
  if (!grid) return;

  const agents = Object.entries(teamMembers);
  if (!agents.length) {
    grid.innerHTML = `<div class="ws-empty" style="grid-column:1/-1">
      <div class="ws-empty-icon">👥</div>
      <div class="ws-empty-title">No team members yet</div>
      <div class="ws-empty-desc">Invite teammates from the Team page.</div></div>`;
    renderUnassigned();
    return;
  }

  const canAssign = ['owner','admin'].includes(userRole);

  // Build workload counts per agent
  const chatCounts   = {};
  const ticketCounts = {};
  Object.values(allChats).forEach(c => {
    if (c.assignedTo && !['resolved','closed'].includes(c.status)) {
      chatCounts[c.assignedTo] = (chatCounts[c.assignedTo]||0) + 1;
    }
  });
  Object.values(allTickets).forEach(t => {
    if (t.assignedAgent && !['resolved','closed'].includes(t.status)) {
      ticketCounts[t.assignedAgent] = (ticketCounts[t.assignedAgent]||0) + 1;
    }
  });

  // Open (unassigned) chats for the assign dropdown
  const openChatOpts = Object.entries(allChats)
    .filter(([,c]) => !c.assignedTo && !['resolved','closed'].includes(c.status))
    .map(([id,c]) => `<option value="chat:${escHtml(id)}">[Chat] ${escHtml(c.customerName||'Visitor '+id.slice(-4))}</option>`)
    .join('');
  const openTicketOpts = Object.entries(allTickets)
    .filter(([,t]) => !t.assignedAgent && !['resolved','closed'].includes(t.status))
    .map(([id,t]) => `<option value="ticket:${escHtml(id)}">[Ticket] ${escHtml(t.subject||t.ticketId||id)}</option>`)
    .join('');
  const hasUnassigned = openChatOpts || openTicketOpts;

  grid.innerHTML = agents.map(([uid, m]) => {
    const isMe    = uid === currentUser.uid;
    const role    = m.role || 'agent';
    const ROLE_COLORS = { owner:'badge-danger', admin:'badge-warning', agent:'badge-info', viewer:'badge-muted' };
    const ROLE_LABELS = { owner:'Owner', admin:'Admin', agent:'Agent', viewer:'Viewer' };
    const statusColor = m.status==='online'?'#10b981': m.status==='away'?'#f59e0b':'#6b7280';
    const chats   = chatCounts[uid]   || 0;
    const tickets = ticketCounts[uid] || 0;

    return `
      <div class="agent-board-card">
        <div class="agent-board-card-header">
          <div class="agent-board-avatar">
            ${m.photoUrl
              ? `<img src="${escHtml(m.photoUrl)}" alt="">`
              : escHtml((m.name||m.email||'?')[0].toUpperCase())}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:.9rem;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              ${escHtml(m.name||'Unknown')} ${isMe?'<span style="font-size:.65rem;color:var(--text-muted)">(you)</span>':''}
            </div>
            <div style="font-size:.75rem;color:var(--text-muted);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(m.email||'')}</div>
            <div style="display:flex;align-items:center;gap:6px;margin-top:5px">
              <span class="badge ${ROLE_COLORS[role]||'badge-muted'}" style="font-size:.65rem">${ROLE_LABELS[role]||role}</span>
              <div style="display:flex;align-items:center;gap:4px;font-size:.72rem;color:var(--text-muted)">
                <span style="width:7px;height:7px;border-radius:50%;background:${statusColor};display:inline-block"></span>
                ${escHtml(m.suspended?'Suspended':m.status||'offline')}
              </div>
            </div>
          </div>
        </div>

        <div class="agent-board-stats">
          <div class="agent-stat">
            <div class="agent-stat-val">${chats}</div>
            <div class="agent-stat-lbl">Chats</div>
          </div>
          <div class="agent-stat">
            <div class="agent-stat-val">${tickets}</div>
            <div class="agent-stat-lbl">Tickets</div>
          </div>
          <div class="agent-stat">
            <div class="agent-stat-val" style="color:${m.status==='online'?'var(--success)':'var(--text-muted)'}">
              ${m.status==='online'?'●':'○'}
            </div>
            <div class="agent-stat-lbl">Status</div>
          </div>
        </div>

        ${canAssign && hasUnassigned ? `
        <div class="agent-board-assign">
          <select id="board-assign-sel-${escHtml(uid)}" title="Select item to assign">
            <option value="">Assign item to ${escHtml(m.name||'agent')}…</option>
            ${openChatOpts}
            ${openTicketOpts}
          </select>
          <button class="btn btn-primary btn-sm" style="white-space:nowrap" onclick="boardAssign('${escHtml(uid)}')">Assign</button>
        </div>` : ''}
      </div>`;
  }).join('');

  renderUnassigned();
}

window.boardAssign = async function(agentUid) {
  const sel = document.getElementById(`board-assign-sel-${agentUid}`);
  const val = sel?.value;
  if (!val) { toast('Select an item to assign.', 'warning'); return; }

  const [type, itemId] = val.split(':');
  const agentName = teamMembers[agentUid]?.name || 'Agent';
  const myName    = userRec?.name || 'Agent';

  try {
    if (type === 'chat') {
      const chat = allChats[itemId];
      await db.ref(`businesses/${workspaceUid}/chats/${itemId}`).update({
        status:     'assigned',
        assignedTo: agentUid,
        assignedBy: currentUser.uid,
        assignedAt: firebase.database.ServerValue.TIMESTAMP,
        updatedAt:  firebase.database.ServerValue.TIMESTAMP
      });
      await db.ref(`businesses/${workspaceUid}/chats/${itemId}/activityLog`).push({
        action: `Assigned to ${agentName}`, byUid: currentUser.uid, byName: myName,
        type: 'assigned', timestamp: Date.now()
      });
      await logActivity(workspaceUid, `${myName} assigned conversation to ${agentName}`, { type:'assigned', chatId: itemId });
      await pushNotification(workspaceUid, agentUid, 'assignment',
        `${myName} assigned a conversation to you: "${chat?.customerName||'Visitor'}"`, { chatId: itemId });
      toast(`Conversation assigned to ${agentName}.`, 'success');
    } else if (type === 'ticket') {
      const ticket = allTickets[itemId];
      await db.ref(`businesses/${workspaceUid}/tickets/${itemId}`).update({
        assignedAgent: agentUid,
        updatedAt:     firebase.database.ServerValue.TIMESTAMP
      });
      await logActivity(workspaceUid, `${myName} assigned ticket ${ticket?.ticketId||itemId} to ${agentName}`, { type:'ticket_assigned', ticketId: itemId });
      await pushNotification(workspaceUid, agentUid, 'ticket_assignment',
        `${myName} assigned ticket "${ticket?.subject||itemId}" to you`, { ticketId: itemId });
      toast(`Ticket assigned to ${agentName}.`, 'success');
    }
    if (sel) sel.value = '';
  } catch (e) { toast('Assignment failed: ' + e.message, 'error'); }
};

function renderUnassigned() {
  const list = document.getElementById('unassigned-chats-list');
  const countEl = document.getElementById('unassigned-chats-count');
  if (!list) return;

  const unassigned = Object.entries(allChats)
    .filter(([,c]) => !c.assignedTo && !['resolved','closed'].includes(c.status))
    .sort((a,b) => (b[1].updatedAt||b[1].createdAt||0)-(a[1].updatedAt||a[1].createdAt||0));

  if (countEl) countEl.textContent = unassigned.length;

  if (!unassigned.length) {
    list.innerHTML = `<div class="ws-empty" style="padding:32px 24px">
      <div class="ws-empty-icon">✅</div>
      <div class="ws-empty-title">All conversations are assigned</div></div>`;
    return;
  }

  const canAct = ['owner','admin','agent'].includes(userRole);
  list.innerHTML = unassigned.map(([id, chat]) => {
    const msgs    = Object.values(chat.messages||{}).sort((a,b)=>(a.timestamp||0)-(b.timestamp||0));
    const last    = msgs[msgs.length-1];
    const preview = last ? escHtml((last.text||'').slice(0,60)) : 'No messages';
    return `
      <div class="queue-card" style="margin-bottom:8px">
        <div class="queue-card-header">
          <div style="display:flex;align-items:center;gap:8px">
            <span class="queue-card-type">💬 Chat</span>
            <span class="badge badge-warning">⏳ Unassigned</span>
            ${chat.priority ? `<span class="badge priority-${escHtml(chat.priority)}">${escHtml(chat.priority)}</span>` : ''}
          </div>
          <span style="font-size:.75rem;color:var(--text-muted)">${timeAgo(chat.updatedAt||chat.createdAt)}</span>
        </div>
        <div class="queue-card-title">${escHtml(chat.customerName||'Unknown Visitor')}</div>
        <div class="queue-card-meta">${escHtml(chat.customerEmail||chat.visitorId||'')}</div>
        <div style="font-size:.82rem;color:var(--text-secondary);margin-top:5px">${preview}</div>
        <div class="queue-card-actions">
          ${canAct ? `<button class="btn btn-primary btn-sm" onclick="openAssignModal('chat','${escHtml(id)}','${escHtml(chat.customerName||'Visitor')}')">👤 Assign to Agent</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="claimChat('${escHtml(id)}')">Claim Myself</button>
        </div>
      </div>`;
  }).join('');
}

window.claimChat = async function(chatId) {
  const name = userRec?.name || currentUser.email.split('@')[0];
  try {
    await db.ref(`businesses/${workspaceUid}/chats/${chatId}`).update({
      status: 'assigned', assignedTo: currentUser.uid, assignedBy: currentUser.uid,
      assignedAt: firebase.database.ServerValue.TIMESTAMP,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
    await db.ref(`businesses/${workspaceUid}/chats/${chatId}/activityLog`).push({
      action: `Claimed by ${name}`, byUid: currentUser.uid, byName: name,
      type: 'assigned', timestamp: Date.now()
    });
    await logActivity(workspaceUid, `${name} claimed a conversation`, { type:'assigned', chatId });
    toast('Conversation claimed.', 'success');
  } catch { toast('Failed to claim.', 'error'); }
};

/* ══════════════════════════════════════════════════════════════
   ASSIGN MODAL
   ══════════════════════════════════════════════════════════════ */
window.openAssignModal = function(type, itemId, label) {
  assignModalType = type;
  assignModalId   = itemId;
  const titleEl = document.getElementById('assign-modal-title');
  const infoEl  = document.getElementById('assign-modal-item-info');
  if (titleEl) titleEl.textContent = type === 'chat' ? 'Assign Conversation' : 'Assign Ticket';
  if (infoEl)  infoEl.textContent  = `Item: "${label}"`;
  populateAssignModalAgents();
  document.getElementById('assign-modal')?.classList.add('open');
};

function populateAssignModalAgents() {
  const sel = document.getElementById('assign-modal-agent');
  if (!sel) return;
  const agents = Object.entries(teamMembers).filter(([,m]) => ['owner','admin','agent'].includes(m.role));
  sel.innerHTML = `<option value="">— Select agent —</option>` +
    agents.map(([id,m]) => `<option value="${escHtml(id)}">${escHtml(m.name||m.email)} (${m.role})</option>`).join('');
}

function bindAssignModal() {
  document.getElementById('close-assign-modal')?.addEventListener('click', closeAssignModal);
  document.getElementById('cancel-assign-modal')?.addEventListener('click', closeAssignModal);
  document.getElementById('assign-modal')?.addEventListener('click', e => {
    if (e.target.id === 'assign-modal') closeAssignModal();
  });
  document.getElementById('confirm-assign-modal')?.addEventListener('click', confirmAssign);
}

function closeAssignModal() {
  document.getElementById('assign-modal')?.classList.remove('open');
  assignModalType = null;
  assignModalId   = null;
}

async function confirmAssign() {
  const agentUid = document.getElementById('assign-modal-agent')?.value;
  if (!agentUid || !assignModalId || !assignModalType) {
    toast('Select an agent.', 'warning'); return;
  }
  const agentName = teamMembers[agentUid]?.name || 'Agent';
  const myName    = userRec?.name || 'Agent';

  try {
    if (assignModalType === 'chat') {
      const chat = allChats[assignModalId];
      await db.ref(`businesses/${workspaceUid}/chats/${assignModalId}`).update({
        status: 'assigned', assignedTo: agentUid, assignedBy: currentUser.uid,
        assignedAt: firebase.database.ServerValue.TIMESTAMP,
        updatedAt:  firebase.database.ServerValue.TIMESTAMP
      });
      await db.ref(`businesses/${workspaceUid}/chats/${assignModalId}/activityLog`).push({
        action: `Assigned to ${agentName}`, byUid: currentUser.uid, byName: myName,
        type: 'assigned', timestamp: Date.now()
      });
      await pushNotification(workspaceUid, agentUid, 'assignment',
        `${myName} assigned a conversation to you: "${chat?.customerName||'Visitor'}"`,
        { chatId: assignModalId });
      await logActivity(workspaceUid, `${myName} assigned conversation to ${agentName}`, { type:'assigned', chatId: assignModalId });
      toast(`Assigned to ${agentName}.`, 'success');
    } else if (assignModalType === 'ticket') {
      const ticket = allTickets[assignModalId];
      await db.ref(`businesses/${workspaceUid}/tickets/${assignModalId}`).update({
        assignedAgent: agentUid,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      });
      await pushNotification(workspaceUid, agentUid, 'ticket_assignment',
        `${myName} assigned ticket "${ticket?.subject||assignModalId}" to you`,
        { ticketId: assignModalId });
      await logActivity(workspaceUid, `${myName} assigned ticket to ${agentName}`, { type:'ticket_assigned', ticketId: assignModalId });
      toast(`Ticket assigned to ${agentName}.`, 'success');
    }
    closeAssignModal();
  } catch (e) { toast('Assignment failed: ' + e.message, 'error'); }
}

/* ══════════════════════════════════════════════════════════════
   TEAM FEED
   ══════════════════════════════════════════════════════════════ */
function renderTeamFeed() {
  const list = document.getElementById('team-feed-list');
  if (!list) return;

  const posts = Object.entries(teamFeed)
    .sort((a,b) => (b[1].createdAt||0) - (a[1].createdAt||0));

  // New-post badge
  const feedBadge = document.getElementById('feed-badge');
  if (feedBadge) {
    const unread = posts.filter(([,p]) => !p.readBy?.[currentUser.uid] && p.authorUid !== currentUser.uid).length;
    if (unread > 0) { feedBadge.textContent = unread; feedBadge.style.display = 'inline-flex'; }
    else feedBadge.style.display = 'none';
  }

  if (!posts.length) {
    list.innerHTML = `<div class="ws-empty">
      <div class="ws-empty-icon">📢</div>
      <div class="ws-empty-title">No posts yet</div>
      <div class="ws-empty-desc">Be the first to post an update for your team.</div></div>`;
    return;
  }

  list.innerHTML = posts.map(([postId, post]) => {
    const replies = Object.entries(post.replies||{}).sort((a,b)=>(a[1].createdAt||0)-(b[1].createdAt||0));
    const isOwn   = post.authorUid === currentUser.uid;
    const canDel  = isOwn || ['owner','admin'].includes(userRole);

    return `
      <div class="feed-post-card animate-fadeUp" id="fp-${escHtml(postId)}">
        <div class="feed-post-header">
          <div class="feed-post-avatar">${escHtml((post.authorName||'?')[0].toUpperCase())}</div>
          <div>
            <div class="feed-post-name">${escHtml(post.authorName||'Team Member')}</div>
            <div class="feed-post-time">${timeAgo(post.createdAt)}</div>
          </div>
        </div>
        <div class="feed-post-body">${escHtml(post.text||'')}</div>
        <div class="feed-post-actions">
          <button class="btn btn-ghost btn-sm" onclick="toggleFeedReply('${escHtml(postId)}')">
            💬 Reply${replies.length ? ` (${replies.length})` : ''}
          </button>
          ${canDel ? `<button class="btn btn-ghost btn-sm" style="color:var(--danger);font-size:.75rem" onclick="deleteFeedPost('${escHtml(postId)}')">Delete</button>` : ''}
        </div>

        <!-- Reply section -->
        <div class="feed-reply-area" id="fra-${escHtml(postId)}">
          <div class="feed-reply-list" id="frl-${escHtml(postId)}">
            ${replies.map(([,r]) => `
              <div class="feed-reply-item">
                <div class="feed-reply-author">${escHtml(r.authorName||'Agent')} · <span style="font-weight:400;color:var(--text-muted)">${timeAgo(r.createdAt)}</span></div>
                <div>${escHtml(r.text||'')}</div>
              </div>`).join('')}
          </div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <input type="text" id="fri-${escHtml(postId)}"
                   placeholder="Write a reply…"
                   style="flex:1;padding:8px 12px;background:var(--input-bg);border:1px solid var(--border);
                          border-radius:var(--radius-sm);color:var(--text-primary);font-size:.84rem;
                          font-family:inherit;outline:none;transition:border-color .15s"
                   onkeydown="if(event.key==='Enter')submitFeedReply('${escHtml(postId)}')">
            <button class="btn btn-primary btn-sm" onclick="submitFeedReply('${escHtml(postId)}')">Send</button>
          </div>
        </div>
      </div>`;
  }).join('');

  // Mark posts as read (non-blocking)
  _markFeedRead(posts);
}

async function _markFeedRead(posts) {
  try {
    const updates = {};
    posts.forEach(([postId, post]) => {
      if (!post.readBy?.[currentUser.uid] && post.authorUid !== currentUser.uid) {
        updates[`businesses/${workspaceUid}/workspace/teamFeed/${postId}/readBy/${currentUser.uid}`] = true;
      }
    });
    if (Object.keys(updates).length) await db.ref().update(updates);
  } catch { /* non-fatal */ }
}

function bindFeedCompose() {
  document.getElementById('feed-post-btn')?.addEventListener('click', submitFeedPost);
  document.getElementById('feed-compose-text')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.ctrlKey) submitFeedPost();
  });
}

async function submitFeedPost() {
  const ta   = document.getElementById('feed-compose-text');
  const text = ta?.value.trim();
  if (!text) { toast('Write something first.', 'warning'); return; }
  const btn = document.getElementById('feed-post-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Posting…'; }
  try {
    await db.ref(`businesses/${workspaceUid}/workspace/teamFeed`).push({
      text,
      authorUid:  currentUser.uid,
      authorName: userRec?.name || currentUser.email.split('@')[0],
      createdAt:  firebase.database.ServerValue.TIMESTAMP,
      readBy:     { [currentUser.uid]: true },
      replies:    {}
    });
    if (ta) ta.value = '';
    toast('Posted to team feed.', 'success');
  } catch { toast('Failed to post.', 'error'); }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = '<svg style="width:14px;height:14px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Post to Team'; } }
}

window.toggleFeedReply = function(postId) {
  const area = document.getElementById(`fra-${postId}`);
  if (area) area.classList.toggle('open');
};

window.submitFeedReply = async function(postId) {
  const input = document.getElementById(`fri-${postId}`);
  const text  = input?.value.trim();
  if (!text) return;
  input.value = '';
  try {
    await db.ref(`businesses/${workspaceUid}/workspace/teamFeed/${postId}/replies`).push({
      text,
      authorUid:  currentUser.uid,
      authorName: userRec?.name || currentUser.email.split('@')[0],
      createdAt:  firebase.database.ServerValue.TIMESTAMP
    });
  } catch { toast('Failed to send reply.', 'error'); }
};

window.deleteFeedPost = async function(postId) {
  if (!confirm('Delete this post?')) return;
  try {
    await db.ref(`businesses/${workspaceUid}/workspace/teamFeed/${postId}`).remove();
    toast('Post deleted.', 'info');
  } catch { toast('Failed to delete.', 'error'); }
};

/* ══════════════════════════════════════════════════════════════
   TAB SWITCHING
   ══════════════════════════════════════════════════════════════ */
function bindTabs() {
  document.querySelectorAll('.ws-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.ws-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.ws-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panel = document.getElementById('panel-' + tab.dataset.tab);
      if (panel) panel.classList.add('active');
    });
  });
}

/* ── Utility ────────────────────────────────────────────────── */
function _set(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
