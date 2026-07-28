/**
 * chats.js — ES6 Module
 * Full Workspace-Aware Conversation System.
 * Supports: assignment, handoff states, internal notes, transfer, ticket creation,
 * activity log, real-time updates.
 */

import {
  requireAuth, setupSidebar, toast, formatDate, timeAgo, escHtml,
  getWorkspaceUid, getCurrentUserRole, getUserRecord, logActivity, pushNotification
} from './app.js';

/* ── Constants ─────────────────────────────────────────────── */
const STATUS_CFG = {
  ai:               { label: 'AI Handling',      badge: 'badge-info',    icon: '🤖' },
  waiting_for_agent:{ label: 'Waiting for Agent', badge: 'badge-warning', icon: '⏳' },
  assigned:         { label: 'Assigned',          badge: 'badge-primary', icon: '👤' },
  resolved:         { label: 'Resolved',          badge: 'badge-success', icon: '✅' },
  closed:           { label: 'Closed',            badge: 'badge-muted',   icon: '🔒' },
  open:             { label: 'Open',              badge: 'badge-success', icon: '💬' }
};
const PRIORITY_CFG = {
  low:    { label: 'Low',    badge: 'priority-low'    },
  medium: { label: 'Medium', badge: 'priority-medium' },
  high:   { label: 'High',   badge: 'priority-high'   },
  urgent: { label: 'Urgent', badge: 'priority-urgent' }
};

/* ── State ─────────────────────────────────────────────────── */
let currentUser    = null;
let workspaceUid   = null;
let userRole       = null;
let userRec        = null;
let allChats       = [];
let selectedChatId = null;
let teamMembers    = {};
let filterStatus   = 'all';
let searchQuery    = '';
let notesMode      = false;

/* ── Init ──────────────────────────────────────────────────── */
requireAuth(async (user, wid) => {
  currentUser  = user;
  workspaceUid = wid;
  userRole     = await getCurrentUserRole();
  userRec      = await getUserRecord();
  setupSidebar(user);
  loadTeamMembers();
  loadChats();
  bindEvents();
  bindFilterTabs();
});

/* ── Load team members ─────────────────────────────────────── */
function loadTeamMembers() {
  firebase.database()
    .ref(`businesses/${workspaceUid}/team/members`)
    .on('value', snap => {
      teamMembers = snap.val() || {};
    });
}

/* ── Load chats (real-time) ────────────────────────────────── */
function loadChats() {
  const chatList  = document.getElementById('chat-list');
  const chatCount = document.getElementById('chat-count');

  firebase.database()
    .ref(`businesses/${workspaceUid}/chats`)
    .on('value', snap => {
      const raw = snap.val() || {};
      allChats = Object.entries(raw)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

      if (chatCount) chatCount.textContent = allChats.length;
      renderChatList();
      if (selectedChatId) renderChatDetail(selectedChatId);
    });
}

/* ── Filter helpers ────────────────────────────────────────── */
function getFilteredChats() {
  let chats = [...allChats];

  // Status filter
  if (filterStatus === 'mine') {
    chats = chats.filter(c => c.assignedTo === currentUser.uid);
  } else if (filterStatus === 'waiting') {
    chats = chats.filter(c => c.status === 'waiting_for_agent');
  } else if (filterStatus !== 'all') {
    chats = chats.filter(c => c.status === filterStatus);
  }

  // Search
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    chats = chats.filter(c => {
      const msgs = Object.values(c.messages || {});
      return (c.customerName || '').toLowerCase().includes(q) ||
             (c.customerEmail || '').toLowerCase().includes(q) ||
             msgs.some(m => (m.text || '').toLowerCase().includes(q));
    });
  }

  return chats;
}

