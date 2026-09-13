-- =============================================================================
-- Realtime / Publication snapshot
-- Project : Stock SDI Demo (rwbplixadhmuytkymwcb)
-- Source  : pg_publication + pg_publication_rel via Management API (read-only)
-- Catatan  : Supabase Realtime menggunakan publication khusus; hanya tabel
--            yang didaftarkan di publication yang mengirim event Realtime.
--            Replica identity seluruh tabel public = DEFAULT (tidak FULL);
--            untuk Realtime, Supabase biasanya menyetel REPLICA IDENTITY FULL
--            pada tabel yang dipublish — pada data ini IDENTITY masih DEFAULT
--            untuk semua tabel public (termasuk barang), namun Realtime tetap
--            berfungsi karena hanya membutuhkan key (PRIMARY KEY) pada mode
--            default. Perlu diverifikasi di environment homelab apakah ada
--            pengaturan REPLICA IDENTITY FULL yang tidak terlihat di sini.
-- =============================================================================

-- Publication 1: supabase_realtime (milik role postgres)
--   Tabel terdaftar: public.barang SAJA.
--   Behavior: hanya tabel di atas yang mengirim payload Realtime (insert/update/
--             delete/truncate) ke client yang subscribe.
--   PERHATIAN: public.stock_levels, public.transaksi, public.profiles,
--             public.user_sessions TIDAK ada di publication ini.
--             Frontend men-subscribe kanal 'riwayat-realtime' untuk tabel transaksi;
--             otomatis refresh antar browser untuk transaksi BERGANTUNG pada fitur
--             Realtime admin/config yang mungkin mengaktifkan tabel via Supabase
--             Dashboard (bukan di-publication ini). Perlu diputuskan di homelab
--             apakah perlu mengaktifkan publication untuk stock_levels/transaksi.
CREATE PUBLICATION supabase_realtime FOR TABLE public.barang
  WITH (publish = 'insert, update, delete, truncate');

-- Publication 2: supabase_realtime_messages_publication (milik supabase_admin)
--   Tabel terdaftar: realtime.messages
--   Internal Supabase Realtime; tidak relevan untuk DDL homelab aplikasi.
--   TIDAK perlu dibuat ulang di homelab.

-- Replica identity per tabel:
--   public.barang          : DEFAULT (pk)
--   public.profiles        : DEFAULT (pk)
--   public.stock_levels    : DEFAULT (pk)
--   public.transaksi       : DEFAULT (pk)
--   public.user_sessions   : DEFAULT (pk)
-- =============================================================================