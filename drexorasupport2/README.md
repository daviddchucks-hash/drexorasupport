# Drexora Support

A customer support widget platform for businesses. Add a floating chat widget to any website in under a minute — it answers questions automatically, captures leads, and records conversations.

**Live site:** https://daviddchucks-hash.github.io/drexorasupport/

---

## What it is

- **Platform dashboard** — register your business, manage FAQs, view leads and conversations, customise your widget
- **Embeddable widget** — a floating chat bubble your visitors interact with
- **Firebase backend** — Realtime Database stores all data, Authentication handles logins, Storage holds logos

## Pages

| Page | URL |
|------|-----|
| Landing | `/index.html` |
| Register | `/register.html` |
| Login | `/login.html` |
| Dashboard | `/dashboard.html` |
| Knowledge Base | `/knowledge-base.html` |
| Leads | `/leads.html` |
| Chats | `/chats.html` |
| Settings | `/settings.html` |

## Widget installation

After registering, copy the snippet from your dashboard and paste it before `</body>`:

```html
<script src="https://daviddchucks-hash.github.io/drexorasupport/widget/embed.js"
        data-business="YOUR_BUSINESS_UID"></script>
```

The widget will load your business settings (logo, theme colour, welcome message, FAQs) from Firebase.

## Firebase Realtime Database structure

```
businesses/
  {uid}/
    profile/      — name, logoUrl, themeColor, welcomeMessage, chatTitle
    faqs/
      {id}/       — question, answer, createdAt
    leads/
      {id}/       — visitorName, email, phone, message, read, createdAt
    chats/
      {id}/
        messages/
          {id}/   — role (user|bot), text, timestamp
```

## Tech stack

- Pure HTML5, CSS3, Vanilla JavaScript (ES6 Modules)
- Firebase CDN SDK v10 (Auth, Realtime Database, Storage)
- No build tools, no npm, no Node.js — works directly on GitHub Pages

## Firebase setup notes

1. Enable **Email/Password** authentication in Firebase Console → Authentication
2. Create a **Realtime Database** (start in test mode, then lock down rules)
3. Enable **Storage** for logo uploads

### Suggested Realtime Database rules

```json
{
  "rules": {
    "businesses": {
      "$uid": {
        ".read":  "$uid === auth.uid",
        ".write": "$uid === auth.uid",
        "leads":  { ".read": true, ".write": true },
        "chats":  { ".read": true, ".write": true }
      }
    }
  }
}
```

> The `leads` and `chats` nodes need public write access so the widget (running on third-party sites without auth) can save visitor data.

## Deployment

This is a static site — it deploys automatically via GitHub Pages from the `main` branch root.

Enable GitHub Pages: **Settings → Pages → Source: Deploy from branch → main → / (root)**
