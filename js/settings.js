/**
 * settings.js — ES6 Module
 * Business settings: profile, branding, widget config, account.
 */

import { requireAuth, setupSidebar, toast, escHtml, copyToClipboard } from './app.js';

/* ── State ─────────────────────────────────────────────────── */
let currentUser = null;
let profile     = {};

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

/* ── Bind events ───────────────────────────────────────────── */
function bindEvents() {
  profileForm?.addEventListener('submit', saveProfile);
  pwForm?.addEventListener('submit', changePassword);
  deleteBtn?.addEventListener('click', deleteAccount);

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
