/**
 * settings.js — ES6 Module
 * Business settings: profile, branding, widget config, account.
 */

import { requireAuth, setupSidebar, toast, escHtml, copyToClipboard } from './app.js';

/* ── State ─────────────────────────────────────────────────── */
let currentUser = null;
let profile     = {};
let settingsFaqs = {};   // { faqId: { question, answer } }
let editingFaqId = null; // null = adding new, string = editing existing

/* ── DOM refs ──────────────────────────────────────────────── */
const profileForm  = document.getElementById('profile-form');
const logoInput    = document.getElementById('logo-upload');
const logoPreview  = document.getElementById('logo-preview');
const colourInput  = document.getElementById('theme-color');
const colourSwatches = document.querySelectorAll('.colour-swatch');
const deleteBtn    = document.getElementById('btn-delete-account');
const pwForm       = document.getElementById('pw-form');
const copyCodeBtn  = document.getElementById('copy-code-btn');
const installCode  = document.getElementById('install-code-display');

/* ── Preset colours ────────────────────────────────────────── */
const PRESET_COLOURS = [
  '#C9A227', '#E4BC5A', '#D4A843', '#10b981',
  '#f59e0b', '#ef4444', '#ec4899', '#6366f1',
  '#0ea5e9', '#14b8a6'
];

/* ── Init ──────────────────────────────────────────────────── */
requireAuth(user => {
  currentUser = user;
  setupSidebar(user);
  loadProfile(user.uid);
  loadSettingsFAQs(user.uid);
  renderColourSwatches();
  bindEvents();
});

/* ── Load profile ──────────────────────────────────────────── */
async function loadProfile(uid) {
  const db = firebase.database();
  try {
    const snap = await db.ref(`businesses/${uid}/profile`).once('value');
    profile = snap.val() || {};
    populateForm();
  } catch (err) {
    toast('Failed to load settings.', 'error');
  }
}

/* ── Populate form fields ──────────────────────────────────── */
function populateForm() {
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };

  setVal('biz-name', profile.name);
  setVal('welcome-msg', profile.welcomeMessage);
  setVal('theme-color', profile.themeColor || '#C9A227');
  setVal('chat-title', profile.chatTitle || '');

  // Logo preview
  if (logoPreview) {
    if (profile.logoUrl) {
      logoPreview.innerHTML = `<img src="${profile.logoUrl}" alt="logo">`;
    } else {
      logoPreview.textContent = (profile.name || 'B').slice(0, 2).toUpperCase();
    }
  }

  // Colour swatch active state
  syncSwatchActive(profile.themeColor || '#C9A227');

  // Installation code
  if (installCode) {
    const snippet = `<script src="https://daviddchucks-hash.github.io/drexorasupport/widget/embed.js" data-business="${currentUser.uid}"><\/script>`;
    installCode.textContent = snippet;
  }
}

/* ── Render colour swatches ────────────────────────────────── */
function renderColourSwatches() {
  const container = document.getElementById('colour-swatches');
  if (!container) return;

  container.innerHTML = PRESET_COLOURS.map(c => `
    <button type="button" class="colour-swatch" data-colour="${c}"
            style="background:${c}" title="${c}"></button>
  `).join('');

  container.querySelectorAll('.colour-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = btn.dataset.colour;
      if (colourInput) colourInput.value = c;
      syncSwatchActive(c);
    });
  });
}

function syncSwatchActive(colour) {
  document.querySelectorAll('.colour-swatch').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.colour === colour);
  });
}

/* ── Logo upload ───────────────────────────────────────────── */
async function uploadLogo(file) {
  if (!file) return null;
  if (file.size > 2 * 1024 * 1024) { toast('Logo must be under 2 MB.', 'warning'); return null; }
  if (!file.type.startsWith('image/')) { toast('Please upload an image file.', 'warning'); return null; }

  toast('Uploading logo…', 'info');
  try {
    const storage = firebase.storage();
    const ref     = storage.ref(`logos/${currentUser.uid}/${file.name}`);
    await ref.put(file);
    const url = await ref.getDownloadURL();
    return url;
  } catch (err) {
    console.error('Logo upload error:', err);
    toast('Logo upload failed. Check Firebase Storage rules.', 'error');
    return null;
  }
}

