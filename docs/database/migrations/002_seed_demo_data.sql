-- =============================================================================
-- Stock SDI Demo — PostgreSQL Homelab — migration 002 seed + identity
-- 1) Sanitized DEMO DATA (bukan data production).
-- 2) Rekonsiliasi stok total di barang agar konsisten dgn SUM(stock_levels).
--    (Identity di-set di migration 004, setelah validation test.)
-- Dijalankan sebagai role aplikasi: stock_sdi_demo_user (owner, hak INSERT).
-- =============================================================================
BEGIN;

-- -----------------------------------------------------------------------------
-- PROFILES (demo; uuid statis. API auth custom akan mengisi baris asli nanti)
-- -----------------------------------------------------------------------------
INSERT INTO public.profiles (id, nama, role) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Admin Demo', 'staff'),
  ('00000000-0000-0000-0000-000000000002', 'Tamu Demo',  'guest');

-- -----------------------------------------------------------------------------
-- BARANG (8 item; stok awal -> seed trigger membuat Puri/Good)
-- -----------------------------------------------------------------------------
INSERT INTO public.barang (nama, stok) VALUES
  ('Pancake SB110',         10),
  ('Pancake Roll Reguler',   8),
  ('Pancake Roll Premium',   6),
  ('Ice Cream Vanilla',     20),
  ('Ice Cream Chocolate',   15),
  ('Daging Ori Sapi',       12),
  ('Susu Bubuk Full Cream', 25),
  ('Topping Coklat',         0);   -- stok 0 => TIDAK membuat baris seed (logic asli)

-- -----------------------------------------------------------------------------
-- STOCK_LEVELS tambahan manual (kriteria Bad / gudang non-Puri).
-- Harus SEBELUM transaksi agar semua "keluar" punya saldo cukup.
-- -----------------------------------------------------------------------------
INSERT INTO public.stock_levels (item_id, warehouse, kriteria, jumlah) VALUES
  (1, 'CS TCL', 'Bad',  1),
  (2, 'CS SBF', 'Good', 2),
  (3, 'CS TCL', 'Good', 1);

-- -----------------------------------------------------------------------------
-- TRANSAKSI demo (semua valid; keluar hanya dari warehouse/kriteria bersaldo)
-- user_id -> profile demo; client_tx_id statis (uji idempotensi duplikat).
-- -----------------------------------------------------------------------------
INSERT INTO public.transaksi (barang_id, jenis, jumlah, keterangan, warehouse, kriteria, user_id, client_tx_id) VALUES
  (1, 'masuk',  5, 'Restok pembelian',       'Puri',   'Good', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001'),
  (1, 'keluar', 3, 'Penjualan online',        'Puri',   'Good', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002'),
  (1, 'keluar', 1, 'Koreksi stok cacat',      'CS TCL', 'Bad',  '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003'),
  (2, 'masuk', 10, 'Restok pembelian',        'Puri',   'Good', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004'),
  (2, 'keluar', 4, 'Penjualan offline',       'Puri',   'Good', '00000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005'),
  (3, 'masuk',  3, 'Restok pembelian',        'CS TCL', 'Good', '00000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000006'),
  (3, 'keluar', 1, 'Penjualan online',        'CS TCL', 'Good', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000007'),
  (4, 'masuk', 30, 'Restok pembelian',        'Puri',   'Good', '00000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000008'),
  (4, 'keluar', 12, 'Penjualan online',       'Puri',   'Good', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000009'),
  (5, 'masuk',  5, 'Restok pembelian',        'CS SBF', 'Good', '00000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a'),
  (5, 'keluar', 2, 'Koreksi stok rusak',      'CS SBF', 'Good', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000b'),
  (6, 'masuk',  8, 'Restok pembelian',        'CS SBF', 'Good', '00000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000c'),
  (6, 'keluar', 3, 'Penjualan offline',       'CS SBF', 'Good', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000d'),
  (7, 'masuk', 10, 'Restok pembelian',        'Puri',   'Good', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000e'),
  (8, 'masuk',  7, 'Restok dari nol (demo)',  'Puri',   'Good', '00000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000f');

-- -----------------------------------------------------------------------------
-- REPLAY seed trigger untuk barang yang mungkin bergeser (belt & suspenders):
-- tidak perlu, karena trigger di atas sudah selalu SET stok = SUM(stock_levels)
-- per item. Baris berikut hanya memastikan konsistensi bila seed 0:
--   Topping Coklat (id 8) tidak punya baris stock_levels & stok FINAL 7.
--   Item 1..7 stok FINAL = SUM(stock_levels) per item (divalidasi test 15).
-- -----------------------------------------------------------------------------
UPDATE public.barang b SET
  stok = COALESCE((SELECT SUM(jumlah) FROM public.stock_levels s WHERE s.item_id = b.id), 0);

COMMIT;
-- =============================================================================