/**
 * team.js — ES6 Module
 * Team Management: members, invitations, roles, permissions
 */

import { requireAuth, setupSidebar, toast, escHtml, timeAgo } from './app.js';

/* ── Role definitions ────────────────────────────────────── */
const ROLES = {
  owner: {
    label: 'Owner',
    color: 'badge-danger',
    permissions: {
      'Reply to Chats': true, 'Reply to Emails': true, 'Reply to WhatsApp': true,
      'Create Tickets': true, 'Delete Tickets': true, 'Assign Tickets': true,
      'Close Tickets': true, 'Resolve Tickets': true, 'Manage Team': true,
      'Manage Billing': true, 'View Analytics': true, 'Export Data': true,
      'Manage AI': true, 'Manage Widget': true, 'Create API Keys': true,
      'Manage Integrations': true, 'Delete Workspace': true, 'Invite Members': true
    }
  },
  admin: {
    label: 'Admin',
    color: 'badge-warning',
    permissions: {
      'Reply to Chats': true, 'Reply to Emails': true, 'Reply to WhatsApp': true,
      'Create Tickets': true, 'Delete Tickets': true, 'Assign Tickets': true,
      'Close Tickets': true, 'Resolve Tickets': true, 'Manage Team': true,
      'Manage Billing': false, 'View Analytics': true, 'Export Data': true,
      'Manage AI': true, 'Manage Widget': true, 'Create API Keys': true,
      'Manage Integrations': true, 'Delete Workspace': false, 'Invite Members': true
    }
  },
  agent: {
    label: 'Support Agent',
    color: 'badge-info',
    permissions: {
      'Reply to Chats': true, 'Reply to Emails': true, 'Reply to WhatsApp': true,
      'Create Tickets': true, 'Delete Tickets': false, 'Assign Tickets': false,
      'Close Tickets': true, 'Resolve Tickets': true, 'Manage Team': false,
      'Manage Billing': false, 'View Analytics': false, 'Export Data': false,
      'Manage AI': false, 'Manage Widget': false, 'Create API Keys': false,
      'Manage Integrations': false, 'Delete Workspace': false, 'Invite Members': false
    }
  },
  viewer: {
    label: 'Viewer',
    color: 'badge-muted',
    permissions: {
      'Reply to Chats': false, 'Reply to Emails': false, 'Reply to WhatsApp': false,
      'Create Tickets': false, 'Delete Tickets': false, 'Assign Tickets': false,
      'Close Tickets': false, 'Resolve Tickets': false, 'Manage Team': false,
      'Manage Billing': false, 'View Analytics': true, 'Export Data': false,
      'Manage AI': false, 'Manage Widget': false, 'Create API Keys': false,
      'Manage Integrations': false, 'Delete Workspace': false, 'Invite Members': false
    }
  }
};

const ALL_PERMISSIONS = Object.keys(ROLES.owner.permissions);

/* ── State ─────────────────────────────────────────────────── */
let currentUser = null;
let db = null;
let members = {};
let invitations = {};
let editingMemberId = null;

/* ── Init ──────────────────────────────────────────────────── */
requireAuth(user => {
  currentUser = user;
  db = firebase.database();
  setupSidebar(user);
  bindEvents();
  loadTeam();
  loadIncomingInvitations();
  setupPermissionPreview();
});

/* ── Load team data ─────────────────────────────────────────── */
function loadTeam() {
  const uid = currentUser.uid;

  // Listen for members
  db.ref(`businesses/${uid}/team/members`).on('value', snap => {
    members = snap.val() || {};
    renderMembers();
    updateStats();
  });

  // Listen for invitations
  db.ref(`businesses/${uid}/team/invitations`).on('value', snap => {
    invitations = snap.val() || {};
    renderInvitations();
    updateStats();
  });

  // Add owner as first member if team is empty
  db.ref(`businesses/${uid}/team/members`).once('value').then(snap => {
    if (!snap.val()) {
      db.ref(`businesses/${uid}/profile`).once('value').then(pSnap => {
        const profile = pSnap.val() || {};
        const ownerMember = {
          name: profile.name || currentUser.email.split('@')[0],
          email: currentUser.email,
          role: 'owner',
          status: 'online',
          lastActive: Date.now(),
          assignedTickets: 0,
          photoUrl: profile.logoUrl || '',
          uid: currentUser.uid,
          joinedAt: Date.now()
        };
        db.ref(`businesses/${uid}/team/members/${currentUser.uid}`).set(ownerMember);
      });
    }
  });
}

