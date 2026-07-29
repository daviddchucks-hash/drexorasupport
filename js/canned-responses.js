/**
 * canned-responses.js — ES6 Module
 * Manage canned (pre-saved) replies for live agents.
 */

import {
  requireAuth, setupSidebar, toast, escHtml,
  getWorkspaceUid, getCurrentUserRole, getUserRecord, timeAgo
} from './app.js';

let currentUser  = null;
let workspaceUid = null;
let userRole     = null;
let allCanned    = {};
let searchQuery  = '';
let filterCat    = '';
let editingId    = null;

requireAuth(async (user, wid) => {
  currentUser  = user;
  workspaceUid = wid;
  userRole     = await getCurrentUserRole();
  setupSidebar(user);
  loadCanned();
  bindEvents();
});

/* ── Load canned responses ─────────────────────────────────── */
function loadCanned() {
  firebase.database()
    .ref(`businesses/${workspaceUid}/cannedResponses`)
    .on('value', snap => {
      allCanned = snap.val() || {};
      renderCanned();
      updateCategoryFilter();
    });
}

/* ── Render list ───────────────────────────────────────────── */
function renderCanned() {
  const list = document.getElementById('canned-list');
  if (!list) return;

  const entries = Object.entries(allCanned).filter(([, r]) => {
    const matchSearch = !searchQuery ||
      (r.title || '').toLowerCase().includes(searchQuery) ||
      (r.body  || '').toLowerCase().includes(searchQuery) ||
      (r.category || '').toLowerCase().includes(searchQuery);
    const matchCat = !filterCat || (r.category || '') === filterCat;
    return matchSearch && matchCat;
  });

  // Update stats
  const totalEl = document.getElementById('stat-total-canned');
  if (totalEl) totalEl.textContent = Object.keys(allCanned).length;
  const cats = [...new Set(Object.values(allCanned).map(r => r.category).filter(Boolean))];
  const catsEl = document.getElementById('stat-canned-categories');
  if (catsEl) catsEl.textContent = cats.length;

  const countEl = document.getElementById('canned-count');
  if (countEl) countEl.textContent = `${entries.length} response${entries.length !== 1 ? 's' : ''}`;

  if (!entries.length) {
    list.innerHTML = `
      <div class="empty-state" style="padding:48px 24px">
        <div class="empty-state-icon">💬</div>
        <div class="empty-state-title">${searchQuery || filterCat ? 'No matching responses' : 'No canned responses yet'}</div>
        <div class="empty-state-desc">
          ${searchQuery || filterCat
            ? 'Try a different search or category.'
            : 'Add your first response using the "+ Add Response" button above. Agents will be able to click them during live conversations.'}
        </div>
      </div>`;
    return;
  }

  const canEdit = ['owner', 'admin', 'agent'].includes(userRole);

  list.innerHTML = entries.map(([id, r]) => `
    <div style="background:var(--surface-raised);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px 16px;transition:border-color .15s"
         onmouseenter="this.style.borderColor='var(--primary-light)'" onmouseleave="this.style.borderColor='var(--border)'">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;flex-wrap:wrap">
            <span style="font-weight:700;font-size:.9rem">${escHtml(r.title || 'Untitled')}</span>
            ${r.category ? `<span class="badge badge-primary" style="font-size:.68rem">${escHtml(r.category)}</span>` : ''}
          </div>
          <div style="font-size:.85rem;color:var(--text-secondary);line-height:1.55;white-space:pre-wrap;word-break:break-word">${escHtml(r.body || '')}</div>
          <div style="font-size:.72rem;color:var(--text-muted);margin-top:6px">
            Added ${r.createdAt ? timeAgo(r.createdAt) : '—'}
            ${r.createdByName ? ` · by ${escHtml(r.createdByName)}` : ''}
          </div>
        </div>
        ${canEdit ? `
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn btn-ghost btn-sm" data-edit="${escHtml(id)}" style="font-size:.75rem">✏️ Edit</button>
          <button class="btn btn-danger btn-sm" data-delete="${escHtml(id)}" style="font-size:.75rem">🗑 Delete</button>
        </div>` : ''}
      </div>
    </div>`).join('');

  // Bind edit/delete
  list.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.edit));
  });
  list.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => deleteResponse(btn.dataset.delete));
  });
}

