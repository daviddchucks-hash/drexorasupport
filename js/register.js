/**
 * register.js — ES6 Module
 * Handles new account registration with Firebase Auth + Realtime DB.
 *
 * Two account types:
 *  - company:     Creates a full business workspace (owner role).
 *  - team_member: Creates an auth account only; waits for an invitation from
 *                 a company admin before being linked to a workspace.
 */

const form      = document.getElementById('register-form');
const btnSubmit = document.getElementById('btn-submit');
const errBox    = document.getElementById('error-msg');

let selectedType = 'company'; // default

/* ── Account type cards ─────────────────────────────────── */
document.querySelectorAll('.account-type-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.account-type-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedType = card.dataset.type;
    _applyTypeUI(selectedType);
  });
});

function _applyTypeUI(type) {
  const isCompany = type === 'company';

  document.getElementById('field-business-name').style.display  = isCompany ? '' : 'none';
  document.getElementById('field-full-name').style.display       = isCompany ? 'none' : '';
  document.getElementById('team-member-notice').style.display    = isCompany ? 'none' : '';

  document.getElementById('reg-subtitle').textContent = isCompany
    ? 'Set up your business and start collecting leads today.'
    : 'Create a team account and join your company\'s workspace when invited.';

  document.getElementById('business-name').required = isCompany;
  document.getElementById('full-name').required      = !isCompany;
}

/* ── Auth redirect ──────────────────────────────────────── */
firebase.auth().onAuthStateChanged(function (user) {
  if (user) window.location.href = 'dashboard.html';
});

/* ── Helpers ────────────────────────────────────────────── */
function showError(msg) { errBox.textContent = msg; errBox.style.display = 'block'; }
function hideError()    { errBox.style.display = 'none'; }
function setLoading(on) {
  btnSubmit.disabled    = on;
  btnSubmit.textContent = on ? 'Creating account…' : 'Create Account';
}

/* ── Submit ─────────────────────────────────────────────── */
form.addEventListener('submit', async function (e) {
  e.preventDefault();
  hideError();

  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const confirm  = document.getElementById('confirm-password').value;

  if (password !== confirm) return showError('Passwords do not match.');
  if (password.length < 6)  return showError('Password must be at least 6 characters.');

  setLoading(true);

  try {
    if (selectedType === 'company') {
      await _registerCompany(email, password);
    } else {
      await _registerTeamMember(email, password);
    }
  } catch (err) {
    setLoading(false);
    const msgs = {
      'auth/email-already-in-use': 'An account with this email already exists.',
      'auth/invalid-email':        'Please enter a valid email address.',
      'auth/weak-password':        'Password is too weak. Use at least 6 characters.'
    };
    showError(msgs[err.code] || err.message);
  }
});

/* ── Company registration ───────────────────────────────── */
async function _registerCompany(email, password) {
  const businessName = document.getElementById('business-name').value.trim();
  if (!businessName) { setLoading(false); return showError('Business name is required.'); }

  // 1. Create Firebase Auth account
  const cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
  const uid  = cred.user.uid;
  const db   = firebase.database();

  // 2. Write initial business profile
  await db.ref(`businesses/${uid}/profile`).set({
    name:           businessName,
    email:          email,
    logoUrl:        '',
    themeColor:     '#C9A227',
    welcomeMessage: 'Hi! How can we help you today? Ask a question below.',
    chatTitle:      'Support Chat',
    createdAt:      firebase.database.ServerValue.TIMESTAMP,
    plan:           'free',
    timezone:       Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    language:       navigator.language || 'en'
  });

  // 3. Write workspace settings defaults
  await db.ref(`businesses/${uid}/settings`).set({
    assignment: { mode: 'manual', enabled: false },
    aiEnabled:     true,
    widgetEnabled: true
  });

  // 4. Bootstrap the owner's userWorkspace entry
  await db.ref(`userWorkspace/${uid}`).set({
    businessUid:  uid,
    role:         'owner',
    accountType:  'company',
    name:         businessName,
    email:        email,
    joinedAt:     firebase.database.ServerValue.TIMESTAMP
  });

  // 5. Add owner to team/members
  await db.ref(`businesses/${uid}/team/members/${uid}`).set({
    name:            businessName,
    email:           email,
    role:            'owner',
    status:          'online',
    lastActive:      firebase.database.ServerValue.TIMESTAMP,
    assignedTickets: 0,
    assignedChats:   0,
    photoUrl:        '',
    uid:             uid,
    joinedAt:        firebase.database.ServerValue.TIMESTAMP,
    permissions:     {}
  });

  // 6. Redirect to dashboard
  window.location.href = 'dashboard.html';
}

/* ── Team member registration ───────────────────────────── */
async function _registerTeamMember(email, password) {
  const fullName = document.getElementById('full-name').value.trim();
  if (!fullName) { setLoading(false); return showError('Full name is required.'); }

  // 1. Create Firebase Auth account
  const cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
  const uid  = cred.user.uid;
  const db   = firebase.database();

  // 2. Store a "pending setup" userWorkspace entry (no businessUid yet)
  //    When an admin invites this email and the user logs in, _acceptPendingInvitations
  //    in app.js will write the real businessUid and clear pendingSetup.
  await db.ref(`userWorkspace/${uid}`).set({
    accountType:  'team_member',
    pendingSetup: true,
    name:         fullName,
    email:        email,
    joinedAt:     firebase.database.ServerValue.TIMESTAMP
  });

  // 3. Try to accept any invitation that was already sent before they registered
  //    If accepted, app.js will handle the redirect from dashboard.
  window.location.href = 'dashboard.html';
}
