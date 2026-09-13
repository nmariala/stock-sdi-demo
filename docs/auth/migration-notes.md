# Stock SDI Demo — Autentikasi: Migration Notes

Tabel & trigger baru yang diperlukan untuk autentikasi custom. Jalankan query
di bawah di database `stock_sdi_demo` (role owner `stock_sdi_demo_user`).

Source SQL lengkap ada di `docs/database/migrations/005_auth.sql`.

## Tabel baru

### `user_accounts`

```sql
CREATE TABLE IF NOT EXISTS user_accounts (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  username   TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_accounts_username_lower
  ON user_accounts (LOWER(username));
```

### `sessions`

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  token_hash    CHAR(64) NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  last_seen_at  TIMESTAMPTZ,
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON sessions (user_id);
```

## Format referensi (akun demo)

```sql
INSERT INTO user_accounts (profile_id, username, password_hash, is_active)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin.demo', '$2a$12$<hash>', true),
  ('00000000-0000-0000-0000-000000000002', 'tamu.demo',  '$2a$12$<hash>', true)
ON CONFLICT DO NOTHING;
```

Hash password diisi oleh `scripts/useradmin.js` di server; jangan letakkan
hash di repository ini.

## Rollback (jika perlu)

```sql
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS user_accounts CASCADE;
```

Hapus juga file `.demo-users.json` di server dan `.env` baris auth-related
(`COOKIE_NAME`, `SESSION_TTL_HOURS`, dll) dari `/home/nugie/stock-sdi-api/.env`.

## Catatan

- Kedua tabel memakai `BIGINT GENERATED ALWAYS AS IDENTITY` agar kompatibel
  dengan filter API (`Integer.MAX_SAFE_INTEGER` = 2^53 di JavaScript).
- `ON DELETE CASCADE` di `sessions.user_id` memastikan penghapusan akun otomatis
  menghapus semua sesinya.
- Indeks `token_hash` diperlukan agar lookup sesi O(1) pada login request.
- Tidak ada perubahan ke tabel lama (`barang`, `profiles`, `stock_levels`,
  `transaksi`) — autentikasi murni additive.