/**
 * settings.js — ES6 Module
 * Workspace settings: profile, branding, widget config, auto-assignment,
 * AI settings, account management.
 */

import {
  requireAuth, setupSidebar, toast, escHtml, copyToClipboard,
  getWorkspaceUid, getCurrentUserRole, getUserRecord
} from './app.js';

let currentUser  = null;
let workspaceUid = null;
let userRole     = null;
let profile      = {};
let settingsFaqs = {};
let editingFaqId = null;

const profileForm = () => document.getElementById('profile-form');
const logoInput   = () => document.getElementById('logo-upload');
const logoPreview = () => document.getElementById('logo-preview');
const colourInput = () => document.getElementById('theme-color');

const PRESET_COLOURS = [
  '#C9A227','#E4BC5A','#D4A843','#10b981',
  '#f59e0b','#ef4444','#ec4899','#6366f1',
  '#0ea5e9','#14b8a6'
];

requireAuth(async (user, wid) => {
  currentUser  = user;
  workspaceUid = wid;
  userRole     = await getCurrentUserRole();
  setupSidebar(user);
  loadProfile();
  loadSettingsFAQs();
  loadWorkspaceSettings();
  renderColourSwatches();
  bindEvents();
});

async function loadProfile() {
  const db = firebase.database();
  try {
    const snap = await db.ref(`businesses/${workspaceUid}/profile`).once('value');
    profile = snap.val() || {};
    populateForm();
  } catch { toast('Failed to load settings.', 'error'); }
}

function populateForm() {
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  setVal('biz-name',    profile.name);
  setVal('welcome-msg', profile.welcomeMessage);
  setVal('theme-color', profile.themeColor || '#C9A227');
  setVal('chat-title',  profile.chatTitle  || '');

  const lp = logoPreview();
  if (lp) {
    lp.innerHTML = profile.logoUrl
      ? `<img src="${escHtml(profile.logoUrl)}" alt="logo">`
      : escHtml((profile.name || 'B').slice(0, 2).toUpperCase());
  }
  syncSwatchActive(profile.themeColor || '#C9A227');

  const installCode = document.getElementById('install-code-display');
  if (installCode) {
    const snippet = `<script src="https://daviddchucks-hash.github.io/drexorasupport/widget/embed.js" data-business="${workspaceUid}"><\/script>`;
    installCode.textContent = snippet;
  }
}

async function loadWorkspaceSettings() {
  const db   = firebase.database();
  const snap = await db.ref(`businesses/${workspaceUid}/settings`).once('value');
  const s    = snap.val() || {};

  const modeEl = document.getElementById('assignment-mode');
  if (modeEl) modeEl.value = s.assignment?.mode || 'manual';

  const enabledEl = document.getElementById('auto-assign-enabled');
  if (enabledEl) enabledEl.checked = s.assignment?.enabled || false;

  const aiEl = document.getElementById('ai-enabled');
  if (aiEl) aiEl.checked = s.aiEnabled !== false;

  const widgetEl = document.getElementById('widget-enabled');
  if (widgetEl) widgetEl.checked = s.widgetEnabled !== false;
}

async function saveWorkspaceSettings() {
  const mode    = document.getElementById('assignment-mode')?.value    || 'manual';
  const enabled = document.getElementById('auto-assign-enabled')?.checked || false;
  const ai      = document.getElementById('ai-enabled')?.checked !== false;
  const widget  = document.getElementById('widget-enabled')?.checked !== false;

  const db = firebase.database();
  try {
    await db.ref(`businesses/${workspaceUid}/settings`).update({
      'assignment/mode':    mode,
      'assignment/enabled': enabled,
      aiEnabled:    ai,
      widgetEnabled: widget
    });
    toast('Workspace settings saved.', 'success');
  } catch { toast('Failed to save workspace settings.', 'error'); }
}

