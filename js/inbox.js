/**
 * inbox.js — ES6 Module
 * Team Inbox: workspace-aware conversation queue with assignment workflow.
 * Mirrors chats.js but with an inbox-focused UX (filters, quick-assign, notifications).
 */

import {
  requireAuth, setupSidebar, toast, timeAgo, escHtml,
  getWorkspaceUid, getCurrentUserRole, getUserRecord, logActivity, pushNotification
} from './app.js';

const STATUS_CFG = {
  ai:               { label: 'AI Handling',       badge: 'badge-info',    icon: '🤖' },
  waiting_for_agent:{ label: 'Waiting for Agent',  badge: 'badge-warning', icon: '⏳' },
  assigned:         { label: 'Assigned',           badge: 'badge-primary', icon: '👤' },
  resolved:         { label: 'Resolved',           badge: 'badge-success', icon: '✅' },
  closed:           { label: 'Closed',             badge: 'badge-muted',   icon: '🔒' },
  open:             { label: 'Open',               badge: 'badge-success', icon: '💬' }
};

let currentUser  = null;
let workspaceUid = null;
let userRole     = null;
let userRec      = null;
let allChats     = [];
let teamMembers  = {};
let activeFilter = 'all';
let searchQuery  = '';
let selectedId   = null;
let notesMode    = false;

requireAuth(async (user, wid) => {
  currentUser  = user;
  workspaceUid = wid;
  userRole     = await getCurrentUserRole();
  userRec      = await getUserRecord();
  setupSidebar(user);
  loadTeamMembers();
  loadChats();
  bindEvents();
  markNotificationsRead();
});

function loadTeamMembers() {
  firebase.database().ref(`businesses/${workspaceUid}/team/members`)
    .on('value', snap => { teamMembers = snap.val() || {}; });
}

function loadChats() {
  firebase.database().ref(`businesses/${workspaceUid}/chats`)
    .on('value', snap => {
      const raw = snap.val() || {};
      allChats = Object.entries(raw)
        .map(([id, d]) => ({ id, ...d }))
        .sort((a,b) => (b.updatedAt||b.createdAt||0) - (a.updatedAt||a.createdAt||0));
      updateFilterCounts();
      renderList();
      if (selectedId) renderDetail(selectedId);
    });
}

async function markNotificationsRead() {
  const db  = firebase.database();
  const ref = db.ref(`businesses/${workspaceUid}/notifications/${currentUser.uid}`);
  const snap = await ref.once('value');
  const data = snap.val() || {};
  const updates = {};
  Object.keys(data).forEach(k => { if (!data[k].read) updates[`${k}/read`] = true; });
  if (Object.keys(updates).length) await ref.update(updates);
}

function filteredChats() {
  let list = [...allChats];
  switch (activeFilter) {
    case 'mine':    list = list.filter(c => c.assignedTo === currentUser.uid); break;
    case 'waiting': list = list.filter(c => c.status === 'waiting_for_agent'); break;
    case 'assigned':list = list.filter(c => c.status === 'assigned'); break;
    case 'resolved':list = list.filter(c => c.status === 'resolved'); break;
    case 'closed':  list = list.filter(c => c.status === 'closed'); break;
    default: break; // all
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(c =>
      (c.customerName||'').toLowerCase().includes(q) ||
      (c.customerEmail||'').toLowerCase().includes(q) ||
      Object.values(c.messages||{}).some(m => (m.text||'').toLowerCase().includes(q))
    );
  }
  return list;
}

function updateFilterCounts() {
  const counts = {
    all:     allChats.length,
    mine:    allChats.filter(c => c.assignedTo === currentUser.uid).length,
    waiting: allChats.filter(c => c.status === 'waiting_for_agent').length,
    assigned:allChats.filter(c => c.status === 'assigned').length,
    resolved:allChats.filter(c => c.status === 'resolved').length,
    closed:  allChats.filter(c => c.status === 'closed').length
  };
  Object.entries(counts).forEach(([k, v]) => {
    const el = document.getElementById(`count-${k}`);
    if (el) el.textContent = v;
  });
}

