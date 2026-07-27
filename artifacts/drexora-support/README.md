# Drexora Support

Drexora Support is a Firebase-backed customer support widget and workspace for small businesses. It answers common questions from Firestore FAQs, collects leads when it cannot answer, and gives owners a polished place to manage their support experience.

## Local preview

```bash
pnpm install
PORT=24252 BASE_PATH=/ pnpm --filter @workspace/drexora-support run build
```

The app is served from `dist/public` after the build. Firebase Hosting can deploy that directory with:

```bash
firebase deploy --only hosting,firestore
```

## Firebase configuration

The Drexora Firebase browser configuration is included in `src/lib/firebase.ts`. For another Firebase project, override it with:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID
```

Enable Email/Password in Firebase Authentication before creating the first workspace.

## Customer widget

After publishing the `public/widget` files, give customers this snippet:

```html
<script src="https://daviddchucks-hash.github.io/drexorasupport/widget/embed.js" data-business="YOUR_BUSINESS_ID"></script>
```

Replace `YOUR_BUSINESS_ID` with the unique ID shown in the business workspace. The loader reads that ID from `data-business`, loads the widget settings and FAQs from Firestore, and writes leads to the `Leads` collection.

## Firestore collections

- `Businesses`
- `Users`
- `FAQs`
- `Chats`
- `Leads`
- `Settings`

The `firestore.rules` file contains the starter access model. Review and adjust it for your production team roles before launch.