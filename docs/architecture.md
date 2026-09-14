# Arsitektur Aplikasi — Stock SDI Demo (pasca migrasi REST)

## Arsitektur umum

```
Browser (Next.js 15, App Router)
   │  fetch() + credentials:"include" (cookie HttpOnly)
   ▼
Custom REST API (Node.js Express)  127.0.0.1:3101 — homelab Debian
   │  pg (node-postgres), validasi, sesi SHA-256, rate-limit
   ▼
PostgreSQL — stock_sdi_demo (barang, stock_levels, transaksi, profiles, sessions)
```

- **Frontend TIDAK pernah** melakukan akses langsung ke Supabase / database.
  Semua akses data & auth lewat `src/lib/api.ts` → HTTP `NEXT_PUBLIC_API_BASE_URL`.
- **Sesi** dikelola server via cookie HttpOnly (`hl_stock_demo_session`).
  Token disimpan di DB sebagai hash SHA-256; frontend tidak menyimpan token.
- **Otorisasi** ditegakkan dua lapis: UI (AuthGate redirect) + API (403 untuk role guest
  pada operasi tulis). Source of truth otorisasi ada di API.

## Lapisan frontend

| Area | Lokasi | Catatan |
|---|---|---|
| API client | `src/lib/api.ts` | satu-satunya gerbang HTTP; helper `getApiErrorMessage`, daftar `API_ERROR_CODES` |
| Auth context | `src/lib/auth.tsx` | `signIn`, `signOut`, restore sesi via `/api/auth/me` |
| Roles | `src/lib/roles.ts` | `isGuestRole`, `isGuestAllowedPath` (guest: `/`, kalkulator; sisanya redirect `/`) |
| Dashboard/stok | `src/app/page.tsx`, `src/lib/stok.ts` | polling `/api/stock` 60 dtk (pengganti Supabase realtime) |
| Transaksi | `src/components/TransaksiForm.tsx` | `createTransaksi` + `client_tx_id` (idempoten) |
| Riwayat | `src/app/riwayat/page.tsx`, `src/lib/riwayatExport.ts` | paging 50/baris + "Muat lebih banyak", export Excel via `xlsx` (batch 500) |
| Kelola barang | `src/app/kelola-barang/page.tsx` | CRUD via API; duplikasi & FK dihandle dari `API_ERROR_CODES` |
| Packing calculator | `src/app/mix-barang`, `src/app/kalkulator-list-pengiriman` | 100% lokal (tanpa API/Supabase) |

## API yang dipakai frontend

- Auth: `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- Data: `GET /api/barang`, `GET /api/stock`, `GET /api/transaksi`, `GET /api/transaksi/:id/balance-before`
- Tulis (staff): `POST /api/barang`, `PATCH /api/barang/:id`, `DELETE /api/barang/:id`, `POST /api/transaksi`
- Spesifikasi lengkap: `docs/api/endpoints.md`, `docs/api/migration-map.md`

## Env frontend (`src`)

- `NEXT_PUBLIC_API_BASE_URL` = base URL REST API
- `NEXT_PUBLIC_GUEST_USERNAME` = username default tombol "Masuk sebagai Tamu"
- `NEXT_PUBLIC_GUEST_ROLES` (opsional) = role tambahan read-only

Template: `.env.example`. Credential API/sesi tidak pernah ada di frontend.

## Keputusan penting akses data

- **Realtime Supabase** diganti **polling** 60 detik di dashboard & riwayat
  (refresh silent; tanpa spinner).
- **Export Excel** membaca halaman demi halaman (`pageSize` maks API = 500, `EXPORT_BATCH=500`)
  sampai seluruh `total` — tidak lagi memakai query langsung `supabase.rpc('riwayat_balance_before')`.
- **Stok total/kriteria/gudang** dihitung server (`/api/stock`); frontend hanya render.
- **Duplikasi barang / referensi** cukup dimunculkan dari `409 DUPLICATE_NAME`,
  `409 FOREIGN_KEY_ERROR`, dst. — bukan dari query client.

## Status migrasi

- Supabase dependency (`@supabase/supabase-js`) dihapus dari `package.json`/lockfile.
- `src/lib/supabase.ts` dihapus. Tidak ada `supabase.*`, `createClient`, `getSession`,
  `signInWithPassword`, `onAuthStateChange`, `.supabase.co` di `src/`.
- Sisa sebutan Supabase hanya di dokumentasi/snapshot historis (`docs/*`, `supabase-snapshot/`).
- Referensi legacy: `supabase-snapshot/` berisi arsitektur Supabase lama sebagai arsip.

## Verifikasi

- `npx tsc --noEmit`, `npm run lint`, `npm run build`
- API smoke: `api/test/smoke.mjs` → 103 PASS (termasuk pengecekan baseline DB)
- Browser E2E (Playwright + Edge): auth + data flows lengkap
- Baseline database: barang 8, stock_levels 13, transaksi 15, profiles 2