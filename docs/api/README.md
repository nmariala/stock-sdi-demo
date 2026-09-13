# Stock SDI Demo — API Layer

REST API Node.js (Express + `pg`) sebagai **satu-satunya akses frontend ke
database PostgreSQL `stock_sdi_demo`** di Homelab. API membungkus logika
Supabase lama yang saat ini masih dipakai frontend secara langsung.

```
Next.js frontend  --->  REST API (port 3101)  --->  PostgreSQL (127.0.0.1:5432)
```

- Bahasa: Node.js CommonJS, beginner-friendly, tanpa framework berat.
- Deps: `express`, `pg`, `cors`, `dotenv`.
- API **tidak menghitung ulang stok**; semua aturan stok (`stock_levels`,
  validasi saldo, idempotensi `client_tx_id`) dijalankan oleh trigger
  PostgreSQL yang sudah ada (source of truth).
- LOKASI SOURCE: `api/` di repository ini. DEPLOY: `/home/nugie/stock-sdi-api/`
  di `debian-server` (192.168.1.29).

## Struktur

```
api/
├── package.json          # deps & scripts (start / dev / check)
├── .env.example          # template konfigurasi (tanpa credential)
├── server.js             # bootstrap Express: CORS, routes, 404, error handler
├── db.js                 # koneksi pool pg dari environment
├── middleware/
│   └── errorHandler.js   # pemetaan error aplikasi & PostgreSQL -> {error:{code,message}}
├── routes/
│   ├── health.js         # GET /api/health
│   ├── barang.js         # CRUD barang
│   ├── stock.js          # tingkat stok dari stock_levels + barang
│   └── transaksi.js      # riwayat transaksi, balance-before, POST transaksi
├── utils/
│   ├── errors.js         # AppError (+ notFoundError, duplicateError, ...)
│   └── validation.js     # validasi input, enum GUDANG/KRITERIA/JENIS, pagination
└── test/
    └── smoke.mjs         # smoke test end-to-end (53 cek) + cleanup otomatis
```

## Menjalankan

Prasyarat: Node.js ≥ 18 (server pakai v20), akses ke database `stock_sdi_demo`
dengan user `stock_sdi_demo_user` (dari `~/.pgpass`).

```bash
cd api
cp .env.example .env      # isi credential nyata (jangan di-commit)
npm install
npm start                 # node server.js
```

Dengan `.env`:

```env
PORT=3101
DATABASE_HOST=127.0.0.1
DATABASE_PORT=5432
DATABASE_NAME=stock_sdi_demo
DATABASE_USER=stock_sdi_demo_user
DATABASE_PASSWORD=...
API_CORS_ORIGIN=http://localhost:3000
DATABASE_CONNECT_TIMEOUT=5000
```

Verifikasi & test:

```bash
curl http://127.0.0.1:3101/api/health        # {"ok":true}
node test/smoke.mjs                          # 53 cek, baseline kembali utuh
```

Proses API saat ini berjalan dari `no (home)/nugie/stock-sdi-api` dan **bind ke
loopback saja** (`127.0.0.1:3101`), tidak dipublikasikan ke LAN/internet.
Restart memakai `/tmp/apirestart.sh` (kill hanya proses pemilik port 3101 —
tidak menyentuh belajar-node:3000 maupun kontainer Docker staging:3001).

## Keamanan

- Bind `127.0.0.1` saja; akses publik hanya lewat reverse-proxy yang
  di-autentikasi (belum dipasang).
- Port 5543/5432 tidak pernah dipublish; node client PostgreSQL dipakai hanya
  di server. AKSES via internet tidak direncanakan (demo internal).
- Semua query **parameterized** (tidak ada interpolasi input user).
- CORS dibatasi ke `API_CORS_ORIGIN` (bukan `*` permanen).
- Error tidak pernah membocorkan SQL/pesan database mentah.
- Body limit 100kb; pagination dibatasi (barang & transaksi).
- Tidak ada auth bertingkat → endpoint **belum** memakai token; pembuatan
  `createTransaksi` & `POST/DELETE` `barang` patut mendapat middleware auth
  sebelum dipakai produksi (lihat `docs/api/migration-map.md`).

## Port & environ panggung (server saat ini)

| Port  | Apa                         | Pemilik                 | Status            |
|-------|-----------------------------|-------------------------|-------------------|
| 3000  | belajar-node                | nugie (proses)          | JANGAN diubah     |
| 3001  | kontainer Docker staging    | dhcpcd (containerd)     | JANGAN diubah     |
| 3101  | Stock SDI Demo API (ini)    | nugie (nohup)           | aktif, loopback   |
| 5432  | PostgreSQL                  | postgres                | localhost saja    |

## Deployment ke Homelab / masa depan

1. `scp -r api/* nugie@192.168.1.29:/home/nugie/stock-sdi-api/` (tanpa `.env`,
   `node_modules`).
2. Buat `.env` dari `~/.pgpass` (lihat pola di `/tmp/apienv.sh`).
3. `npm install --no-audit --no-fund`.
4. Jalankan `node server.js` (idealnya lewat `systemd`, belum dipasang).
5. (Opsional) reverse-proxy + TLS di depan 3101 untuk frontend production.

Untuk pemetaan query Supabase frontend → REST, lihat `docs/api/migration-map.md`.