/**
 * chats.js — ES6 Module
 * View conversations collected via the widget.
 * Includes agent reply input so admins can send messages to customers.
 */

import { requireAuth, setupSidebar, toast, formatDate, timeAgo, escHtml } from './app.js';

/* ── State ─────────────────────────────────────────────────── */
let currentUser    = null;
let allChats       = [];
let selectedChatId = null;

/* ── DOM refs ──────────────────────────────────────────────── */
const chatList    = document.getElementById('chat-list');
const chatDetail  = document.getElementById('chat-detail');
const chatSearch  = document.getElementById('chat-search');
const chatCount   = document.getElementById('chat-count');

/* ── Init ──────────────────────────────────────────────────── */
requireAuth(user => {
  currentUser = user;
  setupSidebar(user);
  loadChats(user.uid);
  bindEvents();
});

/* ── Load chats ────────────────────────────────────────────── */
function loadChats(uid) {
  const db = firebase.database();
  db.ref(`businesses/${uid}/chats`).on('value', snap => {
    const raw = snap.val() || {};
    allChats = Object.entries(raw).map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    if (chatCount) chatCount.textContent = allChats.length;
    renderChatList();

    // Re-render open chat if it was updated
    if (selectedChatId) renderChatDetail(selectedChatId);
  });
}

/* ── Render left panel (chat list) ────────────────────────── */
function renderChatList() {
  const query = (chatSearch?.value || '').toLowerCase();

  const filtered = allChats.filter(chat => {
    if (!query) return true;
    const msgs = chat.messages ? Object.values(chat.messages) : [];
    return msgs.some(m => (m.text || '').toLowerCase().includes(query)) ||
           (chat.visitorId || '').toLowerCase().includes(query);
  });

  if (!filtered.length) {
    chatList.innerHTML = `
      <div class="empty-state" style="padding:40px 20px">
        <div class="empty-state-icon">💬</div>
        <div class="empty-state-title">${query ? 'No matching chats' : 'No conversations yet'}</div>
        <div class="empty-state-desc" style="font-size:.75rem">Conversations will appear here when visitors interact with your widget.</div>
      </div>`;
    return;
  }

  chatList.innerHTML = filtered.map(chat => {
    const msgs    = chat.messages ? Object.values(chat.messages) : [];
    const lastMsg = msgs[msgs.length - 1];
    const preview = lastMsg ? (lastMsg.text || '').slice(0, 60) : 'No messages';
    const isSelected = chat.id === selectedChatId;

    return `
      <div class="chat-list-item ${isSelected ? 'selected' : ''}" data-chat-id="${escHtml(chat.id)}"
           style="padding:14px 16px;border-bottom:1px solid var(--glass-border);cursor:pointer;
                  transition:all .2s;background:${isSelected ? 'rgba(124,58,237,.1)' : 'transparent'}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
          <span style="font-size:.8rem;font-weight:600">
            Visitor ${escHtml((chat.visitorId || 'Unknown').slice(-6))}
          </span>
          <span style="font-size:.7rem;color:var(--text-muted)">${timeAgo(chat.createdAt)}</span>
        </div>
        <div style="font-size:.78rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${escHtml(preview)}
        </div>
        <div style="margin-top:6px;display:flex;gap:6px">
          <span class="badge badge-${chat.status === 'open' ? 'success' : 'muted'}" style="font-size:.65rem">
            ${chat.status || 'open'}
          </span>
          <span class="badge badge-muted" style="font-size:.65rem">${msgs.length} msg${msgs.length !== 1 ? 's' : ''}</span>
        </div>
      </div>`;
  }).join('');

  chatList.querySelectorAll('[data-chat-id]').forEach(el => {
    el.addEventListener('click', () => {
      selectedChatId = el.dataset.chatId;
      renderChatList();
      renderChatDetail(selectedChatId);
    });
    el.addEventListener('mouseenter', () => { if (el.dataset.chatId !== selectedChatId) el.style.background = 'rgba(255,255,255,.03)'; });
    el.addEventListener('mouseleave', () => { if (el.dataset.chatId !== selectedChatId) el.style.background = 'transparent'; });
  });
}

