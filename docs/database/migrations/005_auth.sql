-- =============================================================================
-- Stock SDI Demo — PostgreSQL Homelab — migration 005 authentication
-- 1) user_accounts : akun login custom (username + password_hash).
--    Role TIDAK ada di tabel baru; selalu diambil dari profiles.role
--    (staff | guest). Acceptable values diverifikasi oleh script useradmin.
-- 2) sessions      : sesi HttpOnly-cookie-based. Hanya HASH sha256 dari token
--    yang disimpan (token mentah hanya hidup di cookie browser/permintaan).
--    Tanpa raw token di database.
--
-- Dijalankan sebagai role aplikasi: stock_sdi_demo_user (owner DB/skema).
--   psql -h 127.0.0.1 -U stock_sdi_demo_user -d stock_sdi_demo \
--        -v ON_ERROR_STOP=1 -f 005_auth.sql
-- Guard: bila tabel sudah ada -> RAISE EXCEPTION -> abort.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_accounts'
  ) THEN
    RAISE EXCEPTION 'table user_accounts already exists; aborting migration 005';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sessions'
  ) THEN
    RAISE EXCEPTION 'table sessions already exists; aborting migration 005';
  END IF;
END
$$;

BEGIN;

-- -----------------------------------------------------------------------------
-- user_accounts
-- -----------------------------------------------------------------------------
CREATE TABLE public.user_accounts (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    profile_id uuid NOT NULL UNIQUE
        REFERENCES public.profiles (id) ON DELETE CASCADE,
    username text NOT NULL,
    password_hash text NOT NULL CHECK (password_hash LIKE '$2%'),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    last_login_at timestamptz
);

-- Unique case-insensitive: 'Admin.Demo' dan 'admin.demo' dianggap sama.
CREATE UNIQUE INDEX user_accounts_username_lower_key
    ON public.user_accounts (lower(username));

-- -----------------------------------------------------------------------------
-- sessions
-- -----------------------------------------------------------------------------
CREATE TABLE public.sessions (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id bigint NOT NULL
        REFERENCES public.user_accounts (id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz,
    ip_address inet,
    user_agent text
);

CREATE INDEX sessions_user_id_idx ON public.sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON public.sessions (expires_at);

COMMIT;
-- =============================================================================