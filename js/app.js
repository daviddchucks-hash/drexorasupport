/**
 * app.js — ES6 Module (shared across all authenticated pages)
 * Provides: auth guard, workspace context, sidebar setup, logout,
 * toast notifications, activity logging, and notification helpers.
 */

/* ══════════════════════════════════════════════════════════════
   WORKSPACE CONTEXT — resolve the business (workspace) UID
   for any authenticated user (owner OR teammate)
   ══════════════════════════════════════════════════════════════ */
let _workspaceUid  = null;
let _userRole      = null;
let _userRecord    = null;   // { businessUid, role, name, email, joinedAt }

/**
 * Returns the workspace (owner's) UID for the current user.
 * - Owners:    their own UID (self-hosted workspace)
 * - Teammates: the owner's UID, stored in userWorkspace/{uid}
 * On first call the result is cached for the session.
 */
export async function getWorkspaceUid() {
  if (_workspaceUid) return _workspaceUid;

  const user = firebase.auth().currentUser;
  if (!user) return null;

  const db   = firebase.database();
  const snap = await db.ref(`userWorkspace/${user.uid}`).once('value');
  const data = snap.val();

  if (data && data.businessUid) {
    _workspaceUid = data.businessUid;
    _userRole     = data.role || 'agent';
    _userRecord   = data;
  } else {
    // First login as owner (or pre-migration legacy owner):
    // bootstrap their userWorkspace entry pointing to themselves.
    await db.ref(`userWorkspace/${user.uid}`).set({
      businessUid: user.uid,
      role:        'owner',
      name:        user.displayName || user.email.split('@')[0],
      email:       user.email,
      joinedAt:    Date.now()
    });
    _workspaceUid = user.uid;
    _userRole     = 'owner';
    _userRecord   = { businessUid: user.uid, role: 'owner', email: user.email };
  }

  return _workspaceUid;
}

/** Clear workspace cache (call on logout / auth change) */
export function clearWorkspaceCache() {
  _workspaceUid = null;
  _userRole     = null;
  _userRecord   = null;
}

/** Returns the current user's role in the workspace ('owner','admin','agent','viewer') */
export async function getCurrentUserRole() {
  if (_userRole) return _userRole;
  await getWorkspaceUid();
  return _userRole || 'agent';
}

/** Returns the full userWorkspace record for the current user */
export async function getUserRecord() {
  if (_userRecord) return _userRecord;
  await getWorkspaceUid();
  return _userRecord;
}

/* ══════════════════════════════════════════════════════════════
   AUTH GUARD — redirect to login if not signed in
   ══════════════════════════════════════════════════════════════ */
export function requireAuth(callback) {
  firebase.auth().onAuthStateChanged(async function (user) {
    if (!user) {
      window.location.href = 'login.html';
    } else {
      await _acceptPendingInvitations(user);
      const wid = await getWorkspaceUid();
      callback(user, wid);
    }
  });
}

/**
 * Accept any pending team invitations for this user.
 * Invitations are stored at pendingInvitations/{encodedEmail}/{invId}
 * (dots in email → commas, since Firebase forbids '.' in keys).
 */
async function _acceptPendingInvitations(user) {
  try {
    const encodedEmail = user.email.replace(/\./g, ',');
    const db   = firebase.database();
    const snap = await db.ref('pendingInvitations/' + encodedEmail).once('value');
    if (!snap.val()) return;

    const pending = snap.val();
    await Promise.all(Object.entries(pending).map(async ([inviteKey, invite]) => {
      const { businessUid, businessInviteId, name, role, permissions } = invite;
      if (!businessUid) return;

      const memberData = {
        name:             name || user.email.split('@')[0],
        email:            user.email,
        role:             role || 'agent',
        status:           'online',
        lastActive:       Date.now(),
        assignedTickets:  0,
        assignedChats:    0,
        photoUrl:         user.photoURL || '',
        uid:              user.uid,
        joinedAt:         Date.now(),
        permissions:      permissions || {}
      };

      // 1. Add user to business team/members
      await db.ref(`businesses/${businessUid}/team/members/${user.uid}`).set(memberData);

      // 2. Write userWorkspace mapping so this user resolves the correct workspace
      await db.ref(`userWorkspace/${user.uid}`).set({
        businessUid: businessUid,
        role:        role || 'agent',
        name:        memberData.name,
        email:       user.email,
        joinedAt:    Date.now()
      });

      // 3. Log activity
      await _logActivityDirect(db, businessUid, {
        action:   `${memberData.name} joined the workspace`,
        byUid:    user.uid,
        byName:   memberData.name,
        type:     'member_joined',
        timestamp: Date.now()
      });

      // 4. Clean up business-level invitation
      if (businessInviteId) {
        await db.ref(`businesses/${businessUid}/team/invitations/${businessInviteId}`)
          .remove().catch(() => {});
      }

      // 5. Clean up pendingInvitations
      await db.ref(`pendingInvitations/${encodedEmail}/${inviteKey}`).remove();
    }));
  } catch (err) {
    console.warn('[Drexora] Failed to process pending invitations:', err);
  }
}

