/**
 * leads.js — ES6 Module
 * View and manage collected leads from the widget.
 */

import { requireAuth, setupSidebar, toast, formatDate, escHtml } from './app.js';

/* ── State ─────────────────────────────────────────────────── */
let currentUser = null;
let allLeads    = [];
let filterState = 'all'; // 'all' | 'new' | 'read'

/* ── DOM refs ──────────────────────────────────────────────── */
const leadsBody   = document.getElementById('leads-body');
const leadCount   = document.getElementById('lead-count');
const newCount    = document.getElementById('new-count');
const searchInp   = document.getElementById('leads-search');
const filterBtns  = document.querySelectorAll('[data-filter]');
const exportBtn   = document.getElementById('btn-export');

/* ── Init ──────────────────────────────────────────────────── */
requireAuth(user => {
  currentUser = user;
  setupSidebar(user);
  loadLeads(user.uid);
  bindEvents();
});

/* ── Load leads from Realtime DB ───────────────────────────── */
function loadLeads(uid) {
  const db = firebase.database();
  db.ref(`businesses/${uid}/leads`).on('value', snap => {
    const raw  = snap.val() || {};
    allLeads = Object.entries(raw).map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const newLeads = allLeads.filter(l => !l.read).length;
    if (leadCount) leadCount.textContent = allLeads.length;
    if (newCount)  newCount.textContent  = newLeads;

    renderLeads();
  });
}

/* ── Render table ──────────────────────────────────────────── */
function renderLeads() {
  const query = (searchInp?.value || '').toLowerCase();

  let filtered = allLeads.filter(lead => {
    if (filterState === 'new'  && lead.read)  return false;
    if (filterState === 'read' && !lead.read) return false;
    if (!query) return true;
    return (
      (lead.visitorName || lead.name || '').toLowerCase().includes(query) ||
      (lead.email || '').toLowerCase().includes(query) ||
      (lead.phone || '').toLowerCase().includes(query) ||
      (lead.message || lead.question || '').toLowerCase().includes(query)
    );
  });

  if (!filtered.length) {
    leadsBody.innerHTML = `<tr><td colspan="6">
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-title">${query || filterState !== 'all' ? 'No matching leads' : 'No leads yet'}</div>
        <div class="empty-state-desc">Leads appear here when visitors leave their contact details via the widget.</div>
      </div>
    </td></tr>`;
    return;
  }

  leadsBody.innerHTML = filtered.map(lead => `
    <tr data-id="${escHtml(lead.id)}" class="${lead.read ? '' : 'unread-row'}" style="${lead.read ? '' : 'background:rgba(124,58,237,.05)'}">
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          ${!lead.read ? '<span style="width:8px;height:8px;border-radius:50%;background:#7c3aed;flex-shrink:0;display:inline-block"></span>' : '<span style="width:8px;flex-shrink:0;display:inline-block"></span>'}
          <strong>${escHtml(lead.visitorName || lead.name || 'Unknown')}</strong>
        </div>
      </td>
      <td>${escHtml(lead.email || '—')}</td>
      <td>${escHtml(lead.phone || '—')}</td>
      <td style="max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(lead.message || lead.question || '—')}</td>
      <td>${formatDate(lead.createdAt)}</td>
      <td>
        <div style="display:flex;gap:6px">
          ${!lead.read
            ? `<button class="btn btn-ghost btn-sm" data-mark-read="${escHtml(lead.id)}" title="Mark as read">👁 Read</button>`
            : `<span class="badge badge-muted">Read</span>`
          }
          <button class="btn btn-danger btn-sm" data-delete-lead="${escHtml(lead.id)}" title="Delete">🗑</button>
        </div>
      </td>
    </tr>
  `).join('');

  // Bind row actions
  leadsBody.querySelectorAll('[data-mark-read]').forEach(btn => {
    btn.addEventListener('click', () => markRead(btn.dataset.markRead));
  });
  leadsBody.querySelectorAll('[data-delete-lead]').forEach(btn => {
    btn.addEventListener('click', () => deleteLead(btn.dataset.deleteLead));
  });
}

/* ── Mark lead as read ─────────────────────────────────────── */
async function markRead(id) {
  const db = firebase.database();
  try {
    await db.ref(`businesses/${currentUser.uid}/leads/${id}`).update({ read: true });
  } catch (err) {
    toast('Could not update lead.', 'error');
  }
}

/* ── Delete lead ───────────────────────────────────────────── */
async function deleteLead(id) {
  if (!confirm('Delete this lead? This cannot be undone.')) return;
  const db = firebase.database();
  try {
    await db.ref(`businesses/${currentUser.uid}/leads/${id}`).remove();
    toast('Lead deleted.', 'success');
  } catch (err) {
    toast('Failed to delete lead.', 'error');
  }
}

/* ── Export to CSV ─────────────────────────────────────────── */
function exportCSV() {
  if (!allLeads.length) { toast('No leads to export.', 'info'); return; }

  const headers = ['Name', 'Email', 'Phone', 'Message', 'Date'];
  const rows = allLeads.map(l => [
    l.visitorName || l.name || '',
    l.email || '',
    l.phone || '',
    (l.message || l.question || '').replace(/"/g, '""'),
    l.createdAt ? new Date(l.createdAt).toISOString() : ''
  ].map(v => `"${v}"`).join(','));

  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'drexora-leads.csv';
  a.click();
  URL.revokeObjectURL(url);
  toast('Leads exported as CSV.', 'success');
}

/* ── Bind events ───────────────────────────────────────────── */
function bindEvents() {
  searchInp?.addEventListener('input', renderLeads);
  exportBtn?.addEventListener('click', exportCSV);

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('btn-primary'));
      btn.classList.add('btn-primary');
      filterState = btn.dataset.filter;
      renderLeads();
    });
  });
}
