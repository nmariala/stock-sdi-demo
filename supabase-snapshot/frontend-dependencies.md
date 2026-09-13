# Frontend Dependencies on Database

Peta call-site frontend (Next.js App Router, React 19, `@supabase/supabase-js ^2.112.4`) terhadap object DB. Verifikasi via grep `supabase.from/rpc/channel` di `src/`. Kode yang dipakai: `src/lib/auth.tsx` (client utama) — `src/lib/supabase.ts` adalah file mati (tidak di-import).

## Client & auth

`src/lib/auth.tsx`

| Tabel/Endpoint | Query |
|---|---|
| `profiles` | `.select('*').eq('id', userId).single()` |
| `auth.getSession()` | init sesi |
| `auth.onAuthStateChange()` | subscribe sesi |
| `auth.signInWithPassword({email,password})` | login |
| `auth.signOut()` | logout |

## Halaman stok (dashboard) — `src/app/page.tsx`

| Tabel/Endpoint | Query |
|---|---|
| `barang` | `.select('*').order('nama')` (via `fetchStockRows` di `stok.ts`) |
| `stock_levels` | `.select('*')` (via `fetchStockRows`) |
| realtime channel `stok-realtime` | `postgres_changes` pada `barang` + `stock_levels` (event `*`) |

## Halaman riwayat — `src/app/riwayat/page.tsx`

| Tabel/Endpoint | Query |
|---|---|
| `barang` | `.select('id, nama').order('nama')` |
| `profiles` | `.select('id, nama')` |
| `transaksi` | `.select('id', { count:'exact', head:true })` (jumlah) dan `.select(...).order('created_at',{ascending:false}).order('id',{ascending:false})` (listing) |
| RPC `riwayat_balance_before` | `{ p_barang_id, p_created_at, p_id }` → saldo "sebelum" |
| realtime channel `riwayat-realtime` | `postgres_changes` pada `transaksi` (event `*`) |

## Halaman kelola barang — `src/app/kelola-barang/page.tsx`

| Tabel/Endpoint | Query |
|---|---|
| `barang` | `.select('*').order('nama')` |
| `barang` | `.select('id').ilike('nama', ...).neq('id', ...)` (cek duplikat) |
| `barang` | `.insert({ nama, stok })` |
| `barang` | `.update({ nama }).eq('id', id)` (ubah nama) |
| `barang` | `.delete().eq('id', id)` |

> Penghapusan barang hanya dilakukan setelah cek tidak punya transaksi (UI); DB mengandalkan FK `transaksi.barang_id` (NO ACTION) sebagai pengaman.

## Form transaksi — `src/components/TransaksiForm.tsx`

| Tabel/Endpoint | Query |
|---|---|
| `barang` | `.select('*').order('nama')` |
| `transaksi` | `.insert({ barang_id, jenis, jumlah, warehouse, kriteria, keterangan, ... client_tx_id })` |

- `client_tx_id` = uuid yang dibuat di client (`crypto.randomUUID()`) → **idempotensi retry**; error `23505` (duplicate key) dianggap "sudah tercatat".
- Error `check_violation` dari trigger `sync_saldo_transaksi` → ditampilkan sebagai "stok tidak mencukupi".

## Export riwayat — `src/lib/riwayatExport.ts`

| Konfig | Nilai |
|---|---|
| `TRANS_SELECT` | `'id, barang_id, user_id, jenis, jumlah, created_at, warehouse, kriteria, keterangan'` |
| `EXPORT_BATCH` | 1000 |
| `EXPORT_MAX_ROWS` | 20000 |
| dependency | `riwayat_balance_before` RPC (per barang / batch) |
| tambahan | lookup nama via `barangById`, `profileById` |

## Tipe TS (bayangan kolom DB) — `src/types/index.ts`

- `Barang { id, nama, stok }` — kolom `updated_at` tidak di-type, tapi masih diselect `*`.
- `StockLevel { id, item_id, warehouse, kriteria, jumlah, updated_at }`
- `Transaksi { id, barang_id, user_id, jenis, jumlah, warehouse, kriteria, keterangan, client_tx_id, created_at }`
- `TransaksiWithBarang extends Transaksi { nama }`
- `Profile { id, nama, role }`
- `StockRow extends Barang { levels, total }`

> Tidak ada kolom `created_at` pada `barang`, dan tidak ada `updated_at` pada `transaksi` — tipe TS konsisten dengan skema DB (verified via introspection; `barang.created_at`, `transaksi.updated_at`, `stock_levels.created_at`, `profiles.email/avatar_url/user_id/created_at/updated_at` TIDAK ada).

## Konstanta domain — `src/lib/konstanta.ts` & `src/lib/roles.ts`

- `GUDANG = ['Puri','CS TCL','CS SBF']`, `KRITERIA = ['Good','Bad']` → persis CHECK constraint DB.
- Role guest: `profiles.role ∈ {guest, tamu}` (via `roles.ts`), jalur tamu = `/`, `/kalkulator-list-pengiriman*`, `/mix-barang*`. Default `GUEST_USERNAME='tamu'` (env `NEXT_PUBLIC_GUEST_USERNAME`).

## Catatan

- Semua halaman `'use client'`; query berjalan dari browser memakai anon key → tunduk RLS (auth via JWT sesi).
- **Tidak ada** API route/server-side Supabase, tidak ada middleware pembatas, tidak ada vercel.json. Dependency superbase-js hanya satu `createClient` dengan anon key.