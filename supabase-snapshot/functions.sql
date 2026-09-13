-- =============================================================================
-- Function snapshot — schema public
-- Project : Stock SDI Demo (rwbplixadhmuytkymwcb)
-- Source  : pg_get_functiondef via Management API (read-only), PG 17.6
-- Urutan pembuatan di homelab: seed_stock_levels_barang &
-- sync_saldo_transaksi (dipakai trigger) -> handle_new_user -> riwayat_balance_before
-- (update_stok_barang = dead code, tidak dipasang pada trigger mana pun).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. seed_stock_levels_barang()  -- trigger function AFTER INSERT ON barang
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_stock_levels_barang()
 RETURNS trigger
 LANGUAGE plpgsql
 VOLATILE
AS $function$
BEGIN
  IF COALESCE(new.stok, 0) <> 0 THEN
    INSERT INTO stock_levels (item_id, warehouse, kriteria, jumlah)
    VALUES (new.id, 'Puri', 'Good', new.stok)
    ON CONFLICT (item_id, warehouse, kriteria)
    DO UPDATE SET jumlah = excluded.jumlah, updated_at = now();
  END IF;
  RETURN new;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 2. sync_saldo_transaksi()  -- trigger function AFTER INSERT ON transaksi
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_saldo_transaksi()
 RETURNS trigger
 LANGUAGE plpgsql
 VOLATILE
AS $function$
DECLARE
  cur numeric;
  delta numeric;
BEGIN
  IF new.jenis = 'masuk' THEN
    delta := new.jumlah;
  ELSE
    delta := -new.jumlah;
  END IF;

  -- Cegah stok warehouse+kriteria jadi negatif
  SELECT COALESCE(SUM(jumlah), 0) INTO cur
  FROM stock_levels
  WHERE item_id = new.barang_id AND warehouse = new.warehouse AND kriteria = new.kriteria;
  IF new.jenis = 'keluar' AND cur < new.jumlah THEN
    RAISE EXCEPTION 'Stok tidak mencukupi untuk % di % (%)', new.barang_id, new.warehouse, new.kriteria
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO stock_levels (item_id, warehouse, kriteria, jumlah)
  VALUES (new.barang_id, new.warehouse, new.kriteria, delta)
  ON CONFLICT (item_id, warehouse, kriteria)
  DO UPDATE SET jumlah = stock_levels.jumlah + delta, updated_at = now();

  -- Sinkron total di tabel barang
  UPDATE barang SET stok = COALESCE((SELECT SUM(jumlah) FROM stock_levels WHERE item_id = new.barang_id), 0)
  WHERE id = new.barang_id;

  RETURN new;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 3. handle_new_user()  -- trigger function AFTER INSERT ON auth.users [SUPABASE-AUTH]
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.profiles (id, nama, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nama', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'role', 'staff')
  );
  return new;
end;
$function$;

-- -----------------------------------------------------------------------------
-- 4. riwayat_balance_before(p_barang_id, p_created_at, p_id)  -- RPC stable
--      Digunakan oleh halaman riwayat / riwayatExport untuk menghitung saldo
--      "sebelum" sebuah baris transaksi (total masuk-keluar sebelum posisi
--      (created_at, id) pada barang tsb).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.riwayat_balance_before(p_barang_id bigint, p_created_at timestamp with time zone, p_id bigint)
 RETURNS numeric
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COALESCE(
    SUM(
      CASE
        WHEN t.jenis = 'masuk' THEN t.jumlah
        WHEN t.jenis = 'keluar' THEN -t.jumlah
        ELSE 0
      END
    ),
    0
  )::numeric
  FROM public.transaksi t
  WHERE t.barang_id = p_barang_id
    AND (
      t.created_at < p_created_at
      OR (
        t.created_at = p_created_at
        AND t.id < p_id
      )
    );
$function$;

-- -----------------------------------------------------------------------------
-- 5. update_stok_barang()  -- DEAD CODE (tidak dipasang pada trigger mana pun)
--      Versi lama sinkronisasi saldo; di-supersede oleh sync_saldo_transaksi.
--      Hanya didokumentasikan untuk kelengkapan; TIDAK perlu dimigrasikan.
-- -----------------------------------------------------------------------------
-- CREATE OR REPLACE FUNCTION public.update_stok_barang()
--  RETURNS trigger
--  LANGUAGE plpgsql
--  VOLATILE
-- AS $function$
-- begin
--   if new.jenis = 'masuk' then
--     update barang set stok = stok + new.jumlah, updated_at = now() where id = new.barang_id;
--   else
--     update barang set stok = stok - new.jumlah, updated_at = now() where id = new.barang_id;
--   end if;
--   return new;
-- end;
-- $function$;

-- Metadata seluruh fungsi (nilai yang berbeda dari default):
--   handle_new_user        : SECURITY DEFINER | SET search_path TO '' | VOLATILE
--   riwayat_balance_before : STABLE (SQL)
--   seed_stock_levels_barang : VOLATILE
--   sync_saldo_transaksi   : VOLATILE
--   update_stok_barang     : VOLATILE
-- Semua fungsi NON-STRICT (strict=false) dan parallel=unsafe.
-- =============================================================================