-- =============================================================================
-- Row Level Security snapshot — schema public
-- Project : Stock SDI Demo (rwbplixadhmuytkymwcb)
-- Source  : pg_policies + pg_class.relrowsecurity via Management API (read-only)
-- Catatan  : pendekatan ini = baca metadata, bukan dump; DDL text dibuat ulang
--            dari hasil q36/q37.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Aktifkan RLS pada seluruh tabel public
-- (semua tabel public: relrowsecurity = true, relforcerowsecurity = false)
-- -----------------------------------------------------------------------------
ALTER TABLE public.barang ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaksi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- (realforce RLS tidak dipakai di mana pun)

-- -----------------------------------------------------------------------------
-- Policy: public.barang
-- -----------------------------------------------------------------------------
-- SELECT untuk siapa pun yang login (authenticated) diizinkan.
CREATE POLICY "barang_select_authenticated" ON public.barang
  FOR SELECT TO authenticated USING (true);

-- INSERT/UPDATE/DELETE hanya untuk role 'staff' (cek ke profiles).
CREATE POLICY "barang_insert_staff" ON public.barang
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'staff'));

CREATE POLICY "barang_update_staff" ON public.barang
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'staff'));

CREATE POLICY "barang_delete_staff" ON public.barang
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'staff'));

-- -----------------------------------------------------------------------------
-- Policy: public.profiles
-- -----------------------------------------------------------------------------
-- Hanya SELECT; seluruh authenticated boleh membaca (untuk lookup nama).
-- Tidak ada policy INSERT di API (baris dibuat oleh trigger handle_new_user),
-- tidak ada INSERT valid untuk TIDAK membiarkan user membuat role sendiri.
CREATE POLICY "profiles_select_authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- -----------------------------------------------------------------------------
-- Policy: public.stock_levels
-- -----------------------------------------------------------------------------
CREATE POLICY "stock_levels_select_authenticated" ON public.stock_levels
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "stock_levels_insert_staff" ON public.stock_levels
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'staff'));

CREATE POLICY "stock_levels_update_staff" ON public.stock_levels
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'staff'));

-- (Tidak ada policy DELETE untuk stock_levels — penghapusan baris hanya via
-- CASCADE dari delete barang, atau oleh postgres/service_role.)

-- -----------------------------------------------------------------------------
-- Policy: public.transaksi
-- -----------------------------------------------------------------------------
CREATE POLICY "transaksi_select_authenticated" ON public.transaksi
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "transaksi_insert_staff" ON public.transaksi
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'staff'));

-- -----------------------------------------------------------------------------
-- Policy: public.user_sessions
-- -----------------------------------------------------------------------------
CREATE POLICY "user_sessions_own_row" ON public.user_sessions
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =============================================================================