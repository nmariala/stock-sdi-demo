# Stock SDI Demo — Case Study

A self-hosted inventory management demo built while learning.
GitHub: https://github.com/nmariala/stock-sdi-demo
Live demo: https://stock-sdi.my.id

---

## 1. Project Overview

Stock SDI Demo is a self-hosted inventory management application built as a
learning and portfolio project. It is a demo implementation — not a production
system of any company.

The application manages a small stockroom: stock is tracked per **warehouse**
(`Puri`, `CS TCL`, `CS SBF`) and per **condition** (`Good` / `Bad`), every
stock movement is recorded as a transaction, and the history can be filtered
and exported to Excel. A few small utilities (packing and mix-barang capacity
calculators) are included as read-only tools.

The whole stack was built end-to-end while learning:

```
frontend → API → authentication → database → server → deployment
```

What makes the project interesting is not the feature list, but that it was
taken all the way from a local web app to a publicly accessible HTTPS service,
including a custom authentication system and a self-hosted database.

## 2. The Problem

A small inventory needs more than a flat table of stock. Practical questions
that come up constantly:

- How much *good* stock of item X is in warehouse Y today?
- What moved in and out this week, and which warehouse was involved?
- Can I export the history so the office can work with it in Excel?

So the data model has to separate warehouse, condition (`Good` / `Bad`), and
stock movements, and the report has to show *why* a number is what it is.

For me, there was a second problem: I knew how to build features that ran on
`localhost`, but I did not yet know how to make an application that is actually
*deployed* — with authentication, a persistent database, a protected API,
HTTPS, and a real self-hosted server environment. This project was the exercise
for
that.

## 3. The Goal

1. Build a usable inventory management interface.
2. Separate the frontend, API, and database responsibilities.
3. Replace the original dependency on hosted backend services with a
   self-hosted API.
4. Implement authentication and protected API access.
5. Deploy the application on a home lab server.
6. Learn real deployment and infrastructure troubleshooting along the way.

## 4. What I Built

### Frontend

Next.js + TypeScript + Tailwind CSS, exported as a static site.

Features:

- Login (username + password)
- Guest / read-only access
- Stock dashboard with auto-refresh (polling)
- Stock overview per warehouse and per condition
- Stock-in / stock-out transactions
- Transaction history with filters and date range
- Excel export
- Kelola Barang (create / rename / delete products)
- Packing calculator and mix-barang capacity calculator
- Session persistence across refresh
- Logout

### Backend

Node.js / Express REST API — the single data and authentication layer.

- Authentication endpoints (`login`, `me`, `logout`)
- Protected endpoints (valid session required)
- Role checks (`staff` vs `guest`)
- Stock and transaction APIs
- Pagination and input validation
- Business rules enforced by PostgreSQL triggers (e.g. cannot remove more
  stock than available; duplicate transaction ids return the original row)

### Database

PostgreSQL (`stock_sdi_demo`). The main entities:

- `barang` — products and their current stock
- `stock_levels` — stock per warehouse and condition
- `transaksi` — every stock movement (history)
- `user_accounts` / `profiles` / `sessions` — authentication data

The database is the source of truth for stock calculations; trigger
constraints keep the data consistent even if a write bypasses the frontend.

## 5. From Supabase to Self-Hosted API

This is the most important technical story in the project.

The original demo started on **Supabase**, which provided the database,
authentication, and a browser client library. Supabase was useful for the
initial implementation, but the migration was intentionally done as a learning
exercise to understand what happens behind the managed services.

The final architecture is:

```
Next.js
   ↓
REST API (own implementation)
   ↓
PostgreSQL
```

Why I did this:

- To understand how an API layer actually works instead of calling one.
- To understand database access and schema design directly.
- To understand authentication and session management from scratch.
- To reduce the dependency on a hosted backend.
- To learn deployment end-to-end on my own server.

This was a deliberate learning decision, not a critique of Supabase. The old
Supabase-era architecture is kept in the repository (`supabase-snapshot/`) as a
historical reference. After the migration there is no Supabase dependency in
the frontend code at all — the browser only talks to my own REST API.

## 6. Authentication & Security

Authentication is custom, username/password based, with a server-side session.

- Password hashing with **bcrypt** at **cost 12**; passwords are never stored
  in plaintext.
- Login failures return a **generic error** so a response does not reveal
  whether the username or the password was the problem.
- A **dummy bcrypt hash** is verified for unknown usernames so the timing does
  not make it obvious that a user does not exist (reduces username
  enumeration).
- Session token is **32 random bytes**; only the **SHA-256 hash** of the token
  is stored in the database.
- The browser gets the raw token inside an **HttpOnly cookie**
  (`SameSite=Lax`), and **`Secure`** is enabled on the HTTPS production site.
- Session **TTL of 8 hours**; **logout** invalidates the server-side session
  and deletes the cookie.
- API endpoints are **protected** (valid session = 401 `Unauthorized`).
- A simple **role model**: `staff` can read and write; `guest` is read-only
  (write attempts return a 403).
- **Rate limiting** on login to slow down brute force:

```
5 failed attempts per (IP + username) within 15 minutes
100 attempts per IP within the same window
```

These mechanisms were added because the project replaced a hosted auth service,
so every one of these concerns (hashing, enumeration, brute force, session
lifetime, role enforcement) had to be handled deliberately.

## 7. Deployment Architecture

