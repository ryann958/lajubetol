# Laju Betol System Foundation

## Purpose

This file is the baseline for the Laju Betol customer app, admin dashboard, and shared backend. It is intentionally simple so a beginner can understand where each responsibility belongs.

## Workspace layout

```text
laju_betol_mvp/
  lib/                         Flutter customer app
  test/                        Flutter tests
  backend/
    src/                       Node.js REST API source
    test/                      Backend tests
    data/                      Local SQLite database (ignored from source control)
    README.md                  Backend setup and endpoint guide
  docs/
    system-foundation.md       This architecture and workflow reference
  prd.md                       Rebuild product requirements
```

## Applications

### Customer app

- Flutter Android application.
- Uses the REST API for authentication, catalog, orders, travel, profile, support, and mock payments.
- Never receives admin-only data or permission to manage catalog records.

### Admin dashboard

- Web application planned after the foundation is verified.
- Uses the same REST API with admin roles.
- Starts with catalog and order operations; reports and advanced workflows come later.

### Backend

- Beginner-friendly Node.js REST API.
- SQLite for local development and tests.
- PostgreSQL is the future production database target; the API layer should remain database-agnostic at the boundary.
- No external credentials or provider calls in the MVP.

## Roles and responsibilities

| Role | Intended access |
|---|---|
| `customer` | Own profile, catalog reads, own orders, travel requests, support, own mock payments |
| `admin` | All operational data and configuration |
| `operator` | Catalog and order operations |
| `merchant` | Assigned merchant catalog and order operations |
| `driver` | Assigned travel and delivery operations |
| `support` | Support threads and customer lookup needed for support |

Roles are stored separately from users so one user can receive more than one role without changing the user table.

## Authentication and authorization

1. The client calls `POST /api/auth/login`.
2. The backend creates a random session token and stores its expiry in SQLite.
3. The client sends `Authorization: Bearer <token>` on protected calls.
4. `authenticate()` resolves the user and roles.
5. Admin routes call `requireRoles()` before doing any work.
6. Every admin mutation writes an audit record with actor, action, resource, and result.

The seeded admin credentials are for local development only and must be replaced before any public deployment.

## Audit boundary

Audit records are created for privileged actions, including future merchant/product CRUD, order overrides, role changes, payment adjustments, and settings changes. Passwords, session tokens, and payment secrets must never be written to the audit table.

## Current foundation milestone

- SQLite migration for roles, role assignments, and audit logs.
- Seeded local admin and customer accounts.
- Login response includes roles.
- Admin identity, dashboard counts, and audit-log endpoints are role-protected.
- Customer APIs remain separate from admin APIs.

## Next implementation order

1. Admin catalog CRUD.
2. Admin order operations.
3. Flutter customer API client.
4. Admin web dashboard shell.
5. Travel, support, payment operations and reporting.
6. Production hardening: password hashing, HTTPS, rate limiting, secret management, backups, and PostgreSQL migration.
