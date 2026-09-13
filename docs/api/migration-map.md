# Stock SDI Demo — Pemetaan Query Supabase Frontend → REST API

Frontend saat ini berbicara langsung ke Supabase (`supabase-snapshot/` =
source of truth DDL). Tabel di bawah memetakan **setiap pemanggilan yang ada di
`src/`** (per `grep supabase.from/rpc/channel`) ke endpoint REST yang disiapkan
di `api/`. Bertujuan sebagai panduan cut-over bertahap; belum ada halaman yang
diubah pada tahap ini.

## 1. Barang

| Supabase (Frontend)                                  | REST                                       |
|------------------------------------------------------|--------------------------------------------|
| `from('barang').select('*').order('nama')`           | `GET /api/barang` (default sort `nama`)    |
| `from('barang').select('id, nama').order('nama')`    | `GET /api/barang?sort=nama` (+`search`)    |
| `from('barang').insert({ nama, stok? })`             | `POST /api/barang`                          |
| `from('barang').update({ nama }).eq('id', id)`       | `PATCH /api/barang/:id` `{ nama }`         |
| `from('barang').delete().eq('id', item.id)`          | `DELETE /api/barang/:id`                    |

Catatan:
- `stok` tidak bisa diubah lewat `POST`/`PATCH` saja (semua perubahan saldo
  selalu melewati tabel `transaksi` + trigger). `POST` menerima `stok` awal.
- API menambahkan guard **`DUPLICATE_NAME`** (409) untuk nama yang sudah ada
  (tidak ada unique constraint di DB; guard dfi level aplikasi agar konsisten
  dengan UX form lama).

## 2. Stock (kabar stok)

| Supabase (Frontend)                                        | REST                         |
|------------------------------------------------------------|------------------------------|
| `Promise.all([ from('barang').select('*').order('nama'), from('stock_levels').select('*') ])` -> pivot di client (`src/lib/stok.ts`) | `GET /api/stock` (pivot `levels` di server) |

`src/lib/stok.ts` membangun `StockRow[].levels[warehouse][kriteria]` di client
(EMM.md `emptyLevels` + akumulasi). API `GET /api/stock` mengembalikan bentuk
yang sama (`StockRow { id, nama, stok, total, levels }`) lewat satu panggilan
`json_agg` — jadi `stok.ts` bisa diganti dengan `getStock()` tanpa mengubah
komponen UI.

## 3. Transaksi — riwayat

Sumber filter ada di `src/lib/riwayatExport.ts` (`applyRiwayatFilters`) dan
dipakai di `src/app/riwayat/page.tsx`:

| Supabase                                          | REST                                                  |
|---------------------------------------------------|-------------------------------------------------------|
| `.eq('warehouse', gudang)`                        | `&warehouse=` (token `all` = tanpa param)             |
| `.eq('kriteria', kriteria)`                       | `&kriteria=` (token `all` = tanpa param)              |
| `.eq('jenis', jenis)`                             | `&jenis=masuk|keluar`                                 |
| `.eq('barang_id', n)`                             | `&barang_id=n`                                        |
| `.gte('created_at', dayStartISO(d))`              | `&from=YYYY-MM-DD`                                    |
| `.lt('created_at', nextDayStartISO(d))`           | `&to=YYYY-MM-DD` (API jadikan inklusif => `< T+1`)   |
| `.order('created_at',{ascending:false}).order('id',{ascending:false}).range(...)` | `&page=&pageSize=` (API sort tetap `created_at DESC, id DESC`) |
| `select('id',{count:'exact',head:true})` (total)  | field `total` di respons `GET /api/transaksi`         |

## 4. Transaksi — balance sebelum baris

| Supabase                                                        | REST                                             |
|-----------------------------------------------------------------|--------------------------------------------------|
| `supabase.rpc('riwayat_balance_before', { p_barang_id, p_created_at, p_id })` (per baris, batch export) | `GET /api/transaksi/:id/balance-before` |