```
Internet
   ↓
Cloudflare
   ↓
Cloudflare Tunnel
   ↓
Nginx
   ↓
Next.js static export + API proxy
   ↓
Node.js API
   ↓
PostgreSQL
```

Deployment environment:

- **Debian VM** on **Proxmox** (home lab server)
- **systemd** manages the API service (enabled, restarts on failure)
- **Nginx** serves the static frontend and acts as the reverse proxy
- **Cloudflare Tunnel** exposes the service publicly over HTTPS
- **PostgreSQL** listens on localhost only
- **API** binds to `127.0.0.1` only
- **UFW firewall** with a deny-by-default policy; only specific services are
  allowed
- **HTTPS** terminates at Cloudflare, which also lets the production site use
  `Secure` cookies

Both `stock-sdi.my.id` and `www.stock-sdi.my.id` are served by the tunnel. The
API and database ports are never opened to the Internet directly.

## 8. Challenges I Solved

### A. Migrating from Supabase to a custom API

The frontend originally depended on Supabase for data and authentication.
I built my own REST API with Express + `pg` and re-pointed the application's
data and authentication flows to it, which meant replacing direct database
access with API calls and moving the realtime subscription to a simple
dashboard poll (60s refresh).

### B. Building custom authentication

Hosted auth was replaced with my own implementation: user accounts, sessions,
bcrypt password hashing, protected middleware, role checks, session
expiration, logout, and login rate limiting.

### C. Session security

A session must not be a frontend-only flag. I made session tokens random,
stored only the SHA-256 hash in the database, and sent the token to the browser
inside an HttpOnly cookie so JavaScript cannot read it.

### D. Self-hosting

The app had to run on the server, not just on my machine. That meant systemd
units, Nginx configuration, a local PostgreSQL instance, Cloudflare Tunnel, and
UFW firewall rules — getting each piece working together.

### E. Staging vs production

Changes had to be tested without disturbing the running deployment. I kept
separate staging and production on the server using different ports/services,
so a broken change could remain visible only on staging.

### F. HTTPS and secure cookies

The `Secure` cookie flag is only safe over HTTPS. Because public traffic goes
through Cloudflare Tunnel, the production site is HTTPS and can set `Secure`
cookies correctly.

### G. Debugging deployment

Most of the deployment time went into real troubleshooting across layers:
API routing, reverse proxy behavior, cookie handling, environment
configuration, DNS names resolving to the tunnel, tunnel routes, and firewall
rules. This debugging was the most valuable part — the project is not just
code that was written, but a service that had to be made to work as a
real publicly accessible deployment.

## 9. Testing & Validation

Test results recorded in the project documentation:

- API smoke tests: **103/103 passed** (`api/test/smoke.mjs`), including the
  authentication suite (**44 auth checks**)
- Browser E2E (Playwright + Edge): **9/9 passed** — login, session refresh,
  protected pages, logout, guest redirect

Testing covered:

- Authentication (login success / failure, logout, session refresh)
- Protected API endpoints (401 without a session)
- Roles (guest read-only, staff write access)
- Stock transactions (in / out, insufficient-stock rejection)
- History, filters, date range
- Excel export
- Kelola Barang (create / edit / delete)
- Packing and mix-barang calculators

These checks validate the main behaviors, but this does not mean the code is
bug-free.

## 10. What I Learned

This project helped me move from only building application features to
understanding how an application actually runs as a complete system.

Concretely:

- **REST API design** — endpoints, validation, pagination, error formats.
- **Authentication fundamentals** — password hashing, tokens, sessions,
  roles.
- **Session management** — server-side sessions, HttpOnly cookies, expiration
  and logout.
- **PostgreSQL** — schema, triggers, and parameterized queries.
- **Frontend/backend separation** — the browser never touches the database.
- **Reverse proxy + Linux services** — Nginx, systemd, process management.
- **Cloudflare Tunnel and HTTPS** — public access without opening ports.
- **Firewall basics** — UFW, least-exposure principles.
- **Deployment troubleshooting** — debugging across DNS, tunnel, proxy,
  cookie, and environment layers.

I still have plenty to learn, but this project gave me the full journey from
an idea to a live HTTPS service.

## 11. Limitations

Honest list of what this project does *not* do:

- Rate limiting is **in-memory** — it resets on restart and is not shared
  across multiple instances.
- **Single-instance** architecture.
- **No Redis** (would be needed for shared state across instances).
- **No complex RBAC** — only the two roles `staff` / `guest`.
- **No password reset or email verification** flows.
- Not designed as an enterprise-scale system — it is a demo/learning
  deployment.

These limits are intentional: they were kept out of scope for a portfolio
project so the focus could stay on the core backend, security, and deployment
foundations.

## 12. Next Improvements

Possible future work (documented as ideas, not implemented):

- Automated CI/CD pipeline
- Stronger automated integration coverage
- Persistent, distributed rate limiting
- Richer role / permission model
- Backup and restore automation
- Monitoring and alerting

## 13. Live Demo & Repository

- **Live demo:** https://stock-sdi.my.id
- **GitHub repository:** https://github.com/nmariala/stock-sdi-demo

## 14. Project Status

- Completed portfolio / learning demo
- Self-hosted and publicly accessible
- Runs with its own authentication, API, and database

The goal is to demonstrate practical full-stack application development and
deployment skills. It is a learning/portfolio project — deliberately not
marketed as a production-grade system.