/* ── Render chat list ──────────────────────────────────────── */
function renderChatList() {
  const chatList = document.getElementById('chat-list');
  if (!chatList) return;

  const filtered = getFilteredChats();

  if (!filtered.length) {
    chatList.innerHTML = `
      <div class="empty-state" style="padding:48px 24px;text-align:center">
        <div style="font-size:2.5rem;margin-bottom:12px">💬</div>
        <div style="font-weight:600;margin-bottom:6px">${searchQuery ? 'No matching conversations' : 'No conversations here'}</div>
        <div style="font-size:.8rem;color:var(--text-muted)">
          ${searchQuery ? 'Try a different search term.' : 'Conversations will appear when visitors chat.'}
        </div>
      </div>`;
    return;
  }

  chatList.innerHTML = filtered.map(chat => {
    const msgs     = Object.values(chat.messages || {}).sort((a,b) => (a.timestamp||0)-(b.timestamp||0));
    const lastMsg  = msgs[msgs.length - 1];
    const preview  = lastMsg ? (lastMsg.text || '').slice(0, 65) : 'No messages';
    const status   = chat.status || 'open';
    const sc       = STATUS_CFG[status] || STATUS_CFG.open;
    const isSelected = chat.id === selectedChatId;
    const assignee   = chat.assignedTo ? (teamMembers[chat.assignedTo]?.name || 'Agent') : null;
    const unread     = !isSelected && lastMsg?.role !== 'agent';

    return `
      <div class="chat-list-item ${isSelected ? 'selected' : ''}" data-chat-id="${chat.id}"
           style="padding:14px 16px;border-bottom:1px solid var(--glass-border);cursor:pointer;
                  transition:background .15s;background:${isSelected ? 'rgba(201,162,39,.08)' : 'transparent'}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;gap:8px">
          <div style="display:flex;align-items:center;gap:6px;min-width:0">
            <div style="width:28px;height:28px;border-radius:50%;background:var(--glass-active);
                        display:flex;align-items:center;justify-content:center;font-size:.75rem;
                        font-weight:700;color:var(--primary);flex-shrink:0">
              ${escHtml((chat.customerName || 'V')[0].toUpperCase())}
            </div>
            <span style="font-size:.85rem;font-weight:${unread ? '700' : '600'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              ${escHtml(chat.customerName || 'Visitor ' + (chat.visitorId||'').slice(-4))}
            </span>
          </div>
          <span style="font-size:.7rem;color:var(--text-muted);flex-shrink:0">
            ${timeAgo(chat.updatedAt || chat.createdAt)}
          </span>
        </div>
        <div style="font-size:.78rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:6px;padding-left:34px">
          ${escHtml(preview)}
        </div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;padding-left:34px">
          <span class="badge ${sc.badge}" style="font-size:.65rem">${sc.icon} ${sc.label}</span>
          ${chat.priority ? `<span class="badge ${PRIORITY_CFG[chat.priority]?.badge || ''}" style="font-size:.65rem">${escHtml(chat.priority)}</span>` : ''}
          ${assignee ? `<span class="badge badge-muted" style="font-size:.65rem">→ ${escHtml(assignee)}</span>` : ''}
        </div>
      </div>`;
  }).join('');

  chatList.querySelectorAll('[data-chat-id]').forEach(el => {
    el.addEventListener('click', () => {
      selectedChatId = el.dataset.chatId;
      renderChatList();
      renderChatDetail(selectedChatId);
    });
  });
}

