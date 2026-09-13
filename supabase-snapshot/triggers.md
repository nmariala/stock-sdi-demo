# Triggers

Sumber: `pg_trigger` (non-internal, `tgenabled='O'`) dengan `pg_get_triggerdef(oid, true)`.

## Trigger aktif di `public`

| Tabel | Trigger | Kapan | Function |
|---|---|---|---|
| `barang` | `trg_barang_seed_saldo` | `AFTER INSERT` FOR EACH ROW | `seed_stock_levels_barang()` |
| `transaksi` | `trg_transaksi_sync_saldo` | `AFTER INSERT` FOR EACH ROW | `sync_saldo_transaksi()` |

### Definisi

```sql
-- barang
CREATE TRIGGER trg_barang_seed_saldo
AFTER INSERT ON barang
FOR EACH ROW
EXECUTE FUNCTION seed_stock_levels_barang();

-- transaksi
CREATE TRIGGER trg_transaksi_sync_saldo
AFTER INSERT ON transaksi
FOR EACH ROW
EXECUTE FUNCTION sync_saldo_transaksi();
```

> Status `tgenabled = 'O'` (enabled/origin).

## Trigger di schema `auth`

| Tabel | Trigger | Kapan | Function |
|---|---|---|---|
| `auth.users` | `on_auth_user_created` | `AFTER INSERT` FOR EACH ROW | `public.handle_new_user()` |

```sql
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION handle_new_user();
```

## Alur bisnis yang dijamin trigger

1. **Barang baru dibuat** → `trg_barang_seed_saldo`:
   - Jika `stok > 0`, sisipkan baris `stock_levels (item_id, 'Puri', 'Good', stok)`, atau UPDATE jumlah bila kombinasi sudah ada (UPSERT via `ON CONFLICT (item_id, warehouse, kriteria)`).
2. **Transaksi masuk/keluar dibuat** → `trg_transaksi_sync_saldo`:
   - Hitung delta (`masuk` = +jumlah, `keluar` = −jumlah).
   - Cek stok cukup untuk `keluar` (jumlah saat ini di `stock_levels` untuk (barang, warehouse, kriteria) >= jumlah) — kalau kurang, `RAISE EXCEPTION ... USING ERRCODE='check_violation'` (frontend membaca error ini).
   - UPSERT `stock_levels` (tambah delta).
   - Update `barang.stok` = SUM semua level barang tsb.

## Catatan

- Tidak ada trigger UPDATE/DELETE. Perubahan stok & saldo hanya terjadi saat **insert transaksi** (jalan satu arah ke `stock_levels` dan `barang.stok`).
- Function `update_stok_barang()` ada di DB tetapi **tidak dipasang sebagai trigger mana pun** (kemungkinan sisa skema lama) — lihat functions.md.