# Stock SDI Demo — Autentikasi: Arsitektur

Dokumen ini menjelaskan desain komponen autentikasi custom yang menggantikan
Supabase Auth di demo. Fokus: alur token, tabel, middleware, dan bagaimana
frontend berhubungan dengan API.

## Diagram level tinggi

```
                                     PostgreSQL 17 (127.0.0.1:5432)
                                       ┌──────────────────────────────┐
                                       │  user_accounts               │
 Browser (Next.js)                     │  sessions (hash sha256 token)│
   │  POST /api/auth/login             │  profiles (role, nama)       │
   │  (username + password)            └──────────────────────────────┘
   ▼                                       ▲
 api/ (Express, 127.0.0.1:3101)            │
   ├── routes/auth.js      login/me/logout │ validasi sesi
   ├── middleware/auth.js  requireAuth     │
   ├── lib/passwords.js    bcrypt compare  │
   ├── lib/sessions.js     simpan & lookup │
   └── middleware/rateLimit.js            │
                                           │
   cookie: hl_stock_demo_session (HttpOnly, SameSite=Lax, Path=/)
```

## Komponen server

### `lib/passwords.js`
- `hashPassword(plain)` → bcryptjs, cost **12**.
- `verifyPassword(plain, hash)` → compare waktu konstan.
- Bila akun tidak ditemukan, bandingkan dengan **dummy hash** agar waktu
  respons tidak membocorkan eksistensi username (mitigasi user enumeration).

### `lib/sessions.js`
- `createSession(pg, userId, meta)` → token mentah `crypto.randomBytes(32)
  .toString('base64url')`, simpan `hashToken(token)` (sha256 hex, UNIQUE,
  length=64) + `expires_at` + meta (ip/user-agent).
- `findValidSessionByToken(pg, token)` → hash → join `user_accounts` +
  `profiles`; hanya sesi `expires_at > now()`.
- `revokeSession(pg, token)` → hapus baris.
- `deleteExpired(pg)` → cleanup oportunistik saat login & validasi.

### `middleware/auth.js`
- `readCookie(req, name)` → parse header `Cookie` (utils/cookies.js).
- `requireAuth` → ambil cookie `COOKIE_NAME` → validasi → isi `req.auth =
  { userId, role, profileId, username, name }`; gagal → 401 `UNAUTHORIZED`.
- `requireRole('staff')` → pastikan `req.auth.role === 'staff'`; bukan →
  403 `FORBIDDEN`. Selalu dipakai setelah `requireAuth`.

### `middleware/rateLimit.js`
- `loginRateLimit` (in-memory, per proses): per **IP + username** 5 percobaan /
  15 menit; per **IP** 100 / 15 menit. Gagal login dicatat
  `recordLoginFailure`; sukses `recordLoginSuccess`. Melebihi → 429
  `RATE_LIMITED`.

### `routes/auth.js`
- `POST /api/auth/login` — body `{username, password}`. Validasi, resolve
  username (strip suffix `@durian.sdi`), cek `is_active`, verifikasi password,
  buat sesi, set cookie, return `{user:{id,username,name,role},expires_at}`.
- `GET /api/auth/me` — 200 `{authenticated:true,user,expires_at}` / 401.
- `POST /api/auth/logout` — idempoten; hapus cookie & baris sesi → `{ok:true}`.

### `scripts/useradmin.js`
CLI operasional akun demo:
```
node scripts/useradmin.js create <username> <role> [--password-file X]
node scripts/useradmin.js set-password <username> --password-file X
node scripts/useradmin.js list
node scripts/useradmin.js deactivate <username>
node scripts/useradmin.js activate <username>
```
Password tidak diterima via argumen CLI (jangan masuk history). Role dibatasi
`staff` / `guest`. Akun dummy yang pernah dibuat sesuai panduan Supabase
(`00000000-0000-...-0002`) tetap dapat dipetakan.

## Integrasi transaksi (authz di data)

- `POST /api/transaksi` kini memakai `req.auth.user.profileId` sebagai
  `user_id` (pengganti nilai profil dari auth Supabase lama).
- Endpoint tulis barang & transaksi tergantung `requireRole('staff')`.
- Endpoint baca tetap boleh untuk guest (demo read-only).

## Frontend adapter

### `src/lib/auth.tsx`
- `AuthProvider` menyuplai: `user` (dari `/api/auth/me`), `profile` (derivatif:
  `{id, nama, role}` dari user API), `loading`, `signIn(username, password)`,
  `signOut()`, `initializing`.
- `useAuth()` → hook konsumsi (sidebar, AuthGate, halaman login).
- `signOut` selalu memaksa hapus cookie API, lalu set `user=null`.

### `src/lib/client-providers.tsx` (AuthGate)
Routing guard (UX saja; keamanan sebenarnya di API):
- loading → spinner.
- anonim & bukan `/login` → `router.replace('/login')`.
- ter-auth & di `/login` → `router.replace('/')`.
- guest & akses path tulis (`/kelola-barang`) → `router.replace('/')`.

### `src/lib/api.ts`
- `API_BASE_URL` default `http://localhost:3101` (env `NEXT_PUBLIC_API_BASE_URL`).
- Semua panggilan `credentials: 'include'` agar cookie HttpOnly ikut terkirim.
- Kode error baru: `UNAUTHORIZED` → redirect login; `FORBIDDEN` → info guest.

## Alur refresh / session persistence

Cookie disimpan browser → pada setiap load halaman, `AuthProvider` memanggil
`GET /api/auth/me` dan memulihkan `user`. Karena sesi tersimpan di DB dengan
`expires_at`, refresh browser **tidak** membutuhkan Supabase; hanya memerlukan
API yang hidup (di demo lewat tunnel loopback dari sisi dev).

## Catatan skala produksi

- Rate limiter in-memory → sebaiknya diganti penyimpanan bersama (Redis / PG)
  bila multi-instance.
- Belum ada refresh-token / rolling sesi; TTL tetap 8 jam (cukup untuk demo).
- Cookie `Secure` harus `true` begitu HTTPS dipasang (lihat security.md).