Semantik identik: `riwayat_balance_before(barang_id, created_at, id)` —
penjumlahan *transaksi* yang terjadi **sebelum** posisi `(created_at, id)` pada
barang tsb (TIDAK termasuk saldo awal hasil `seed_stock_levels_barang`).
REST memakai nilai kolom (`t.created_at`) sehingga presisi mikrodetik
terjaga, menghindari staleness RPC param dari client.

Strategi export (`attachStockBalances`, batch 1000, max 20000):
- Ambil baseline per barang dari transaksi pertama: `GET /api/transaksi/:firstId/balance-before`.
- Akses daftar: `GET /api/transaksi?<filter>` (sudah sorted `created_at DESC,id DESC`),
  lalu jalankan akumulasi `masuk+ / keluar-` di client — sama logika yang ada.
- (Opsional penghematan N+1 di masa depan: tambahkan `balance_before` pada item
  list atau endpoint export khusus — tercatat sebagai enhancement, bukan
  kebutuhan fungsional sekarang.)

## 5. Insert transaksi

| Supabase                                                  | REST                        |
|-----------------------------------------------------------|-----------------------------|
| `from('transaksi').insert({ barang_id, jenis, jumlah, warehouse, kriteria, keterangan, client_tx_id })` | `POST /api/transaksi` (body sama) |

- `user_id` tidak dikirim API (null) — di Supabase lama default `auth.uid()`;
  di Homelab tidak ada auth → NULL.
- Pengulangan `client_tx_id` yang sama: Supabase lama enggak dibuat duplikat
  (partial unique index) → REST mengembalikan **200 + data baris lama**
  (idempoten).
- `keluar` melebihi saldo `warehouse+kriteria` → trigger `check_violation` →
  REST 409 `INSUFFICIENT_STOCK`.
- Tidak ada endpoint UPDATE/DELETE transaksi (riwayat immutable), sama seperti
  aplikasi lama.

## 6. Profil pengguna (auth)

| Supabase                                              | REST                  |
|-------------------------------------------------------|-----------------------|
| `from('profiles').select('id, nama')`                 | — (belum dibuat)      |
| `from('profiles').select('*').eq('id', userId).single()` (get profile sesi) | — (menunggu auth)     |

`GET /api/transaksi` sudah melakukan join `barang` & `profiles` sehingga
`barang_nama` / `user_nama` tersedia tanpa query profil terpisah. Endpoint
profil sesi (`/api/me`) + proteksi token untuk *write* adalah bagian dari
desain auth yang akan datang — lihat catatan keamanan `README.md`.

## 7. Realtime

| Supabase                                   | REST            |
|--------------------------------------------|-----------------|
| `channel(...).on('postgres_changes', ...)` (subscribe `barang` & `stock_levels`) | poll berkala via `GET /api/barang` & `GET /api/stock` |

API Homelab tidak menyediakan streaming realtime; halaman yang memakai
subscribe akan diubah ke polling (atau SSE/WebSocket di masa depan). Notifikasi
server tidak termasuk lingkup tahap ini.

## Hal-hal yang belum ada di API (keputusan sengaja)

- Auth/role (`profiles.role`, `staff`/`guest`) — middleware auth belum dibangun.
- Endpoint admin khusus (reset identity, pengaturan) — semuanya tetap lewat
  psql sebagai DBA.
- Write langsung ke `stock_levels` — hanya lewat buffer `transaksi` (trigger
  adalah satu-satunya jalan yang valid untuk menjaga konsistensi saldo).

## Uji coba cut-over

Urutan kandidat paling aman (baca-saja dulu):
1. `src/lib/stok.ts` → `getStock()` (satu panggilan, bentuk sama).
2. Halaman riwayat daftar + total → `getTransaksi()`.
3. `kelola-barang` CRUD → `getBarangList/getBarangById/createBarang/updateBarang/deleteBarang`.
4. Export → `getTransaksi()` + `getTransaksiBalanceBefore()`.
5. Insert form → `createTransaksi()`.
Setiap tahap tervalidasi lewat `api/test/smoke.mjs` sebelum merubah prod.