# Relationships (Relasi Antar Tabel)

Sumber: `pg_constraint` (contype='f') via Management API.

## Diagram relasi

```
auth.users
   │
   ├──< public.profiles.id          (ON DELETE CASCADE)
   ├──< public.transaksi.user_id    (tidak ada cascade)
   └──< public.user_sessions.user_id (ON DELETE CASCADE)

public.barang.id
   ├──< public.stock_levels.item_id (ON DELETE CASCADE)
   └──< public.transaksi.barang_id  (tidak ada cascade)
```

## Daftar FK (public → referensi)

| Constraint | Kolom (child) | Referensi | On Delete |
|---|---|---|---|
| `profiles_id_fkey` | `public.profiles.id` | `auth.users(id)` | `CASCADE` |
| `transaksi_user_id_fkey` | `public.transaksi.user_id` | `auth.users(id)` | tidak ada (default `NO ACTION`) |
| `user_sessions_user_id_fkey` | `public.user_sessions.user_id` | `auth.users(id)` | `CASCADE` |
| `stock_levels_item_id_fkey` | `public.stock_levels.item_id` | `public.barang(id)` | `CASCADE` |
| `transaksi_barang_id_fkey` | `public.transaksi.barang_id` | `public.barang(id)` | tidak ada (default `NO ACTION`) |

## Catatan penting

1. **`transaksi.user_id` → `auth.users`** (bukan `public.profiles`). Karena itu embedding PostgREST `transaksi?select=*,profile:profiles(...)` pada probe gagal (400) — tidak ada FK `transaksi.user_id → profiles`. Frontend memetakan nama user lewat fetch `profiles` terpisah (`/riwayat` mengambil `profiles(id,nama)` dan menggabungkan manual).
2. **`barang` ↔ `stock_levels` & `transaksi`** dua arah terbukti work di PostgREST (FK ada), cocok dengan `GUDANG`/`KRITERIA` di konstanta frontend.
3. `profiles` **tidak punya FK balik** ke tabel lain; hanya `auth.users`.
4. `user_sessions` adalah relasi ekstra yang TIDAK dipakai aplikasi (tidak ada referensi di kode frontend). Keputusan migrasi: buang atau pertahankan.
5. Tidak ada relasi `user_sessions.session_token` → tabel lain (kolom uuid bebas).

## Konsekuensi pada aplikasi

- Hapus user di `auth.users` (admin panel) akan otomatis menghapus `profiles` dan `user_sessions` (CASCADE), tapi **transaksi lama tetap tersimpan** (NO ACTION / column nullable `user_id` → NULL kemungkinan tetap, bergantung default). Karena `transaksi.user_id` default `auth.uid()` & nullable, hapus user tidak menghapus riwayat.
- Hapus `barang` akan otomatis menghapus `stock_levels` (CASCADE) tetapi **menolak / membiarkan** bila masih ada `transaksi` mereferensikannya (NO ACTION). Aplikasi (kelola-barang) menolak hapus barang yang masih punya transaksi.