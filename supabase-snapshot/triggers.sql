-- =============================================================================
-- Trigger snapshot — schema public (+ auth.users yang menarget fungsi public)
-- Project : Stock SDI Demo (rwbplixadhmuytkymwcb)
-- Source  : pg_get_triggerdef via Management API (read-only), PG 17.6
-- =============================================================================

-- Trigger 1: seed saldo awal saat barang baru dibuat -------------------------
-- Event : AFTER INSERT ON public.barang (FOR EACH ROW)
-- Fungsi: public.seed_stock_levels_barang()
-- Perilaku: jika stok awal != 0, buat/update baris stock_levels Puri/Good
--           sebesar nilai stok. Barang stok 0 tidak menghasilkan baris seed.
CREATE TRIGGER trg_barang_seed_saldo AFTER INSERT ON public.barang FOR EACH ROW EXECUTE FUNCTION public.seed_stock_levels_barang();

-- Trigger 2: sinkronisasi saldo saat transaksi baru --------------------------
-- Event : AFTER INSERT ON public.transaksi (FOR EACH ROW)
-- Fungsi: public.sync_saldo_transaksi()
-- Perilaku: hitung delta (masuk = +jumlah, keluar = -jumlah), cegah keluar
--           melebihi saldo warehouse+kriteria (RAISE check_violation),
--           UPSERT stock_levels, lalu set ulang barang.stok = SUM(stock_levels).
CREATE TRIGGER trg_transaksi_sync_saldo AFTER INSERT ON public.transaksi FOR EACH ROW EXECUTE FUNCTION public.sync_saldo_transaksi();

-- Trigger 3: pembuatan profile otomatis saat user Auth dibuat -----------------
-- Event : AFTER INSERT ON auth.users (FOR EACH ROW) [skema auth, milik
--         supabase_auth_admin]  -- [SUPABASE-AUTH]
-- Fungsi: public.handle_new_user()
-- Perilaku: insert public.profiles(id,nama,role) dari new.raw_user_meta_data;
--           nama fallback = bagian sebelum '@' email; role default 'staff'.
-- Perhatian homelab: trigger ini menempel pada skema auth Supabase. Saat
-- migrasi, mekanisme "buat profile saat user dibuat" harus dibuat ulang
-- terhadap mekanisme auth homelab (mis. trigger pada tabel users sendiri,
-- hook aplikasi, atau edge function).
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Status seluruh trigger: enabled 'O' (origin / aktif).
-- Tidak ada trigger lain pada schema public.
-- =============================================================================