/* ══════════════════════════════════════════════════════════════
   ACTIVITY LOG
   ══════════════════════════════════════════════════════════════ */
async function _logActivityDirect(db, workspaceUid, entry) {
  try {
    await db.ref(`businesses/${workspaceUid}/activityLog`).push(entry);
  } catch (e) { /* non-fatal */ }
}

/**
 * Log a workspace activity.
 * @param {string} workspaceUid
 * @param {string} action  — Human-readable action string
 * @param {object} meta    — Extra fields (chatId, ticketId, etc.)
 */
export async function logActivity(workspaceUid, action, meta = {}) {
  const user = firebase.auth().currentUser;
  if (!user || !workspaceUid) return;
  const db   = firebase.database();
  const rec  = await getUserRecord();
  const name = rec?.name || user.email.split('@')[0];
  await _logActivityDirect(db, workspaceUid, {
    action,
    byUid:    user.uid,
    byName:   name,
    type:     meta.type || 'general',
    timestamp: Date.now(),
    ...meta
  });
}

/* ══════════════════════════════════════════════════════════════
   NOTIFICATIONS
   ══════════════════════════════════════════════════════════════ */
/**
 * Push a notification to a specific workspace member.
 */
export async function pushNotification(workspaceUid, targetUid, type, message, meta = {}) {
  if (!workspaceUid || !targetUid) return;
  const db = firebase.database();
  try {
    await db.ref(`businesses/${workspaceUid}/notifications/${targetUid}`).push({
      type, message,
      read:      false,
      createdAt: Date.now(),
      ...meta
    });
  } catch (e) { /* non-fatal */ }
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

  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 350);
  }, duration);
}

/* ══════════════════════════════════════════════════════════════
   SIDEBAR SETUP
   ══════════════════════════════════════════════════════════════ */
export function setupSidebar(user) {
  /* ── Mobile toggle ──────────────────────────────────────── */
  const toggle  = document.querySelector('.sidebar-toggle');
  const overlay = document.querySelector('.sidebar-overlay');
  const sidebar = document.querySelector('.sidebar');

  if (toggle && sidebar) {
    toggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      if (overlay) overlay.classList.toggle('visible');
    });
  }
  if (overlay && sidebar) {
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('visible');
    });
  }

  /* ── Inject "Team Inbox" link after Chats link ──────────── */
  _injectInboxNavLink();

  /* ── Highlight active nav item ──────────────────────────── */
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-item').forEach(link => {
    const href = link.getAttribute('href') || '';
    if (href === currentPage) link.classList.add('active');
    else link.classList.remove('active');
  });

  /* ── User info in sidebar footer ───────────────────────── */
  const nameEl  = document.getElementById('sidebar-user-name');
  const emailEl = document.getElementById('sidebar-user-email');
  const avatarEl = document.getElementById('sidebar-user-avatar');
  if (nameEl)  nameEl.textContent  = user.displayName || user.email.split('@')[0];
  if (emailEl) emailEl.textContent = user.email;
  if (avatarEl) {
    avatarEl.textContent = (user.displayName || user.email)[0].toUpperCase();
  }

  /* ── Logout ─────────────────────────────────────────────── */
  document.querySelectorAll('[data-logout], #logout-btn, .logout-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      clearWorkspaceCache();
      // Update presence to offline
      const db = firebase.database();
      const wid = _workspaceUid;
      const uid = user.uid;
      if (wid && uid) {
        await db.ref(`businesses/${wid}/team/members/${uid}/status`).set('offline')
          .catch(() => {});
      }
      await firebase.auth().signOut();
      window.location.href = 'login.html';
    });
  });

  /* ── Update online presence ─────────────────────────────── */
  _updatePresence(user);

  /* ── Notification badge ─────────────────────────────────── */
  _watchNotifications(user);
}

