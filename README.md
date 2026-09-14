# Stock SDI Demo

A self-hosted stock management demo (Next.js + Express + PostgreSQL) running on a
Debian VM in a home lab — fronted by Nginx and Cloudflare Tunnel.

**Live demo:** https://stock-sdi.my.id · https://www.stock-sdi.my.id

> This is a **portfolio / learning project**. It is a demo implementation, not a
> production system of any company.

---

## Overview

Stock SDI Demo is a small inventory management app. It solves a common
small-business problem: knowing how much stock is available per **warehouse**
(`Puri`, `CS TCL`, `CS SBF`) and per **condition** (`Good` / `Bad`), recording
every stock-in and stock-out transaction, and keeping a searchable history with
filtering and Excel export so teams can see what changed and when.

The project was built while learning how to take a business idea from code to
deployment: designing an application end-to-end, custom authentication, a REST
API, a PostgreSQL schema, and then self-hosting it on a Linux server that is
reachable over HTTPS via Cloudflare Tunnel.

The frontend is a **static export** (Next.js `output: 'export'`). It talks only to
the custom REST API — there is no direct database access from the browser.

---

## Features

- Login with username + password
- Guest (`tamu.demo`) quick access — read-only
- Stock dashboard
- Stock per warehouse (`Puri`, `CS TCL`, `CS SBF`)
- Good / Bad stock condition
- Stock-in and stock-out transactions
- Transaction history
- History filters (warehouse, kriteria, jenis, barang)
- Date range filtering
- Excel export
- Kelola Barang (create / rename / delete products)
- Packing calculator
- Mix-barang capacity calculator
- Session persistence across refresh
- Logout
- Protected API endpoints
- Dashboard auto-refresh (polling)

**Roles**

- `staff` — read + write (create/edit/delete products, record transactions)
- `guest` — read-only

There is no complex RBAC / permission matrix — just these two roles.

---

## Tech Stack

### Frontend

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- Static export (`next.config.ts` → `output: 'export'`)
- `xlsx` for Excel export
- REST API consumption via `src/lib/api.ts`

### Backend

- Node.js
- Express
- REST API
- Custom authentication (cookie-based)
- `pg` (node-postgres) for PostgreSQL

### Authentication

- `bcryptjs` for password hashing (cost 12)
- Random session token (32 bytes, base64url)
- SHA-256 token hash stored in the database
- `HttpOnly` cookie
- `Secure` cookie flag (enabled on HTTPS production)
- `SameSite=Lax`
- Session expiration: 8 hours (default)
- Login rate limiting

### Database

- PostgreSQL
- Database: `stock_sdi_demo`
- Tables: `barang`, `stock_levels`, `transaksi`, `profiles`, `user_accounts`, `sessions`

### Server

- Debian Linux
- Proxmox VM
- systemd
- Nginx
- Cloudflare Tunnel
- UFW firewall

---

## Architecture

```
Internet
   │
   ▼
Cloudflare
   │
   ▼
Cloudflare Tunnel
   │
   ▼
Nginx
   │
   ├── stock-sdi.my.id / www.stock-sdi.my.id
   │        │
   │        ▼
   │     :8081
   │        │
   │        ▼
   │   Stock SDI Demo (static export + API proxy)
   │        │
   │        ▼
   │      API :3101
   │        │
   │        ▼
   │   PostgreSQL :5432
   │
   └── server.stock-sdi.my.id
            │
            ▼
        Homelab Dashboard
```

The API (`3101`) and PostgreSQL (`5432`) are **not exposed directly** to the
Internet:

- API listens on `127.0.0.1:3101` only
- PostgreSQL listens on `127.0.0.1:5432` / `[::1]:5432` only

All external traffic enters through the Cloudflare Tunnel via Nginx.

---

## Authentication

- `POST /api/auth/login` — validates credentials, creates a session, sets an
  HttpOnly cookie
- `GET /api/auth/me` — restores / validates the current session
- `POST /api/auth/logout` — deletes the server-side session and clears the cookie

The session token is stored **hashed** in PostgreSQL (`token_hash`, SHA-256);
the raw token is only sent to the browser inside the cookie.

---

## Security

### Password storage

