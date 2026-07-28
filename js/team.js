/**
 * team.js — ES6 Module
 * Team Management: workspace-aware members, invitations, roles, permissions.
 */

import {
  requireAuth, setupSidebar, toast, escHtml, timeAgo,
  getWorkspaceUid, getCurrentUserRole, getUserRecord, logActivity
} from './app.js';

const ROLES = {
  owner: {
    label: 'Owner', color: 'badge-danger',
    permissions: {
      'Reply to Chats':true,'Reply to Emails':true,'Reply to WhatsApp':true,
      'Create Tickets':true,'Delete Tickets':true,'Assign Tickets':true,
      'Close Tickets':true,'Resolve Tickets':true,'Manage Team':true,
      'Manage Billing':true,'View Analytics':true,'Export Data':true,
      'Manage AI':true,'Manage Widget':true,'Create API Keys':true,
      'Manage Integrations':true,'Delete Workspace':true,'Invite Members':true
    }
  },
  admin: {
    label: 'Admin', color: 'badge-warning',
    permissions: {
      'Reply to Chats':true,'Reply to Emails':true,'Reply to WhatsApp':true,
      'Create Tickets':true,'Delete Tickets':true,'Assign Tickets':true,
      'Close Tickets':true,'Resolve Tickets':true,'Manage Team':true,
      'Manage Billing':false,'View Analytics':true,'Export Data':true,
      'Manage AI':true,'Manage Widget':true,'Create API Keys':true,
      'Manage Integrations':true,'Delete Workspace':false,'Invite Members':true
    }
  },
  agent: {
    label: 'Support Agent', color: 'badge-info',
    permissions: {
      'Reply to Chats':true,'Reply to Emails':true,'Reply to WhatsApp':true,
      'Create Tickets':true,'Delete Tickets':false,'Assign Tickets':false,
      'Close Tickets':true,'Resolve Tickets':true,'Manage Team':false,
      'Manage Billing':false,'View Analytics':false,'Export Data':false,
      'Manage AI':false,'Manage Widget':false,'Create API Keys':false,
      'Manage Integrations':false,'Delete Workspace':false,'Invite Members':false
    }
  },
  viewer: {
    label: 'Viewer', color: 'badge-muted',
    permissions: {
      'Reply to Chats':false,'Reply to Emails':false,'Reply to WhatsApp':false,
      'Create Tickets':false,'Delete Tickets':false,'Assign Tickets':false,
      'Close Tickets':false,'Resolve Tickets':false,'Manage Team':false,
      'Manage Billing':false,'View Analytics':true,'Export Data':false,
      'Manage AI':false,'Manage Widget':false,'Create API Keys':false,
      'Manage Integrations':false,'Delete Workspace':false,'Invite Members':false
    }
  }
};
const ALL_PERMISSIONS = Object.keys(ROLES.owner.permissions);

let currentUser    = null;
let workspaceUid   = null;
let userRole       = null;
let userRec        = null;
let db             = null;
let members        = {};
let invitations    = {};
let editingMemberId= null;

requireAuth(async (user, wid) => {
  currentUser  = user;
  workspaceUid = wid;
  userRole     = await getCurrentUserRole();
  userRec      = await getUserRecord();
  db           = firebase.database();
  setupSidebar(user);
  _applyTeamRoleUI(userRole);
  bindEvents();
  loadTeam();
  loadIncomingInvitations();
  setupPermissionPreview();
});

/**
 * Agents and viewers cannot invite teammates or manage team settings.
 * Hide the Invite Teammate button; the team table remains visible
 * so they can see who else is on the team.
 */
function _applyTeamRoleUI(role) {
  if (['owner', 'admin'].includes(role)) return; // full access
  const inviteBtn = document.getElementById('invite-btn');
  if (inviteBtn) inviteBtn.style.display = 'none';
}

