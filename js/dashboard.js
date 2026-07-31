/**
 * dashboard.js — ES6 Module
 * Main dashboard: workspace stats, installation code, recent leads/chats,
 * online agents, conversation metrics.
 */

import { requireAuth, setupSidebar, toast, formatDate, escHtml, copyToClipboard, timeAgo } from './app.js';

let currentUser  = null;
let workspaceUid = null;

requireAuth(async (user, wid) => {
  currentUser  = user;
  workspaceUid = wid;
  setupSidebar(user);
  await loadDashboard();
});

async function loadDashboard() {
  const db = firebase.database();

  try {
    const [profileSnap, leadsSnap, faqsSnap, chatsSnap, membersSnap, ticketsSnap] = await Promise.all([
      db.ref(`businesses/${workspaceUid}/profile`).once('value'),
      db.ref(`businesses/${workspaceUid}/leads`).once('value'),
      db.ref(`businesses/${workspaceUid}/faqs`).once('value'),
      db.ref(`businesses/${workspaceUid}/chats`).once('value'),
      db.ref(`businesses/${workspaceUid}/team/members`).once('value'),
      db.ref(`businesses/${workspaceUid}/tickets`).once('value')
    ]);

    const profile  = profileSnap.val()  || {};
    const leads    = Object.values(leadsSnap.val()   || {});
    const faqs     = Object.values(faqsSnap.val()    || {});
    const chatsRaw = chatsSnap.val()    || {};
    const members  = Object.values(membersSnap.val() || {});
    const tickets  = Object.values(ticketsSnap.val() || {});

    const chats = Object.entries(chatsRaw).map(([id, d]) => ({ id, ...d }));

    // Compute stats
    const openChats        = chats.filter(c => !['resolved','closed'].includes(c.status)).length;
    const waitingChats     = chats.filter(c => c.status === 'waiting_for_agent').length;
    const resolvedToday    = chats.filter(c => {
      if (c.status !== 'resolved') return false;
      const today = new Date(); today.setHours(0,0,0,0);
      return (c.updatedAt || c.createdAt || 0) >= today.getTime();
    }).length;
    const aiActive         = chats.filter(c => c.status === 'ai' || (!c.status && c.messages)).length;
    const onlineAgents     = members.filter(m => m.status === 'online').length;
    const openTickets      = tickets.filter(t => t.status === 'open' || t.status === 'pending').length;

    renderStats({
      leads: leads.length, faqs: faqs.length, chats: chats.length,
      openChats, waitingChats, resolvedToday, aiActive,
      onlineAgents, openTickets
    });

    renderInstallCode(workspaceUid);
    renderRecentLeads(leads.slice(-5).reverse());
    renderRecentChats(chats.slice(0, 5));
    renderBusinessInfo(profile);
    renderOnlineAgents(members);

  } catch (err) {
    console.error('Dashboard load error:', err);
    toast('Failed to load dashboard data.', 'error');
  }
}

function renderStats(s) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('stat-leads', s.leads);
  set('stat-faqs', s.faqs);
  set('stat-chats', s.chats);
  set('stat-install', 1);
  set('stat-open-chats', s.openChats);
  set('stat-waiting', s.waitingChats);
  set('stat-resolved-today', s.resolvedToday);
  set('stat-ai-active', s.aiActive);
  set('stat-online-agents', s.onlineAgents);
  set('stat-open-tickets', s.openTickets);
}

function renderBusinessInfo(profile) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || ''; };
  set('biz-name', profile.name || 'Your Business');
  set('biz-email', currentUser.email);
  set('biz-welcome', profile.welcomeMessage || '—');
  const colourEl = document.getElementById('biz-colour');
  if (colourEl) colourEl.style.background = profile.themeColor || '#C9A227';
}

function renderInstallCode(uid) {
  const snippet = `<script src="https://daviddchucks-hash.github.io/drexorasupport/widget/embed.js" data-business="${uid}"><\/script>`;
  const codeEl  = document.getElementById('install-code');
  const copyBtn = document.getElementById('copy-install');
  if (codeEl)  codeEl.textContent = snippet;
  if (copyBtn) copyBtn.addEventListener('click', () => copyToClipboard(snippet, copyBtn));
}

function renderRecentLeads(leads) {
  const tbody = document.getElementById('recent-leads-body');
  if (!tbody) return;
  if (!leads.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-muted)">
      No leads yet. Share your widget to start collecting them.</td></tr>`;
    return;
  }
  tbody.innerHTML = leads.map(lead => `
    <tr>
      <td><strong>${escHtml(lead.visitorName || lead.name || 'Unknown')}</strong></td>
      <td>${escHtml(lead.email || '—')}</td>
      <td>${escHtml(lead.phone || '—')}</td>
      <td><span class="badge badge-${lead.read ? 'muted' : 'primary'}">${lead.read ? 'Read' : 'New'}</span></td>
    </tr>`).join('');
}

function renderRecentChats(chats) {
  const tbody = document.getElementById('recent-chats-body');
  if (!tbody) return;
  if (!chats.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-muted)">
      No conversations yet.</td></tr>`;
    return;
  }
  const statusColors = {
    ai: 'badge-info', waiting_for_agent: 'badge-warning', assigned: 'badge-primary',
    resolved: 'badge-success', closed: 'badge-muted', open: 'badge-success'
  };
  const statusLabels = {
    ai: 'AI', waiting_for_agent: 'Waiting', assigned: 'Assigned',
    resolved: 'Resolved', closed: 'Closed', open: 'Open'
  };
  tbody.innerHTML = chats.map(chat => {
    const msgs    = Object.values(chat.messages || {});
    const lastMsg = msgs[msgs.length - 1];
    const preview = lastMsg ? (lastMsg.text || '').slice(0, 50) : '—';
    const status  = chat.status || 'open';
    return `<tr>
      <td><strong>${escHtml(chat.customerName || 'Visitor ' + (chat.visitorId || '').slice(-4))}</strong></td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(preview)}</td>
      <td><span class="badge ${statusColors[status] || 'badge-muted'}">${statusLabels[status] || status}</span></td>
      <td style="color:var(--text-muted);font-size:.8rem">${timeAgo(chat.updatedAt || chat.createdAt)}</td>
    </tr>`;
  }).join('');
}

function renderOnlineAgents(members) {
  const container = document.getElementById('online-agents-list');
  if (!container) return;
  const online = members.filter(m => m.status === 'online');
  if (!online.length) {
    container.innerHTML = `<div style="color:var(--text-muted);font-size:.85rem;padding:8px 0">No agents online</div>`;
    return;
  }
  container.innerHTML = online.slice(0, 5).map(m => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      <div class="member-avatar" style="width:32px;height:32px">
        ${m.photoUrl
          ? `<img class="member-avatar-img" src="${escHtml(m.photoUrl)}" alt="">`
          : `<div class="member-avatar-fallback">${escHtml((m.name||'?')[0].toUpperCase())}</div>`}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:.85rem;font-weight:600">${escHtml(m.name||m.email)}</div>
        <div style="font-size:.75rem;color:var(--text-muted)">${escHtml(m.role||'agent')}</div>
      </div>
      <span class="status-dot" style="background:#10b981;width:8px;height:8px;border-radius:50%;display:inline-block"></span>
    </div>`).join('');
}
