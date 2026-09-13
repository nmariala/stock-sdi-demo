# Stock SDI Demo API — Referensi Endpoint

Base URL (dev): `http://127.0.0.1:3101`. Semua respons JSON. ID (bigint)
dipetakan ke `number` (bukan string). Tanggal `created_at` berformat ISO-Z.

## Format respons

- Sukses: `{ "data": ... }` atau `{ "data": [...], "total": n, "page": p, "pageSize": n }`.
- Error: `{ "error": { "code": "...", "message": "..." } }`

### Daftar kode error

| Kode                  | HTTP | Kapan                                                        |
|-----------------------|------|--------------------------------------------------------------|
| `VALIDATION_ERROR`    | 400  | Parameter/body tidak valid (enum, format, pagination, JSON)  |
| `NOT_FOUND`           | 404  | Resource tidak ada (barang/transaksi), atau barang pada FK   |
| `DUPLICATE_NAME`      | 409  | Buat/ubah nama barang yang sudah ada (cek aplikasi)          |
| `DUPLICATE_TRANSACTION`| 200 | `client_tx_id` sama → respons idempoten (baris yang sudah ada)|
| `INSUFFICIENT_STOCK`  | 409  | `keluar` melebihi saldo warehouse+kriteria (trigger DB)      |
| `FOREIGN_KEY_ERROR`   | 409  | Hapus barang yang masih punya riwayat transaksi              |
| `CONSTRAINT_ERROR`    | 400  | CHECK/not-null lain dari database                            |
| `DATABASE_ERROR`      | 500  | Kegagalan DB/koneksi (pesan aman, tanpa SQL)                 |
| `INTERNAL_ERROR`      | 500  | Exception tak terduga                                        |

## Health

### `GET /api/health`

Cek ringan koneksi DB.

- 200 `{ "ok": true }`
- 503 `{ "ok": false, "error": { code: "DATABASE_ERROR", ... } }`

## Barang

### `GET /api/barang` — daftar + pencarian

Query (opsional):

| Param     | Contoh         | Keterangan                              |
|-----------|----------------|-----------------------------------------|
| `search`  | `vani`         | ILIKE case-insensitive pada nama        |
| `page`    | `2`            | default `1`                             |
| `pageSize`| `50`           | default `50`, maks `500`                |
| `sort`    | `id` / `nama`  | default `nama` (whitelist, aman)        |
| `order`   | `asc`/`desc`   | default `asc`                           |

Urutan default `nama ASC` — setara `supabase.from('barang').select('*').order('nama')`.

### `GET /api/barang/:id` — detail

200 `{ data: Barang }` atau 404 `NOT_FOUND`.

Barang: `{ id, nama, stok, updated_at }`.

### `POST /api/barang` — buat

Body: `{ "nama": "string", "stok": number | optional }`. `stok >= 0` (default 0).
Bila `stok > 0`, trigger seed membuat baris `stock_levels` Puri/Good.
- 201 `{ data: Barang }`
- 409 `DUPLICATE_NAME` bila nama sudah ada (perbandingan case-insensitive).

### `PATCH /api/barang/:id` — ubah nama

Body: `{ "nama": "string" }`. `stok` tidak bisa diubah lewat API (perubahan
saldo hanya lewat transaksi). 200 `{ data: Barang }` | 404 | 409.

### `DELETE /api/barang/:id`

- 200 `{ data: { id } }`
- 404 bila tidak ada
- 409 `FOREIGN_KEY_ERROR` bila barang punya riwayat transaksi.

## Stock

### `GET /api/stock` — stok per barang + rincian per gudang/kriteria

Query (opsional): `warehouse`, `kriteria`, `barang_id`, `search`.

Respons `{ data: StockRow[], total }`; `StockRow`:

```json
{
  "id": 1, "nama": "Pancake SB110", "stok": 12,
  "total": 12,
  "levels": { "Puri": { "Good": 12 }, "CS TCL": { "Bad": 0 } }
}
```

Semantik:
- `levels` = pivot `stock_levels` setelah filter `warehouse`/`kriteria`.
- `stok` = nilai stok utama di tabel `barang` (source of truth trigger).
- `total` = `SUM(jumlah)` *yang dipilih* (filter warehouse/kriteria),
  atau `stok` bila tanpa filter. Server tidak menghitung ulang — data
  datang langsung dari `stock_levels`.

## Transaksi

### `GET /api/transaksi` — riwayat (filter + pagination)

Query (opsional):

| Param       | Keterangan                                                       |
|-------------|------------------------------------------------------------------|
| `barang_id` | filter per barang                                                 |
| `warehouse` | `Puri` / `CS TCL` / `CS SBF`                                     |
| `kriteria`  | `Good` / `Bad`                                                   |
| `jenis`     | `masuk` / `keluar`                                               |
| `from`/`to` | `YYYY-MM-DD`; **`to` inklusif** (ikut transaksi akhir tanggal tsb) |
| `page`      | default `1`                                                      |
| `pageSize`  | default `50`, maks `200`                                         |

Urutan default `created_at DESC, id DESC` — setara perilaku Supabase
`order('created_at', {ascending:false}).order('id', {ascending:false})`.

Respons `{ data: Transaksi[], total, page, pageSize }`; `Transaksi` menambahkan
`barang_nama` dan `user_nama` (join `profiles`, bisa `null`).

### `GET /api/transaksi/:id` — detail + balance-before

200 `{ data: { ...Transaksi, balance_before: number } }` | 404.
`balance_before` dihitung fungsi SQL `riwayat_balance_before` (kolom, presisi
penuh), = jumlah masuk-keluar **transaksi sebelum** baris ini (tidak termasuk
saldo awal yang bukan transaksi).

### `GET /api/transaksi/:id/balance-before`

200 `{ data: { id, barang_id, created_at, balance_before } }` | 404.

### `POST /api/transaksi` — catat masuk/keluar

Body:

```json
{
  "barang_id": 1,
  "jenis": "masuk",
  "jumlah": 5,
  "warehouse": "Puri",
  "kriteria": "Good",
  "keterangan": "opsional",
  "client_tx_id": "uuid-4-opsional-sekali-pakai"
}
```

Aturan (di-daerah trigger DB, bukan aplikasi):
- `masuk` menambah saldo warehouse+kriteria & stok barang.
- `keluar` hanya bila saldo warehouse+kriteria cukup; bila tidak → 409
  `INSUFFICIENT_STOCK`.
- `client_tx_id` duplikat → **200** dengan data baris yang sudah ada
  (idempoten, aman untuk retry frontend).
- `barang_id` tidak ada → 404 `NOT_FOUND`.
- 201 `{ data: Transaksi }` bila sukses.

## Catatan perilaku yang disengaja

- `riwayat_balance_before` hanya menjumlah **transaksi** sebelumnya (bukan
  saldo dari `stock_levels`/stok awal barang). Buat barang dengan `stok: 0`
  jika ingin saldo awal datang sepenuhnya dari transaksi.
- Tidak ada endpoint untuk mengubah/menghapus transaksi — riwayat immutable
  (mencerminkan aturan aplikasi lama).
- Semua pembulatan angka dilakukan di server/DB; JSON angka selalu `number`.