/* ── Render chat detail ────────────────────────────────────── */
function renderChatDetail(chatId) {
  const detail = document.getElementById('chat-detail');
  if (!detail) return;

  const chat = allChats.find(c => c.id === chatId);
  if (!chat) {
    detail.innerHTML = emptyDetailHtml();
    return;
  }

  const msgs      = Object.entries(chat.messages || {}).sort((a,b) => (a[1].timestamp||0)-(b[1].timestamp||0));
  const notes     = Object.entries(chat.internalNotes || {}).sort((a,b) => (a[1].createdAt||0)-(b[1].createdAt||0));
  const status    = chat.status || 'open';
  const sc        = STATUS_CFG[status] || STATUS_CFG.open;
  const assignee  = chat.assignedTo ? (teamMembers[chat.assignedTo] || null) : null;
  const isAssignedToMe   = chat.assignedTo === currentUser.uid;
  // ── Granular role permissions ───────────────────────────────
  // canAssignOthers: only owner/admin can assign conversations to specific agents
  const canAssignOthers  = ['owner','admin'].includes(userRole);
  // canReply: owner/admin always; agent only if THIS chat is assigned to them
  const canReply         = ['owner','admin'].includes(userRole) ||
                           (userRole === 'agent' && isAssignedToMe);
  // canAct: owner/admin or agent assigned to this chat (resolve, close, etc.)
  const canAct           = ['owner','admin'].includes(userRole) ||
                           (userRole === 'agent' && isAssignedToMe);
  // canClaimSelf: agents can claim unassigned chats for themselves
  const canClaimSelf     = userRole === 'agent' && !chat.assignedTo;
  // canRequestAssign: agents/viewers not assigned to this chat can request it
  const canRequestAssign = (userRole === 'agent' || userRole === 'viewer') &&
                           !isAssignedToMe &&
                           chat.status !== 'resolved' && chat.status !== 'closed';
  const isViewer         = userRole === 'viewer';

  const agentOptions = Object.entries(teamMembers)
    .filter(([,m]) => ['owner','admin','agent'].includes(m.role))
    .map(([id, m]) => `<option value="${id}" ${chat.assignedTo===id?'selected':''}>${escHtml(m.name||m.email)}</option>`)
    .join('');

  detail.innerHTML = `
    <!-- ── Header ── -->
    <div style="padding:16px 20px;border-bottom:1px solid var(--border);background:var(--surface)">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:40px;height:40px;border-radius:50%;background:var(--glass-active);
                      display:flex;align-items:center;justify-content:center;font-size:1rem;
                      font-weight:700;color:var(--primary)">
            ${escHtml((chat.customerName || 'V')[0].toUpperCase())}
          </div>
          <div>
            <div style="font-weight:700;font-size:.95rem">${escHtml(chat.customerName || 'Unknown Visitor')}</div>
            <div style="font-size:.78rem;color:var(--text-muted)">${escHtml(chat.customerEmail || chat.visitorId || '—')}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="badge ${sc.badge}">${sc.icon} ${sc.label}</span>
          ${chat.priority ? `<span class="badge ${PRIORITY_CFG[chat.priority]?.badge||''}" style="font-size:.72rem">${escHtml(chat.priority)}</span>` : ''}
          <button class="btn btn-ghost btn-sm" id="chat-detail-close" title="Close panel">✕</button>
        </div>
      </div>
    </div>

    <!-- ── Main body: messages + sidebar ── -->
    <div style="display:flex;flex:1;overflow:hidden;min-height:0">

      <!-- Messages column -->
      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden">
        <!-- Tabs -->
        <div style="display:flex;gap:0;border-bottom:1px solid var(--border);background:var(--surface-raised)">
          <button class="chat-tab ${!notesMode?'active':''}" data-tab="messages"
                  style="padding:10px 16px;font-size:.83rem;font-weight:600;border:none;background:transparent;
                         cursor:pointer;border-bottom:2px solid ${!notesMode?'var(--primary)':'transparent'};
                         color:${!notesMode?'var(--primary)':'var(--text-muted)'}">
            Messages
          </button>
          <button class="chat-tab ${notesMode?'active':''}" data-tab="notes"
                  style="padding:10px 16px;font-size:.83rem;font-weight:600;border:none;background:transparent;
                         cursor:pointer;border-bottom:2px solid ${notesMode?'var(--primary)':'transparent'};
                         color:${notesMode?'var(--primary)':'var(--text-muted)'}">
            Internal Notes (${notes.length})
          </button>
        </div>

        <!-- Messages area -->
        <div id="messages-area" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;${notesMode?'display:none':''}" ${notesMode?'hidden':''}>
          ${msgs.map(([msgId, msg]) => renderMessage(msg)).join('')}
          ${!msgs.length ? `<div style="text-align:center;color:var(--text-muted);font-size:.85rem;margin-top:32px">No messages yet</div>` : ''}
        </div>

        <!-- Notes area -->
        <div id="notes-area" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;${!notesMode?'display:none':''}" ${!notesMode?'hidden':''}>
          <div style="background:rgba(201,162,39,.06);border:1px solid rgba(201,162,39,.2);border-radius:8px;padding:10px 14px;margin-bottom:8px;font-size:.8rem;color:var(--text-secondary)">
            🔒 Internal notes are only visible to your team. Customers cannot see them.
          </div>
          ${notes.map(([,note]) => renderNote(note)).join('')}
          ${!notes.length ? `<div style="text-align:center;color:var(--text-muted);font-size:.85rem;margin-top:24px">No internal notes yet</div>` : ''}
        </div>

        <!-- Reply / Note input -->
        ${canReply ? `
        <div style="padding:14px 16px;border-top:1px solid var(--border);background:var(--surface)">
          <div style="display:flex;gap:10px;align-items:flex-end">
            <textarea id="reply-input" placeholder="${notesMode ? 'Write an internal note…' : 'Type a reply…'}"
                      style="flex:1;resize:none;min-height:60px;max-height:140px;padding:10px 12px;
                             background:var(--input-bg);border:1px solid var(--border);border-radius:8px;
                             color:var(--text-primary);font-size:.875rem;font-family:inherit;outline:none;
                             transition:border-color .15s"
                      rows="2"></textarea>
            <button id="send-reply-btn" class="btn btn-primary btn-sm"
                    style="padding:10px 16px;white-space:nowrap">
              ${notesMode ? '📝 Note' : '↩ Send'}
            </button>
          </div>
        </div>` : canRequestAssign ? `
        <div style="padding:14px 16px;border-top:1px solid var(--border);background:var(--surface)">
          <div style="background:rgba(99,102,241,.06);border:1px solid rgba(99,102,241,.2);border-radius:8px;
                      padding:12px 14px;text-align:center">
            <div style="font-size:.8rem;color:var(--text-secondary);margin-bottom:8px">
              ${isViewer ? '👁 You have read-only access to this conversation.' : '⚠️ This conversation is not assigned to you.'}
            </div>
            <button id="request-assign-btn" class="btn btn-ghost btn-sm">
              🙋 Request Assignment
            </button>
          </div>
        </div>` : `
        <div style="padding:12px 16px;border-top:1px solid var(--border);background:var(--surface)">
          <div style="font-size:.78rem;color:var(--text-muted);text-align:center">
            👁 Read-only — this conversation is resolved or closed.
          </div>
        </div>`}
      </div>

      <!-- Sidebar info -->
      <div style="width:240px;flex-shrink:0;border-left:1px solid var(--border);overflow-y:auto;background:var(--surface-raised)">
        <!-- Customer info -->
        <div style="padding:14px 16px;border-bottom:1px solid var(--border)">
          <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:10px">Customer</div>
          <div style="font-size:.85rem;font-weight:600;margin-bottom:3px">${escHtml(chat.customerName || 'Unknown')}</div>
          <div style="font-size:.78rem;color:var(--text-muted)">${escHtml(chat.customerEmail || '—')}</div>
          <div style="font-size:.75rem;color:var(--text-muted);margin-top:4px">
            Visitor: ${escHtml((chat.visitorId||'').slice(-8))}
          </div>
          <div style="font-size:.75rem;color:var(--text-muted);margin-top:2px">
            Started: ${timeAgo(chat.createdAt)}
          </div>
        </div>

        <!-- Assignment -->
        ${canAssignOthers ? `
        <div style="padding:14px 16px;border-bottom:1px solid var(--border)">
          <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:8px">Assigned To</div>
          <select id="assign-agent-select" class="form-input form-select" style="font-size:.82rem;padding:7px 10px">
            <option value="">— Unassigned —</option>
            ${agentOptions}
          </select>
          <button id="assign-btn" class="btn btn-ghost btn-sm btn-block" style="margin-top:6px;font-size:.78rem">
            Assign
          </button>
        </div>` : `
        <div style="padding:14px 16px;border-bottom:1px solid var(--border)">
          <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:8px">Assigned To</div>
          ${assignee
            ? `<div style="font-size:.85rem;font-weight:600">${escHtml(assignee.name||assignee.email)}</div>
               ${isAssignedToMe ? '<div style="font-size:.72rem;color:#10b981;margin-top:3px">✓ Assigned to you</div>' : ''}`
            : `<div style="font-size:.82rem;color:var(--text-muted)">Unassigned</div>`}
        </div>`}

        <!-- Priority -->
        ${canAct ? `
        <div style="padding:14px 16px;border-bottom:1px solid var(--border)">
          <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:8px">Priority</div>
          <select id="priority-select" class="form-input form-select" style="font-size:.82rem;padding:7px 10px">
            <option value="">— None —</option>
            ${['low','medium','high','urgent'].map(p => `<option value="${p}" ${chat.priority===p?'selected':''}>${p.charAt(0).toUpperCase()+p.slice(1)}</option>`).join('')}
          </select>
          <button id="set-priority-btn" class="btn btn-ghost btn-sm btn-block" style="margin-top:6px;font-size:.78rem">Set Priority</button>
        </div>` : chat.priority ? `
        <div style="padding:14px 16px;border-bottom:1px solid var(--border)">
          <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:6px">Priority</div>
          <span class="badge ${PRIORITY_CFG[chat.priority]?.badge||''}" style="font-size:.75rem">${escHtml(chat.priority)}</span>
        </div>` : ''}

        <!-- Actions -->
        <div style="padding:14px 16px;border-bottom:1px solid var(--border)">
          <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:8px">Actions</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${canAct && status !== 'resolved' ? `<button class="btn btn-success btn-sm" data-action="resolve">✅ Resolve</button>` : ''}
            ${canAct && status !== 'closed'   ? `<button class="btn btn-ghost btn-sm"   data-action="close">🔒 Close</button>`   : ''}
            ${canClaimSelf && status !== 'assigned' && status !== 'resolved' && status !== 'closed'
              ? `<button class="btn btn-ghost btn-sm" data-action="assign_me">👤 Assign to Me</button>` : ''}
            ${canAssignOthers && status !== 'assigned' && status !== 'resolved' && status !== 'closed'
              ? `<button class="btn btn-ghost btn-sm" data-action="assign_me">👤 Assign to Me</button>` : ''}
            ${canAssignOthers ? `<button class="btn btn-ghost btn-sm" data-action="transfer">🔄 Transfer</button>` : ''}
            ${canAct          ? `<button class="btn btn-ghost btn-sm" data-action="create_ticket">🎫 Create Ticket</button>` : ''}
            ${canAssignOthers ? `<button class="btn btn-danger btn-sm" data-action="delete">🗑 Delete</button>` : ''}
          </div>
        </div>

        <!-- Activity log -->
        <div style="padding:14px 16px">
          <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:8px">Activity</div>
          <div id="chat-activity-log" style="font-size:.75rem;color:var(--text-muted);display:flex;flex-direction:column;gap:5px">
            ${renderActivityLog(chat.activityLog)}
          </div>
        </div>
      </div>
    </div>

    <!-- Transfer modal (hidden) -->
    <div id="transfer-modal" class="modal-overlay" style="display:none">
      <div class="modal" style="max-width:400px">
        <div class="modal-header">
          <div class="modal-title">Transfer Conversation</div>
          <button class="modal-close" id="close-transfer-modal">✕</button>
        </div>
        <div class="form-group" style="padding:0 0 12px">
          <label class="form-label">Transfer to</label>
          <select class="form-input form-select" id="transfer-agent-select">
            <option value="">Select agent…</option>
            ${Object.entries(teamMembers)
              .filter(([id,m]) => id !== currentUser.uid && ['owner','admin','agent'].includes(m.role))
              .map(([id,m]) => `<option value="${id}">${escHtml(m.name||m.email)} (${m.role})</option>`)
              .join('')}
          </select>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="cancel-transfer-btn">Cancel</button>
          <button class="btn btn-primary" id="confirm-transfer-btn">Transfer</button>
        </div>
      </div>
    </div>`;

  // Bind detail events
  bindDetailEvents(chatId, chat);

  // Scroll messages to bottom
  const area = document.getElementById('messages-area');
  if (area) area.scrollTop = area.scrollHeight;
}

