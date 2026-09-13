# Database — Stock SDI Demo (PostgreSQL Homelab)

> Tahap **DATABASE ONLY** dari migrasi Supabase → Homelab. Belum ada Node.js API,
> frontend, domain, Nginx, maupun cut-over. Jangan commit/push (belum final).

## Ringkasan

- **Host**: `debian-server` (PostgreSQL 17.11, cluster `17/main`, port 5432, listen hanya 127.0.0.1/::1)
- **Database**: `stock_sdi_demo`, owner = `stock_sdi_demo_user`
- **Role**: `stock_sdi_demo_user` (LOGIN, non-superuser) — dipakai oleh aplikasi di tahap berikut
- **Credential**: tersimpan di `.env.pg.stock_sdi` (gitignored, jangan pernah di-commit). Server:
  `~/.pgpass` (chmod 600). Tidak pernah muncul di repo / output / command-line.
- **Status**: setup ✅ seed demo ✅ validasi 17 poin ✅ identity ✅

## Isi

| Folder/File | Keterangan |
|---|---|
| `migrations/001_setup_schema.sql` | Buat role + database + schema (4 tabel, index, fungsi, trigger) |
| `migrations/002_seed_demo_data.sql` | Demo data sanitized (2 profile, 8 barang, 13 stock_levels, 15 transaksi) |
| `migrations/003_validation_tests.sql` | 17 poin validasi + hasil (ROLLBACK, aman dijalankan ulang) |
| `migrations/004_finalize_identity.sql` | Set identity sequence (barang next 37, stock_levels 64, transaksi 59) |
| `architecture.md` | Desain tabel, trigger, fungsi dibanding sumber (snapshot Supabase) |
| `migration-notes.md` | Catatan keputusan migrasi & item yang sengaja ditunda |

## Cara menjalankan migrasi (runbook)

```bash
# 1. schema + role + database (SATU-satunya langkah sudo; dipicu manual)
sudo -u postgres psql --set ON_ERROR_STOP=1 -f /tmp/001_setup_schema.sql

# 2-4. sebagai role aplikasi via 127.0.0.1 (+ ~/.pgpass)
psql -h 127.0.0.1 -U stock_sdi_demo_user -d stock_sdi_demo -v ON_ERROR_STOP=1 -f /tmp/002_seed_demo_data.sql
psql -h 127.0.0.1 -U stock_sdi_demo_user -d stock_sdi_demo -f /tmp/003_validation_tests.sql
psql -h 127.0.0.1 -U stock_sdi_demo_user -d stock_sdi_demo -v ON_ERROR_STOP=1 -f /tmp/004_finalize_identity.sql
```

## Verifikasi terakhir (sukses)

- Role `stock_sdi_demo_user`: can_login = true, is_super = false
- Seluruh 4 tabel di-owner `stock_sdi_demo_user`
- Identity next: `barang` 37, `stock_levels` 64, `transaksi` 59 (sesuai snapshot)
- Counts: barang 8, stock_levels 13, transaksi 15, profiles 2
- `barang.stok == SUM(stock_levels.*.jumlah)` untuk 8/8 item
- Validation 17 poin: **semua PASS** (12 baris hasil)