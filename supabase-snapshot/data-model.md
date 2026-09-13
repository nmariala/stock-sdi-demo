# Data Model & Data (ringkas, sanitized)

Jumlah baris diambil via `SELECT count(*)` pada tanggal snapshot. Sample dipotong **maks 5 baris** dan kolom-kolom yang tidak sensitif.

## Jumlah baris

| Tabel | Jumlah |
|---|---|
| `barang` | 19 |
| `stock_levels` | 26 |
| `transaksi` | 40 |
| `profiles` | 6 |

## Sample `barang` (5 baris, sanitized)

| id | nama | stok | updated_at |
|---|---|---|---|
| 1 | Pancake SB110 | 0 | 2026-09-02 08:33:35 |
| 2 | Pancake Roll Reguler | 0 | 2026-09-02 08:33:35 |
| 3 | Pancake Roll Premium | 0 | 2026-09-02 08:33:35 |
| 4 | Ice Cream | 0 | 2026-09-02 08:33:35 |
| 6 | Daging Ori | 0 | 2026-09-02 08:33:35 |

## Sample `stock_levels` (5 baris, sanitized)

| id | item_id | warehouse | kriteria | jumlah | updated_at |
|---|---|---|---|---|---|
| 1 | 3 | Puri | Good | 0 | 2026-08-29 20:52:13 |
| 2 | 4 | Puri | Good | 0 | 2026-08-29 20:52:13 |
| 3 | 2 | Puri | Good | 0 | 2026-08-29 20:52:13 |
| 4 | 1 | Puri | Good | 0 | 2026-09-03 08:58:21 |
| 5 | 6 | Puri | Good | 0 | 2026-09-03 06:27:01 |

> Sample di atas kebetulan menampilkan angka 0 (data stok hampir semua nol pada sample awal). Data `id` 5 pada `barang` tidak muncul di sample 5 baris (urut id, id 7 dst. terpotong).

## Aturan/kardinalitas

- `barang 1 ─── * stock_levels` (satu per kombinasi item+warehouse+kriteria, unique) dan `barang 1 ─── * transaksi`.
- `profiles 1 ─── * transaksi` (lewat `user_id`); mapping nama dilakukan via lookup terpisah (tidak ada join FK `transaksi→profiles`).
- Nilai yang diizinkan (dijamin CHECK):
  - `warehouse` ∈ `{Puri, CS TCL, CS SBF}`
  - `kriteria` ∈ `{Good, Bad}`
  - `jenis` ∈ `{masuk, keluar}`
  - `role` ∈ `{staff, guest}`

## Keterbatasan sample

- `transaksi` dan `profiles` **tidak** di-sample (prioritas schema/metadata, sesuai instruksi; bisa saja berisi informasi pribadi/nama user).
- `user_sessions` tidak dihitung (tidak relevan; tidak dipakai aplikasi).

## Distribusi domain yang relevan untuk migrasi data

- ID sequence (`bigint`, non-uuid) untuk 3 tabel utama → perlu mempertahankan nilai sequence agar ID baru tidak bertabrakan setelah migrasi.
- `transaksi.client_tx_id` (uuid) unik partial — berfungsi idempotensi retry dari frontend (lihat frontend-dependencies → TransaksiForm).