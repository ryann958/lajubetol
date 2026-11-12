# Laju Betol MVP Backend

Beginner-friendly REST API for the Laju Betol MVP. This is the first backend step: it starts a local HTTP server and exposes a health check. Feature APIs will be added one module at a time and verified after each step.

## Requirements

- Node.js 22.5 or newer (Node 26 is recommended)
- No external service is needed; SQLite is provided by Node's built-in `node:sqlite` module

## Start the server

From this folder:

```powershell
npm start
```

The server listens on `http://127.0.0.1:3000`.

To use another port:

```powershell
$env:PORT = 4000
npm start
```

## Verify it

Open `http://127.0.0.1:3000/health` in a browser, or run:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
```

Expected response:

```json
{
  "ok": true,
  "service": "laju_betol-mvp-backend",
  "version": "1.0.0",
  "time": "..."
}
```

Run the automated smoke test:

```powershell
npm test
```

## Step 2: SQLite database

The server now creates `data/laju-betol.sqlite` on first start. It applies schema version 1 and seeds one demo user, three merchants, and three products. Set `DB_PATH` to use another database file.

```powershell
$env:DB_PATH = 'D:\temp\laju-betol.sqlite'
npm start
```

The `/health` response includes row counts so you can verify the database without opening the SQLite file. Local SQLite files under `backend/data/` are ignored by Git and must not be committed.

## Step 3: authentication

The demo authentication endpoints are now available:

- `POST /api/auth/login` with `{ "email": "demo@lajubetol.app", "password": "password" }`
- `GET /api/auth/me` with `Authorization: Bearer <token>`
- `POST /api/auth/logout` with `Authorization: Bearer <token>`

The server stores sessions in SQLite and expires them after seven days. The demo password is intentionally simple and must be replaced with a real password-hashing flow before production. No real authentication provider is contacted.

## Step 4: MVP feature API

The mock-backed MVP endpoints are now available:

### Public catalog

- `GET /api/catalog/merchants?query=coffee&category=beverage`
- `GET /api/catalog/merchants/:merchantId`
- `GET /api/catalog/products?merchantId=merchant_kopi&query=kopi`

### Authenticated profile

- `GET /api/profile`
- `PATCH /api/profile` with `displayName` and/or `phone`
- `GET /api/profile/permissions`
- `PUT /api/profile/permissions` with `{ "permission": "location", "state": "allowed" }`

### Orders

- `GET /api/orders`
- `GET /api/orders/:orderId`
- `POST /api/orders` with `{ "items": [{ "productId": "product_nasi", "quantity": 1 }], "deliveryAddress": "..." }`
- `POST /api/orders/:orderId/status` with the next valid status
- `POST /api/orders/:orderId/cancel`

Valid order flow: `placed` -> `preparing` -> `ready` -> `on_the_way` -> `completed`. Cancellation is allowed before `on_the_way`.

### Travel

- `GET /api/travel/requests`
- `GET /api/travel/requests/:requestId`
- `POST /api/travel/quote`
- `POST /api/travel/requests`
- `POST /api/travel/requests/:requestId/status`

### Support chat

- `GET /api/support/threads`
- `GET /api/support/threads/:threadId`
- `POST /api/support/threads` with `{ "subject": "Help", "message": "..." }`
- `POST /api/support/threads/:threadId/messages` with `{ "message": "..." }`

### Payments mock

- `GET /api/payments`
- `POST /api/payments` with `{ "method": "qris", "amountCents": 900, "orderId": "..." }`
- `POST /api/payments/:paymentId/pay`

Payment methods are mock-only: `qris`, `mock_card`, and `cash`. No external payment provider is contacted.

## Admin MVP API

Admin catalog management:

- `GET /api/admin/catalog/merchants`
- `POST /api/admin/catalog/merchants/ignored` with `name`, `description`, `category`, and optional `isOpen`
- `PATCH /api/admin/catalog/merchants/:id`
- `DELETE /api/admin/catalog/merchants/:id` archives the merchant and disables its products
- `GET /api/admin/catalog/products?merchantId=...`
- `POST /api/admin/catalog/products/ignored` with `merchantId`, `name`, `description`, and `priceCents`
- `PATCH /api/admin/catalog/products/:id`
- `DELETE /api/admin/catalog/products/:id` archives the product

Admin operations:

- `GET /api/admin/operations/orders?status=placed`
- `POST /api/admin/operations/orders/:id/status`
- `GET /api/admin/operations/travel`
- `POST /api/admin/operations/travel/:id/status`
- `GET /api/admin/operations/support`
- `POST /api/admin/operations/support/:threadId/messages`
- `GET /api/admin/operations/payments`
- `GET /api/admin/operations/customers`

Catalog mutations and operational mutations create audit records. Admin routes require an appropriate role and customer tokens receive `403 FORBIDDEN`.

## Run all backend tests

```powershell
npm test
```

The integration test exercises catalog, profile, permissions, order creation and state validation, travel quote/request, support thread/message, and payment creation/settlement in one local SQLite database.