/* ── Save profile ──────────────────────────────────────────── */
async function saveProfile(e) {
  e.preventDefault();

  const name           = document.getElementById('biz-name')?.value.trim();
  const welcomeMessage = document.getElementById('welcome-msg')?.value.trim();
  const themeColor     = document.getElementById('theme-color')?.value || '#C9A227';
  const chatTitle      = document.getElementById('chat-title')?.value.trim();

  if (!name) { toast('Business name is required.', 'warning'); return; }

  const saveBtn = document.getElementById('save-profile-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

  try {
    let logoUrl = profile.logoUrl || '';

    // Handle logo upload if a new file was selected
    const logoFile = logoInput?.files?.[0];
    if (logoFile) {
      const uploaded = await uploadLogo(logoFile);
      if (uploaded) logoUrl = uploaded;
    }

    const updates = { name, welcomeMessage, themeColor, chatTitle, logoUrl, updatedAt: firebase.database.ServerValue.TIMESTAMP };
    await firebase.database().ref(`businesses/${currentUser.uid}/profile`).update(updates);

    profile = { ...profile, ...updates };
    toast('Settings saved successfully!', 'success');

    // Update logo preview
    if (logoPreview) {
      if (logoUrl) logoPreview.innerHTML = `<img src="${logoUrl}" alt="logo">`;
      else logoPreview.textContent = name.slice(0, 2).toUpperCase();
    }
  } catch (err) {
    console.error('Save profile error:', err);
    toast('Failed to save settings.', 'error');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Settings'; }
  }
}

/* ── Change password ───────────────────────────────────────── */
async function changePassword(e) {
  e.preventDefault();
  const current  = document.getElementById('current-pw')?.value;
  const newPw    = document.getElementById('new-pw')?.value;
  const confirm  = document.getElementById('confirm-pw')?.value;

  if (newPw !== confirm) { toast('New passwords do not match.', 'warning'); return; }
  if (newPw.length < 6)  { toast('Password must be at least 6 characters.', 'warning'); return; }

  const pwBtn = document.getElementById('save-pw-btn');
  if (pwBtn) { pwBtn.disabled = true; pwBtn.textContent = 'Updating…'; }

  try {
    // Re-authenticate first
    const cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, current);
    await currentUser.reauthenticateWithCredential(cred);
    await currentUser.updatePassword(newPw);
    toast('Password updated successfully.', 'success');
    pwForm.reset();
  } catch (err) {
    const msgs = { 'auth/wrong-password': 'Current password is incorrect.', 'auth/weak-password': 'New password is too weak.' };
    toast(msgs[err.code] || err.message, 'error');
  } finally {
    if (pwBtn) { pwBtn.disabled = false; pwBtn.textContent = 'Update Password'; }
  }
}

/* ── Delete account ────────────────────────────────────────── */
async function deleteAccount() {
  const confirmed = prompt('Type DELETE to permanently delete your account and all data:');
  if (confirmed !== 'DELETE') return;

  try {
    // Remove business data
    await firebase.database().ref(`businesses/${currentUser.uid}`).remove();
    // Delete auth account
    await currentUser.delete();
    window.location.href = 'index.html';
  } catch (err) {
    if (err.code === 'auth/requires-recent-login') {
      toast('Please sign out and sign back in before deleting your account.', 'warning');
    } else {
      toast('Failed to delete account: ' + err.message, 'error');
    }
  }
}

/* ── Load FAQs (real-time) for settings page ───────────────── */
function loadSettingsFAQs(uid) {
  const db = firebase.database();
  db.ref(`businesses/${uid}/faqs`).on('value', snap => {
    settingsFaqs = snap.val() || {};
    renderSettingsFAQs();
  });
}

/* ── Render FAQ list on settings page ──────────────────────── */
function renderSettingsFAQs() {
  const list = document.getElementById('settings-faq-list');
  if (!list) return;

  const entries = Object.entries(settingsFaqs);

  if (!entries.length) {
    list.innerHTML = `
      <div style="text-align:center;padding:24px 16px;color:var(--text-muted);font-size:.85rem">
        No FAQs yet. Add your first question above — it will appear as a clickable chip in the widget.
      </div>`;
    return;
  }

  list.innerHTML = entries.map(([id, faq]) => `
    <div class="faq-settings-item" data-faq-id="${escHtml(id)}" style="
      display:flex;align-items:flex-start;gap:12px;padding:12px 14px;
      border:1px solid var(--glass-border);border-radius:10px;margin-bottom:8px;
      background:var(--glass-bg);transition:background .15s;">
      <div style="flex:1;min-width:0">
        <div id="faq-q-display-${escHtml(id)}" style="font-size:.85rem;font-weight:600;color:var(--text-primary);margin-bottom:3px">
          ❓ ${escHtml(faq.question)}
        </div>
        <div id="faq-a-display-${escHtml(id)}" style="font-size:.8rem;color:var(--text-secondary);line-height:1.5">
          ${escHtml(faq.answer)}
        </div>
        <div class="faq-edit-row" id="faq-edit-row-${escHtml(id)}" style="display:none;margin-top:8px;display:none;flex-direction:column;gap:6px">
          <input class="form-input" type="text" id="faq-edit-q-${escHtml(id)}" value="${escHtml(faq.question)}" placeholder="Question…" style="font-size:.82rem;padding:7px 10px">
          <input class="form-input" type="text" id="faq-edit-a-${escHtml(id)}" value="${escHtml(faq.answer)}" placeholder="Answer…" style="font-size:.82rem;padding:7px 10px">
          <div style="display:flex;gap:8px">
            <button class="btn btn-primary btn-sm" onclick="saveInlineEditFAQ('${escHtml(id)}')">Save</button>
            <button class="btn btn-ghost btn-sm" onclick="cancelInlineEditFAQ('${escHtml(id)}')">Cancel</button>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn btn-ghost btn-sm" onclick="startInlineEditFAQ('${escHtml(id)}')" title="Edit">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="deleteSettingsFAQ('${escHtml(id)}')" title="Delete">🗑</button>
      </div>
    </div>
  `).join('');
}

