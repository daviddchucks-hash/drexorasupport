/**
 * knowledge-base.js — ES6 Module
 * Workspace-aware FAQ management.
 */

import { requireAuth, setupSidebar, toast, escHtml, getWorkspaceUid } from './app.js';

let currentUser  = null;
let workspaceUid = null;
let faqs         = {};
let editingId    = null;

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

requireAuth(async (user, wid) => {
  currentUser  = user;
  workspaceUid = wid;
  setupSidebar(user);
  loadFAQs();
  bindEvents();
});

function loadFAQs() {
  const db = firebase.database();
  db.ref(`businesses/${workspaceUid}/faqs`).on('value', snap => {
    faqs = snap.val() || {};
    renderFAQs(Object.entries(faqs));
  });
}

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
        <button class="btn btn-ghost btn-sm" data-edit="${escHtml(id)}">✏️ Edit</button>
        <button class="btn btn-danger btn-sm" data-delete="${escHtml(id)}">🗑 Delete</button>
      </div>
    </div>`).join('');

  faqList.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.dataset.edit));
  });
  faqList.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => deleteFAQ(btn.dataset.delete));
  });
}

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

async function saveFAQ(e) {
  e.preventDefault();
  const question = inputQ.value.trim();
  const answer   = inputA.value.trim();
  if (!question || !answer) { toast('Please fill in both question and answer.', 'warning'); return; }

  const db = firebase.database();
  try {
    if (editingId) {
      await db.ref(`businesses/${workspaceUid}/faqs/${editingId}`).update({
        question, answer, updatedAt: firebase.database.ServerValue.TIMESTAMP
      });
      toast('FAQ updated successfully.', 'success');
    } else {
      await db.ref(`businesses/${workspaceUid}/faqs`).push({
        question, answer, createdAt: firebase.database.ServerValue.TIMESTAMP
      });
      toast('FAQ added successfully.', 'success');
    }
    closeModal();
  } catch (err) {
    toast('Failed to save FAQ. Please try again.', 'error');
  }
}

async function deleteFAQ(id) {
  if (!confirm('Delete this FAQ? This cannot be undone.')) return;
  const db = firebase.database();
  try {
    await db.ref(`businesses/${workspaceUid}/faqs/${id}`).remove();
    toast('FAQ deleted.', 'success');
  } catch { toast('Failed to delete FAQ.', 'error'); }
}

function bindEvents() {
  addBtn?.addEventListener('click', () => openModal());
  modalClose?.addEventListener('click', closeModal);
  modalCancel?.addEventListener('click', closeModal);
  faqForm?.addEventListener('submit', saveFAQ);
  modalEl?.addEventListener('click', e => { if (e.target === modalEl) closeModal(); });
  searchInp?.addEventListener('input', () => renderFAQs(Object.entries(faqs)));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modalEl?.classList.contains('open')) closeModal();
  });
}
