/**
 * knowledge-base.js — ES6 Module
 * FAQ management: list, add, edit, delete.
 */

import { requireAuth, setupSidebar, toast, escHtml } from './app.js';

/* ── State ─────────────────────────────────────────────────── */
let currentUser = null;
let faqs        = {};   // { faqId: { question, answer, createdAt } }
let editingId   = null; // null = new FAQ, string = editing existing

/* ── DOM refs ──────────────────────────────────────────────── */
const faqList    = document.getElementById('faq-list');
const modalEl    = document.getElementById('faq-modal');
const faqForm    = document.getElementById('faq-form');
const modalTitle = document.getElementById('modal-title');
const inputQ     = document.getElementById('faq-question');
const inputA     = document.getElementById('faq-answer');
const faqCount   = document.getElementById('faq-count');
const searchInp  = document.getElementById('faq-search');
const addBtn     = document.getElementById('btn-add-faq');
const modalClose = document.getElementById('modal-close');
const modalCancel= document.getElementById('modal-cancel');

/* ── Init ──────────────────────────────────────────────────── */
requireAuth(user => {
  currentUser = user;
  setupSidebar(user);
  loadFAQs(user.uid);
  bindEvents();
});

/* ── Load FAQs from Realtime DB ────────────────────────────── */
function loadFAQs(uid) {
  const db = firebase.database();
  db.ref(`businesses/${uid}/faqs`).on('value', snap => {
    faqs = snap.val() || {};
    renderFAQs(Object.entries(faqs));
  });
}

/* ── Render FAQ list ───────────────────────────────────────── */
function renderFAQs(entries) {
  const query = (searchInp?.value || '').toLowerCase();
  const filtered = entries.filter(([, faq]) =>
    !query ||
    (faq.question || '').toLowerCase().includes(query) ||
    (faq.answer   || '').toLowerCase().includes(query)
  );

  if (faqCount) faqCount.textContent = Object.keys(faqs).length;

  if (!filtered.length) {
    faqList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">💡</div>
        <div class="empty-state-title">${query ? 'No matching FAQs' : 'No FAQs yet'}</div>
        <div class="empty-state-desc">
          ${query ? 'Try a different search term.' : 'Add questions and answers your visitors commonly ask. The widget will use these to reply automatically.'}
        </div>
      </div>`;
    return;
  }

  faqList.innerHTML = filtered.map(([id, faq]) => `
    <div class="faq-item animate-fadeUp" data-id="${escHtml(id)}">
      <div class="faq-item-body">
        <div class="faq-question">❓ ${escHtml(faq.question)}</div>
        <div class="faq-answer">${escHtml(faq.answer)}</div>
      </div>
      <div class="faq-actions">
        <button class="btn btn-ghost btn-sm" data-edit="${escHtml(id)}" title="Edit">✏️ Edit</button>
        <button class="btn btn-danger btn-sm" data-delete="${escHtml(id)}" title="Delete">🗑 Delete</button>
      </div>
    </div>
  `).join('');

  // Attach action handlers
  faqList.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.dataset.edit));
  });
  faqList.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => deleteFAQ(btn.dataset.delete));
  });
}

/* ── Open modal (add or edit) ──────────────────────────────── */
function openModal(id = null) {
  editingId = id;
  modalTitle.textContent = id ? 'Edit FAQ' : 'Add New FAQ';

  if (id && faqs[id]) {
    inputQ.value = faqs[id].question || '';
    inputA.value = faqs[id].answer   || '';
  } else {
    faqForm.reset();
  }

  modalEl.classList.add('open');
  inputQ.focus();
}

function closeModal() {
  modalEl.classList.remove('open');
  editingId = null;
  faqForm.reset();
}

/* ── Save FAQ ──────────────────────────────────────────────── */
async function saveFAQ(e) {
  e.preventDefault();
  const question = inputQ.value.trim();
  const answer   = inputA.value.trim();

  if (!question || !answer) {
    toast('Please fill in both question and answer.', 'warning');
    return;
  }

  const db = firebase.database();
  const uid = currentUser.uid;

  try {
    if (editingId) {
      // Update existing
      await db.ref(`businesses/${uid}/faqs/${editingId}`).update({ question, answer, updatedAt: firebase.database.ServerValue.TIMESTAMP });
      toast('FAQ updated successfully.', 'success');
    } else {
      // Create new
      const newRef = db.ref(`businesses/${uid}/faqs`).push();
      await newRef.set({ question, answer, createdAt: firebase.database.ServerValue.TIMESTAMP });
      toast('FAQ added successfully.', 'success');
    }
    closeModal();
  } catch (err) {
    console.error('Save FAQ error:', err);
    toast('Failed to save FAQ. Please try again.', 'error');
  }
}

/* ── Delete FAQ ────────────────────────────────────────────── */
async function deleteFAQ(id) {
  if (!confirm('Delete this FAQ? This cannot be undone.')) return;

  const db = firebase.database();
  try {
    await db.ref(`businesses/${currentUser.uid}/faqs/${id}`).remove();
    toast('FAQ deleted.', 'success');
  } catch (err) {
    console.error('Delete FAQ error:', err);
    toast('Failed to delete FAQ.', 'error');
  }
}

/* ── Bind global events ────────────────────────────────────── */
function bindEvents() {
  addBtn?.addEventListener('click', () => openModal());
  modalClose?.addEventListener('click', closeModal);
  modalCancel?.addEventListener('click', closeModal);
  faqForm?.addEventListener('submit', saveFAQ);

  // Close modal on overlay click
  modalEl?.addEventListener('click', e => {
    if (e.target === modalEl) closeModal();
  });

  // Live search filter
  searchInp?.addEventListener('input', () => {
    renderFAQs(Object.entries(faqs));
  });

  // Keyboard escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modalEl?.classList.contains('open')) closeModal();
  });
}
