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

/**
 * FIX — Race condition guard.
 *
 * Problem: firebase.auth().onAuthStateChanged fires the moment
 * createUserWithEmailAndPassword() resolves (the Auth account exists) but
 * BEFORE the subsequent userWorkspace write finishes.  Dashboard.js then
 * calls getWorkspaceUid(), finds no record, and falls into the
 * "legacy owner bootstrap" branch — stamping the team member as owner.
 *
 * Solution: set _skipAuthRedirect = true before any createUser* call and
 * clear it only after ALL database writes are done.  The onAuthStateChanged
 * listener checks this flag and does nothing during the registration flow.
 * Redirects are performed explicitly at the end of each _register* function.
 */
let _skipAuthRedirect = false;

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

/* ── Auth redirect (only when already logged in on page load) ── */
firebase.auth().onAuthStateChanged(function (user) {
  // Do NOT redirect during an active registration — all writes must complete
  // before we navigate, otherwise dashboard bootstraps the user as owner.
  if (_skipAuthRedirect) return;
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
  // Block onAuthStateChanged from racing while we write to the DB
  _skipAuthRedirect = true;

  try {
    if (selectedType === 'company') {
      await _registerCompany(email, password);
    } else {
      await _registerTeamMember(email, password);
    }
  } catch (err) {
    _skipAuthRedirect = false; // re-enable on error so the page still works
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
  if (!businessName) { setLoading(false); _skipAuthRedirect = false; return showError('Business name is required.'); }

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

  // 6. All writes complete — safe to redirect
  _skipAuthRedirect = false;
  window.location.href = 'dashboard.html';
}

/* ── Team member registration ───────────────────────────── */
async function _registerTeamMember(email, password) {
  const fullName = document.getElementById('full-name').value.trim();
  if (!fullName) { setLoading(false); _skipAuthRedirect = false; return showError('Full name is required.'); }

  // 1. Create Firebase Auth account
  const cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
  const uid  = cred.user.uid;
  const db   = firebase.database();

  // 2. Store a "pending setup" userWorkspace entry (no businessUid yet).
  //    This MUST be written before we navigate — otherwise dashboard's
  //    getWorkspaceUid() finds nothing and bootstraps the user as owner.
  await db.ref(`userWorkspace/${uid}`).set({
    accountType:  'team_member',
    role:         'agent',
    pendingSetup: true,
    name:         fullName,
    email:        email,
    joinedAt:     firebase.database.ServerValue.TIMESTAMP
  });

  // 3. All writes complete — safe to redirect.
  //    app.js _acceptPendingInvitations will handle any existing invite on arrival.
  _skipAuthRedirect = false;
  window.location.href = 'dashboard.html';
}
