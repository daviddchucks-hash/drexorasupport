/**
 * api.js — ES6 Module
 * Centralised HTTP client for the Render backend.
 *
 * Base URL: https://drexorasupport.onrender.com
 *
 * Every authenticated request automatically attaches the current Firebase
 * ID token as "Authorization: Bearer <token>".  If the token is expired the
 * Firebase SDK refreshes it transparently before we make the call.
 *
 * Usage:
 *   import { backendApi } from './api.js';
 *
 *   // unauthenticated
 *   const health = await backendApi.get('/');
 *
 *   // authenticated
 *   const profile = await backendApi.get('/api/v1/auth/me');
 *   await backendApi.post('/api/v1/auth/logout');
 */

export const BACKEND_URL = 'https://drexorasupport.onrender.com';

/* ── Internal: get a fresh Firebase ID token ──────────────────────────── */
async function _getIdToken() {
  const user = typeof firebase !== 'undefined' && firebase.auth().currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken(/* forceRefresh */ false);
  } catch (e) {
    console.warn('[api.js] Could not get ID token:', e.message);
    return null;
  }
}

/* ── Core fetch wrapper ───────────────────────────────────────────────── */
/**
 * @param {string} path      — e.g. '/api/v1/auth/me'
 * @param {object} [options] — standard fetch init overrides
 * @param {boolean} [auth=true] — whether to attach the Firebase ID token
 * @returns {Promise<any>}   — parsed JSON body
 * @throws  {Error}          — with .status and .body on non-2xx responses
 */
async function _call(path, options = {}, auth = true) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };

  if (auth) {
    const token = await _getIdToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BACKEND_URL}${path}`, { ...options, headers });

  let body;
  try { body = await res.json(); } catch { body = {}; }

  if (!res.ok) {
    const err = new Error(body.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.body   = body;
    throw err;
  }

  return body;
}

/* ── Public API surface ───────────────────────────────────────────────── */
export const backendApi = {
  /** GET without authentication (health check, etc.) */
  get: (path, auth = true) => _call(path, { method: 'GET' }, auth),

  /** POST with JSON body */
  post: (path, data, auth = true) =>
    _call(path, { method: 'POST', body: JSON.stringify(data || {}) }, auth),

  /** PUT with JSON body */
  put: (path, data, auth = true) =>
    _call(path, { method: 'PUT', body: JSON.stringify(data || {}) }, auth),

  /** PATCH with JSON body */
  patch: (path, data, auth = true) =>
    _call(path, { method: 'PATCH', body: JSON.stringify(data || {}) }, auth),

  /** DELETE */
  del: (path, auth = true) => _call(path, { method: 'DELETE' }, auth),
};

/* ═══════════════════════════════════════════════════════════════
   Convenience helpers — thin wrappers around backendApi
   ═══════════════════════════════════════════════════════════════ */

/**
 * Verify the current user's Firebase ID token with the backend and get the
 * enriched server-side user profile. Call this after firebase.auth().signIn*
 * resolves so the backend can track the session.
 *
 * @param {string} idToken — Firebase ID token from currentUser.getIdToken()
 * @returns {Promise<object|null>} — server profile or null on failure
 */
export async function backendLogin(idToken) {
  try {
    const res = await backendApi.post('/api/v1/auth/login', { idToken }, false);
    return res.data || null;
  } catch (e) {
    // Non-blocking: the client already signed in via Firebase; backend sync is best-effort.
    console.warn('[api.js] backendLogin failed (non-fatal):', e.message);
    return null;
  }
}

/**
 * Revoke the user's refresh tokens on the backend.  Call this after
 * firebase.auth().signOut() so all server sessions are invalidated.
 *
 * @returns {Promise<void>}
 */
export async function backendLogout() {
  try {
    await backendApi.post('/api/v1/auth/logout', {});
  } catch (e) {
    console.warn('[api.js] backendLogout failed (non-fatal):', e.message);
  }
}

/**
 * Update the authenticated user's display name and/or photo URL via the
 * backend.  The backend syncs the change to Firebase Auth.
 *
 * @param {string} uid
 * @param {{ displayName?: string, photoURL?: string }} updates
 * @returns {Promise<object|null>}
 */
export async function updateUserProfile(uid, updates) {
  try {
    const res = await backendApi.put(`/api/v1/users/${uid}`, updates);
    return res.data || null;
  } catch (e) {
    console.warn('[api.js] updateUserProfile failed:', e.message);
    throw e; // re-throw so callers can show an error toast
  }
}

/**
 * Mark the current user as online via the backend presence endpoint.
 * The backend writes to RTDB `presence/<uid>`.
 *
 * @returns {Promise<void>}
 */
export async function markPresenceOnline() {
  try {
    await backendApi.post('/api/v1/rtdb/presence/online', {});
  } catch (e) {
    console.warn('[api.js] markPresenceOnline failed (non-fatal):', e.message);
  }
}

/**
 * Mark the current user as offline via the backend presence endpoint.
 *
 * @returns {Promise<void>}
 */
export async function markPresenceOffline() {
  try {
    await backendApi.post('/api/v1/rtdb/presence/offline', {});
  } catch (e) {
    console.warn('[api.js] markPresenceOffline failed (non-fatal):', e.message);
  }
}

/**
 * Fetch the current user's unread notifications from the backend.
 *
 * @returns {Promise<Array>}
 */
export async function fetchNotifications() {
  try {
    const res = await backendApi.get('/api/v1/rtdb/notifications');
    return res.data || [];
  } catch (e) {
    console.warn('[api.js] fetchNotifications failed (non-fatal):', e.message);
    return [];
  }
}

/**
 * Mark all of the current user's notifications as read via the backend.
 *
 * @returns {Promise<void>}
 */
export async function markNotificationsRead() {
  try {
    await backendApi.post('/api/v1/rtdb/notifications/read', {});
  } catch (e) {
    console.warn('[api.js] markNotificationsRead failed (non-fatal):', e.message);
  }
}
