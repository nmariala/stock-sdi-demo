# Stock SDI Demo — Autentikasi Custom

Autentikasi & otorisasi aplikasi untuk **ganti langsung Supabase Auth** dari demo.
Sesi berbasis **cookie HttpOnly** yang diamankan hash-side di database; role staff
vs guest dijalankan di middleware API (`requireAuth` / `requireRole`).

```
Browser (Next.js)  --->  API Auth (/api/auth/*)  --->  PostgreSQL
               cookie HttpOnly (hl_stock_demo_session)
```

- Bahasa: Node.js CommonJS (lanjutan dari `api/`).
- Deps bertambah: `bcryptjs` (hashing password).
- FE login memakai **username** (bukan email); suffix email lama (`@durian.sdi`)
  dipotong otomatis oleh helper `resolveUsername()`.
- Role diambil dari akun demo (`staff` / `guest`), bukan dari Supabase.

## Struktur baru

```
api/
├── lib/
│   ├── passwords.js        # hashPassword / verifyPassword (bcryptjs, cost 12)
│   └── sessions.js         # createSession, validasi, cleanup, hash token sha256
├── middleware/
│   ├── auth.js             # requireAuth, requireRole, baca cookie
│   └── rateLimit.js        # rate limiter login (per IP + per user)
├── routes/
│   └── auth.js             # POST /login, GET /me, POST /logout
├── scripts/
│   └── useradmin.js        # CLI: create / set-password / list / deactivate / activate
└── utils/
    └── cookies.js          # parse header Cookie
```

Tambahan tabel (migration `docs/database/migrations/005_auth.sql`):
`user_accounts` dan `sessions` (lihat `docs/auth/migration-notes.md`).

## Alur sesi

1. `POST /api/auth/login` → validasi kredensial → buat token acak (32 byte,
   base64url) → simpan **hash sha256** di tabel `sessions` → set cookie.
2. Cookie: `hl_stock_demo_session`, `HttpOnly`, `SameSite=Lax`, `Path=/`,
   `Secure=false` (dev loopback). TTL default **8 jam**.
3. `GET /api/auth/me` → baca cookie → hash → cari sesi valid → kembalikan
   `{authenticated, user, expires_at}`; tanpa sesi → `401`.
4. `POST /api/auth/logout` → hapus sesi di DB + hapus cookie (idempoten).

Kredensial sudah dienkripsi; DB tidak pernah menyimpan token mentah, hanya hash.

## Matriks otorisasi

| Metode & path                     | Role            |
|-----------------------------------|-----------------|
| `GET /api/health`                 | publik          |
| `GET /api/barang`, `/stock`, `/transaksi` (baca & filter) | semua (termasuk guest) |
| `POST /api/auth/logout`           | semua           |
| `POST /api/barang`, `PATCH/DELETE /api/barang/:id` | staff           |
| `POST /api/transaksi`             | staff           |
| lainnya                           | `404 NOT_FOUND` |

Guest yang memanggil endpoint tulis → `403 FORBIDDEN`. Tanpa sesi → `401`.

## Akun demo

| Username    | Role  | Dipakai        |
|-------------|-------|----------------|
| `admin.demo`| staff | kelola barang & transaksi |
| `tamu.demo` | guest | baca data saja (read-only) |

Password akun demo **tidak ada di repository**; disimpan di
`/home/nugie/stock-sdi-api/.demo-users.json` (chmod 600) di server. Kelola lewat
`node scripts/useradmin.js` (lihat `docs/auth/security.md`).

## Frontend

- `src/lib/auth.tsx` — adapter auth custom (AuthProvider + `useAuth`) menggantikan
  `@supabase/auth-helpers-nextjs`.
- `src/lib/api.ts` — `API_BASE_URL` default `http://localhost:3101`,
  `credentials: 'include'`, kode error `UNAUTHORIZED` / `FORBIDDEN` / `RATE_LIMITED`.
- `src/lib/roles.ts` — `GUEST_USERNAME` default `tamu.demo`.
- `src/app/login/page.tsx` — form username+password (dengan tombol masuk cepat Tamu).
- `src/lib/client-providers.tsx` — `AuthGate` memakai `user` dari `useAuth`
  (redirect `/login` bila anonim; block route tulis untuk guest).
- Env: `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_GUEST_USERNAME` (`.env.local`).

## Menjalankan & verifikasi

```bash
cd api
node test/smoke.mjs        # 103 cek lewat (termasuk suite auth 44 tes)
```

E2E browser asli (opsional, dev): jalankan `next dev` + tunnel SSH
(`ssh -L 3101:127.0.0.1:3101 ...`) + skrip Playwright (Edge) — hasil final
9/9 PASS (login/refresh/protected/logout/redirect guest).

## Konfigurasi

Env tambahan (`.env.example`):

```env
COOKIE_NAME=hl_stock_demo_session
COOKIE_SECURE=false
SESSION_TTL_HOURS=8
LOGIN_MAX_ATTEMPTS=5
LOGIN_WINDOW_MINUTES=15
LOGIN_MAX_PER_IP=100
```

Untuk arsitektur detail, lihat `docs/auth/architecture.md`; evaluasi keamanan di
`docs/auth/security.md`; migrasi DB di `docs/auth/migration-notes.md`.