-- =============================================================================
-- Index snapshot — public schema
-- Project : Stock SDI Demo (rwbplixadhmuytkymwcb)
-- Source  : pg_get_indexdef via Management API (read-only), PG 17.6
-- Catatan  : index PRIMARY KEY di-generate otomatis dari constraint PK pada
--            CREATE TABLE di schema.sql, sehingga tidak perlu dibuat ulang.
-- =============================================================================

-- Supporting index: stock_levels.item_id (untuk lookup riwayat stok per barang)
CREATE INDEX idx_stock_levels_item ON public.stock_levels USING btree (item_id);

-- Composite ordering index transaksi: urutan lampau = (created_at, id) menurun
CREATE INDEX transaksi_created_at_id_idx ON public.transaksi USING btree (created_at DESC, id DESC);

-- Composite ordering index transaksi per barang: dipakai halaman riwayat
CREATE INDEX transaksi_barang_created_id_idx ON public.transaksi USING btree (barang_id, created_at DESC, id DESC);

-- Partial unique index: idempotensi INSERT transaksi dari client
-- (client_tx_id = uuid sekali pakai; hanya baris dengan client_tx_id NOT NULL
-- yang di-unique-kan). Diberlakukan sebagai index, bukan constraint.
CREATE UNIQUE INDEX transaksi_client_tx_id_key ON public.transaksi USING btree (client_tx_id) WHERE (client_tx_id IS NOT NULL);

-- Index dari primary key (dokumentasi; sudah dibuat lewat constraint PK):
--   barang_pkey              ON public.barang      USING btree (id)
--   profiles_pkey            ON public.profiles    USING btree (id)
--   stock_levels_pkey        ON public.stock_levels USING btree (id)
--   transaksi_pkey           ON public.transaksi   USING btree (id)
--   user_sessions_pkey       ON public.user_sessions USING btree (user_id)
--   stock_levels_item_id_warehouse_kriteria_key  UNIQUE btree
--                              (item_id, warehouse, kriteria)  [dari constraint]

-- Replica identity seluruh tabel public: DEFAULT (replident 'd').
-- =============================================================================