/* ── Update category filter dropdown ──────────────────────── */
function updateCategoryFilter() {
  const cats = [...new Set(Object.values(allCanned).map(r => r.category).filter(Boolean))].sort();
  const select = document.getElementById('canned-category-filter');
  const current = select?.value || '';
  if (select) {
    select.innerHTML = '<option value="">All Categories</option>' +
      cats.map(c => `<option value="${escHtml(c)}" ${current === c ? 'selected' : ''}>${escHtml(c)}</option>`).join('');
  }
  // Also update datalist for add modal
  const dl = document.getElementById('category-suggestions');
  if (dl) {
    dl.innerHTML = cats.map(c => `<option value="${escHtml(c)}">`).join('');
  }
}

/* ── Open add modal ─────────────────────────────────────────── */
function openAddModal() {
  editingId = null;
  document.getElementById('canned-modal-title').textContent = 'Add Canned Response';
  document.getElementById('canned-title-input').value    = '';
  document.getElementById('canned-category-input').value = '';
  document.getElementById('canned-body-input').value     = '';
  document.getElementById('save-canned-btn').textContent = 'Save Response';
  document.getElementById('canned-modal').classList.add('open');
  setTimeout(() => document.getElementById('canned-title-input').focus(), 80);
}

/* ── Open edit modal ────────────────────────────────────────── */
function openEditModal(id) {
  const r = allCanned[id];
  if (!r) return;
  editingId = id;
  document.getElementById('canned-modal-title').textContent = 'Edit Canned Response';
  document.getElementById('canned-title-input').value    = r.title    || '';
  document.getElementById('canned-category-input').value = r.category || '';
  document.getElementById('canned-body-input').value     = r.body     || '';
  document.getElementById('save-canned-btn').textContent = 'Update Response';
  document.getElementById('canned-modal').classList.add('open');
}

function closeModal() {
  document.getElementById('canned-modal').classList.remove('open');
}

/* ── Save / Update ──────────────────────────────────────────── */
async function saveResponse() {
  const title    = document.getElementById('canned-title-input')?.value.trim();
  const category = document.getElementById('canned-category-input')?.value.trim();
  const body     = document.getElementById('canned-body-input')?.value.trim();
  if (!title || !body) { toast('Title and response text are required.', 'warning'); return; }

  const btn = document.getElementById('save-canned-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  try {
    const db  = firebase.database();
    const rec = await getUserRecord();
    const entry = {
      title, body,
      category:       category || '',
      updatedAt:      firebase.database.ServerValue.TIMESTAMP,
      updatedByUid:   currentUser.uid,
      updatedByName:  rec?.name || currentUser.email.split('@')[0]
    };

    if (editingId) {
      await db.ref(`businesses/${workspaceUid}/cannedResponses/${editingId}`).update(entry);
      toast('Response updated.', 'success');
    } else {
      entry.createdAt      = firebase.database.ServerValue.TIMESTAMP;
      entry.createdByUid   = currentUser.uid;
      entry.createdByName  = rec?.name || currentUser.email.split('@')[0];
      await db.ref(`businesses/${workspaceUid}/cannedResponses`).push(entry);
      toast('Canned response saved! Agents can now use it in conversations.', 'success');
    }
    closeModal();
  } catch { toast('Failed to save.', 'error'); }
  finally  { if (btn) { btn.disabled = false; btn.textContent = editingId ? 'Update Response' : 'Save Response'; } }
}

/* ── Delete ─────────────────────────────────────────────────── */
async function deleteResponse(id) {
  if (!confirm('Delete this canned response? This cannot be undone.')) return;
  try {
    await firebase.database().ref(`businesses/${workspaceUid}/cannedResponses/${id}`).remove();
    toast('Response deleted.', 'info');
  } catch { toast('Failed to delete.', 'error'); }
}

/* ── Bind events ────────────────────────────────────────────── */
function bindEvents() {
  document.getElementById('add-canned-btn')?.addEventListener('click', openAddModal);
  document.getElementById('close-canned-modal')?.addEventListener('click', closeModal);
  document.getElementById('cancel-canned-modal')?.addEventListener('click', closeModal);
  document.getElementById('save-canned-btn')?.addEventListener('click', saveResponse);

  document.getElementById('canned-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });

  document.getElementById('canned-search')?.addEventListener('input', e => {
    searchQuery = e.target.value.toLowerCase();
    renderCanned();
  });

  document.getElementById('canned-category-filter')?.addEventListener('change', e => {
    filterCat = e.target.value;
    renderCanned();
  });

  // Save on Enter (Ctrl+Enter in textarea, Enter in title input)
  document.getElementById('canned-title-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('canned-body-input')?.focus(); }
  });
}