function loadTeam() {
  let mLoaded = false, iLoaded = false;
  const timeout = setTimeout(() => {
    if (!mLoaded) { mLoaded = true; renderMembers(); updateStats(); }
    if (!iLoaded) { iLoaded = true; renderInvitations(); }
  }, 6000);

  db.ref(`businesses/${workspaceUid}/team/members`).on('value', snap => {
    mLoaded = true;
    members = snap.val() || {};
    renderMembers();
    updateStats();
  }, err => console.warn('[Team] members read failed:', err.message));

  db.ref(`businesses/${workspaceUid}/team/invitations`).on('value', snap => {
    iLoaded = true;
    invitations = snap.val() || {};
    renderInvitations();
    updateStats();
  });
}

function loadIncomingInvitations() {
  // Already processed by app.js; this is just a UI refresh trigger
}

function updateStats() {
  const arr = Object.values(members);
  const set = (id, v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  set('stat-total-members', arr.length);
  set('stat-online-members', arr.filter(m=>m.status==='online').length);
  set('stat-pending-invites', Object.values(invitations).filter(i=>i.status==='pending').length);
  set('stat-active-agents', arr.filter(m=>m.role==='agent'&&m.status==='online').length);
}

function renderMembers() {
  const tbody = document.getElementById('members-tbody');
  if (!tbody) return;
  const arr = Object.entries(members);
  if (!arr.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="empty-state-icon">👥</div>
      <div class="empty-state-title">No team members yet</div>
      <div class="empty-state-desc">Invite your first teammate using the button above.</div></div></td></tr>`;
    return;
  }

  tbody.innerHTML = arr.map(([uid, m]) => {
    const role   = ROLES[m.role] || ROLES.agent;
    const isMe   = uid === currentUser.uid;
    const canEdit= userRole === 'owner' || (userRole === 'admin' && m.role !== 'owner');
    return `
      <tr>
        <td>
          <div class="member-cell">
            <div class="member-avatar">
              ${m.photoUrl
                ? `<img class="member-avatar-img" src="${escHtml(m.photoUrl)}" alt="">`
                : `<div class="member-avatar-fallback">${escHtml((m.name||m.email||'?')[0].toUpperCase())}</div>`}
            </div>
            <div>
              <div class="member-name">${escHtml(m.name||'—')} ${isMe?'<span style="font-size:.65rem;color:var(--text-muted)">(you)</span>':''}</div>
              <div class="member-email">${escHtml(m.email||'—')}</div>
            </div>
          </div>
        </td>
        <td><span class="badge ${role.color}">${escHtml(role.label)}</span></td>
        <td>
          <div class="status-cell">
            <span class="status-dot" style="background:${m.status==='online'?'#10b981':m.status==='away'?'#f59e0b':'#6b7280'}"></span>
            <span>${escHtml(m.suspended?'Suspended':m.status||'offline')}</span>
          </div>
        </td>
        <td style="text-align:center">${m.assignedChats||0}</td>
        <td style="text-align:center">${m.assignedTickets||0}</td>
        <td style="font-size:.8rem;color:var(--text-muted)">${timeAgo(m.lastActive)}</td>
        <td>
          ${canEdit ? `
          <div class="action-menu-wrap">
            <button class="btn btn-ghost btn-sm" onclick="toggleMemberMenu(event,'${escHtml(uid)}')">⋯</button>
            <div class="action-menu" id="menu-${escHtml(uid)}">
              <button class="action-menu-item" onclick="viewProfile('${escHtml(uid)}')">👤 View Profile</button>
              <button class="action-menu-item" onclick="editMember('${escHtml(uid)}')">✏️ Edit Role</button>
              <button class="action-menu-item" onclick="toggleSuspend('${escHtml(uid)}')">${m.suspended?'✅ Unsuspend':'🚫 Suspend'}</button>
              ${m.role!=='owner'?`<button class="action-menu-item danger" onclick="removeMember('${escHtml(uid)}')">🗑 Remove</button>`:''}
            </div>
          </div>` : '—'}
        </td>
      </tr>`;
  }).join('');
}

function renderInvitations() {
  const tbody = document.getElementById('invitations-tbody');
  if (!tbody) return;
  const arr = Object.entries(invitations).filter(([,i])=>i.status==='pending');
  const container = document.getElementById('invitations-section');
  if (container) container.style.display = arr.length ? 'block' : 'none';
  if (!arr.length) return;

  tbody.innerHTML = arr.map(([id, inv]) => `
    <tr>
      <td>${escHtml(inv.email||'—')}</td>
      <td>${escHtml(inv.name||'—')}</td>
      <td><span class="badge ${ROLES[inv.role]?.color||'badge-muted'}">${ROLES[inv.role]?.label||inv.role}</span></td>
      <td><span class="badge badge-warning">Pending</span></td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="cancelInvitation('${escHtml(id)}')">Cancel</button>
      </td>
    </tr>`).join('');
}

/* ── Invite form ─────────────────────────────────────────── */
async function sendInvitation() {
  const name  = document.getElementById('invite-name')?.value.trim();
  const email = document.getElementById('invite-email')?.value.trim().toLowerCase();
  const role  = document.getElementById('invite-role')?.value || 'agent';
  const msg   = document.getElementById('invite-message')?.value.trim();

  if (!email) { toast('Email is required.', 'warning'); return; }
  if (!name)  { toast('Name is required.', 'warning');  return; }

  const btn = document.getElementById('send-invite-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

  try {
    // Check if user is already a member
    const existingMember = Object.values(members).find(m => m.email?.toLowerCase() === email);
    if (existingMember) { toast('This person is already in your workspace.', 'warning'); return; }

    const perms = ROLES[role]?.permissions || {};
    const invId = db.ref(`businesses/${workspaceUid}/team/invitations`).push().key;

    // Write business-level invitation
    await db.ref(`businesses/${workspaceUid}/team/invitations/${invId}`).set({
      email, name, role,
      message:    msg || '',
      status:     'pending',
      permissions: perms,
      invitedBy:  currentUser.uid,
      invitedByName: userRec?.name || currentUser.email.split('@')[0],
      createdAt:  firebase.database.ServerValue.TIMESTAMP
    });

    // Write pending invitation at root level (cross-workspace lookup)
    const encodedEmail = email.replace(/\./g, ',');
    const invKey = db.ref(`pendingInvitations/${encodedEmail}`).push().key;
    await db.ref(`pendingInvitations/${encodedEmail}/${invKey}`).set({
      businessUid:       workspaceUid,
      businessInviteId:  invId,
      name, role,
      permissions:       perms,
      invitedBy:         currentUser.uid,
      message:           msg || ''
    });

    await logActivity(workspaceUid, `${userRec?.name||'Owner'} invited ${name} (${email}) as ${role}`, { type: 'invitation_sent' });

    toast(`Invitation sent to ${email}.`, 'success');
    closeModal('invite-modal');
    ['invite-name','invite-email','invite-message'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
  } catch (err) {
    toast('Failed to send invitation.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Send Invitation'; }
  }
}

window.cancelInvitation = async function(invId) {
  if (!confirm('Cancel this invitation?')) return;
  try {
    const inv = invitations[invId];
    await db.ref(`businesses/${workspaceUid}/team/invitations/${invId}`).remove();
    if (inv?.email) {
      const encodedEmail = inv.email.toLowerCase().replace(/\./g, ',');
      const snap = await db.ref(`pendingInvitations/${encodedEmail}`).once('value');
      const pending = snap.val() || {};
      for (const [key, entry] of Object.entries(pending)) {
        if (entry.businessInviteId === invId || entry.businessUid === workspaceUid) {
          await db.ref(`pendingInvitations/${encodedEmail}/${key}`).remove();
        }
      }
    }
    toast('Invitation cancelled.', 'info');
  } catch { toast('Failed to cancel invitation.', 'error'); }
};

/* ── Member actions ──────────────────────────────────────── */
window.viewProfile = function(uid) {
  closeAllMenus();
  const m = members[uid];
  if (!m) return;
  const role = ROLES[m.role] || ROLES.agent;
  document.getElementById('view-profile-content').innerHTML = `
    <div style="text-align:center;padding:20px 0 10px">
      <div style="width:80px;height:80px;border-radius:50%;background:var(--glass-active);margin:0 auto 12px;
                  display:flex;align-items:center;justify-content:center;font-size:1.6rem;font-weight:700;color:var(--primary)">
        ${m.photoUrl ? `<img src="${escHtml(m.photoUrl)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : escHtml((m.name||'?')[0].toUpperCase())}
      </div>
      <div style="font-size:1.1rem;font-weight:700;margin-bottom:4px">${escHtml(m.name||'Unknown')}</div>
      <div style="font-size:.85rem;color:var(--text-muted);margin-bottom:10px">${escHtml(m.email||'—')}</div>
      <span class="badge ${role.color}">${role.label}</span>
    </div>
    <div style="background:var(--surface-raised);border-radius:var(--radius);padding:14px;margin-top:12px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:.82rem">
        <div><span style="color:var(--text-muted)">Status</span><br><strong>${escHtml(m.status||'—')}</strong></div>
        <div><span style="color:var(--text-muted)">Last Active</span><br><strong>${timeAgo(m.lastActive)}</strong></div>
        <div><span style="color:var(--text-muted)">Assigned Chats</span><br><strong>${m.assignedChats||0}</strong></div>
        <div><span style="color:var(--text-muted)">Assigned Tickets</span><br><strong>${m.assignedTickets||0}</strong></div>
        <div><span style="color:var(--text-muted)">Joined</span><br><strong>${timeAgo(m.joinedAt)}</strong></div>
      </div>
    </div>`;
  openModal('view-profile-modal');
};

window.editMember = function(uid) {
  closeAllMenus();
  editingMemberId = uid;
  const m = members[uid];
  if (!m) return;

  const infoEl = document.getElementById('edit-role-member-info');
  if (infoEl) infoEl.innerHTML = `
    <div style="width:36px;height:36px;border-radius:50%;background:var(--glass-active);
                display:flex;align-items:center;justify-content:center;font-size:.9rem;font-weight:700;color:var(--primary)">
      ${escHtml((m.name||'?')[0].toUpperCase())}
    </div>
    <div><div style="font-weight:600">${escHtml(m.name||'Member')}</div>
    <div style="font-size:.78rem;color:var(--text-muted)">${escHtml(m.email||'')}</div></div>`;

  const roleSelect = document.getElementById('edit-role-select');
  if (roleSelect) roleSelect.value = m.role || 'agent';

  renderPermissionEditor(m.role || 'agent', m.permissions || {});
  openModal('edit-role-modal');
};

function renderPermissionEditor(role, overrides) {
  const grid = document.getElementById('perm-editor-grid');
  if (!grid) return;
  const defaults = ROLES[role]?.permissions || {};
  const merged   = { ...defaults, ...overrides };
  grid.innerHTML = ALL_PERMISSIONS.map(perm => `
    <label class="perm-toggle">
      <input type="checkbox" class="perm-checkbox" data-perm="${escHtml(perm)}" ${merged[perm]?'checked':''}>
      <span>${escHtml(perm)}</span>
    </label>`).join('');
}

window.toggleMemberMenu = function(e, uid) {
  e.stopPropagation();
  document.querySelectorAll('.action-menu.open').forEach(m => { if(m.id!==`menu-${uid}`) m.classList.remove('open'); });
  document.getElementById(`menu-${uid}`)?.classList.toggle('open');
};

window.toggleSuspend = async function(uid) {
  closeAllMenus();
  const m = members[uid];
  if (!m) return;
  const action = m.suspended ? 'Unsuspend' : 'Suspend';
  if (!confirm(`${action} ${m.name||'this member'}?`)) return;
  try {
    await db.ref(`businesses/${workspaceUid}/team/members/${uid}`).update({ suspended: !m.suspended, status: 'offline' });
    await logActivity(workspaceUid, `${userRec?.name||'Owner'} ${action.toLowerCase()}ed ${m.name}`, { type: 'member_suspended', targetUid: uid });
    toast(`Member ${action.toLowerCase()}ed.`, 'success');
  } catch { toast('Failed to update member.', 'error'); }
};

window.removeMember = async function(uid) {
  closeAllMenus();
  const m = members[uid];
  if (!m) return;
  if (!confirm(`Remove ${m.name||'this member'} from the workspace? This cannot be undone.`)) return;
  try {
    await db.ref(`businesses/${workspaceUid}/team/members/${uid}`).remove();
    // Clean up their userWorkspace entry
    await firebase.database().ref(`userWorkspace/${uid}`).remove().catch(()=>{});
    await logActivity(workspaceUid, `${userRec?.name||'Owner'} removed ${m.name} from the workspace`, { type: 'member_removed', targetUid: uid });
    toast('Member removed.', 'info');
  } catch { toast('Failed to remove member.', 'error'); }
};

function setupPermissionPreview() {
  const roleSelect = document.getElementById('invite-role');
  if (!roleSelect) return;
  roleSelect.addEventListener('change', () => {
    const role  = roleSelect.value;
    const perms = ROLES[role]?.permissions || {};
    const grid  = document.getElementById('perm-preview-grid');
    if (!grid) return;
    grid.innerHTML = ALL_PERMISSIONS.map(p => `
      <div class="perm-preview-item">
        <span class="perm-preview-dot" style="color:${perms[p]?'#10b981':'#ef4444'}">${perms[p]?'✓':'✗'}</span>
        <span class="perm-preview-label">${escHtml(p)}</span>
      </div>`).join('');
  });
  roleSelect.dispatchEvent(new Event('change'));

  document.getElementById('edit-role-select')?.addEventListener('change', function() {
    renderPermissionEditor(this.value, {});
  });
}

function bindEvents() {
  // Invite modal
  document.getElementById('invite-btn')?.addEventListener('click', () => openModal('invite-modal'));
  document.getElementById('close-invite-modal')?.addEventListener('click', () => closeModal('invite-modal'));
  document.getElementById('cancel-invite-btn')?.addEventListener('click', () => closeModal('invite-modal'));
  document.getElementById('invite-modal')?.addEventListener('click', e => { if(e.target.id==='invite-modal') closeModal('invite-modal'); });
  document.getElementById('send-invite-btn')?.addEventListener('click', sendInvitation);

  // Edit role modal
  document.getElementById('close-edit-role-modal')?.addEventListener('click', () => closeModal('edit-role-modal'));
  document.getElementById('cancel-edit-role-btn')?.addEventListener('click',  () => closeModal('edit-role-modal'));
  document.getElementById('save-edit-role-btn')?.addEventListener('click', saveRoleEdit);

  // View profile modal
  document.getElementById('close-view-profile-modal')?.addEventListener('click', () => closeModal('view-profile-modal'));
  document.getElementById('close-profile-btn')?.addEventListener('click', () => closeModal('view-profile-modal'));

  // Close menus on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('.action-menu-wrap')) closeAllMenus();
  });
}

async function saveRoleEdit() {
  if (!editingMemberId) return;
  const role = document.getElementById('edit-role-select')?.value || 'agent';
  const perms = {};
  document.querySelectorAll('.perm-checkbox').forEach(cb => { perms[cb.dataset.perm] = cb.checked; });

  try {
    await db.ref(`businesses/${workspaceUid}/team/members/${editingMemberId}`).update({ role, permissions: perms });
    // Update userWorkspace role too
    await firebase.database().ref(`userWorkspace/${editingMemberId}/role`).set(role).catch(()=>{});
    await logActivity(workspaceUid, `${userRec?.name||'Owner'} changed ${members[editingMemberId]?.name||'member'}'s role to ${role}`, { type: 'role_changed', targetUid: editingMemberId });
    toast('Role updated.', 'success');
    closeModal('edit-role-modal');
  } catch { toast('Failed to save role.', 'error'); }
}

function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
function closeAllMenus(){ document.querySelectorAll('.action-menu.open').forEach(m => m.classList.remove('open')); }
