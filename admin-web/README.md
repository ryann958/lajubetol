# Laju Betol Admin Web

Beginner-friendly admin dashboard for the local Laju Betol backend. This is a separate workspace from the Flutter customer app and backend source.

## Start

1. Start the backend first:

```powershell
cd D:\VscodeProject\ApkAntar\suruhkami_mvp\backend
npm start
```

2. Start the dashboard in another terminal:

```powershell
cd D:\VscodeProject\ApkAntar\suruhkami_mvp\admin-web
npm start
```

3. Open `http://127.0.0.1:4173`.
4. Sign in with the local development admin account:

```text
Email: admin@lajubetol.app
Password: admin
```

The dashboard reads the backend at `http://127.0.0.1:3000`. To use another backend URL, run the following in the browser console before refreshing:

```js
localStorage.setItem('lajuBetolApi', 'http://127.0.0.1:4000')
```

## Included pages

- Overview dashboard counts.
- Catalog merchant list, add merchant, archive/reopen merchant.
- Orders.
- Travel.
- Support.
- Payments.
- Customers.

The first dashboard version intentionally uses plain HTML, CSS, and browser JavaScript so it is easy to understand and does not add a frontend framework dependency. It is a local MVP, not a public production deployment. Production still needs HTTPS, secure cookie/session handling, CSRF protection, password hashing, and a real deployment configuration.
