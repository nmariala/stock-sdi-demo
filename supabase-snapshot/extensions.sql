-- =============================================================================
-- Extensions snapshot
-- Project : Stock SDI Demo (rwbplixadhmuytkymwcb)
-- Source  : pg_extension via Management API (read-only), PG 17.6
-- Catatan  : Extensions yang berada di skema 'extensions' (Supabase) dan
--            'pg_catalog' (bawaan) ditampilkan. Extensions pada skema
--            'vault', 'realtime' milik Supabase platform; TIDAK perlu
--            dibuat ulang di homelab kecuali menggunakan fitur terkait.
-- =============================================================================

-- PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS plpgsql WITH SCHEMA pg_catalog;    -- PL/pgSQL (bawaan, tipe=language)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;  -- UUID generation functions
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;     -- Cryptographic functions

-- Supabase platform extensions (opsional di homelab)
-- CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
-- CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
-- =============================================================================