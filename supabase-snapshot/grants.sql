-- =============================================================================
-- Grants / Privileges snapshot — schema public + sequences + functions
-- Project : Stock SDI Demo (rwbplixadhmuytkymwcb)
-- Source  : information_schema.role_table_grants + role_routine_grants +
--           role_usage_grants + aclexplode(nspacl) + pg_auth_members
--           via Management API (read-only)
-- Catatan  : Di Supabase, privilege ALL pada tabel diberikan ke empat role
--            (anon/authenticated/service_role/postgres). Pembatasan DML
--            SEBENARNYA dilakukan oleh RLS policy (lihat rls.sql).
--            Di PostgreSQL homelab, grant yang sama diperlukan agar RLS
--            aktif (RLS hanya memfilter role yang punya SELECT privilege).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Usage pada schema public
-- -----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO PUBLIC;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA public TO postgres;

-- -----------------------------------------------------------------------------
-- Tabel: sembilan privilege (arwdDxtm) — diberikan ke empat role
-- [barang, profiles, stock_levels, transaksi, user_sessions]
-- Unquoted i==internal privilege 'D'='TRUNCATE', 't'='TRIGGER', 'x'='REFERENCES'
-- Asli dari pg: arwdDxtm = INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
-- Format pg_dump-style: GRANT ALL ON TABLE ...
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON public.barang TO anon, authenticated, service_role, postgres;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON public.profiles TO anon, authenticated, service_role, postgres;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON public.stock_levels TO anon, authenticated, service_role, postgres;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON public.transaksi TO anon, authenticated, service_role, postgres;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON public.user_sessions TO anon, authenticated, service_role, postgres;

-- -----------------------------------------------------------------------------
-- Sequences: USAGE (agar role anon/authenticated/service_role dapat mengisi
-- GENERATED IDENTITY columns via implicit nextval)
-- -----------------------------------------------------------------------------
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO postgres;

-- -----------------------------------------------------------------------------
-- Functions: EXECUTE (agar RPC dan trigger function dapat dipanggil)
-- Semua fungsi di public: handle_new_user, riwayat_balance_before,
-- seed_stock_levels_barang, sync_saldo_transaksi, update_stok_barang
-- -----------------------------------------------------------------------------
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO postgres;

-- -----------------------------------------------------------------------------
-- Role membership (pg_auth_members) — untuk referensi migrasi
--   authenticator → memeberikan anon, authenticated, service_role  [platform login role]
--   postgres      → anon, authenticated, authenticator, service_role,
--                    pg_create_subscription, pg_monitor, pg_read_all_data,
--                    pg_signal_backend, supabase_privileged_role
--   cli_login_postgres → postgres  [dipakai supabase CLI]
--   supabase_read_only_user → pg_monitor, pg_read_all_data
--   supabase_etl_admin → pg_monitor, pg_read_all_data, supabase_privileged_role
--   supabase_realtime_admin → anon, authenticated, service_role
--   supabase_storage_admin → authenticator
--
-- Homelab: replikasi role membership ini tidak wajib. Yang penting adalah
-- memastikan role yang dipakai oleh aplikasi (authenticated) punya privilege
-- SELECT/INSERT pada tabel + EXECUTE pada fungsi + USAGE sequence.
-- =============================================================================