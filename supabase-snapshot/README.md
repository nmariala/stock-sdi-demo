# Snapshot Basis Data Supabase — Stock SDI Demo

Dokumen snapshot **read-only** dari project Supabase **stock-sdi** (`rwbplixadhmuytkymwcb`, region ap-northeast-1 / Tokyo) untuk keperluan **perencanaan migrasi ke PostgreSQL Homelab**.

> **Status:** Draf sementara oleh agen. **BELUM di-review user, BELUM di-commit, BELUM di-push.**
> Semua akses read-only; tidak ada perubahan pada production database.
> **Tidak ada full production data dump.** Credential (token, password, key) TIDAK disimpan di folder ini.

## Cara pembuatan

### Tahap 1 — Snapshot audit metadata (file `.md`)
- Introspection dilakukan via **Management API** (`POST https://api.supabase.com/v1/projects/<ref>/database/query`) dengan access token CLI supabase milik user (diambil dari Windows Credential Manager dengan `CredRead`, tidak pernah dicetak/ditulis ke file repo).
- Semua query berupa **SELECT** murni terhadap catalog `pg_catalog` / `information_schema` — tidak ada INSERT/UPDATE/ALTER/DROP.
- Sebagian verifikasi kolom & FK tambahan berasal dari probe read-only PostgREST memakai anon key pada sesi audit sebelumnya.

### Tahap 2 — Full DDL / schema snapshot (file `.sql` + `ddl-notes.md`)
- DDL direkonstruksi dari system catalog via **Management API SQL endpoint** (read-only): `pg_get_constraintdef`, `pg_get_indexdef`, `pg_get_functiondef`, `pg_get_triggerdef`, `pg_policies`, `pg_sequence`, `pg_default_acl`, `information_schema`.
- **`supabase db dump --remote` TIDAK dapat dijalankan** karena membutuhkan Docker Desktop (tidak terpasang di mesin ini); sesuai aturan read-only, tidak ada workaround yang dipaksakan. Detail selengkapnya di [ddl-notes.md](ddl-notes.md).

## Peringatan

- **Bukan** hasil `supabase db dump`. DDL tabel disusun ulang dari catalog (type/nullable/default/identity + constraint dari `pg_get_constraintdef`) — akurat namun urutan pemicu/migrasi asli (migration history, owner, comment) tidak terjaga.
- Nomor baris/kode SQL secara harfiah sudah direkam (trigger/function/RLS) via `pg_get_triggerdef` / `pg_get_functiondef` / `pg_get_expr`.

## Isi dokumen

### Dokumentasi audit (Tahap 1)

| File | Isi |
|---|---|
| [schema.md](schema.md) | Skema 5 tabel `public`, semua kolom, tipe, default, identity |
| [relationships.md](relationships.md) | Relasi foreign key antar tabel (termasuk `auth.users`) |
| [constraints-and-indexes.md](constraints-and-indexes.md) | PK/FK/UNIQUE/CHECK + semua index + sequence |
| [triggers.md](triggers.md) | Daftar trigger aktif + definisi & alurnya |
| [functions.md](functions.md) | `riwayat_balance_before`, `sync_saldo_transaksi`, `seed_stock_levels_barang`, `handle_new_user`, `update_stok_barang` |
| [rls-policies.md](rls-policies.md) | Policy Row Level Security per tabel + grant ACL |
| [auth-and-profiles.md](auth-and-profiles.md) | Integrasi `auth.users` ↔ `public.profiles`/`transaksi`/`user_sessions`, trigger `on_auth_user_created` |
| [realtime.md](realtime.md) | Publication `supabase_realtime` + channel yang dipakai frontend |
| [data-model.md](data-model.md) | Jumlah data, contoh sample (sanitized, maks 5 baris) |
| [frontend-dependencies.md](frontend-dependencies.md) | Peta dependency frontend terhadap object DB |

### DDL snapshot (Tahap 2)

