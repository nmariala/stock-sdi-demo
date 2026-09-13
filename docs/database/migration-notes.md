# Catatan migrasi — Supabase → PostgreSQL Homelab

## Status

- **Selesai**: schema, trigger, fungsi, identity, demo data, validasi 17 poin, role app.
- **Belum**: auth (login/register), realtime, RLS/authorization, API layer, frontend, domain, Nginx, cut-over.
- Tidak ada koneksi ke internet/browser; PostgreSQL tetap hanya di 127.0.0.1. **Jangan** expose ke jaringan.

## Cara eksekusi

1. `001_setup_schema.sql` dijalankan via `sudo -u postgres psql` (SATU langkah sudo).
   - Guard menolak eksekusi ulang bila role/database sudah ada (tidak ada drop/reset).
   - Password role dibaca dari `/tmp/stock_sdi_pw` via backtick psql
     `\set dbpw `cat /tmp/stock_sdi_pw`` (pola resmi psql; file dibuat 644 agar terbaca postgres).
   - Semua objek di-OWN role aplikasi lewat `SET ROLE stock_sdi_demo_user` setelah `\c`.
2. `002`–`004` dijalankan sebagai `stock_sdi_demo_user` via 127.0.0.1 menggunakan `~/.pgpass`.

## Tips teknis yang ditemui

- `\set dbpw \`cat ...\`` (dengan backslash) **salah** — backslash tak ber-escape memutus
  parsing argumen psql → `invalid command`. Yang benar: backtick polos `\set dbpw `cat ...``.
- `~/.pgpass` harus dibuat dari nilai password yang SAMA dengan yang dipakai `CREATE ROLE`;
  gunakan `printf '%s\n' 'host:port:db:user:'"$(cat file)"`. Cek dengan
  `awk -F: '{print $5}' ~/.pgpass | md5sum` vs sumber password.
- `nextval` tidak mengikuti rollback → identity di-final-kan (004) SETELAH seed + validasi,
  bukan sebelum/bersamaan.
- Validasi membungkus seluruhnya dalam transaksi + ROLLBACK supaya tidak meninggalkan data test.

## Demo data (sanitized, bukan data production)

- 8 barang, 2 di antaranya pernah 0 stok (uji seed-skip); `Topping Coklat` dibuat dari kasus restock-nol.
- 2 profile demo (uuid statis): staff & guest.
- 15 transaksi masuk/keluar lintas Puri/CS TCL/CS SBF dan Good/Bad; termasuk contoh keluar-Bad
  yang divalidasi cukup saldo; `client_tx_id` placeholder statis untuk menguji idempotensi duplikat.
- Total stok final barang = SUM setiap stock_levels (diuji poin 15).

## Validasi (17 poin → 12 hasil PASS)

`03` sudah membuktikan: select dasar; seed trigger; masuk → stok naik; keluar → stok turun;
keluar berlebih ditolak (`check_violation`); duplicate `client_tx_id` ditolak (`unique_violation`);
`riwayat_balance_before` benar; stok == SUM stock_levels; FK barang_id ditolak;
CHECK warehouse & kriteria ditolak.

## Policy security

- Role app = LOGIN, non-superuser; semua tabel owner role app.
- Password: server `~/.pgpass` (600), lokal `.env.pg.stock_sdi` (gitignored). File `/tmp/stock_sdi_pw`
  sudah dihapus.
- Tidak ada secret di file SQL atau di repo.

## Pendahulu yang TIDAK disentuh selama tahap ini

Homelab Dashboard DB (`hl-*`), Docker staging DB, Nginx, Cloudflare, `D:\stock-app`,
`.env.local`, belajar-node service — semuanya dibiarkan apa adanya.