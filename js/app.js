/**
 * app.js — ES6 Module (shared across all authenticated pages)
 * Provides: auth guard, sidebar mobile toggle, logout, toast notifications,
 * sidebar active-state, and user info display.
 */

/* ══════════════════════════════════════════════════════════════
   AUTH GUARD — redirect to login if not signed in
   ══════════════════════════════════════════════════════════════ */
export function requireAuth(callback) {
  firebase.auth().onAuthStateChanged(async function (user) {
    if (!user) {
      window.location.href = 'login.html';
    } else {
      // FIX: Check for and auto-accept any pending team invitations before
      // handing control to the page. Invitations sent to an existing user
      // are stored at the root-level pendingInvitations node (keyed by
      // encoded email) so the invited user can find them without needing
      // access to the inviting owner's business node.
      await _acceptPendingInvitations(user);
      callback(user);
    }
  });
}

/**
 * Look up pendingInvitations/<encodedEmail> and, for each entry, add the
 * current user as a team member of the corresponding business, then clean up.
 *
 * Email dots are encoded as commas to form valid Firebase Realtime Database
 * keys (Firebase forbids '.' in key names).
 */
async function _acceptPendingInvitations(user) {
  try {
    const encodedEmail = user.email.replace(/\./g, ',');
    const db = firebase.database();
    const snap = await db.ref('pendingInvitations/' + encodedEmail).once('value');
    if (!snap.val()) return;

    const pending = snap.val();
    await Promise.all(Object.entries(pending).map(async ([inviteKey, invite]) => {
      const { businessUid, businessInviteId, name, role, permissions } = invite;
      if (!businessUid) return;

      // 1. Add the user to the business team/members node.
      //    The Firebase rule for $memberId allows auth.uid === $memberId,
      //    so an invited user can write their own member record.
      await db.ref('businesses/' + businessUid + '/team/members/' + user.uid).set({
        name:            name || user.email.split('@')[0],
        email:           user.email,
        role:            role || 'agent',
        status:          'online',
        lastActive:      Date.now(),
        assignedTickets: 0,
        photoUrl:        user.photoURL || '',
        uid:             user.uid,
        joinedAt:        Date.now(),
        permissions:     permissions || {}
      });

      // 2. Remove the business-level invitation record so the owner's
      //    pending list stays clean.
      if (businessInviteId) {
        await db
          .ref('businesses/' + businessUid + '/team/invitations/' + businessInviteId)
          .remove()
          .catch(() => {}); // non-fatal — may already be gone
      }

      // 3. Remove from pendingInvitations so this doesn't run again.
      await db.ref('pendingInvitations/' + encodedEmail + '/' + inviteKey).remove();
    }));
  } catch (err) {
    // Non-fatal — log but don't block the login flow
    console.warn('[Drexora] Failed to process pending invitations:', err);
  }
}

/* ══════════════════════════════════════════════════════════════
   TOAST NOTIFICATIONS
   ══════════════════════════════════════════════════════════════ */
let toastContainer = null;

export function toast(message, type = 'info', duration = 4000) {
  if (!toastContainer) {
    toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      document.body.appendChild(toastContainer);
    }
  }

  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span>
                  <span class="toast-msg">${message}</span>`;
  toastContainer.appendChild(el);

  // Auto-remove
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(20px)';
    el.style.transition = 'opacity .3s, transform .3s';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

/* ══════════════════════════════════════════════════════════════
   SIDEBAR SETUP — mobile toggle, active link, user info, logout
   ══════════════════════════════════════════════════════════════ */
export function setupSidebar(user) {
  const sidebar        = document.querySelector('.sidebar');
  const overlay        = document.querySelector('.sidebar-overlay');
  const toggleBtn      = document.querySelector('.sidebar-toggle');
  const logoutBtns     = document.querySelectorAll('[data-logout]');
  const userNameEls    = document.querySelectorAll('[data-user-name]');
  const userEmailEls   = document.querySelectorAll('[data-user-email]');
  const avatarEls      = document.querySelectorAll('[data-user-avatar]');

  // Display user info from Firebase Auth + DB profile
  const db = firebase.database();
  db.ref('businesses/' + user.uid + '/profile').once('value').then(snap => {
    const profile = snap.val() || {};
    const displayName = profile.name || user.email.split('@')[0];
    const initials    = displayName.slice(0, 2).toUpperCase();

    userNameEls.forEach(el  => { el.textContent = displayName; });
    userEmailEls.forEach(el => { el.textContent = user.email; });
    avatarEls.forEach(el    => {
      if (profile.logoUrl) {
        el.innerHTML = `<img src="${profile.logoUrl}" alt="logo" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
      } else {
        el.textContent = initials;
      }
    });
  });

  // Mobile toggle
  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay && overlay.classList.toggle('open');
    });
  }
  if (overlay) {
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('open');
    });
  }

  // Active nav link — match current page filename
  const currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';
  document.querySelectorAll('.nav-item[href]').forEach(link => {
    const href = link.getAttribute('href');
    if (href && (href === currentPage || href.endsWith('/' + currentPage))) {
      link.classList.add('active');
    }
  });

  // Logout
  logoutBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await firebase.auth().signOut();
        window.location.href = 'login.html';
      } catch (err) {
        toast('Sign-out failed. Please try again.', 'error');
      }
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════════ */

/** Format a Firebase timestamp (ms) to a human-readable string */
export function formatDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
         ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** Format relative time (e.g. "2 hours ago") */
export function timeAgo(ts) {
  if (!ts) return '—';
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60)   return 'just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  return Math.floor(seconds / 86400) + 'd ago';
}

/** Escape HTML to prevent XSS */
export function escHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c]);
}

/** Copy text to clipboard and give feedback */
export function copyToClipboard(text, btnEl) {
  navigator.clipboard.writeText(text).then(() => {
    if (btnEl) {
      const orig = btnEl.textContent;
      btnEl.textContent = 'Copied!';
      btnEl.style.background = '#10b981';
      setTimeout(() => { btnEl.textContent = orig; btnEl.style.background = ''; }, 2000);
    }
  }).catch(() => {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    if (btnEl) { btnEl.textContent = 'Copied!'; setTimeout(() => btnEl.textContent = 'Copy', 2000); }
  });
}

/** Generate a unique visitor ID stored in sessionStorage */
export function getVisitorId() {
  let id = sessionStorage.getItem('drx_visitor');
  if (!id) {
    id = 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    sessionStorage.setItem('drx_visitor', id);
  }
  return id;
}