/* ── Render members table ───────────────────────────────────── */
function renderMembers() {
  const tbody = document.getElementById('members-tbody');
  const search = document.getElementById('member-search').value.toLowerCase();

  const arr = Object.entries(members).filter(([id, m]) => {
    if (!search) return true;
    return (m.name||'').toLowerCase().includes(search) ||
           (m.email||'').toLowerCase().includes(search);
  });

  if (!arr.length) {
    tbody.innerHTML = `<tr><td colspan="6">
      <div class="empty-state"><div class="empty-state-icon">👥</div>
      <div class="empty-state-title">No Members Found</div>
      <div class="empty-state-desc">Invite teammates to get started.</div></div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = arr.map(([id, m]) => {
    const role = ROLES[m.role] || ROLES.agent;
    const initials = (m.name || 'U').slice(0, 2).toUpperCase();
    const avatarHtml = m.photoUrl
      ? `<img src="${escHtml(m.photoUrl)}" alt="${escHtml(m.name)}" class="member-avatar-img">`
      : `<div class="member-avatar-fallback">${initials}</div>`;

    const statusClass = m.status === 'online' ? 'status-online' :
                        m.status === 'away'   ? 'status-away'   : 'status-offline';
    const statusLabel = m.status === 'online' ? 'Online' :
                        m.status === 'away'   ? 'Away'   : 'Offline';

    const isOwner = m.uid === currentUser.uid;

    return `<tr class="animate-fadeUp">
      <td>
        <div class="member-cell">
          <div class="member-avatar">${avatarHtml}</div>
          <div>
            <div class="member-name">${escHtml(m.name||'Unknown')}</div>
            <div class="member-email">${escHtml(m.email||'')}</div>
          </div>
        </div>
      </td>
      <td><span class="badge ${role.color}">${role.label}</span></td>
      <td>
        <div class="status-cell">
          <span class="status-dot ${statusClass}"></span>
          <span>${statusLabel}</span>
        </div>
      </td>
      <td class="text-muted">${timeAgo(m.lastActive)}</td>
      <td><span class="badge badge-muted">${m.assignedTickets || 0}</span></td>
      <td>
        ${isOwner ? '' : `
        <div class="action-menu-wrap">
          <button class="action-menu-btn" onclick="toggleMemberMenu(event,'${id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
          </button>
          <div class="action-menu" id="menu-${id}">
            <button class="action-menu-item" onclick="viewProfile('${id}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              View Profile
            </button>
            <button class="action-menu-item" onclick="editRole('${id}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              Edit Role
            </button>
            <button class="action-menu-item" onclick="suspendMember('${id}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
              ${m.suspended ? 'Unsuspend' : 'Suspend'} Member
            </button>
            <div class="action-menu-divider"></div>
            <button class="action-menu-item action-menu-item--danger" onclick="removeMember('${id}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              Remove Member
            </button>
          </div>
        </div>`}
      </td>
    </tr>`;
  }).join('');
}

/* ── Render invitations ─────────────────────────────────────── */
function renderInvitations() {
  const container = document.getElementById('invitations-container');
  const empty = document.getElementById('invitations-empty');
  const arr = Object.entries(invitations);

  if (!arr.length) {
    container.innerHTML = `<div class="empty-state" id="invitations-empty">
      <div class="empty-state-icon">📭</div>
      <div class="empty-state-title">No Pending Invitations</div>
      <div class="empty-state-desc">Invite teammates using the button above to grow your team.</div>
    </div>`;
    return;
  }

  container.innerHTML = `<div class="invitations-list">${arr.map(([id, inv]) => {
    const role = ROLES[inv.role] || ROLES.agent;
    const initials = (inv.name || inv.email).slice(0, 2).toUpperCase();
    return `<div class="invitation-item animate-fadeUp">
      <div class="member-avatar"><div class="member-avatar-fallback" style="background:var(--glass-active)">${initials}</div></div>
      <div style="flex:1;min-width:0">
        <div class="member-name">${escHtml(inv.name || 'Unknown')}</div>
        <div class="member-email">${escHtml(inv.email)}</div>
      </div>
      <span class="badge ${role.color}">${role.label}</span>
      <span class="badge badge-warning">Pending</span>
      <span class="text-muted" style="font-size:.78rem;white-space:nowrap">${timeAgo(inv.createdAt)}</span>
      <button class="btn btn-ghost btn-sm" onclick="cancelInvitation('${id}')">Cancel</button>
    </div>`;
  }).join('')}</div>`;
}

/* ── Incoming invitations (sent TO this user by other workspaces) ───── */
async function loadIncomingInvitations() {
  try {
    const encodedEmail = currentUser.email.replace(/./g, ',');
    // Live listener so new invites appear without a page refresh
    db.ref('pendingInvitations/' + encodedEmail).on('value', async snap => {
      const raw = snap.val() || {};
      const enriched = await Promise.all(
        Object.entries(raw).map(async ([key, invite]) => {
          let businessName = invite.invitedBy || invite.businessUid;
          try {
            const pSnap = await db
              .ref('businesses/' + invite.businessUid + '/profile/name')
              .once('value');
            if (pSnap.val()) businessName = pSnap.val();
          } catch (_) {}
          return [key, { ...invite, businessName }];
        })
      );
      renderIncomingInvitations(Object.fromEntries(enriched));
    });
  } catch (err) {
    console.warn('[Drexora] loadIncomingInvitations error:', err);
  }
}

function renderIncomingInvitations(incomingMap) {
  const card      = document.getElementById('incoming-invitations-card');
  const container = document.getElementById('incoming-invitations-container');
  const badge     = document.getElementById('incoming-badge');
  if (!card || !container) return;

  const entries = Object.entries(incomingMap);
  if (badge) badge.textContent = entries.length || '';

  if (!entries.length) {
    card.style.display = 'none';
    return;
  }
  card.style.display = '';

  container.innerHTML = '<div class="invitations-list">' +
    entries.map(([key, inv]) => {
      const role     = ROLES[inv.role] || ROLES.agent;
      const initials = (inv.businessName || 'W').slice(0, 2).toUpperCase();
      const safeKey  = escHtml(key);
      const safeBizUid   = escHtml(inv.businessUid || '');
      const safeBizInvId = escHtml(inv.businessInviteId || '');
      const safeName     = escHtml(inv.name || '');
      const safeRole     = escHtml(inv.role || 'agent');
      return (
        '<div class="invitation-item animate-fadeUp" id="incoming-item-' + safeKey + '">' +
          '<div class="member-avatar">' +
            '<div class="member-avatar-fallback" style="background:rgba(99,102,241,.18);color:var(--primary)">' + initials + '</div>' +
          '</div>' +
          '<div style="flex:1;min-width:0">' +
            '<div class="member-name">' + escHtml(inv.businessName || inv.businessUid) + '</div>' +
            '<div class="member-email">Invited by ' + escHtml(inv.invitedBy || 'unknown') + ' &nbsp;&middot;&nbsp; ' + timeAgo(inv.createdAt) + '</div>' +
          '</div>' +
          '<span class="badge ' + role.color + '">' + role.label + '</span>' +
          '<div style="display:flex;gap:8px;flex-shrink:0">' +
            '<button class="btn btn-primary btn-sm" ' +
              'onclick="acceptIncomingInvitation('' + safeKey + '','' + safeBizUid + '','' + safeBizInvId + '','' + safeName + '','' + safeRole + '',this)">' +
              '&#10003; Accept' +
            '</button>' +
            '<button class="btn btn-ghost btn-sm" ' +
              'onclick="declineIncomingInvitation('' + safeKey + '',this)">Decline</button>' +
          '</div>' +
        '</div>'
      );
    }).join('') +
  '</div>';
}

/* ── Accept incoming invitation ───────────────────────────────── */
window.acceptIncomingInvitation = async function(inviteKey, businessUid, businessInviteId, invitedName, role, btn) {
  btn.disabled    = true;
  btn.textContent = 'Joining…';
  try {
    const encodedEmail = currentUser.email.replace(/./g, ',');

    // 1. Add user to the business team/members.
    //    Rule: auth.uid === $memberId allows invited users to write their own record.
    await db.ref('businesses/' + businessUid + '/team/members/' + currentUser.uid).set({
      name:            invitedName || currentUser.email.split('@')[0],
      email:           currentUser.email,
      role:            role || 'agent',
      status:          'online',
      lastActive:      Date.now(),
      assignedTickets: 0,
      photoUrl:        currentUser.photoURL || '',
      uid:             currentUser.uid,
      joinedAt:        Date.now()
    });

    // 2. Remove the business-level invitation record (non-fatal if denied)
    if (businessInviteId) {
      await db.ref('businesses/' + businessUid + '/team/invitations/' + businessInviteId)
        .remove().catch(() => {});
    }

    // 3. Remove from pendingInvitations — triggers the live listener
    //    which will re-render the section automatically.
    await db.ref('pendingInvitations/' + encodedEmail + '/' + inviteKey).remove();

    toast('You have joined the team!', 'success');
  } catch (err) {
    btn.disabled    = false;
    btn.textContent = '✓ Accept';
    toast('Failed to accept invitation. Please try again.', 'error');
    console.error('[Drexora] acceptIncomingInvitation:', err);
  }
};

/* ── Decline incoming invitation ──────────────────────────────── */
window.declineIncomingInvitation = async function(inviteKey, btn) {
  if (!confirm('Decline this invitation?')) return;
  btn.disabled = true;
  try {
    const encodedEmail = currentUser.email.replace(/./g, ',');
    await db.ref('pendingInvitations/' + encodedEmail + '/' + inviteKey).remove();
    toast('Invitation declined.', 'info');
  } catch (err) {
    btn.disabled = false;
    toast('Failed to decline invitation.', 'error');
  }
};

/* ── Update stats ───────────────────────────────────────────── */
function updateStats() {
  const membersArr = Object.values(members);
  const invitesArr = Object.values(invitations);

  animateCounter('stat-total-members', membersArr.length);
  animateCounter('stat-online-members', membersArr.filter(m => m.status === 'online').length);
  animateCounter('stat-pending-invites', invitesArr.length);
  animateCounter('stat-active-agents', membersArr.filter(m => m.role === 'agent' && !m.suspended).length);
}

/* ── Animated counter ───────────────────────────────────────── */
function animateCounter(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = parseInt(el.textContent) || 0;
  if (start === target) { el.textContent = target; return; }
  const step = Math.ceil(Math.abs(target - start) / 20);
  let current = start;
  const interval = setInterval(() => {
    current = current < target ? Math.min(current + step, target) : Math.max(current - step, target);
    el.textContent = current;
    if (current === target) clearInterval(interval);
  }, 30);
}

/* ── Permission preview ─────────────────────────────────────── */
function setupPermissionPreview() {
  const roleSelect = document.getElementById('invite-role');
  if (roleSelect) {
    roleSelect.addEventListener('change', () => updatePermissionPreview(roleSelect.value));
    updatePermissionPreview(roleSelect.value);
  }
}

function updatePermissionPreview(roleKey) {
  const role = ROLES[roleKey] || ROLES.agent;
  const titleEl = document.getElementById('perm-preview-title');
  const gridEl = document.getElementById('perm-preview-grid');
  if (titleEl) titleEl.textContent = role.label;
  if (gridEl) {
    gridEl.innerHTML = ALL_PERMISSIONS.map(p => `
      <div class="perm-item ${role.permissions[p] ? 'perm-yes' : 'perm-no'}">
        <span class="perm-icon">${role.permissions[p] ? '✓' : '✕'}</span>
        <span>${p}</span>
      </div>`).join('');
  }
}

/* ── Bind UI events ─────────────────────────────────────────── */
function bindEvents() {
  // Invite modal
  const inviteBtn = document.getElementById('invite-btn');
  const inviteModal = document.getElementById('invite-modal');
  const closeInviteModal = document.getElementById('close-invite-modal');
  const cancelInviteBtn = document.getElementById('cancel-invite-btn');
  const sendInviteBtn = document.getElementById('send-invite-btn');

  inviteBtn.addEventListener('click', () => openModal('invite-modal'));
  closeInviteModal.addEventListener('click', () => closeModal('invite-modal'));
  cancelInviteBtn.addEventListener('click', () => closeModal('invite-modal'));
  inviteModal.addEventListener('click', e => { if (e.target === inviteModal) closeModal('invite-modal'); });

  sendInviteBtn.addEventListener('click', sendInvite);

  // Edit role modal
  document.getElementById('close-edit-role-modal').addEventListener('click', () => closeModal('edit-role-modal'));
  document.getElementById('cancel-edit-role-btn').addEventListener('click', () => closeModal('edit-role-modal'));
  document.getElementById('save-edit-role-btn').addEventListener('click', saveEditRole);
  document.getElementById('edit-role-modal').addEventListener('click', e => { if (e.target.id === 'edit-role-modal') closeModal('edit-role-modal'); });

  // View profile modal
  document.getElementById('close-view-profile-modal').addEventListener('click', () => closeModal('view-profile-modal'));
  document.getElementById('close-profile-btn').addEventListener('click', () => closeModal('view-profile-modal'));
  document.getElementById('view-profile-modal').addEventListener('click', e => { if (e.target.id === 'view-profile-modal') closeModal('view-profile-modal'); });

  // Search
  document.getElementById('member-search').addEventListener('input', renderMembers);

  // Photo upload preview
  document.getElementById('invite-photo-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      document.getElementById('invite-photo-preview').innerHTML = `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    };
    reader.readAsDataURL(file);
  });

  // Close action menus on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('.action-menu-wrap')) {
      document.querySelectorAll('.action-menu.open').forEach(m => m.classList.remove('open'));
    }
  });
}

