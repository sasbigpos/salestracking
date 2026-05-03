# FieldPulse — Sales Activity Tracker

A mobile-friendly, offline-capable sales activity tracker with GPS geotagging, user-defined questionnaires, and Firebase Firestore cloud sync.

![FieldPulse](https://img.shields.io/badge/status-ready-brightgreen) ![License](https://img.shields.io/badge/license-MIT-blue)

---

## Features

- 📍 **Geotagging** — Capture GPS coordinates on every activity log
- 🗺️ **Interactive Maps** — View all visits pinned on a Leaflet/OSM map
- 📋 **Custom Questionnaire Builder** — Add text, dropdown, checkbox, radio, date fields
- 📊 **Dashboard** — Today/week/total stats at a glance
- 🔐 **Auth** — Local demo mode + Firebase Auth
- ☁️ **Firestore Sync** — Optional cloud backup & multi-device sync
- 📥 **CSV Export** — Download all activities as a spreadsheet
- 📱 **Responsive** — Works on desktop and mobile

---

## Quick Start (Demo Mode — No Firebase Needed)

1. Clone or download this repo
2. Open `index.html` in any modern browser (or serve it locally)
3. Register with any email/password (stored locally)
4. Start logging activities — data is saved in `localStorage`

> **Local server recommended** (required for ES modules):
> ```bash
> npx serve .
> # or
> python3 -m http.server 8080
> ```
> Then open `http://localhost:8080`

---

## Firebase Setup (Cloud Sync)

1. Go to [Firebase Console](https://console.firebase.google.com) → Create a project
2. Add a **Web App** → Copy the config object
3. Enable **Firestore Database** (Start in test mode for development)
4. Enable **Authentication** → Email/Password provider
5. In FieldPulse → **Settings** → paste your Firebase config → **Save & Connect**

### Firestore Security Rules (Production)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /activities/{doc} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null;
    }
    match /config/{doc} {
      allow read, write: if request.auth != null;
    }
  }
}
```

---

## GitHub Pages Deployment

### Option A — GitHub Actions (Automatic)

1. Push this repo to GitHub
2. Go to **Settings → Pages**
3. Under **Source**, select **GitHub Actions**
4. Push to `main` — it deploys automatically via `.github/workflows/deploy.yml`

### Option B — Manual Deploy

1. Go to **Settings → Pages**
2. Source: **Deploy from branch** → `main` → `/ (root)`
3. Save — your site will be live at `https://<username>.github.io/<repo-name>`

---

## Project Structure

```
fieldpulse/
├── index.html              # App shell & all pages
├── css/
│   └── style.css           # Full stylesheet
├── js/
│   ├── app.js              # Main app controller
│   ├── auth.js             # Authentication (local + Firebase)
│   ├── db.js               # Data layer (localStorage + Firestore)
│   ├── geo.js              # Geolocation service
│   ├── maps.js             # Leaflet map helpers
│   ├── questionnaire.js    # Custom form builder
│   ├── history.js          # Activity history & detail modal
│   └── utils.js            # Shared utilities
├── .github/
│   └── workflows/
│       └── deploy.yml      # GitHub Pages CI/CD
└── README.md
```

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML5, CSS3 (custom design system), ES Modules |
| Maps | Leaflet.js + OpenStreetMap |
| Database | Firebase Firestore (cloud) + localStorage (offline) |
| Auth | Firebase Authentication + local fallback |
| Hosting | GitHub Pages |
| Fonts | Syne, DM Mono, DM Sans (Google Fonts) |

---

## License

MIT — free to use, modify, and deploy.