function renderMessage(msg) {
  const isAgent   = msg.role === 'agent';
  const isBot     = msg.role === 'bot';
  const isVisitor = !isAgent && !isBot;
  const color     = isAgent ? 'var(--primary)' : isBot ? 'rgba(201,162,39,.1)' : '#f3f4f6';
  const textColor = isAgent ? '#fff' : 'var(--text-primary)';
  const align     = isAgent ? 'flex-end' : 'flex-start';
  const radius    = isAgent ? '14px 14px 3px 14px' : '14px 14px 14px 3px';

  return `
    <div style="display:flex;flex-direction:column;align-items:${align};gap:3px;max-width:80%;${isAgent?'align-self:flex-end':'align-self:flex-start'}">
      ${!isAgent ? `<span style="font-size:.7rem;color:var(--text-muted);margin-bottom:1px">${isBot?'🤖 AI Bot':'👤 Visitor'}</span>` : ''}
      <div style="background:${color};color:${textColor};padding:10px 13px;border-radius:${radius};font-size:.87rem;line-height:1.55;word-break:break-word">
        ${escHtml(msg.text || '')}
      </div>
      <span style="font-size:.68rem;color:var(--text-muted)">${msg.timestamp ? timeAgo(msg.timestamp) : ''}</span>
    </div>`;
}

