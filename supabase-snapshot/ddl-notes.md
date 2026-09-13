# DDL Notes — Full Schema Snapshot

## Metode yang digunakan

1. **Tidak ada `supabase db dump --remote`.** Command CLI dijalankan dengan
   `npx supabase db dump --project-ref rwbplixadhmuytkymwcb --schema public --dry-run`
   berhasil *menampilkan* script pg_dump (menandakan CLI + token + login role
   `cli_login_postgres` tersedia), tetapi eksekusi dump **gagal** karena CLI
   mengeksekusi pg_dump di dalam container Docker dan Docker Desktop tidak
   terpasang di mesin ini:
   ```
   docker: command not found (podman also not found) ...
   ```
   Sesuai aturan read-only, tidak dilakukan workaround apa pun; pengguna tidak
   perlu menginstal Docker untuk tahap ini.

2. **Rekonstruksi DDL dari system catalog melalui Management API SQL endpoint
   (read-only).** Menggunakan query `SELECT` terhadap `pg_catalog`,
   `information_schema`, `pg_policies`, `pg_publication`, dll. Semua query
   adalah read-only terhadap `postgres`; tidak ada `CREATE`/`ALTER`/`DROP`/
   `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` yang dijalankan.

3. Definisi DDL yang di-capture:
   - `pg_get_constraintdef(oid, true)` — constraint PK/FK/UNIQUE/CHECK
   - `pg_get_indexdef(indexrelid)` — index lengkap (termasuk partial predicate)
   - `pg_get_triggerdef(oid, true)` — trigger lengkap
   - `pg_get_functiondef(oid)` — body function lengkap
   - `pg_policies` — policy RLS (USING / WITH CHECK / role / command)
   - `pg_sequence` / `pg_sequences` — konfigurasi identity/sequence
   - `pg_default_acl` + `information_schema` — grants

   Kode sumber fungsi **sama persis** dengan yang tersimpan di database. DDL
   tabel (CREATE TABLE) disusun ulang dari catalog (format_type + attnotnull +
   pg_attrdef + attidentity) dan **bukan** hasil tebakan; namun karena tidak
   melalui pg_dump, urutan/opsi seperti `COMMENT`, `OWNER TO`, atau setelan
   kolateral/tabel IS NOT NULL tambahan perlu diverifikasi saat migrasi aktual.

## Hasil

### Berhasil diperoleh (lengkap dan akurat)
- 5 tabel public lengkap + seluruh konstrain (PK, FK dengan ON DELETE, CHECK,
  UNIQUE) → `schema.sql`
- Seluruh index (termasuk 3 index "custom": `idx_stock_levels_item`,
  `transaksi_created_at_id_idx`, `transaksi_barang_created_id_idx`,
  partial unique `transaksi_client_tx_id_key`) → `indexes.sql`
- Sequence/identity untuk 3 tabel (start 1, increment 1, min 1, max
  9223372036854775807, cycle off, bigint) + last_value saat snapshot
  (barang 36, stock_levels 63, transaksi 58) → `schema.sql` (komentar)
- 3 trigger aktif + definisi lengkap (via `pg_get_triggerdef`) → `triggers.sql`
- 5 fungsi lengkap termasuk body, volatility, security definer, search_path,
  argument, return type → `functions.sql` (termasuk tanda `update_stok_barang`
  = DEAD CODE)
- RLS: 5 tabel enabled, 11 policy lengkap (USING / WITH CHECK / role / cmd) → `rls.sql`
- Realtime: 2 publication + tabel terdaftar → `realtime.sql`
- Grants: schema USAGE, tabel privilege, sequence USAGE, function EXECUTE,
  role membership → `grants.sql`
- Extensions: 5 extension (plpgsql, uuid-ossp, pgcrypto aktif; pg_stat_statements,
  supabase_vault milik Supabase) → `extensions.sql`

### Tidak bisa diperoleh (read-only limitation)
- **COLLATION per-kolom detail**: tidak ada kolom yang memakai collation
  non-default (query `a.attcollation <> t.typcollation` hanya mengembalikan
  NULL), jadi semua kolom memakai collation default database
  (`en_US.UTF-8`).