/* ── Render right panel (chat detail) ─────────────────────── */
function renderChatDetail(chatId) {
  const chat = allChats.find(c => c.id === chatId);

  if (!chat) {
    chatDetail.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">💬</div>
        <div class="empty-state-title">Select a conversation</div>
        <div class="empty-state-desc">Choose a chat from the left to view the full conversation.</div>
      </div>`;
    return;
  }

  const msgs    = chat.messages ? Object.values(chat.messages).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)) : [];
  const started = chat.createdAt ? new Date(chat.createdAt).toLocaleString() : 'Unknown time';

  chatDetail.innerHTML = `
    <div style="padding:20px;border-bottom:1px solid var(--glass-border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
      <div>
        <div style="font-size:.9rem;font-weight:700">Visitor ${escHtml((chat.visitorId || 'Unknown').slice(-6))}</div>
        <div style="font-size:.75rem;color:var(--text-muted);margin-top:2px">Started ${started}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="badge badge-${chat.status === 'open' ? 'success' : 'muted'}">${chat.status || 'open'}</span>
        ${chat.status === 'open'
          ? `<button class="btn btn-ghost btn-sm" data-close-chat="${escHtml(chatId)}">Close chat</button>`
          : ''}
        <button class="btn btn-danger btn-sm" data-delete-chat="${escHtml(chatId)}">🗑 Delete</button>
      </div>
    </div>
    <div class="chat-messages" id="messages-area" style="flex:1;overflow-y:auto">
      ${msgs.length ? msgs.map(msg => `
        <div class="msg ${msg.role === 'user' ? 'visitor' : msg.role === 'agent' ? 'agent' : 'bot'}">
          <div class="msg-bubble">${escHtml(msg.text || '')}</div>
          <div class="msg-time">${msg.role === 'agent' ? '<span class="agent-label">You</span> · ' : ''}${msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}</div>
        </div>
      `).join('') : '<div class="empty-state"><div class="empty-state-desc">No messages in this chat.</div></div>'}
    </div>
    <div class="agent-reply-bar" id="agent-reply-bar">
      <input
        type="text"
        id="agent-reply-input"
        class="agent-reply-input"
        placeholder="Reply to customer…"
        autocomplete="off"
        ${chat.status !== 'open' ? 'disabled' : ''}
      >
      <button
        id="agent-reply-send"
        class="agent-reply-send"
        aria-label="Send reply"
        ${chat.status !== 'open' ? 'disabled' : ''}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      </button>
    </div>
    ${chat.status !== 'open' ? `<div style="text-align:center;font-size:.72rem;color:var(--text-muted);padding:6px 0 10px">This conversation is closed — reopen it to reply.</div>` : ''}`;

  // Bind chat actions
  const closeBtn = chatDetail.querySelector('[data-close-chat]');
  closeBtn?.addEventListener('click', () => updateChatStatus(chatId, 'closed'));

  const deleteBtn = chatDetail.querySelector('[data-delete-chat]');
  deleteBtn?.addEventListener('click', () => deleteChat(chatId));

  // Bind agent reply input
  const replyInput = document.getElementById('agent-reply-input');
  const replySend  = document.getElementById('agent-reply-send');

  if (replyInput && replySend) {
    replySend.addEventListener('click', () => {
      const text = replyInput.value.trim();
      if (!text) return;
      replyInput.value = '';
      replyInput.focus();
      sendAgentMessage(chatId, text);
    });

    replyInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = replyInput.value.trim();
        if (!text) return;
        replyInput.value = '';
        sendAgentMessage(chatId, text);
      }
    });
  }

  // Scroll to bottom
  const area = document.getElementById('messages-area');
  if (area) area.scrollTop = area.scrollHeight;
}

/* ── Send agent message to customer ───────────────────────── */
async function sendAgentMessage(chatId, text) {
  const db = firebase.database();
  try {
    await db.ref(`businesses/${currentUser.uid}/chats/${chatId}/messages`).push({
      role:      'agent',
      text:      text,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });
    // loadChats listener will auto-refresh the detail
  } catch (err) {
    toast('Failed to send message.', 'error');
  }
}

/* ── Actions ───────────────────────────────────────────────── */
async function updateChatStatus(id, status) {
  const db = firebase.database();
  try {
    await db.ref(`businesses/${currentUser.uid}/chats/${id}`).update({ status });
    toast(`Chat marked as ${status}.`, 'success');
  } catch (err) {
    toast('Could not update chat status.', 'error');
  }
}

async function deleteChat(id) {
  if (!confirm('Delete this conversation? This cannot be undone.')) return;
  const db = firebase.database();
  try {
    await db.ref(`businesses/${currentUser.uid}/chats/${id}`).remove();
    if (selectedChatId === id) {
      selectedChatId = null;
      chatDetail.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💬</div><div class="empty-state-title">Select a conversation</div></div>`;
    }
    toast('Conversation deleted.', 'success');
  } catch (err) {
    toast('Failed to delete conversation.', 'error');
  }
}

/* ── Bind events ───────────────────────────────────────────── */
function bindEvents() {
  chatSearch?.addEventListener('input', renderChatList);
}