function renderNote(note) {
  return `
    <div style="background:rgba(201,162,39,.06);border:1px solid rgba(201,162,39,.15);border-radius:10px;padding:12px 14px">
      <div style="font-size:.78rem;font-weight:600;color:var(--primary);margin-bottom:5px">
        📝 ${escHtml(note.agentName || 'Agent')}
        <span style="font-weight:400;color:var(--text-muted);margin-left:6px">${timeAgo(note.createdAt)}</span>
      </div>
      <div style="font-size:.87rem;line-height:1.55;color:var(--text-primary)">${escHtml(note.text||'')}</div>
    </div>`;
}

function renderActivityLog(log) {
  if (!log) return '<span style="color:var(--text-muted)">No activity yet</span>';
  const entries = Object.values(log).sort((a,b) => (b.timestamp||0)-(a.timestamp||0)).slice(0,8);
  return entries.map(e => `
    <div style="padding:4px 0;border-bottom:1px solid var(--border)">
      <span style="color:var(--text-primary)">${escHtml(e.action||'')}</span>
      <br><span style="font-size:.7rem">${timeAgo(e.timestamp)}</span>
    </div>`).join('');
}

function emptyDetailHtml() {
  return `<div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:12px;color:var(--text-muted)">
    <div style="font-size:3rem">💬</div>
    <div style="font-size:1rem;font-weight:600">Select a conversation</div>
    <div style="font-size:.85rem">Choose a conversation from the list to view it here.</div>
  </div>`;
}