- Passwords are **never stored in plaintext**.
- `bcryptjs` with **cost 12** (`api/lib/passwords.js`).
- A dummy bcrypt hash is used for unknown usernames to reduce
  username-enumeration timing differences.

### Sessions

- Browser receives a session cookie: `HttpOnly`, `Secure`, `SameSite=Lax`.
- Session TTL: **8 hours** (configurable via `SESSION_TTL_HOURS`).
- Only the **SHA-256 hash** of the token is stored in the database.
- Logout and expired-session cleanup remove rows from `sessions`.

### Authentication behavior

- Protected endpoints return `401 Unauthorized` when there is no valid session.
- Failed login returns a generic message (does not reveal whether the username
  or the password was wrong).
- Guest calling a write endpoint returns `403 Forbidden`.
- Database queries use parameterized statements to mitigate SQL injection.

### Rate limiting

```
5 failed attempts  per (IP + username)  within 15 minutes
100 attempts       per IP               within 15 minutes
```

- Implemented in-memory (`api/middleware/rateLimit.js`).
- **Limitation:** the rate-limit state resets when the process restarts and it
  is not suitable for a multi-instance deployment. It fits this single-instance
  demo.

### Firewall / exposure

- The API and PostgreSQL are bound to `127.0.0.1` only and are not reachable
  from the LAN/public (no UFW allow rule for `3101` / `5432`).
- UFW default policy is deny incoming; only specific services are allowed
  (SSH, HTTP from LAN/Tailscale, staging `8080`, ...).

### Secrets

- Secrets live in environment files (`.env`, `.env.local`, `.demo-users.json`),
  all gitignored.
- **No real secret value appears in this repository.**

---

## Deployment

### Frontend flow

```
Local development
      ↓
Git / GitHub
      ↓
Static frontend build/export (Next.js)
      ↓
/var/www/stock-sdi-demo
      ↓
Nginx :8081
      ↓
Cloudflare Tunnel
      ↓
HTTPS public domain
```

### Backend flow

```
/home/nugie/stock-sdi-api
        ↓
systemd (stock-sdi-api.service)
        ↓
127.0.0.1:3101
```

The backend is managed by a systemd unit
(`stock-sdi-api.service`) that is enabled, restarts on failure, and uses
`PrivateTmp`, `ProtectSystem=full`, and a restricted `ReadWritePaths`.

---

## Infrastructure

```
Old Dell Latitude E6230
        ↓
Proxmox
        ↓
Debian VM
        ↓
Stock SDI Demo
```

Skills practiced in this setup:

- Linux server administration
- systemd service management
- Nginx reverse proxy
- PostgreSQL administration
- Firewall configuration (UFW)
- Cloudflare Tunnel / HTTPS on a public domain
- Deployment & service management
- Environment variables / secret handling
- Authentication design

### Server topology / ports

| Port | Purpose |
|------|---------|
| `80`   | Homelab Dashboard |
| `8080` | Stock SDI Demo **staging** |
| `8081` | Stock SDI Demo **production** |
| `3101` | Stock SDI Demo API |
| `5432` | PostgreSQL |

Internal API/database ports (`3101`, `5432`) are not opened to the Internet.

### Domain routing

One Cloudflare Tunnel (tunnel ID-based config) serves multiple hostnames:

```
server.stock-sdi.my.id → Nginx :80  → Homelab Dashboard
stock-sdi.my.id        → Nginx :8081 → Stock SDI Demo
www.stock-sdi.my.id    → Nginx :8081 → Stock SDI Demo
```

---

## Production Demo vs Production System

This repository is the **Stock SDI Demo** — a self-hosted version used for
portfolio and learning purposes.

There is a separate production Stock SDI system; its source code and credentials
are **not** part of this repository. Do not assume this demo represents the
production system of any company.

---

## API Overview

Base URL (dev): `http://localhost:3101`. All responses are JSON.
Response shape: success `{ "data": ... }`, error `{ "error": { "code", "message" } }`.

### Authentication (public endpoints)

```
POST /api/auth/login
GET  /api/auth/me
POST /api/auth/logout
```

### Protected endpoints (require a valid session)

