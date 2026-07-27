/**
 * dashboard.js — ES6 Module
 * Main dashboard: stats overview, installation code, recent leads/chats.
 */

import { requireAuth, setupSidebar, toast, formatDate, escHtml, copyToClipboard } from './app.js';

/* ── State ─────────────────────────────────────────────────── */
let currentUser  = null;
let businessData = {};

/* ── Init ──────────────────────────────────────────────────── */
requireAuth(user => {
  currentUser = user;
  setupSidebar(user);
  loadDashboard(user);
});

/* ── Load all dashboard data ───────────────────────────────── */
async function loadDashboard(user) {
  const db = firebase.database();

  try {
    // Load profile + stats in parallel
    const [profileSnap, leadsSnap, faqsSnap, chatsSnap] = await Promise.all([
      db.ref(`businesses/${user.uid}/profile`).once('value'),
      db.ref(`businesses/${user.uid}/leads`).once('value'),
      db.ref(`businesses/${user.uid}/faqs`).once('value'),
      db.ref(`businesses/${user.uid}/chats`).once('value')
    ]);

    businessData = profileSnap.val() || {};
    const leads  = leadsSnap.val()   || {};
    const faqs   = faqsSnap.val()    || {};
    const chats  = chatsSnap.val()   || {};

    const leadsArr = Object.values(leads);
    const faqsArr  = Object.values(faqs);
    const chatsArr = Object.values(chats);

    renderStats(leadsArr.length, faqsArr.length, chatsArr.length);
    renderInstallCode(user.uid);
    renderRecentLeads(leadsArr.slice(-5).reverse());
    renderBusinessInfo(businessData);
  } catch (err) {
    console.error('Dashboard load error:', err);
    toast('Failed to load dashboard data.', 'error');
  }
}

/* ── Render stats ──────────────────────────────────────────── */
function renderStats(leadsCount, faqsCount, chatsCount) {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  set('stat-leads', leadsCount);
  set('stat-faqs', faqsCount);
  set('stat-chats', chatsCount);
  set('stat-install', 1); // "installed"
}

/* ── Render business info ──────────────────────────────────── */
function renderBusinessInfo(profile) {
  const nameEl = document.getElementById('biz-name');
  if (nameEl) nameEl.textContent = profile.name || 'Your Business';

  const emailEl = document.getElementById('biz-email');
  if (emailEl) emailEl.textContent = currentUser.email;

  const colourEl = document.getElementById('biz-colour');
  if (colourEl) colourEl.style.background = profile.themeColor || '#7c3aed';

  const welcomeEl = document.getElementById('biz-welcome');
  if (welcomeEl) welcomeEl.textContent = profile.welcomeMessage || '—';
}

/* ── Render installation code ──────────────────────────────── */
function renderInstallCode(uid) {
  const snippet = `<script src="https://daviddchucks-hash.github.io/drexorasupport/widget/embed.js" data-business="${uid}"><\/script>`;
  const codeEl  = document.getElementById('install-code');
  const copyBtn = document.getElementById('copy-install');

  if (codeEl) codeEl.textContent = snippet;
  if (copyBtn) {
    copyBtn.addEventListener('click', () => copyToClipboard(snippet, copyBtn));
  }
}

/* ── Render recent leads ───────────────────────────────────── */
function renderRecentLeads(leads) {
  const tbody = document.getElementById('recent-leads-body');
  if (!tbody) return;

  if (!leads.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--text-muted)">
      No leads yet. Share your widget to start collecting them.
    </td></tr>`;
    return;
  }

  tbody.innerHTML = leads.map(lead => `
    <tr>
      <td><strong>${escHtml(lead.visitorName || lead.name || 'Unknown')}</strong></td>
      <td>${escHtml(lead.email || '—')}</td>
      <td>${escHtml(lead.phone || '—')}</td>
      <td><span class="badge badge-${lead.read ? 'muted' : 'primary'}">${lead.read ? 'Read' : 'New'}</span></td>
    </tr>
  `).join('');
}