| File | Isi |
|---|---|
| [schema.sql](schema.sql) | `CREATE TABLE` 5 tabel public (lengkap: kolom, tipe, nullable, default, identity, PK, FK, CHECK, UNIQUE) + info sequence |
| [indexes.sql](indexes.sql) | `CREATE INDEX`/`CREATE UNIQUE INDEX` (termasuk partial unique `client_tx_id`, composite index ordering) |
| [triggers.sql](triggers.sql) | `CREATE TRIGGER` lengkap (3 aktif) |
| [functions.sql](functions.sql) | `CREATE OR REPLACE FUNCTION` lengkap (body + security definer + search_path) |
| [rls.sql](rls.sql) | `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` (11 policy) |
| [realtime.sql](realtime.sql) | Publication `supabase_realtime` (hanya `public.barang`) + replica identity |
| [grants.sql](grants.sql) | GRANT schema/table/sequence/function + role membership |
| [extensions.sql](extensions.sql) | Extension PostgreSQL aktif (plpgsql, uuid-ossp, pgcrypto) |
| [ddl-notes.md](ddl-notes.md) | Metode, yang berhasil/tidak diperoleh, error, Supabase-specific dependencies, rekomendasi homelab |

## Ringkasan object yang ditemukan

- **Tabel `public` (4 dipakai aplikasi + 1 tersisa):**
  - `barang` (19 baris) — master barang & stok total
  - `stock_levels` (26 baris) — saldo per (barang, gudang, kriteria)
  - `transaksi` (40 baris) — riwayat masuk/keluar
  - `profiles` (6 baris) — profil user (auth)
  - `user_sessions` — **tidak dipakai frontend**, tersisa (migrasi bisa diabaikan/buang)
- **Function:** `riwayat_balance_before`, `sync_saldo_transaksi`, `seed_stock_levels_barang`, `handle_new_user`, `update_stok_barang` (yang terakhir tampak orpan — tidak dipasang trigger).
- **Trigger aktif:** `trg_barang_seed_saldo` (AFTER INSERT `barang`), `trg_transaksi_sync_saldo` (AFTER INSERT `transaksi`), `on_auth_user_created` (AFTER INSERT `auth.users`).
- **RLS:** aktif di semua 5 tabel `public`; policy hanya diberikan ke role `authenticated` (staff untuk tulis, semua authenticated untuk baca). Role `anon` tidak punya policy → akses anon = 0 baris (sesuai probe REST).
- **Realtime:** publication `supabase_realtime` berisi **hanya tabel `barang`**. Channel frontend `stok-realtime` & `riwayat-realtime` juga subscribe `stock_levels` & `transaksi` — perhatikan: kedua tabel tsb **tidak** aktif di publication PostgreSQL (event realtime untuk keduanya tidak akan dikirim oleh Supabase secara native, karena hanya `barang` yang dipublish). Ini risiko konsistensi antar browser (lihat [realtime.md](realtime.md)).
- **Sequence/identity:** `barang.id` & `transaksi.id` = `GENERATED ALWAYS AS IDENTITY`; `stock_levels.id` = `GENERATED BY DEFAULT AS IDENTITY`. Nilai terakhir saat snapshot: barang=36, stock_levels=63, transaksi=58.
- **Server:** PostgreSQL **17.6**, database `postgres`, encoding UTF8, collate `en_US.UTF-8`, TimeZone UTC.

## Hal yang belum terverifikasi / butuh perhatian saat migrasi

1. Urutan & format persis DDL **asli** (migration history, owner, comment, pipeline dashboard) — untuk presisi penuh jalankan `supabase db dump --remote` di mesin dengan Docker.
2. Konfigurasi level project (Auth providers, rate limit, SMTP template) — di luar scope DB.
3. `user_sessions` — perlu diputuskan: buang atau pertahankan dalam schema migrasi.
4. Function `update_stok_barang` tidak terpasang sebagai trigger mana pun (dead code di DB) — verifikasi kembali sebelum membawa ke target.
5. Metadata publikasi `supabase_realtime`-per-tabel (Postgres replication slot/Publication) tidak menampilkan `stock_levels`/`transaksi` — perlu diputuskan apakah fitur realtime memang dikehendaki di target Homelab (dan bagaimana implementasinya — mis. LISTEN/NOTIFY, pg_notify + trigger, atau polling).
6. Bagian yang bergantung pada **Supabase Auth** (`auth.users`, `auth.uid()`, trigger `on_auth_user_created`, role `authenticated`/`anon`/`service_role`) TIDAK boleh dicopy mentah — lihat [ddl-notes.md](ddl-notes.md#supabase-specific-dependencies-harus-direplikasidisesuaikan-di-homelab).