/* ── Bind detail-panel events ─────────────────────────────── */
function bindDetailEvents(chatId, chat) {
  const db = firebase.database();

  // Close detail
  document.getElementById('chat-detail-close')?.addEventListener('click', () => {
    selectedChatId = null;
    document.getElementById('chat-detail').innerHTML = emptyDetailHtml();
    renderChatList();
  });

  // Tab switching
  document.querySelectorAll('.chat-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      notesMode = tab.dataset.tab === 'notes';
      renderChatDetail(chatId);
    });
  });

  // Send reply
  const replyInput = document.getElementById('reply-input');
  const sendBtn    = document.getElementById('send-reply-btn');

  const send = async () => {
    const text = replyInput?.value.trim();
    if (!text) return;
    replyInput.value = '';
    try {
      if (notesMode) {
        await db.ref(`businesses/${workspaceUid}/chats/${chatId}/internalNotes`).push({
          agentUid:  currentUser.uid,
          agentName: userRec?.name || currentUser.email.split('@')[0],
          text, createdAt: firebase.database.ServerValue.TIMESTAMP
        });
        await logActivity(workspaceUid, `Note added by ${userRec?.name || 'Agent'}`, { type: 'note_added', chatId });
        toast('Note added.', 'success');
      } else {
        await db.ref(`businesses/${workspaceUid}/chats/${chatId}/messages`).push({
          role: 'agent', text,
          agentUid:  currentUser.uid,
          agentName: userRec?.name || currentUser.email.split('@')[0],
          timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        await db.ref(`businesses/${workspaceUid}/chats/${chatId}`).update({
          status:    chat.status === 'waiting_for_agent' ? 'assigned' : chat.status || 'assigned',
          updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
      }
    } catch {
      toast('Failed to send.', 'error');
    }
  };

  sendBtn?.addEventListener('click', send);
  replyInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });

  // Request Assignment (agent/viewer who is not assigned to this chat)
  document.getElementById('request-assign-btn')?.addEventListener('click', async () => {
    const db = firebase.database();
    const myName = userRec?.name || currentUser.email.split('@')[0];
    try {
      // Notify all owners/admins in the workspace
      const membersSnap = await db.ref(`businesses/${workspaceUid}/team/members`).once('value');
      const members = membersSnap.val() || {};
      const admins  = Object.entries(members).filter(([,m]) => ['owner','admin'].includes(m.role));
      await Promise.all(admins.map(([adminUid]) =>
        db.ref(`businesses/${workspaceUid}/notifications/${adminUid}`).push({
          type:      'assignment_request',
          message:   `${myName} is requesting assignment to a conversation with ${escHtml(chat.customerName || 'a visitor')}.`,
          chatId,
          fromUid:   currentUser.uid,
          fromName:  myName,
          read:      false,
          createdAt: Date.now()
        })
      ));
      await logActivity(workspaceUid, `${myName} requested assignment to a conversation`, { type: 'assignment_request', chatId });
      toast('Assignment request sent to admins.', 'success');
      const btn = document.getElementById('request-assign-btn');
      if (btn) { btn.textContent = '✓ Request Sent'; btn.disabled = true; }
    } catch { toast('Failed to send request.', 'error'); }
  });

  // Assign
  document.getElementById('assign-btn')?.addEventListener('click', async () => {
    const sel = document.getElementById('assign-agent-select');
    const agentUid = sel?.value;
    if (!agentUid) { toast('Select an agent.', 'warning'); return; }
    const agentName = teamMembers[agentUid]?.name || 'Agent';
    try {
      await db.ref(`businesses/${workspaceUid}/chats/${chatId}`).update({
        status:     'assigned',
        assignedTo: agentUid,
        assignedBy: currentUser.uid,
        assignedAt: firebase.database.ServerValue.TIMESTAMP,
        updatedAt:  firebase.database.ServerValue.TIMESTAMP
      });
      // Log activity on the chat
      await db.ref(`businesses/${workspaceUid}/chats/${chatId}/activityLog`).push({
        action:    `Assigned to ${agentName}`,
        byUid:     currentUser.uid,
        byName:    userRec?.name || 'Agent',
        type:      'assigned',
        timestamp: Date.now()
      });
      await logActivity(workspaceUid, `${userRec?.name||'Agent'} assigned conversation to ${agentName}`, { type: 'assigned', chatId });
      await pushNotification(workspaceUid, agentUid, 'assignment',
        `You have been assigned a conversation by ${userRec?.name||'Agent'}`, { chatId });

      // Update agent's assignedChats count
      const snap = await db.ref(`businesses/${workspaceUid}/team/members/${agentUid}/assignedChats`).once('value');
      await db.ref(`businesses/${workspaceUid}/team/members/${agentUid}/assignedChats`).set((snap.val() || 0) + 1);

      toast(`Assigned to ${agentName}.`, 'success');
    } catch { toast('Failed to assign.', 'error'); }
  });

  // Priority
  document.getElementById('set-priority-btn')?.addEventListener('click', async () => {
    const sel = document.getElementById('priority-select');
    const priority = sel?.value;
    await db.ref(`businesses/${workspaceUid}/chats/${chatId}`).update({ priority, updatedAt: firebase.database.ServerValue.TIMESTAMP });
    toast('Priority updated.', 'success');
  });

  // Action buttons
  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => handleChatAction(btn.dataset.action, chatId, chat));
  });

  // Transfer modal
  document.getElementById('close-transfer-modal')?.addEventListener('click', () => {
    const modal = document.getElementById('transfer-modal');
    if (modal) modal.style.display = 'none';
  });
  document.getElementById('cancel-transfer-btn')?.addEventListener('click', () => {
    const modal = document.getElementById('transfer-modal');
    if (modal) modal.style.display = 'none';
  });
  document.getElementById('confirm-transfer-btn')?.addEventListener('click', async () => {
    const sel = document.getElementById('transfer-agent-select');
    const targetUid  = sel?.value;
    if (!targetUid) { toast('Select an agent to transfer to.', 'warning'); return; }
    const targetName = teamMembers[targetUid]?.name || 'Agent';
    try {
      await db.ref(`businesses/${workspaceUid}/chats/${chatId}`).update({
        status:     'assigned',
        assignedTo: targetUid,
        assignedBy: currentUser.uid,
        assignedAt: firebase.database.ServerValue.TIMESTAMP,
        updatedAt:  firebase.database.ServerValue.TIMESTAMP
      });
      await db.ref(`businesses/${workspaceUid}/chats/${chatId}/activityLog`).push({
        action:    `Transferred to ${targetName}`,
        byUid:     currentUser.uid,
        byName:    userRec?.name || 'Agent',
        type:      'transferred',
        timestamp: Date.now()
      });
      await logActivity(workspaceUid, `${userRec?.name||'Agent'} transferred conversation to ${targetName}`, { type: 'transferred', chatId });
      await pushNotification(workspaceUid, targetUid, 'transfer',
        `A conversation was transferred to you by ${userRec?.name||'Agent'}`, { chatId });
      const modal = document.getElementById('transfer-modal');
      if (modal) modal.style.display = 'none';
      toast(`Transferred to ${targetName}.`, 'success');
    } catch { toast('Transfer failed.', 'error'); }
  });
}

