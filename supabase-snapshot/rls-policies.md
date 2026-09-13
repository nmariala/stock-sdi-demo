# RLS Policies

Sumber: `pg_policy` (di-join `pg_class`, `pg_namespace`) dengan `pg_get_expr(polqual/polwithcheck, polrelid)`, plus `relacl` dari `pg_class`.

## Status umum

- Semua 5 tabel `public` memiliki **RLS ENABLED** (`relrowsecurity=true`) dan `relforcerowsecurity=false`.
- Grant level objek (ACL tabel, dari `relacl`): `postgres`, `anon`, `authenticated`, `service_role` semuanya mendapat **`arwdDxtm`** (ALL privileges) pada seluruh tabel. Artinya pembatasan **sepenuhnya** dilakukan RLS policy, bukan grant.
- Role yang diberi policy: hanya **`authenticated`**. Tidak ada policy untuk `anon`, dan tidak ada `FORCE ROW LEVEL SECURITY`, jadi `anon` melihat **0 baris** (dan penulisan diblokir) — cocok dengan hasil probe REST (semua `count=0`).
- Role `service_role` tidak terpengaruh RLS (bypass) — hanya untuk admin/backend.

## Policy per tabel

### `public.barang`

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `barang_select_authenticated` | SELECT | authenticated | `true` | — |
| `barang_insert_staff` | INSERT | authenticated | — | `EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'staff')` |
| `barang_update_staff` | UPDATE | authenticated | `EXISTS (... role = 'staff')` | — |
| `barang_delete_staff` | DELETE | authenticated | `EXISTS (... role = 'staff')` | — |

### `public.profiles`

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `profiles_select_authenticated` | SELECT | authenticated | `true` | — |

> Tidak ada policy INSERT/UPDATE/DELETE untuk `profiles`. Insert dilakukan via `handle_new_user()` (SECURITY DEFINER, jadi di luar RLS). Frontend tidak menulis `profiles` — hanya baca (map user_id → nama).

### `public.stock_levels`

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `stock_levels_select_authenticated` | SELECT | authenticated | `true` | — |
| `stock_levels_insert_staff` | INSERT | authenticated | — | `EXISTS (... role = 'staff')` |
| `stock_levels_update_staff` | UPDATE | authenticated | `EXISTS (... role = 'staff')` | — |

> Tidak ada policy DELETE → penghapusan baris level tidak mungkin dilakukan client (hanya via CASCADE dari hapus `barang`, atau service_role/postgres). Aplikasi tidak menghapus `stock_levels` langsung.

### `public.transaksi`

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `transaksi_select_authenticated` | SELECT | authenticated | `true` | — |
| `transaksi_insert_staff` | INSERT | authenticated | — | `EXISTS (... role = 'staff')` |

> Tidak ada policy UPDATE/DELETE untuk `transaksi` → riwayat **immutable** dari sisi client. Sesuai desain aplikasi (tidak ada edit transaksi).

### `public.user_sessions`

| Policy | Command | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `user_sessions_own_row` | ALL (`*`) | authenticated | `auth.uid() = user_id` | `auth.uid() = user_id` |

> Tabel tak dipakai aplikasi; policy tinggal jejak.

## Pola (`EXISTS (SELECT 1 FROM profiles ...)`)

Semua policy tulis (insert/update/delete) mengecek keanggotaan *staff*:

```sql
EXISTS (
  SELECT 1
  FROM profiles
  WHERE profiles.id = auth.uid()
    AND profiles.role = 'staff'
)
```

`auth.uid()` mengacu user yang sedang login; dibandingkan dengan `profiles.id` (sama dengan `auth.users.id`). Role disimpan di `profiles.role` (`staff`/`guest`).

## Matriks akses aplikasi berdasarkan role

| Aksi | anon (tanpa login) | authenticated (guest/tamu) | authenticated (staff) |
|---|---|---|---|
| SELECT `barang`, `stock_levels`, `transaksi`, `profiles` | ✗ (0 baris) | ✓ (semua) | ✓ (semua) |
| INSERT `barang` | ✗ | ✗ | ✓ |
| UPDATE `barang` | ✗ | ✗ | ✓ |
| DELETE `barang` | ✗ | ✗ | ✓ |
| INSERT `stock_levels` | ✗ | ✗ | ✓ (indirect via trigger transaksi) |
| UPDATE `stock_levels` | ✗ | ✗ | ✓ |
| INSERT `transaksi` | ✗ | ✗ | ✓ |
| UPDATE/DELETE `transaksi` | ✗ | ✗ | ✗ (immutable) |
| INSERT/UPDATE `profiles` | ✗ | ✗ | ✗ (via trigger auth hanya) |

> Catatan: role guest (`profiles.role='guest'` / `'tamu'`) **tidak dapat menulis apa pun** — hanya SELECT pada halaman yang diizinkan (lihat frontend-dependencies, `isGuestAllowedPath`).