function renderList() {
  const el = document.getElementById('inbox-list');
  if (!el) return;
  const list = filteredChats();

  if (!list.length) {
    el.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 24px;gap:12px;color:var(--text-muted)">
        <div style="font-size:2.5rem">📭</div>
        <div style="font-weight:600">${searchQuery ? 'No matches found' : 'Nothing here'}</div>
        <div style="font-size:.82rem;text-align:center">
          ${activeFilter === 'waiting' ? 'No conversations waiting for an agent.' :
            activeFilter === 'mine'    ? 'You have no assigned conversations.' :
            'No conversations in this category.'}
        </div>
      </div>`;
    return;
  }

  el.innerHTML = list.map(chat => {
    const msgs    = Object.values(chat.messages||{}).sort((a,b)=>(a.timestamp||0)-(b.timestamp||0));
    const last    = msgs[msgs.length-1];
    const preview = last ? (last.text||'').slice(0,70) : 'No messages';
    const sc      = STATUS_CFG[chat.status||'open'];
    const agent   = chat.assignedTo ? (teamMembers[chat.assignedTo]?.name||'Agent') : null;
    const isSel   = chat.id === selectedId;
    const isNew   = chat.status === 'waiting_for_agent';

    return `
      <div class="inbox-item ${isSel?'selected':''} ${isNew?'inbox-item--urgent':''}"
           data-id="${chat.id}"
           style="padding:14px 16px;border-bottom:1px solid var(--border);cursor:pointer;
                  transition:background .15s;position:relative;
                  background:${isSel?'rgba(201,162,39,.08)':isNew?'rgba(201,162,39,.03)':'transparent'}">
        ${isNew?`<div style="position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--primary);border-radius:0 2px 2px 0"></div>`:''}
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:38px;height:38px;border-radius:50%;background:var(--glass-active);
                      display:flex;align-items:center;justify-content:center;font-size:.9rem;
                      font-weight:700;color:var(--primary);flex-shrink:0">
            ${escHtml((chat.customerName||'V')[0].toUpperCase())}
          </div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
              <span style="font-size:.88rem;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                ${escHtml(chat.customerName || 'Visitor ' + (chat.visitorId||'').slice(-4))}
              </span>
              <span style="font-size:.7rem;color:var(--text-muted);flex-shrink:0">${timeAgo(chat.updatedAt||chat.createdAt)}</span>
            </div>
            <div style="font-size:.78rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">
              ${escHtml(preview)}
            </div>
            <div style="display:flex;gap:5px;margin-top:6px;flex-wrap:wrap;align-items:center">
              <span class="badge ${sc.badge}" style="font-size:.64rem">${sc.icon} ${sc.label}</span>
              ${chat.priority ? `<span class="badge priority-${chat.priority}" style="font-size:.64rem">${escHtml(chat.priority)}</span>` : ''}
              ${agent ? `<span class="badge badge-muted" style="font-size:.64rem">→ ${escHtml(agent)}</span>` : ''}
            </div>
          </div>
        </div>
        ${isNew && ['owner','admin','agent'].includes(userRole) ? `
          <div style="display:flex;gap:6px;margin-top:10px;padding-left:48px">
            <button class="btn btn-primary btn-sm" style="font-size:.75rem;padding:5px 12px"
                    data-quick-assign="${chat.id}">👤 Assign to Me</button>
          </div>` : ''}
      </div>`;
  }).join('');

  // Bind list item clicks
  el.querySelectorAll('[data-id]').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('[data-quick-assign]')) return;
      selectedId = item.dataset.id;
      renderList();
      renderDetail(selectedId);
    });
  });

  // Bind quick-assign buttons
  el.querySelectorAll('[data-quick-assign]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      quickAssignToMe(btn.dataset.quickAssign);
    });
  });
}

async function quickAssignToMe(chatId) {
  const db  = firebase.database();
  const name = userRec?.name || currentUser.email.split('@')[0];
  try {
    await db.ref(`businesses/${workspaceUid}/chats/${chatId}`).update({
      status:     'assigned',
      assignedTo: currentUser.uid,
      assignedBy: currentUser.uid,
      assignedAt: firebase.database.ServerValue.TIMESTAMP,
      updatedAt:  firebase.database.ServerValue.TIMESTAMP
    });
    await db.ref(`businesses/${workspaceUid}/chats/${chatId}/activityLog`).push({
      action: `Assigned to ${name} (self)`, byUid: currentUser.uid,
      byName: name, type: 'assigned', timestamp: Date.now()
    });
    await logActivity(workspaceUid, `${name} claimed a conversation`, { type: 'assigned', chatId });
    toast('Conversation assigned to you.', 'success');
  } catch { toast('Failed to assign.', 'error'); }
}

function renderDetail(chatId) {
  const panel = document.getElementById('inbox-detail');
  if (!panel) return;
  const chat = allChats.find(c => c.id === chatId);
  if (!chat) { panel.innerHTML = detailEmpty(); return; }

  const msgs    = Object.entries(chat.messages||{}).sort((a,b)=>(a[1].timestamp||0)-(b[1].timestamp||0));
  const notes   = Object.entries(chat.internalNotes||{}).sort((a,b)=>(a[1].createdAt||0)-(b[1].createdAt||0));
  const sc      = STATUS_CFG[chat.status||'open'];
  const agent   = chat.assignedTo ? teamMembers[chat.assignedTo] : null;
  const canAct  = ['owner','admin','agent'].includes(userRole);

  const agentOpts = Object.entries(teamMembers)
    .filter(([,m])=>['owner','admin','agent'].includes(m.role))
    .map(([id,m])=>`<option value="${id}" ${chat.assignedTo===id?'selected':''}>${escHtml(m.name||m.email)}</option>`)
    .join('');

  panel.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%">
      <!-- Header -->
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);background:var(--surface);flex-shrink:0">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:40px;height:40px;border-radius:50%;background:var(--glass-active);display:flex;align-items:center;justify-content:center;font-size:1rem;font-weight:700;color:var(--primary)">
              ${escHtml((chat.customerName||'V')[0].toUpperCase())}
            </div>
            <div>
              <div style="font-weight:700;font-size:.95rem">${escHtml(chat.customerName||'Unknown Visitor')}</div>
              <div style="font-size:.78rem;color:var(--text-muted)">${escHtml(chat.customerEmail||chat.visitorId||'—')}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="badge ${sc.badge}">${sc.icon} ${sc.label}</span>
            ${chat.priority?`<span class="badge priority-${chat.priority}" style="font-size:.72rem">${escHtml(chat.priority)}</span>`:''}
            ${canAct ? `
              ${chat.status!=='resolved'?`<button class="btn btn-success btn-sm" data-action="resolve">✅ Resolve</button>`:''}
              ${chat.status!=='closed'?`<button class="btn btn-ghost btn-sm" data-action="close">🔒 Close</button>`:''}
              <button class="btn btn-ghost btn-sm" data-action="transfer">🔄 Transfer</button>
            ` : ''}
            <button class="btn btn-ghost btn-sm" data-close-detail>✕</button>
          </div>
        </div>
        ${canAct ? `
        <div style="display:flex;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap">
          <select id="det-assign" class="form-input form-select" style="font-size:.8rem;padding:6px 10px;max-width:200px">
            <option value="">— Unassigned —</option>${agentOpts}
          </select>
          <button class="btn btn-ghost btn-sm" id="det-assign-btn">Assign</button>
          <select id="det-priority" class="form-input form-select" style="font-size:.8rem;padding:6px 10px;max-width:140px">
            <option value="">Priority…</option>
            ${['low','medium','high','urgent'].map(p=>`<option value="${p}" ${chat.priority===p?'selected':''}>${p[0].toUpperCase()+p.slice(1)}</option>`).join('')}
          </select>
          <button class="btn btn-ghost btn-sm" id="det-priority-btn">Set</button>
        </div>` : ''}
      </div>

      <!-- Tabs -->
      <div style="display:flex;border-bottom:1px solid var(--border);background:var(--surface-raised);flex-shrink:0">
        <button class="inbox-tab" data-tab="msgs" style="padding:10px 18px;font-size:.83rem;font-weight:600;border:none;background:transparent;cursor:pointer;border-bottom:2px solid ${!notesMode?'var(--primary)':'transparent'};color:${!notesMode?'var(--primary)':'var(--text-muted)'}">
          Messages (${msgs.length})
        </button>
        <button class="inbox-tab" data-tab="notes" style="padding:10px 18px;font-size:.83rem;font-weight:600;border:none;background:transparent;cursor:pointer;border-bottom:2px solid ${notesMode?'var(--primary)':'transparent'};color:${notesMode?'var(--primary)':'var(--text-muted)'}">
          Internal Notes (${notes.length})
        </button>
      </div>

      <!-- Messages -->
      <div id="det-msgs" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;${notesMode?'display:none':''}" ${notesMode?'hidden':''}>
        ${msgs.map(([,m])=>msgBubble(m)).join('')}
        ${!msgs.length?`<div style="text-align:center;color:var(--text-muted);font-size:.85rem;margin-top:32px">No messages yet</div>`:''}
      </div>

      <!-- Notes -->
      <div id="det-notes" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;${!notesMode?'display:none':''}" ${!notesMode?'hidden':''}>
        <div style="background:rgba(201,162,39,.06);border:1px solid rgba(201,162,39,.2);border-radius:8px;padding:9px 13px;font-size:.78rem;color:var(--text-secondary)">
          🔒 Internal notes — only visible to team members.
        </div>
        ${notes.map(([,n])=>noteBubble(n)).join('')}
        ${!notes.length?`<div style="text-align:center;color:var(--text-muted);font-size:.85rem;margin-top:24px">No notes yet</div>`:''}
      </div>

      <!-- Input -->
      ${canAct ? `
      <div style="padding:14px 16px;border-top:1px solid var(--border);background:var(--surface);flex-shrink:0">
        <div style="display:flex;gap:8px;align-items:flex-end">
          <textarea id="det-reply" rows="2" placeholder="${notesMode?'Write a private note…':'Type your reply…'}"
                    style="flex:1;resize:none;min-height:60px;max-height:120px;padding:9px 12px;
                           background:var(--input-bg);border:1px solid var(--border);border-radius:8px;
                           color:var(--text-primary);font-size:.875rem;font-family:inherit;outline:none;
                           transition:border-color .15s"></textarea>
          <button id="det-send" class="btn btn-primary btn-sm" style="padding:10px 16px">
            ${notesMode?'📝 Note':'↩ Send'}
          </button>
        </div>
      </div>` : ''}
    </div>

    <!-- Transfer modal -->
    <div id="inbox-transfer-modal" class="modal-overlay" style="display:none">
      <div class="modal" style="max-width:380px">
        <div class="modal-header"><div class="modal-title">Transfer Conversation</div>
          <button class="modal-close" data-close-transfer>✕</button></div>
        <div class="form-group" style="padding:0 0 10px">
          <label class="form-label">Transfer to agent</label>
          <select class="form-input form-select" id="transfer-to-sel">
            <option value="">Select agent…</option>
            ${Object.entries(teamMembers)
              .filter(([id,m])=>id!==currentUser.uid&&['owner','admin','agent'].includes(m.role))
              .map(([id,m])=>`<option value="${id}">${escHtml(m.name||m.email)}</option>`).join('')}
          </select>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" data-close-transfer>Cancel</button>
          <button class="btn btn-primary" id="confirm-transfer">Transfer</button>
        </div>
      </div>
    </div>`;

  // Scroll messages down
  setTimeout(() => {
    const el = document.getElementById('det-msgs');
    if (el) el.scrollTop = el.scrollHeight;
  }, 50);

  bindDetailEvents(chatId, chat);
}

function msgBubble(msg) {
  const isAgent = msg.role === 'agent';
  const isBot   = msg.role === 'bot';
  return `
    <div style="display:flex;flex-direction:column;align-items:${isAgent?'flex-end':'flex-start'};gap:3px;max-width:80%;${isAgent?'align-self:flex-end':'align-self:flex-start'}">
      ${!isAgent?`<span style="font-size:.7rem;color:var(--text-muted)">${isBot?'🤖 AI Bot':'👤 Visitor'}</span>`:''}
      <div style="padding:10px 13px;border-radius:${isAgent?'14px 14px 3px 14px':'14px 14px 14px 3px'};
                  font-size:.87rem;line-height:1.55;word-break:break-word;
                  background:${isAgent?'var(--primary)':'rgba(201,162,39,.08)'};
                  color:${isAgent?'#fff':'var(--text-primary)'}">
        ${escHtml(msg.text||'')}
      </div>
      <span style="font-size:.68rem;color:var(--text-muted)">${timeAgo(msg.timestamp)}</span>
    </div>`;
}

function noteBubble(note) {
  return `
    <div style="background:rgba(201,162,39,.06);border:1px solid rgba(201,162,39,.15);border-radius:10px;padding:12px 14px">
      <div style="font-size:.78rem;font-weight:600;color:var(--primary);margin-bottom:4px">
        📝 ${escHtml(note.agentName||'Agent')} · <span style="font-weight:400;color:var(--text-muted)">${timeAgo(note.createdAt)}</span>
      </div>
      <div style="font-size:.87rem;line-height:1.55">${escHtml(note.text||'')}</div>
    </div>`;
}

function detailEmpty() {
  return `<div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:12px;color:var(--text-muted)">
    <div style="font-size:3rem">📬</div>
    <div style="font-size:1rem;font-weight:600">Select a conversation</div>
    <div style="font-size:.85rem">Pick one from the inbox to view and reply.</div>
  </div>`;
}

function bindDetailEvents(chatId, chat) {
  const db   = firebase.database();
  const ref  = db.ref(`businesses/${workspaceUid}/chats/${chatId}`);
  const name = userRec?.name || currentUser.email.split('@')[0];

  // Close detail
  document.querySelector('[data-close-detail]')?.addEventListener('click', () => {
    selectedId = null;
    document.getElementById('inbox-detail').innerHTML = detailEmpty();
    renderList();
  });

  // Tabs
  document.querySelectorAll('.inbox-tab').forEach(t => {
    t.addEventListener('click', () => { notesMode = t.dataset.tab === 'notes'; renderDetail(chatId); });
  });

  // Send reply / note
  const send = async () => {
    const ta = document.getElementById('det-reply');
    const text = ta?.value.trim();
    if (!text) return;
    ta.value = '';
    try {
      if (notesMode) {
        await db.ref(`businesses/${workspaceUid}/chats/${chatId}/internalNotes`).push({
          agentUid: currentUser.uid, agentName: name, text,
          createdAt: firebase.database.ServerValue.TIMESTAMP
        });
        toast('Note saved.', 'success');
      } else {
        await db.ref(`businesses/${workspaceUid}/chats/${chatId}/messages`).push({
          role: 'agent', text,
          agentUid: currentUser.uid, agentName: name,
          timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        await ref.update({ updatedAt: firebase.database.ServerValue.TIMESTAMP });
      }
    } catch { toast('Send failed.', 'error'); }
  };
  document.getElementById('det-send')?.addEventListener('click', send);
  document.getElementById('det-reply')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });

  // Assign
  document.getElementById('det-assign-btn')?.addEventListener('click', async () => {
    const sel = document.getElementById('det-assign');
    const uid = sel?.value;
    if (!uid) { toast('Select an agent first.', 'warning'); return; }
    const agentName = teamMembers[uid]?.name || 'Agent';
    await ref.update({ status:'assigned', assignedTo:uid, assignedBy:currentUser.uid,
      assignedAt: firebase.database.ServerValue.TIMESTAMP, updatedAt: firebase.database.ServerValue.TIMESTAMP });
    await db.ref(`businesses/${workspaceUid}/chats/${chatId}/activityLog`).push({
      action: `Assigned to ${agentName}`, byUid: currentUser.uid, byName: name,
      type: 'assigned', timestamp: Date.now()
    });
    await logActivity(workspaceUid, `${name} assigned conversation to ${agentName}`, { type:'assigned', chatId });
    await pushNotification(workspaceUid, uid, 'assignment', `You have a new conversation from ${name}`, { chatId });
    toast(`Assigned to ${agentName}.`, 'success');
  });

  // Priority
  document.getElementById('det-priority-btn')?.addEventListener('click', async () => {
    const sel = document.getElementById('det-priority');
    await ref.update({ priority: sel?.value, updatedAt: firebase.database.ServerValue.TIMESTAMP });
    toast('Priority set.', 'success');
  });

  // Action buttons
  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const act = btn.dataset.action;
      if (act === 'resolve') {
        await ref.update({ status:'resolved', updatedAt: firebase.database.ServerValue.TIMESTAMP });
        await db.ref(`businesses/${workspaceUid}/chats/${chatId}/activityLog`).push({
          action: `Resolved by ${name}`, byUid: currentUser.uid, byName: name,
          type: 'resolved', timestamp: Date.now()
        });
        toast('Resolved.', 'success');
      } else if (act === 'close') {
        await ref.update({ status:'closed', updatedAt: firebase.database.ServerValue.TIMESTAMP });
        toast('Closed.', 'success');
      } else if (act === 'transfer') {
        const modal = document.getElementById('inbox-transfer-modal');
        if (modal) modal.style.display = 'flex';
      }
    });
  });

  // Transfer
  document.querySelectorAll('[data-close-transfer]').forEach(b => {
    b.addEventListener('click', () => {
      const modal = document.getElementById('inbox-transfer-modal');
      if (modal) modal.style.display = 'none';
    });
  });
  document.getElementById('confirm-transfer')?.addEventListener('click', async () => {
    const sel = document.getElementById('transfer-to-sel');
    const uid = sel?.value;
    if (!uid) { toast('Select an agent.', 'warning'); return; }
    const agentName = teamMembers[uid]?.name || 'Agent';
    await ref.update({ status:'assigned', assignedTo:uid, assignedBy:currentUser.uid,
      assignedAt: firebase.database.ServerValue.TIMESTAMP, updatedAt: firebase.database.ServerValue.TIMESTAMP });
    await db.ref(`businesses/${workspaceUid}/chats/${chatId}/activityLog`).push({
      action: `Transferred to ${agentName}`, byUid: currentUser.uid, byName: name,
      type: 'transferred', timestamp: Date.now()
    });
    await logActivity(workspaceUid, `${name} transferred conversation to ${agentName}`, { type:'transferred', chatId });
    await pushNotification(workspaceUid, uid, 'transfer', `${name} transferred a conversation to you`, { chatId });
    const modal = document.getElementById('inbox-transfer-modal');
    if (modal) modal.style.display = 'none';
    toast(`Transferred to ${agentName}.`, 'success');
  });
}

function bindEvents() {
  document.getElementById('inbox-search')?.addEventListener('input', e => {
    searchQuery = e.target.value;
    updateFilterCounts();
    renderList();
  });

  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      updateFilterCounts();
      renderList();
    });
  });
}
