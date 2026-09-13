-- =============================================================================
-- Stock SDI Demo — PostgreSQL Homelab — migration 003 validation tests
-- Test 17 poin bisnis (parse + logika). SELURUH test dibungkus satu DO block
-- dan di-ROLLBACK; demo data (migration 002) TIDAK terhapus.
-- Catatan: nextval tidak rollback => identity diset ulang di migration 004.
-- Dijalankan sebagai role aplikasi: stock_sdi_demo_user.
-- =============================================================================
\set ON_ERROR_STOP off
BEGIN;

CREATE TEMP TABLE test_results (tname text PRIMARY KEY, status text);

DO $$
DECLARE
  _barang_id bigint;
  _stok_sebelum integer;
  _stok_sesudah integer;
  _ct uuid;
  _dummy uuid;
  _created timestamp with time zone;
  _tid bigint;
  _expected numeric;
  _got numeric;
  _max_id bigint;
BEGIN

  ----------------------------------------------------------------------
  -- 01/02/03: SELECT dasar
  ----------------------------------------------------------------------
  INSERT INTO test_results VALUES
    ('01 select barang',        CASE WHEN EXISTS(SELECT 1 FROM public.barang) THEN 'PASS' ELSE 'FAIL' END),
    ('02 select stock_levels',  CASE WHEN EXISTS(SELECT 1 FROM public.stock_levels) THEN 'PASS' ELSE 'FAIL' END),
    ('03 select transaksi',     CASE WHEN EXISTS(SELECT 1 FROM public.transaksi) THEN 'PASS' ELSE 'FAIL' END);

  ----------------------------------------------------------------------
  -- 04/05: INSERT barang + trigger seed membuat baris stock_levels
  ----------------------------------------------------------------------
  INSERT INTO public.barang (nama, stok) VALUES ('Barang Test Seed', 7) RETURNING id INTO _barang_id;
  INSERT INTO test_results VALUES ('04/05 insert barang + seed',
    CASE WHEN (SELECT COALESCE(SUM(jumlah),0) FROM public.stock_levels
               WHERE item_id = _barang_id AND warehouse='Puri' AND kriteria='Good') = 7
         THEN 'PASS' ELSE 'FAIL' END);

  ----------------------------------------------------------------------
  -- 06/07: INSERT transaksi MASUK valid -> stok bertambah
  -- 08/09: INSERT transaksi KELUAR valid -> stok berkurang
  ----------------------------------------------------------------------
  SELECT id, stok INTO _barang_id, _stok_sebelum FROM public.barang ORDER BY id LIMIT 1;
  INSERT INTO public.transaksi (barang_id, jenis, jumlah, warehouse, kriteria)
    VALUES (_barang_id, 'masuk', 5, 'Puri', 'Good');
  SELECT stok INTO _stok_sesudah FROM public.barang WHERE id = _barang_id;
  INSERT INTO test_results VALUES ('06/07 insert MASUK -> stok naik',
    CASE WHEN _stok_sesudah = _stok_sebelum + 5 THEN 'PASS' ELSE 'FAIL' END);

  SELECT stok INTO _stok_sebelum FROM public.barang WHERE id = _barang_id;
  INSERT INTO public.transaksi (barang_id, jenis, jumlah, warehouse, kriteria)
    VALUES (_barang_id, 'keluar', 1, 'Puri', 'Good');
  SELECT stok INTO _stok_sesudah FROM public.barang WHERE id = _barang_id;
  INSERT INTO test_results VALUES ('08/09 insert KELUAR -> stok turun',
    CASE WHEN _stok_sesudah = _stok_sebelum - 1 THEN 'PASS' ELSE 'FAIL' END);

  ----------------------------------------------------------------------
  -- 10/11: KELUAR melebihi saldo -> ditolak (check_violation 23514)
  ----------------------------------------------------------------------
  SELECT id INTO _barang_id FROM public.barang ORDER BY stok ASC LIMIT 1;
  BEGIN
    INSERT INTO public.transaksi (barang_id, jenis, jumlah, warehouse, kriteria)
      VALUES (_barang_id, 'keluar', 999999, 'Puri', 'Good');
    INSERT INTO test_results VALUES ('10/11 KELUAR berlebih ditolak', 'FAIL');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO test_results VALUES ('10/11 KELUAR berlebih ditolak', 'PASS');
  END;

  ----------------------------------------------------------------------
  -- 12/13: DUPLICATE client_tx_id -> ditolak (unique_violation 23505)
  ----------------------------------------------------------------------
  _ct := 'bbbbbbbb-0000-0000-0000-000000000001'::uuid;
  INSERT INTO public.transaksi (barang_id, jenis, jumlah, warehouse, kriteria, client_tx_id)
    VALUES (_barang_id, 'keluar', 1, 'Puri', 'Good', _ct);
  BEGIN
    INSERT INTO public.transaksi (barang_id, jenis, jumlah, warehouse, kriteria, client_tx_id)
      VALUES (_barang_id, 'keluar', 1, 'Puri', 'Good', _ct);
    INSERT INTO test_results VALUES ('12/13 duplicate client_tx_id ditolak', 'FAIL');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO test_results VALUES ('12/13 duplicate client_tx_id ditolak', 'PASS');
  END;

  ----------------------------------------------------------------------
  -- 14: riwayat_balance_before cocok dgn hitungan manual (tie-break id)
  --     Pakai transaksi barang 1 paling akhir; semua created_at sama,
  --     jadi pembanding murni id kecil.
  ----------------------------------------------------------------------
  SELECT created_at, id INTO _created, _tid
    FROM public.transaksi WHERE barang_id = 1
    ORDER BY id DESC LIMIT 1;
  SELECT COALESCE(SUM(CASE WHEN jenis='masuk' THEN jumlah ELSE -jumlah END), 0)::numeric
    INTO _expected
    FROM public.transaksi
    WHERE barang_id = 1
      AND (created_at < _created OR (created_at = _created AND id < _tid));
  _got := public.riwayat_balance_before(1, _created, _tid);
  INSERT INTO test_results VALUES ('14 riwayat_balance_before',
    CASE WHEN _got = _expected THEN 'PASS' ELSE 'FAIL' END);

  ----------------------------------------------------------------------
  -- 15: barang.stok == SUM(stock_levels) untuk SEMUA item
  ----------------------------------------------------------------------
  INSERT INTO test_results VALUES ('15 stok == SUM stock_levels',
    CASE WHEN (SELECT count(*) FROM (
        SELECT b.id FROM public.barang b
          LEFT JOIN (SELECT item_id, SUM(jumlah) j FROM public.stock_levels GROUP BY item_id) s
            ON s.item_id = b.id
        WHERE COALESCE(b.stok,0) <> COALESCE(s.j,0)
      ) x) = 0 THEN 'PASS' ELSE 'FAIL' END);

  ----------------------------------------------------------------------
  -- 16: FK transaksi.barang_id -> barang.id (foreign_key_violation 23503)
  ----------------------------------------------------------------------
  SELECT COALESCE(MAX(id),0) INTO _max_id FROM public.barang;
  BEGIN
    INSERT INTO public.transaksi (barang_id, jenis, jumlah, warehouse, kriteria)
      VALUES (_max_id + 9999, 'keluar', 1, 'Puri', 'Good');
    INSERT INTO test_results VALUES ('16 FK barang_id ditolak', 'FAIL');
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO test_results VALUES ('16 FK barang_id ditolak', 'PASS');
  END;

  ----------------------------------------------------------------------
  -- 17: CHECK warehouse & kriteria invalid -> ditolak (check_violation)
  ----------------------------------------------------------------------
  BEGIN
    INSERT INTO public.transaksi (barang_id, jenis, jumlah, warehouse, kriteria)
      VALUES (_barang_id, 'masuk', 1, 'WAREHOUSE-INVALID', 'Good');
    RAISE EXCEPTION 'not expected';
  EXCEPTION WHEN check_violation THEN
    NULL; -- expected
  END;

  BEGIN
    INSERT INTO public.transaksi (barang_id, jenis, jumlah, warehouse, kriteria)
      VALUES (_barang_id, 'masuk', 1, 'Puri', 'KRITERIA-INVALID');
    RAISE EXCEPTION 'not expected';
  EXCEPTION WHEN check_violation THEN
    NULL; -- expected
  END;
  INSERT INTO test_results VALUES ('17 CHECK warehouse & kriteria', 'PASS');

END $$;

-- Tampilkan hasil SEBELUM rollback (temp table hilang setelah ROLLBACK)
SELECT tname AS test, status AS result FROM test_results ORDER BY tname;

ROLLBACK;
-- =============================================================================