- **Urutan pipeline migrasi default Supabase** (mis. apakah tabel dibuat
  melalui Supabase migration/Dashboard) — tidak diketahui; ini memengaruhi
  presisi DDL di migration tooling homelab.
- Rekonstruksi DDL tabel via `db dump` dibatalkan karena Docker tidak
  tersedia; jika ingin output 100% pg_dump, jalankan di mesin dengan Docker:
  ```
  npx supabase db dump --project-ref rwbplixadhmuytkymwcb --schema public -f schema.sql
  ```

## Supabase-specific dependencies (harus direplikasi/disesuaikan di homelab)

Berikut bagian yang **TIDAK boleh langsung dicopy** karena bergantung pada
Supabase Auth:

1. **`auth.users`** — `public.profiles.id` (FK, ON DELETE CASCADE),
   `public.transaksi.user_id` (FK, tanpa cascade), `public.user_sessions.user_id`
   (FK, CASCADE), `auth.uid()` (default pada `transaksi.user_id`).
2. **Trigger `on_auth_user_created`** di schema `auth.users` → memanggil
   `public.handle_new_user()` SECURITY DEFINER. Homelab harus punya mekanisme
   setara (mis. trigger pada tabel users sendiri / aplikasi) yang mengisi
   `profiles` saat user dibuat.
3. **Role `authenticated`, `anon`, `service_role`, `authenticator`** — Supabase
   Auth menggunakan role ini sebagai penjepit (JWT claim `role`). Homelab
   dengan auth-native PostgreSQL perlu memetakan ulang (atau tetap membuat role
   dengan nama sama + RLS policy yang sama).
4. **`handle_new_user`** membaca `new.raw_user_meta_data` dan `new.email` dari
   `auth.users` — kolom itu spesifik Supabase Auth; migrasi harus menyesuaikan
   sumber data role/nama.

### Integrasi yang perlu diperhatikan
- `sync_saldo_transaksi` menggunakan `RAISE ... USING ERRCODE = 'check_violation'`
  untuk menolak transaksi "keluar" yang melebihi saldo; frontend menangkap
  error ini (`'Stok tidak mencukupi'`). Pertahankan perilaku ini di homelab.
- `riwayat_balance_before(...)` dipanggil sebagai RPC dari client browser
  (`.rpc('riwayat_balance_before', ...)`) — harus ada + grant EXECUTE ke
  role pembaca.
- Realtime: frontend subscribe `stok-realtime` (tabel `barang` + `stock_levels`)
  dan `riwayat-realtime` (`transaksi`). Publication saat ini hanya berisi
  `public.barang`. Di homelab, jika ingin Realtime berfungsi untuk
  stock_levels/transaksi, perlu ada publikasi setara (pengaturan dashboard
  Supabase saat ini tidak menampilkan tabel tersebut di publication — perlu
  keputusan).

## Rekomendasi untuk PostgreSQL Homelab
1. Buat schema `public`, roles (`authenticated`, `anon`, `service_role`,
   `postgres` dll.) sesuai pendekatan auth homelab.
2. Eksekusi `schema.sql` (sesuaikan FK ke `auth.users` bila auth homelab
   memakai skema berbeda), lalu `indexes.sql`, `functions.sql`, `triggers.sql`,
   `rls.sql`, `realtime.sql`, `grants.sql`, `extensions.sql`.
3. Pastikan sequence identity `RESTART WITH` di-set bila data dimigrasikan
   (nilai snapshot: barang 36 → 37, stock_levels 63 → 64, transaksi 58 → 59).
4. Selalu validasi dengan `supabase db dump` (dengan Docker) sebelum cutover
   untuk presisi maksimal.

## Keamanan
- Tidak ada credential/secret yang dicetak ke terminal atau disimpan dalam
  bagian snapshot ini (token CLI, password DB, anon/service_role key tidak
  pernah ditulis ke file mana pun di `supabase-snapshot/`).
- Semua akses memakai access token CLI (read-only Management API).