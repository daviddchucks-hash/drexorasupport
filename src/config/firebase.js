/**
 * config/firebase.js — Firebase Admin SDK initialisation.
 *
 * Project: drexorasupport (drexorasupport.firebaseapp.com)
 *
 * Credentials are read exclusively from environment variables — no secrets
 * are ever hard-coded here.  The Admin SDK gives access to:
 *   - Firestore  → `db`
 *   - Auth       → `auth`
 *   - Realtime Database → `rtdb`
 *
 * How to get your service-account credentials:
 *   Firebase Console → Project Settings → Service accounts
 *   → Generate new private key → download JSON
 *   → copy project_id, client_email, private_key into your .env
 */

'use strict';

const admin = require('firebase-admin');

// Guard: only initialise once (important in hot-reload dev environments)
if (!admin.apps.length) {
  const serviceAccount = {
    projectId:   process.env.FIREBASE_PROJECT_ID,   // "drexorasupport"
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    // Render / most CI platforms store newlines as literal '\n' — restore them
    privateKey:  (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  };

  admin.initializeApp({
    credential:  admin.credential.cert(serviceAccount),

    // Realtime Database — required if you use rtdb anywhere in the app
    databaseURL: process.env.FIREBASE_DATABASE_URL ||
                 'https://drexorasupport-default-rtdb.firebaseio.com',
  });
}

/** Firestore database instance */
const db   = admin.firestore();

/** Firebase Auth instance */
const auth = admin.auth();

/**
 * Realtime Database instance.
 * Use this for real-time features (presence, live chat, notifications, etc.)
 * that need sub-second latency.  For structured data with complex queries,
 * prefer Firestore (`db`).
 */
const rtdb = admin.database();

module.exports = { admin, db, auth, rtdb };