function renderColourSwatches() {
  const container = document.getElementById('colour-swatches');
  if (!container) return;
  container.innerHTML = PRESET_COLOURS.map(c => `
    <button type="button" class="colour-swatch" data-colour="${c}" style="background:${c}" title="${c}"></button>`).join('');
  container.querySelectorAll('.colour-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = btn.dataset.colour;
      const ci = colourInput();
      if (ci) ci.value = c;
      syncSwatchActive(c);
    });
  });
}

function syncSwatchActive(colour) {
  document.querySelectorAll('.colour-swatch').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.colour === colour);
  });
}

async function uploadLogo(file) {
  if (!file) return null;
  if (file.size > 2 * 1024 * 1024) { toast('Logo must be under 2 MB.', 'warning'); return null; }
  try {
    const storage = firebase.storage();
    const ref     = storage.ref(`logos/${workspaceUid}/${Date.now()}_${file.name}`);
    await ref.put(file);
    return await ref.getDownloadURL();
  } catch { toast('Logo upload failed.', 'error'); return null; }
}

async function saveProfile(e) {
  e.preventDefault();
  const btn = document.getElementById('save-profile-btn');
  if (btn) { btn.disabled=true; btn.textContent='Saving…'; }

  try {
    const db   = firebase.database();
    const name = document.getElementById('biz-name')?.value.trim() || '';
    const welcome = document.getElementById('welcome-msg')?.value.trim() || '';
    const color   = colourInput()?.value || '#C9A227';
    const title   = document.getElementById('chat-title')?.value.trim() || '';

    let logoUrl = profile.logoUrl || '';
    const file  = logoInput()?.files?.[0];
    if (file) {
      const url = await uploadLogo(file);
      if (url) logoUrl = url;
    }

    await db.ref(`businesses/${workspaceUid}/profile`).update({ name, welcomeMessage: welcome, themeColor: color, chatTitle: title, logoUrl });
    profile = { ...profile, name, welcomeMessage: welcome, themeColor: color, chatTitle: title, logoUrl };
    toast('Settings saved.', 'success');
  } catch { toast('Failed to save settings.', 'error'); }
  finally  {
    if (btn) { btn.disabled=false; btn.textContent='Save Settings'; }
  }
}

/* ── FAQs ────────────────────────────────────────────────── */
async function loadSettingsFAQs() {
  const db = firebase.database();
  db.ref(`businesses/${workspaceUid}/faqs`).on('value', snap => {
    settingsFaqs = snap.val() || {};
    renderFAQs();
  });
}

