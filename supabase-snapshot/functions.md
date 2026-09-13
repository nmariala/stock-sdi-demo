# Functions

Sumber: `pg_proc` (schema `public`) dengan `pg_get_functiondef(p.oid)` dan metadata (`provolatile`, `prosecdef`, `proretset`).

## Daftar

| Function | Tipe | Volatile | SECURITY | Keterangan |
|---|---|---|---|---|
| `handle_new_user()` | trigger, plpgsql | volatile | **DEFINER** | dipanggil trigger `on_auth_user_created` (auth.users) |
| `riwayat_balance_before(bigint, timestamptz, bigint)` | sql | **stable** | invoker | dipanggil frontend via RPC |
| `seed_stock_levels_barang()` | trigger, plpgsql | volatile | invoker | dipanggil `trg_barang_seed_saldo` |
| `sync_saldo_transaksi()` | trigger, plpgsql | volatile | invoker | dipanggil `trg_transaksi_sync_saldo` |
| `update_stok_barang()` | trigger, plpgsql | volatile | invoker | **tidak terpasang as trigger mana pun** (dead code di DB) |

## 1. `handle_new_user()`

Dipanggil saat user auth dibuat di `auth.users`. Membuat baris `public.profiles` otomatis.

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.profiles (id, nama, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nama', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'role', 'staff')
  );
  return new;
end;
$function$
```

> `SECURITY DEFINER` + `SET search_path TO ''` — aman (tidak ada relasi yang bisa disalahgunakan via `search_path`). Default role = `staff`.

## 2. `riwayat_balance_before(p_barang_id bigint, p_created_at timestamptz, p_id bigint)`

Menghitung saldo sebuah barang **sebelum** sebuah transaksi (berdasarkan urutan `(created_at, id)`). Dipanggil sebagai RPC untuk kolom "sebelum" pada export riwayat.

```sql
CREATE OR REPLACE FUNCTION public.riwayat_balance_before(p_barang_id bigint, p_created_at timestamp with time zone, p_id bigint)
 RETURNS numeric
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COALESCE(
    SUM(
      CASE
        WHEN t.jenis = 'masuk' THEN t.jumlah
        WHEN t.jenis = 'keluar' THEN -t.jumlah
        ELSE 0
      END
    ),
    0
  )::numeric
  FROM public.transaksi t
  WHERE t.barang_id = p_barang_id
    AND (
      t.created_at < p_created_at
      OR (
        t.created_at = p_created_at
        AND t.id < p_id
      )
    );
$function$
```

> STABLE (membaca konsisten per statement). Sasaran index `transaksi_created_at_id_idx` & `transaksi_barang_created_id_idx`.

## 3. `seed_stock_levels_barang()`

Trigger AFTER INSERT `barang`: seeding saldo awal (Puri/Good) bila `stok` awal > 0.

```sql
CREATE OR REPLACE FUNCTION public.seed_stock_levels_barang()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF COALESCE(new.stok, 0) <> 0 THEN
    INSERT INTO stock_levels (item_id, warehouse, kriteria, jumlah)
    VALUES (new.id, 'Puri', 'Good', new.stok)
    ON CONFLICT (item_id, warehouse, kriteria)
    DO UPDATE SET jumlah = excluded.jumlah, updated_at = now();
  END IF;
  RETURN new;
END;
$function$
```

## 4. `sync_saldo_transaksi()`

Trigger AFTER INSERT `transaksi`: mutasi persediaan + cek saldo cukup.

```sql
CREATE OR REPLACE FUNCTION public.sync_saldo_transaksi()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  cur numeric;
  delta numeric;
BEGIN
  IF new.jenis = 'masuk' THEN
    delta := new.jumlah;
  ELSE
    delta := -new.jumlah;
  END IF;

  -- Cegah stok warehouse+kriteria jadi negatif
  SELECT COALESCE(SUM(jumlah), 0) INTO cur
  FROM stock_levels
  WHERE item_id = new.barang_id AND warehouse = new.warehouse AND kriteria = new.kriteria;
  IF new.jenis = 'keluar' AND cur < new.jumlah THEN
    RAISE EXCEPTION 'Stok tidak mencukupi untuk % di % (%)', new.barang_id, new.warehouse, new.kriteria
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO stock_levels (item_id, warehouse, kriteria, jumlah)
  VALUES (new.barang_id, new.warehouse, new.kriteria, delta)
  ON CONFLICT (item_id, warehouse, kriteria)
  DO UPDATE SET jumlah = stock_levels.jumlah + delta, updated_at = now();

  -- Sinkron total di tabel barang
  UPDATE barang SET stok = COALESCE((SELECT SUM(jumlah) FROM stock_levels WHERE item_id = new.barang_id), 0)
  WHERE id = new.barang_id;

  RETURN new;
END;
$function$
```

## 5. `update_stok_barang()` — TIDAK terpasang (dead code)

```sql
CREATE OR REPLACE FUNCTION public.update_stok_barang()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
  begin
    if new.jenis = 'masuk' then
      update barang set stok = stok + new.jumlah, updated_at = now() where id = new.barang_id;
    else
      update barang set stok = stok - new.jumlah, updated_at = now() where id = new.barang_id;
    end if;
    return new;
  end;
$function$
```

> Tidak ada trigger yang menunjuk function ini (duplikat fungsi lama dari `sync_saldo_transaksi`). Keputusan migrasi: buang atau jaga untuk kompatibilitas. Catatan bug potensial: tidak mengoperasikan `stock_levels`, sehingga bila dipakai akan inkonsisten dengan saldo per-gudang/kriteria.