function _injectInboxNavLink() {
  // Only inject once
  if (document.querySelector('.nav-item[href="inbox.html"]')) return;
  const chatsLink = document.querySelector('.nav-item[href="chats.html"]');
  if (!chatsLink) return;

  const inboxLink = document.createElement('a');
  inboxLink.className = 'nav-item';
  inboxLink.href = 'inbox.html';
  inboxLink.innerHTML = `
    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
    </svg>
    Team Inbox
    <span class="nav-badge" id="inbox-badge" style="display:none"></span>`;
  chatsLink.insertAdjacentElement('afterend', inboxLink);

  // Re-apply active state for inbox
  const currentPage = window.location.pathname.split('/').pop();
  if (currentPage === 'inbox.html') inboxLink.classList.add('active');
}

async function _updatePresence(user) {
  try {
    const wid = await getWorkspaceUid();
    if (!wid) return;
    const db  = firebase.database();
    const ref = db.ref(`businesses/${wid}/team/members/${user.uid}`);

    // Only update if we're actually a team member (avoid creating ghost records for owners not yet in members)
    const snap = await ref.once('value');
    if (!snap.exists()) {
      // Owner: ensure they're in the members list
      const role = await getCurrentUserRole();
      if (role === 'owner') {
        await ref.set({
          name:            user.displayName || user.email.split('@')[0],
          email:           user.email,
          role:            'owner',
          status:          'online',
          lastActive:      Date.now(),
          assignedTickets: 0,
          assignedChats:   0,
          photoUrl:        user.photoURL || '',
          uid:             user.uid,
          joinedAt:        Date.now(),
          permissions:     {}
        });
        return;
      }
    }

    await ref.update({ status: 'online', lastActive: Date.now() });

    // Set to offline on disconnect
    ref.child('status').onDisconnect().set('offline');
    ref.child('lastActive').onDisconnect().set(firebase.database.ServerValue.TIMESTAMP);
  } catch (e) { /* non-fatal */ }
}

async function _watchNotifications(user) {
  try {
    const wid = await getWorkspaceUid();
    if (!wid) return;
    const db  = firebase.database();
    db.ref(`businesses/${wid}/notifications/${user.uid}`)
      .on('value', snap => {
        const data  = snap.val() || {};
        const unread = Object.values(data).filter(n => !n.read).length;
        const badge = document.getElementById('inbox-badge');
        if (badge) {
          if (unread > 0) {
            badge.textContent = unread > 99 ? '99+' : unread;
            badge.style.display = 'inline-flex';
          } else {
            badge.style.display = 'none';
          }
        }
      });
  } catch (e) { /* non-fatal */ }
}

/* ══════════════════════════════════════════════════════════════
   UTILITY HELPERS
   ══════════════════════════════════════════════════════════════ */

/** Format a timestamp as "DD MMM YYYY HH:MM" */
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
  if (seconds < 60)    return 'just now';
  if (seconds < 3600)  return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  return Math.floor(seconds / 86400) + 'd ago';
}

/** Escape HTML to prevent XSS */
export function escHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c]);
}

/** Copy text to clipboard */
export function copyToClipboard(text, btnEl) {
  navigator.clipboard.writeText(text).then(() => {
    if (btnEl) {
      const orig = btnEl.textContent;
      btnEl.textContent = 'Copied!';
      btnEl.style.background = '#10b981';
      setTimeout(() => { btnEl.textContent = orig; btnEl.style.background = ''; }, 2000);
    }
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
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
