/**
 * csat-reports.js — ES6 Module
 * Customer Satisfaction (CSAT) reports page.
 */

import {
  requireAuth, setupSidebar, toast, escHtml, formatDate,
  getWorkspaceUid, getCurrentUserRole, timeAgo
} from './app.js';

let currentUser  = null;
let workspaceUid = null;
let allReports   = [];
let searchQuery  = '';

requireAuth(async (user, wid) => {
  currentUser  = user;
  workspaceUid = wid;
  await getCurrentUserRole();
  setupSidebar(user);
  loadReports();
  bindEvents();
});

/* ── Load CSAT reports real-time ───────────────────────────── */
function loadReports() {
  firebase.database()
    .ref(`businesses/${workspaceUid}/csatReports`)
    .on('value', snap => {
      const raw = snap.val() || {};
      allReports = Object.entries(raw)
        .map(([id, r]) => ({ id, ...r }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      renderStats();
      renderTable();
    });
}

/* ── Render summary stats ──────────────────────────────────── */
function renderStats() {
  const total = allReports.length;

  const avgEl  = document.getElementById('stat-avg-score');
  const totEl  = document.getElementById('stat-total-ratings');
  const posEl  = document.getElementById('stat-positive-pct');
  const rateEl = document.getElementById('stat-response-rate');

  if (!total) {
    if (avgEl)  avgEl.textContent  = '—';
    if (totEl)  totEl.textContent  = '0';
    if (posEl)  posEl.textContent  = '—';
    if (rateEl) rateEl.textContent = '—';
    renderDistribution([0,0,0,0,0]);
    return;
  }

  const sum = allReports.reduce((s, r) => s + (r.score || 0), 0);
  const avg = sum / total;
  const positive = allReports.filter(r => r.score >= 4).length;

  if (avgEl)  avgEl.textContent  = avg.toFixed(1) + ' ★';
  if (totEl)  totEl.textContent  = total;
  if (posEl)  posEl.textContent  = Math.round((positive / total) * 100) + '%';
  if (rateEl) rateEl.textContent = total + ' received';

  // Distribution
  const counts = [1,2,3,4,5].map(s => allReports.filter(r => r.score === s).length);
  renderDistribution(counts);
}

function renderDistribution(counts) {
  const container = document.getElementById('score-distribution');
  if (!container) return;
  const total = counts.reduce((a,b) => a+b, 0) || 1;
  const labels = ['⭐ 1 Star', '⭐⭐ 2 Stars', '⭐⭐⭐ 3 Stars', '⭐⭐⭐⭐ 4 Stars', '⭐⭐⭐⭐⭐ 5 Stars'];
  const colors  = ['#ef4444','#f59e0b','#eab308','#84cc16','#10b981'];

  container.innerHTML = [4,3,2,1,0].map(i => `
    <div style="display:flex;align-items:center;gap:12px">
      <span style="font-size:.8rem;width:90px;flex-shrink:0;color:var(--text-secondary)">${labels[i]}</span>
      <div class="csat-score-bar" style="flex:1">
        <div class="csat-score-fill" style="width:${Math.round((counts[i]/total)*100)}%;background:${colors[i]}"></div>
      </div>
      <span style="font-size:.8rem;width:28px;text-align:right;color:var(--text-muted)">${counts[i]}</span>
    </div>`).join('');
}

/* ── Render table ──────────────────────────────────────────── */
function renderTable() {
  const tbody = document.getElementById('csat-tbody');
  if (!tbody) return;

  const filtered = allReports.filter(r => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (r.customerName || '').toLowerCase().includes(q) ||
           (r.comment      || '').toLowerCase().includes(q) ||
           (r.agentName    || '').toLowerCase().includes(q);
  });

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-muted)">
      ${searchQuery ? 'No matching results.' : 'No CSAT ratings yet. Ratings appear here after you end conversations and customers submit their scores.'}
    </td></tr>`;
    return;
  }

  const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);
  const scoreColor = s => s >= 4 ? '#10b981' : s === 3 ? '#f59e0b' : '#ef4444';

  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td>
        <div style="font-weight:600;font-size:.85rem">${escHtml(r.customerName || 'Unknown Visitor')}</div>
        <div style="font-size:.73rem;color:var(--text-muted)">${escHtml(r.customerEmail || '—')}</div>
      </td>
      <td>
        <span style="font-size:1rem;color:${scoreColor(r.score || 0)};letter-spacing:2px">${stars(r.score || 0)}</span>
        <div style="font-size:.72rem;color:var(--text-muted)">${r.score || 0}/5</div>
      </td>
      <td style="font-size:.83rem;max-width:220px;color:var(--text-secondary)">
        ${r.comment ? escHtml(r.comment) : '<span style="color:var(--text-muted);font-style:italic">No comment</span>'}
      </td>
      <td style="font-size:.83rem">${escHtml(r.agentName || '—')}</td>
      <td style="font-size:.78rem;color:var(--text-muted);white-space:nowrap">${timeAgo(r.createdAt)}</td>
    </tr>`).join('');
}

function bindEvents() {
  document.getElementById('csat-search')?.addEventListener('input', e => {
    searchQuery = e.target.value.trim().toLowerCase();
    renderTable();
  });
}
