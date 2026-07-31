# Drexora Support — Backend API

Production-ready **Node.js + Express** REST API backed by **Firebase (Firestore + Auth)**.  
Designed to be deployed on [Render](https://render.com) and consumed by the **GitHub Pages** frontend.

---

## Project Structure

```
drexora-support-backend/
├── src/
│   ├── server.js               # Entry point — Express app + middleware setup
│   ├── config/
│   │   ├── firebase.js         # Firebase Admin SDK initialisation
│   │   └── cors.js             # CORS configuration
│   ├── middleware/
│   │   ├── auth.js             # Firebase token verification + role guard
│   │   ├── errorHandler.js     # Centralised error handler
│   │   ├── rateLimiter.js      # IP-based rate limiting
│   │   └── validate.js         # express-validator result handler
│   ├── routes/
│   │   ├── index.js            # Root router + health check
│   │   ├── auth.routes.js      # /api/v1/auth/*
│   │   ├── user.routes.js      # /api/v1/users/*
│   │   └── ticket.routes.js    # /api/v1/tickets/*
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── user.controller.js
│   │   └── ticket.controller.js
│   └── services/
│       ├── auth.service.js
│       ├── user.service.js
│       ├── ticket.service.js
│       └── logger.service.js
├── .env.example
├── render.yaml
├── package.json
└── README.md
```

---

## Quick Start (Local)

```bash
git clone https://github.com/daviddchucks-hash/drexorasupport.git
cd drexorasupport
npm install
cp .env.example .env   # fill in your Firebase credentials
npm run dev
curl http://localhost:5000/
```

---

## API Reference

### Health Check

| Method | Path | Auth |
|--------|------|------|
| GET | `/` | None |

### Authentication — `/api/v1/auth`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/register` | None | Create a new user |
| POST | `/login` | None | Verify Firebase ID token, return profile |
| POST | `/logout` | Bearer | Revoke all refresh tokens |
| GET | `/me` | Bearer | Get authenticated user profile |

**Register body:**
```json
{ "email": "user@example.com", "password": "secret123", "displayName": "Jane Doe" }
```

**Login body** *(send the ID token obtained from the Firebase client SDK)*:
```json
{ "idToken": "<firebase-id-token>" }
```

### Users — `/api/v1/users`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Admin | List all users |
| GET | `/:uid` | Bearer | Get a user profile |
| PUT | `/:uid` | Bearer | Update own profile |
| DELETE | `/:uid` | Admin | Delete a user |

### Support Tickets — `/api/v1/tickets`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/` | Bearer | Open a new ticket |
| GET | `/` | Bearer | List own tickets (admin sees all) |
| GET | `/:id` | Bearer | Get a ticket |
| PATCH | `/:id` | Bearer | Update status (admin) or add reply |
| DELETE | `/:id` | Admin | Delete a ticket |

**Create ticket body:**
```json
{ "subject": "Cannot log in", "message": "I get an error...", "category": "account" }
```
`category`: `general` | `billing` | `technical` | `account`

**Update ticket body:**
```json
{ "status": "in-progress", "reply": "We are looking into this." }
```
`status`: `open` | `in-progress` | `resolved` | `closed`

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values.

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | HTTP port (default: 5000) |
| `NODE_ENV` | Yes | `development` or `production` |
| `FIREBASE_PROJECT_ID` | Yes | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Yes | Service account email |
| `FIREBASE_PRIVATE_KEY` | Yes | Service account private key (full PEM block) |
| `ALLOWED_ORIGINS` | Yes | Comma-separated CORS origins |
| `RATE_LIMIT_WINDOW_MS` | No | Rate limit window in ms (default: 900000) |
| `RATE_LIMIT_MAX` | No | Max requests per window per IP (default: 100) |

**Getting Firebase credentials:**
1. Firebase Console → Project Settings → **Service accounts** tab
2. Click **Generate new private key** → download the JSON
3. Copy `project_id` → `FIREBASE_PROJECT_ID`
4. Copy `client_email` → `FIREBASE_CLIENT_EMAIL`
5. Copy `private_key` (full block including `-----BEGIN/END PRIVATE KEY-----`) → `FIREBASE_PRIVATE_KEY`

---

## Deploying on Render

### Exact Render Settings

| Setting | Value |
|---------|-------|
| **Runtime** | Node |
| **Root Directory** | *(leave blank)* |
| **Build Command** | `npm install` |
| **Start Command** | `node src/server.js` |
| **Health Check Path** | `/` |

### Required Environment Variables (add in Render dashboard)

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `PORT` | `5000` |
| `FIREBASE_PROJECT_ID` | your project ID |
| `FIREBASE_CLIENT_EMAIL` | your service account email |
| `FIREBASE_PRIVATE_KEY` | your full private key |
| `ALLOWED_ORIGINS` | `https://daviddchucks-hash.github.io` |

> **Tip for `FIREBASE_PRIVATE_KEY`:** Paste the full key exactly as it appears in the JSON file. Render preserves literal `\n` characters — the server automatically converts them to real newlines.

After deployment you will receive a URL like:  
`https://drexora-support-backend.onrender.com`

---

## Connecting to GitHub Pages

In your GitHub Pages frontend, point all API calls at your Render URL:

```js
const API_BASE = 'https://drexora-support-backend.onrender.com/api/v1';

// Example — open a support ticket
async function submitTicket(idToken, subject, message) {
  const res = await fetch(`${API_BASE}/tickets`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${idToken}`,  // Firebase ID token from client SDK
    },
    body: JSON.stringify({ subject, message, category: 'general' }),
  });
  return res.json();
}
```

Make sure `ALLOWED_ORIGINS` on Render includes `https://daviddchucks-hash.github.io`.

> Firebase ID tokens expire after 1 hour. Call `user.getIdToken()` (from the Firebase JS SDK) before each request — it auto-refreshes transparently without requiring a re-login.

---

## Architecture Decisions

- **Firebase Admin SDK server-only** — credentials never leave the backend. The client uses the Firebase JS SDK to sign in and gets an ID token; the backend verifies it on every protected request.
- **No custom JWT library** — `auth.verifyIdToken()` handles signature, expiry, and revocation natively.
- **Thin controllers, fat services** — controllers handle HTTP only; business logic lives in services.
- **Centralised error handler** — every async controller calls `next(error)`, so all errors flow to `errorHandler.js`.
- **Environment-first secrets** — no credentials in source; `.env` is git-ignored.