/* ── Send invite ────────────────────────────────────────────── */
async function sendInvite() {
  const name  = document.getElementById('invite-name').value.trim();
  const email = document.getElementById('invite-email').value.trim();
  const role  = document.getElementById('invite-role').value;

  if (!name) { toast('Please enter a full name.', 'error'); return; }
  if (!email || !/\S+@\S+\.\S+/.test(email)) { toast('Please enter a valid email.', 'error'); return; }

  // Check for duplicate
  const existing = Object.values(members).find(m => m.email === email);
  const alreadyInvited = Object.values(invitations).find(i => i.email === email);
  if (existing) { toast('This person is already a team member.', 'error'); return; }
  if (alreadyInvited) { toast('An invitation has already been sent to this email.', 'warning'); return; }

  const btn = document.getElementById('send-invite-btn');
  btn.disabled = true;
  btn.textContent = 'Sending…';

  try {
    const uid = currentUser.uid;
    const inviteRef = db.ref(`businesses/${uid}/team/invitations`).push();
    const invitePayload = {
      name, email, role,
      status: 'pending',
      createdAt: Date.now(),
      invitedBy: currentUser.email,
      permissions: ROLES[role]?.permissions || ROLES.agent.permissions
    };
    await inviteRef.set(invitePayload);

    // FIX: Also write to the root-level pendingInvitations node so the
    // invited user (who cannot access the owner's business node) can
    // discover and accept the invite automatically when they next log in.
    const encodedEmail = email.replace(/\./g, ',');
    await firebase.database()
      .ref(`pendingInvitations/${encodedEmail}/${inviteRef.key}`)
      .set({
        businessUid: uid,
        businessInviteId: inviteRef.key,
        name, email, role,
        invitedBy: currentUser.email,
        permissions: invitePayload.permissions,
        createdAt: invitePayload.createdAt
      });

    toast(`Invitation sent to ${email}!`, 'success');
    closeModal('invite-modal');
    document.getElementById('invite-name').value = '';
    document.getElementById('invite-email').value = '';
    document.getElementById('invite-role').value = 'agent';
    updatePermissionPreview('agent');
  } catch (err) {
    toast('Failed to send invitation. Try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg style="width:15px;height:15px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Send Invite`;
  }
}

/* ── Cancel invitation ──────────────────────────────────────── */
window.cancelInvitation = async function(inviteId) {
  if (!confirm('Cancel this invitation?')) return;
  try {
    // FIX: Also remove from the root pendingInvitations node so the invited
    // user no longer receives an outdated invitation on next login.
    const invite = invitations[inviteId];
    if (invite?.email) {
      const encodedEmail = invite.email.replace(/\./g, ',');
      await firebase.database()
        .ref(`pendingInvitations/${encodedEmail}/${inviteId}`)
        .remove();
    }
    await db.ref(`businesses/${currentUser.uid}/team/invitations/${inviteId}`).remove();
    toast('Invitation cancelled.', 'info');
  } catch {
    toast('Failed to cancel invitation.', 'error');
  }
};

/* ── View profile ───────────────────────────────────────────── */
window.viewProfile = function(memberId) {
  closeAllMenus();
  const m = members[memberId];
  if (!m) return;
  const role = ROLES[m.role] || ROLES.agent;
  const initials = (m.name || 'U').slice(0, 2).toUpperCase();
  const avatarHtml = m.photoUrl
    ? `<img src="${escHtml(m.photoUrl)}" style="width:72px;height:72px;border-radius:50%;object-fit:cover">`
    : `<div style="width:72px;height:72px;border-radius:50%;background:var(--glass-active);display:grid;place-items:center;font-size:1.5rem;font-weight:700;color:var(--primary)">${initials}</div>`;

  const permList = Object.entries(m.permissions || role.permissions || {}).map(([k, v]) =>
    `<div class="perm-item ${v ? 'perm-yes' : 'perm-no'}"><span class="perm-icon">${v ? '✓' : '✕'}</span><span>${k}</span></div>`
  ).join('');

  document.getElementById('view-profile-content').innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px">
      ${avatarHtml}
      <div>
        <div style="font-size:1.1rem;font-weight:700">${escHtml(m.name||'Unknown')}</div>
        <div style="color:var(--text-secondary);font-size:.875rem">${escHtml(m.email||'')}</div>
        <div style="margin-top:6px;display:flex;gap:8px;align-items:center">
          <span class="badge ${role.color}">${role.label}</span>
          <div class="status-cell"><span class="status-dot status-${m.status||'offline'}"></span><span style="font-size:.8rem">${m.status||'offline'}</span></div>
        </div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;padding:14px;background:var(--glass-bg);border:1px solid var(--border);border-radius:var(--radius)">
      <div><div style="font-size:.75rem;color:var(--text-muted);margin-bottom:2px">Last Active</div><div style="font-size:.875rem;font-weight:600">${timeAgo(m.lastActive)}</div></div>
      <div><div style="font-size:.75rem;color:var(--text-muted);margin-bottom:2px">Assigned Tickets</div><div style="font-size:.875rem;font-weight:600">${m.assignedTickets||0}</div></div>
      <div><div style="font-size:.75rem;color:var(--text-muted);margin-bottom:2px">Joined</div><div style="font-size:.875rem;font-weight:600">${m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : '—'}</div></div>
      <div><div style="font-size:.75rem;color:var(--text-muted);margin-bottom:2px">Status</div><div style="font-size:.875rem;font-weight:600">${m.suspended ? 'Suspended' : 'Active'}</div></div>
    </div>
    <div style="font-size:.82rem;font-weight:600;color:var(--text-secondary);margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em">Permissions</div>
    <div class="perm-preview-grid">${permList}</div>`;
  openModal('view-profile-modal');
};

/* ── Edit role ──────────────────────────────────────────────── */
window.editRole = function(memberId) {
  closeAllMenus();
  editingMemberId = memberId;
  const m = members[memberId];
  if (!m) return;
  const role = ROLES[m.role] || ROLES.agent;
  const initials = (m.name || 'U').slice(0, 2).toUpperCase();

  document.getElementById('edit-role-member-info').innerHTML = `
    <div style="width:40px;height:40px;border-radius:50%;background:var(--glass-active);display:grid;place-items:center;font-weight:700;font-size:.9rem;color:var(--primary);flex-shrink:0">${initials}</div>
    <div><div style="font-weight:600">${escHtml(m.name||'Unknown')}</div><div style="font-size:.8rem;color:var(--text-secondary)">${escHtml(m.email||'')}</div></div>`;

  document.getElementById('edit-role-select').value = m.role || 'agent';

  buildPermEditor(m.permissions || role.permissions);
  openModal('edit-role-modal');
};

function buildPermEditor(currentPerms) {
  const grid = document.getElementById('perm-editor-grid');
  grid.innerHTML = ALL_PERMISSIONS.map(p => `
    <label class="perm-toggle-row">
      <span>${p}</span>
      <label class="tt-switch">
        <input type="checkbox" class="perm-checkbox" data-perm="${p}" ${currentPerms[p] ? 'checked' : ''}>
        <span class="tt-switch-slider"></span>
      </label>
    </label>`).join('');

  // When role select changes, update the checkboxes
  document.getElementById('edit-role-select').onchange = function() {
    const rolePerms = ROLES[this.value]?.permissions || ROLES.agent.permissions;
    document.querySelectorAll('#perm-editor-grid .perm-checkbox').forEach(cb => {
      cb.checked = !!rolePerms[cb.dataset.perm];
    });
  };
}

async function saveEditRole() {
  if (!editingMemberId) return;
  const roleKey = document.getElementById('edit-role-select').value;
  const permissions = {};
  document.querySelectorAll('#perm-editor-grid .perm-checkbox').forEach(cb => {
    permissions[cb.dataset.perm] = cb.checked;
  });

  try {
    await db.ref(`businesses/${currentUser.uid}/team/members/${editingMemberId}`).update({ role: roleKey, permissions });
    toast('Role and permissions updated.', 'success');
    closeModal('edit-role-modal');
  } catch {
    toast('Failed to save changes.', 'error');
  }
}

/* ── Suspend member ─────────────────────────────────────────── */
window.suspendMember = async function(memberId) {
  closeAllMenus();
  const m = members[memberId];
  if (!m) return;
  const action = m.suspended ? 'Unsuspend' : 'Suspend';
  if (!confirm(`${action} ${m.name || 'this member'}?`)) return;

  try {
    await db.ref(`businesses/${currentUser.uid}/team/members/${memberId}`).update({
      suspended: !m.suspended,
      status: m.suspended ? 'offline' : 'offline'
    });
    toast(`Member ${action.toLowerCase()}ed.`, 'success');
  } catch {
    toast('Failed to update member.', 'error');
  }
};

/* ── Remove member ──────────────────────────────────────────── */
window.removeMember = async function(memberId) {
  closeAllMenus();
  const m = members[memberId];
  if (!m) return;
  if (!confirm(`Remove ${m.name || 'this member'} from the team? This cannot be undone.`)) return;

  try {
    await db.ref(`businesses/${currentUser.uid}/team/members/${memberId}`).remove();
    toast('Member removed.', 'info');
  } catch {
    toast('Failed to remove member.', 'error');
  }
};

/* ── Action menu toggle ─────────────────────────────────────── */
window.toggleMemberMenu = function(e, memberId) {
  e.stopPropagation();
  document.querySelectorAll('.action-menu.open').forEach(m => {
    if (m.id !== `menu-${memberId}`) m.classList.remove('open');
  });
  document.getElementById(`menu-${memberId}`)?.classList.toggle('open');
};

/* ── Modal helpers ──────────────────────────────────────────── */
function openModal(id) {
  document.getElementById(id)?.classList.add('open');
}
function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}
function closeAllMenus() {
  document.querySelectorAll('.action-menu.open').forEach(m => m.classList.remove('open'));
}