function renderFAQs() {
  const list = document.getElementById('faq-list');
  if (!list) return;
  const arr  = Object.entries(settingsFaqs);
  if (!arr.length) {
    list.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:.85rem">
      No FAQs yet. Add your first one below.</div>`;
    return;
  }
  list.innerHTML = arr.map(([id, faq]) => `
    <div class="faq-item">
      <div class="faq-item-body">
        <div class="faq-question">${escHtml(faq.question)}</div>
        <div class="faq-answer">${escHtml(faq.answer)}</div>
      </div>
      <div class="faq-actions">
        <button class="btn btn-ghost btn-sm" onclick="editFaq('${escHtml(id)}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteFaq('${escHtml(id)}')">Delete</button>
      </div>
    </div>`).join('');
}

window.deleteFaq = async function(id) {
  if (!confirm('Delete this FAQ?')) return;
  await firebase.database().ref(`businesses/${workspaceUid}/faqs/${id}`).remove();
  toast('FAQ deleted.', 'info');
};

window.editFaq = function(id) {
  editingFaqId = id;
  const faq = settingsFaqs[id];
  if (!faq) return;
  const q = document.getElementById('faq-question');
  const a = document.getElementById('faq-answer');
  if (q) q.value = faq.question;
  if (a) a.value = faq.answer;
  const btn = document.getElementById('faq-add-btn');
  if (btn) btn.textContent = 'Update FAQ';
};

async function addSettingsFAQ(e) {
  e?.preventDefault();
  const q = document.getElementById('faq-question')?.value.trim();
  const a = document.getElementById('faq-answer')?.value.trim();
  if (!q || !a) { toast('Both fields are required.', 'warning'); return; }

  const btn = document.getElementById('faq-add-btn');
  if (btn) { btn.disabled=true; btn.textContent='Saving…'; }

  try {
    const db = firebase.database();
    if (editingFaqId) {
      await db.ref(`businesses/${workspaceUid}/faqs/${editingFaqId}`).update({ question: q, answer: a });
      editingFaqId = null;
      toast('FAQ updated.', 'success');
    } else {
      await db.ref(`businesses/${workspaceUid}/faqs`).push({ question: q, answer: a, createdAt: firebase.database.ServerValue.TIMESTAMP });
      toast('FAQ added! It\'s now live in the widget.', 'success');
    }
    const qEl = document.getElementById('faq-question');
    const aEl = document.getElementById('faq-answer');
    if (qEl) qEl.value = '';
    if (aEl) aEl.value = '';
  } catch { toast('Failed to save FAQ.', 'error'); }
  finally  {
    if (btn) { btn.disabled=false; btn.textContent='+ Add FAQ'; }
  }
}

/* ── Password & Account ──────────────────────────────────── */
async function changePassword(e) {
  e.preventDefault();
  const current = document.getElementById('current-pw')?.value;
  const newPw   = document.getElementById('new-pw')?.value;
  const confirm = document.getElementById('confirm-pw')?.value;
  if (newPw !== confirm) { toast('Passwords do not match.', 'warning'); return; }
  if (!newPw || newPw.length < 6) { toast('Password must be at least 6 characters.', 'warning'); return; }

  try {
    const cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, current);
    await currentUser.reauthenticateWithCredential(cred);
    await currentUser.updatePassword(newPw);
    toast('Password updated.', 'success');
    document.getElementById('pw-form')?.reset();
  } catch (err) {
    if (err.code === 'auth/wrong-password') toast('Current password is incorrect.', 'error');
    else toast(err.message, 'error');
  }
}

async function deleteAccount() {
  if (userRole !== 'owner') { toast('Only the workspace owner can delete the account.', 'warning'); return; }
  const pw = prompt('Enter your password to confirm account deletion:');
  if (!pw) return;
  try {
    const cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, pw);
    await currentUser.reauthenticateWithCredential(cred);
    await firebase.database().ref(`businesses/${workspaceUid}`).remove();
    await firebase.database().ref(`userWorkspace/${currentUser.uid}`).remove();
    await currentUser.delete();
    window.location.href = 'register.html';
  } catch (err) {
    if (err.code === 'auth/wrong-password') toast('Incorrect password.', 'error');
    else toast(err.message, 'error');
  }
}

function bindEvents() {
  profileForm()?.addEventListener('submit', saveProfile);
  document.getElementById('pw-form')?.addEventListener('submit', changePassword);
  document.getElementById('btn-delete-account')?.addEventListener('click', deleteAccount);
  document.getElementById('faq-inline-form')?.addEventListener('submit', addSettingsFAQ);
  document.getElementById('save-workspace-settings-btn')?.addEventListener('click', saveWorkspaceSettings);

  logoInput()?.addEventListener('change', () => {
    const file = logoInput()?.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = ev => {
        const lp = logoPreview();
        if (lp) lp.innerHTML = `<img src="${ev.target.result}" alt="logo">`;
      };
      reader.readAsDataURL(file);
    }
  });

  colourInput()?.addEventListener('input', e => syncSwatchActive(e.target.value));

  const copyCodeBtn = document.getElementById('copy-code-btn');
  const installCode = document.getElementById('install-code-display');
  copyCodeBtn?.addEventListener('click', () => {
    const code = installCode?.textContent;
    if (code) copyToClipboard(code, copyCodeBtn);
  });
}
