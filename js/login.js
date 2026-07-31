/**
 * login.js — ES6 Module
 * Handles business login with Firebase Email/Password auth.
 * After sign-in, also calls the Render backend to sync the session
 * and get the enriched server-side user profile.
 */

import { backendLogin } from './api.js';

/* ── DOM refs ─────────────────────────────────────────────── */
const form      = document.getElementById('login-form');
const btnSubmit = document.getElementById('btn-submit');
const errBox    = document.getElementById('error-msg');

/* ── Helpers ──────────────────────────────────────────────── */
function showError(msg) {
  errBox.textContent = msg;
  errBox.style.display = 'block';
}
function setLoading(on) {
  btnSubmit.disabled    = on;
  btnSubmit.textContent = on ? 'Signing in…' : 'Sign In';
}

/* ── If already logged in, skip to dashboard ─────────────── */
firebase.auth().onAuthStateChanged(function (user) {
  if (user) window.location.href = 'dashboard.html';
});

/* ── Form submit ──────────────────────────────────────────── */
form.addEventListener('submit', async function (e) {
  e.preventDefault();
  errBox.style.display = 'none';

  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  setLoading(true);

  try {
    const cred  = await firebase.auth().signInWithEmailAndPassword(email, password);
    // Sync session with the Render backend (non-blocking — don't let failure block login)
    try {
      const idToken = await cred.user.getIdToken();
      await backendLogin(idToken);
    } catch (backendErr) {
      console.warn('[login.js] Backend sync failed (non-fatal):', backendErr.message);
    }
    window.location.href = 'dashboard.html';
  } catch (err) {
    setLoading(false);
    const msgs = {
      'auth/user-not-found':     'No account found with this email.',
      'auth/wrong-password':     'Incorrect password. Please try again.',
      'auth/invalid-email':      'Please enter a valid email address.',
      'auth/too-many-requests':  'Too many failed attempts. Please wait and try again.',
      'auth/invalid-credential': 'Invalid email or password.'
    };
    showError(msgs[err.code] || err.message);
  }
});

/* ── Password visibility toggle ──────────────────────────── */
const toggleBtn = document.getElementById('toggle-password');
const pwInput   = document.getElementById('password');
if (toggleBtn && pwInput) {
  toggleBtn.addEventListener('click', function () {
    const visible      = pwInput.type === 'text';
    pwInput.type       = visible ? 'password' : 'text';
    toggleBtn.textContent = visible ? '👁' : '🙈';
  });
}
