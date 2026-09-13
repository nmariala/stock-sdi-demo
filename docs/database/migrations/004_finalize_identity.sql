-- =============================================================================
-- Stock SDI Demo — PostgreSQL Homelab — migration 004 finalize identity
-- Set identity sequence agar next ID sesuai snapshot Supabase (last_value+1):
--   barang.id        : last 36  => next 37
--   stock_levels.id  : last 63  => next 64
--   transaksi.id     : last 58  => next 59
-- Wajib dijalankan SETELAH 002 seed & 003 validation (nextval tidak rollback).
-- Dijalankan sebagai role aplikasi: stock_sdi_demo_user.
-- =============================================================================
BEGIN;

SELECT setval(pg_get_serial_sequence('public.barang', 'id'),       36, true);
SELECT setval(pg_get_serial_sequence('public.stock_levels', 'id'), 63, true);
SELECT setval(pg_get_serial_sequence('public.transaksi', 'id'),    58, true);

COMMIT;
-- =============================================================================