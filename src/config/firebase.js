/**
 * config/firebase.js — Firebase Admin SDK initialisation.
 *
 * Reads credentials from environment variables so that no secrets
 * are ever hard-coded in the source. Call getFirestore() / getAuth()
 * on the exported `admin` instance wherever Firebase services are needed.
 */

'use strict';

const admin = require('firebase-admin');

// Guard: only initialise once (important when modules are hot-reloaded in dev)
if (!admin.apps.length) {
  const serviceAccount = {
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    // Render / most CI platforms store newlines as literal '\n' — restore them
    privateKey:  (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  };

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

/** Firestore database instance */
const db   = admin.firestore();

/** Firebase Auth instance */
const auth = admin.auth();

module.exports = { admin, db, auth };