/* ── Inline FAQ edit helpers (exposed to onclick) ──────────── */
window.startInlineEditFAQ = function(id) {
  const row = document.getElementById(`faq-edit-row-${id}`);
  const qEl = document.getElementById(`faq-q-display-${id}`);
  const aEl = document.getElementById(`faq-a-display-${id}`);
  if (row)  { row.style.display = 'flex'; }
  if (qEl)  { qEl.style.display = 'none'; }
  if (aEl)  { aEl.style.display = 'none'; }
  editingFaqId = id;
};

window.cancelInlineEditFAQ = function(id) {
  const row = document.getElementById(`faq-edit-row-${id}`);
  const qEl = document.getElementById(`faq-q-display-${id}`);
  const aEl = document.getElementById(`faq-a-display-${id}`);
  if (row)  { row.style.display = 'none'; }
  if (qEl)  { qEl.style.display = ''; }
  if (aEl)  { aEl.style.display = ''; }
  editingFaqId = null;
};

window.saveInlineEditFAQ = async function(id) {
  const qInput = document.getElementById(`faq-edit-q-${id}`);
  const aInput = document.getElementById(`faq-edit-a-${id}`);
  const question = qInput?.value.trim();
  const answer   = aInput?.value.trim();
  if (!question || !answer) { toast('Both question and answer are required.', 'warning'); return; }

  try {
    await firebase.database()
      .ref(`businesses/${currentUser.uid}/faqs/${id}`)
      .update({ question, answer, updatedAt: firebase.database.ServerValue.TIMESTAMP });
    toast('FAQ updated.', 'success');
    editingFaqId = null;
  } catch (err) {
    toast('Failed to update FAQ.', 'error');
  }
};

window.deleteSettingsFAQ = async function(id) {
  if (!confirm('Delete this FAQ?')) return;
  try {
    await firebase.database().ref(`businesses/${currentUser.uid}/faqs/${id}`).remove();
    toast('FAQ deleted.', 'success');
  } catch (err) {
    toast('Failed to delete FAQ.', 'error');
  }
};

/* ── Add new FAQ from inline form ──────────────────────────── */
async function addSettingsFAQ(e) {
  e.preventDefault();
  const qInput = document.getElementById('faq-q-input');
  const aInput = document.getElementById('faq-a-input');
  const question = qInput?.value.trim();
  const answer   = aInput?.value.trim();

  if (!question || !answer) { toast('Please fill in both question and answer.', 'warning'); return; }

  const btn = document.getElementById('faq-add-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }

  try {
    await firebase.database()
      .ref(`businesses/${currentUser.uid}/faqs`)
      .push({ question, answer, createdAt: firebase.database.ServerValue.TIMESTAMP });
    toast('FAQ added! It\'s now live in the widget.', 'success');
    if (qInput) qInput.value = '';
    if (aInput) aInput.value = '';
  } catch (err) {
    toast('Failed to add FAQ.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '+ Add FAQ'; }
  }
}

/* ── Bind events ───────────────────────────────────────────── */
function bindEvents() {
  profileForm?.addEventListener('submit', saveProfile);
  pwForm?.addEventListener('submit', changePassword);
  deleteBtn?.addEventListener('click', deleteAccount);

  // FAQ inline form
  document.getElementById('faq-inline-form')?.addEventListener('submit', addSettingsFAQ);

  // Live logo preview
  logoInput?.addEventListener('change', () => {
    const file = logoInput.files?.[0];
    if (file && logoPreview) {
      const reader = new FileReader();
      reader.onload = e => { logoPreview.innerHTML = `<img src="${e.target.result}" alt="logo">`; };
      reader.readAsDataURL(file);
    }
  });

  // Colour input sync to swatches
  colourInput?.addEventListener('input', e => syncSwatchActive(e.target.value));

  // Copy install code
  copyCodeBtn?.addEventListener('click', () => {
    const code = installCode?.textContent;
    if (code) copyToClipboard(code, copyCodeBtn);
  });
}
