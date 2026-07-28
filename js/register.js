/**
 * register.js — ES6 Module
 * Handles new-business registration with Firebase Auth + Realtime DB.
 * Creates both the business profile AND the owner's userWorkspace entry.
 */

const form      = document.getElementById('register-form');
const btnSubmit = document.getElementById('btn-submit');
const errBox    = document.getElementById('error-msg');

function showError(msg) { errBox.textContent = msg; errBox.style.display = 'block'; }
function hideError()    { errBox.style.display = 'none'; }
function setLoading(on) {
  btnSubmit.disabled    = on;
  btnSubmit.textContent = on ? 'Creating account…' : 'Create Account';
}

firebase.auth().onAuthStateChanged(function (user) {
  if (user) window.location.href = 'dashboard.html';
});

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
      assignment: {
        mode:    'manual',
        enabled: false
      },
      aiEnabled:      true,
      widgetEnabled:  true
    });

    // 4. Bootstrap the owner's userWorkspace entry
    //    This allows getWorkspaceUid() to resolve correctly on first login.
    await db.ref(`userWorkspace/${uid}`).set({
      businessUid: uid,
      role:        'owner',
      name:        businessName,
      email:       email,
      joinedAt:    firebase.database.ServerValue.TIMESTAMP
    });

    // 5. Add owner to team/members so they appear in team lists
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
