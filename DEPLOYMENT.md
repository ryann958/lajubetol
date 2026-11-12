# Deployment Guide

## GitHub

The repository is intended for public source and APK release distribution. Do not commit tokens, passwords, signing keys, Firebase files, or production credentials.

## Backend

The current backend is a long-running Node.js server with SQLite. For a stable public demo, deploy it to a container host such as Render using `backend/Dockerfile` and `backend/render.yaml`.

Important: the default SQLite database is local to the container. Use a persistent disk or migrate the database layer to PostgreSQL before production use. The seeded `admin@lajubetol.app` / `admin` account is development-only and must be replaced.

Health endpoint:

```text
GET /health
```

## Admin web

The admin web is static HTML/CSS/JavaScript and can be deployed to Vercel from the `admin-web` directory. After the backend has an HTTPS URL, set the browser local storage key before using the dashboard:

```js
localStorage.setItem('lajuBetolApi', 'https://your-api.example.com')
```

The dashboard does not embed credentials in source code.

## Android APK

Build the APK with the public API URL:

```powershell
flutter build apk --release --target-platform android-arm64 `
  --dart-define=API_BASE_URL=https://your-api.example.com
```

Then create a GitHub Release and upload:

```text
build/app/outputs/flutter-apk/app-release.apk
```

The APK can then be downloaded from the GitHub Release assets without USB debugging.
