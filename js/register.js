/**
 * register.js — ES6 Module
 * Handles new-business registration with Firebase Auth + Realtime DB.
 */

/* ── DOM refs ─────────────────────────────────────────────── */
const form      = document.getElementById('register-form');
const btnSubmit = document.getElementById('btn-submit');
const errBox    = document.getElementById('error-msg');

/* ── Helpers ──────────────────────────────────────────────── */
function showError(msg) {
  errBox.textContent = msg;
  errBox.style.display = 'block';
}
function hideError() {
  errBox.style.display = 'none';
}
function setLoading(on) {
  btnSubmit.disabled   = on;
  btnSubmit.textContent = on ? 'Creating account…' : 'Create Account';
}

/* ── If already logged in, skip to dashboard ─────────────── */
firebase.auth().onAuthStateChanged(function (user) {
  if (user) window.location.href = 'dashboard.html';
});

/* ── Form submit ──────────────────────────────────────────── */
form.addEventListener('submit', async function (e) {
  e.preventDefault();
  hideError();

  const businessName = document.getElementById('business-name').value.trim();
  const email        = document.getElementById('email').value.trim();
  const password     = document.getElementById('password').value;
  const confirm      = document.getElementById('confirm-password').value;

  if (!businessName) return showError('Business name is required.');
  if (password !== confirm) return showError('Passwords do not match.');
  if (password.length < 6) return showError('Password must be at least 6 characters.');

  setLoading(true);

  try {
    // 1. Create Firebase Auth account
    const cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
    const uid  = cred.user.uid;

    // 2. Write initial business profile to Realtime Database
    const db = firebase.database();
    await db.ref('businesses/' + uid + '/profile').set({
      name:           businessName,
      email:          email,
      logoUrl:        '',
      themeColor:     '#7c3aed',
      welcomeMessage: 'Hi! How can we help you today? Ask a question below.',
      createdAt:      firebase.database.ServerValue.TIMESTAMP,
      plan:           'free'
    });

    // 3. Redirect to dashboard
    window.location.href = 'dashboard.html';

  } catch (err) {
    setLoading(false);
    // Map Firebase error codes to friendly messages
    const msgs = {
      'auth/email-already-in-use': 'An account with this email already exists.',
      'auth/invalid-email':        'Please enter a valid email address.',
      'auth/weak-password':        'Password is too weak. Use at least 6 characters.'
    };
    showError(msgs[err.code] || err.message);
  }
});