async function handleChatAction(action, chatId, chat) {
  const db = firebase.database();
  const ref = db.ref(`businesses/${workspaceUid}/chats/${chatId}`);

  switch (action) {
    case 'resolve':
      await ref.update({ status: 'resolved', updatedAt: firebase.database.ServerValue.TIMESTAMP });
      await db.ref(`businesses/${workspaceUid}/chats/${chatId}/activityLog`).push({
        action: `Resolved by ${userRec?.name||'Agent'}`, byUid: currentUser.uid,
        byName: userRec?.name||'Agent', type: 'resolved', timestamp: Date.now()
      });
      await logActivity(workspaceUid, `${userRec?.name||'Agent'} resolved a conversation`, { type: 'resolved', chatId });
      toast('Conversation resolved.', 'success');
      break;

    case 'close':
      await ref.update({ status: 'closed', updatedAt: firebase.database.ServerValue.TIMESTAMP });
      await db.ref(`businesses/${workspaceUid}/chats/${chatId}/activityLog`).push({
        action: `Closed by ${userRec?.name||'Agent'}`, byUid: currentUser.uid,
        byName: userRec?.name||'Agent', type: 'closed', timestamp: Date.now()
      });
      await logActivity(workspaceUid, `${userRec?.name||'Agent'} closed a conversation`, { type: 'closed', chatId });
      toast('Conversation closed.', 'success');
      break;

    case 'assign_me':
      await ref.update({
        status: 'assigned', assignedTo: currentUser.uid,
        assignedBy: currentUser.uid, assignedAt: firebase.database.ServerValue.TIMESTAMP,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      });
      await db.ref(`businesses/${workspaceUid}/chats/${chatId}/activityLog`).push({
        action: `Assigned to ${userRec?.name||'Agent'} (self)`, byUid: currentUser.uid,
        byName: userRec?.name||'Agent', type: 'assigned', timestamp: Date.now()
      });
      toast('Assigned to yourself.', 'success');
      break;

    case 'transfer': {
      const modal = document.getElementById('transfer-modal');
      if (modal) modal.style.display = 'flex';
      break;
    }

    case 'create_ticket': {
      try {
        const snap = await db.ref(`businesses/${workspaceUid}/ticketCounter`).transaction(n => (n || 0) + 1);
        const num  = snap.snapshot.val();
        const tid  = `DXS-${String(num).padStart(6, '0')}`;
        await db.ref(`businesses/${workspaceUid}/tickets/${tid}`).set({
          ticketId:       tid,
          conversationId: chatId,
          customerName:   chat.customerName || 'Unknown',
          customerEmail:  chat.customerEmail || '',
          subject:        `Conversation from ${chat.customerName || 'Visitor'}`,
          status:         'open',
          priority:       chat.priority || 'medium',
          channel:        'website',
          assignedAgent:  chat.assignedTo || '',
          createdAt:      firebase.database.ServerValue.TIMESTAMP,
          updatedAt:      firebase.database.ServerValue.TIMESTAMP,
          messages:       {},
          notes:          {}
        });
        await logActivity(workspaceUid, `${userRec?.name||'Agent'} created ticket ${tid} from conversation`, { type: 'ticket_created', chatId, ticketId: tid });
        toast(`Ticket ${tid} created.`, 'success');
      } catch { toast('Failed to create ticket.', 'error'); }
      break;
    }

    case 'delete':
      if (!confirm('Delete this conversation? This cannot be undone.')) return;
      try {
        await ref.remove();
        selectedChatId = null;
        document.getElementById('chat-detail').innerHTML = emptyDetailHtml();
        renderChatList();
        toast('Conversation deleted.', 'success');
      } catch { toast('Delete failed.', 'error'); }
      break;
  }
}

/* ── Bind global events ────────────────────────────────────── */
function bindEvents() {
  const chatSearch = document.getElementById('chat-search');
  chatSearch?.addEventListener('input', e => {
    searchQuery = e.target.value;
    renderChatList();
  });
}

function bindFilterTabs() {
  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterStatus = btn.dataset.filter;
      renderChatList();
    });
  });
}