```
GET  /api/health
GET  /api/barang            (list + search)
GET  /api/barang/:id        (detail)
POST /api/barang            (staff)
PATCH /api/barang/:id       (staff)
DELETE /api/barang/:id      (staff)
GET  /api/stock             (stock per warehouse / kriteria)
GET  /api/transaksi         (history, filters, pagination)
GET  /api/transaksi/:id     (detail + balance-before)
POST /api/transaksi         (staff; stock-in / stock-out, idempotent via client_tx_id)
```

Full reference: [`docs/api/endpoints.md`](docs/api/endpoints.md)

---

## Testing

Results recorded in this repository/docs:

- API smoke tests: **103/103 PASS** (`api/test/smoke.mjs`), including the auth
  suite (**44 auth checks**)
- Browser E2E (Playwright + Edge): **9/9 PASS** — login, session refresh,
  protected pages, logout, guest redirect

Behaviors covered by tests:

- login success
- login failure
- session refresh (persistence)
- logout
- unauthorized API access (`401`)
- guest access (read-only, redirected away from protected pages)
- staff write access
- stock transactions (in / out, insufficient stock)
- history + filters + date range
- Excel export
- Kelola Barang (create / edit / delete)
- packing & mix-barang calculators
- protected endpoints

---

## Local Development

### Frontend

```bash
git clone https://github.com/nmariala/stock-sdi-demo.git
cd stock-sdi-demo
npm install

cp .env.example .env.local   # set NEXT_PUBLIC_API_BASE_URL
npm run dev
```

For the static export:

```bash
npm run build
# output goes to ./out
```

### Backend

The API needs PostgreSQL and its own environment file:

```bash
cd api
npm install
cp .env.example .env
# set DATABASE_HOST/NAME/USER/PASSWORD, API_CORS_ORIGIN
npm start        # or: npm run dev (node --watch)
```

You also need the database schema — see
[`docs/database/migrations`](docs/database/migrations) and
[`docs/database/README.md`](docs/database/README.md).

> Never commit `.env` or credential files. See the security notes above.

---

## Environment Variables

Placeholders only — fill in your own values locally.

### Frontend (`.env.local`)

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3101
NEXT_PUBLIC_GUEST_USERNAME=tamu.demo
```

### Backend (`.env`)

```env
PORT=3101

DATABASE_HOST=127.0.0.1
DATABASE_PORT=5432
DATABASE_NAME=stock_sdi_demo
DATABASE_USER=your_db_user
DATABASE_PASSWORD=your_db_password

API_CORS_ORIGIN=http://localhost:3000

COOKIE_NAME=hl_stock_demo_session
COOKIE_SECURE=true       # true when served over HTTPS
SESSION_TTL_HOURS=8

LOGIN_MAX_ATTEMPTS=5
LOGIN_WINDOW_MS=900000
LOGIN_IP_MAX_ATTEMPTS=100
```

### Gitignored secret files

The following are excluded from Git:

```
.env
.env.local
.demo-users.json
```

---

## Project Status

**Status: Completed / Portfolio Demo**

- Production demo is online
- HTTPS active (Cloudflare Tunnel)
- Authentication active
- Database active
- Protected API active
- Infrastructure self-hosted
- Security baseline applied

This project is primarily a learning and portfolio project. It is not intended
to represent a production enterprise deployment.

---

## What I Learned

Built while learning full-stack deployment:

- REST API design and a clean frontend/backend separation
- Custom authentication and session management (cookie + server-side sessions)
- Password hashing with bcrypt, token hashing with SHA-256
- PostgreSQL schema, triggers, and parameterized queries
- Linux server administration
- Nginx reverse proxy configuration
- systemd service management
- Cloudflare Tunnel and HTTPS on a public domain
- Firewall configuration (UFW)
- Deployment and environment/secret handling
- Debugging and testing (API smoke tests, browser E2E)
- Security hardening (rate limiting, timing-safe verification, least exposure)

---

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — app architecture
- [`docs/api/`](docs/api) — API reference & endpoint docs
- [`docs/auth/`](docs/auth) — authentication design & security notes
- [`docs/database/`](docs/database) — database schema & migrations
- [`supabase-snapshot/`](supabase-snapshot) — historical Supabase-era snapshot (archived)