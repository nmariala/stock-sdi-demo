# Realtime

Supabase realtime menyiarkan perubahan baris via **PostgreSQL logical replication publication** (`supabase_realtime`) + WebSocket. Dokumen ini membandingkan apa yang **dipublish DB** dengan apa yang **disubscribe frontend**.

## Publication (dari `pg_publication` + `pg_publication_tables`)

Publication relevan untuk aplikasi: **`supabase_realtime`**

| Property | Nilai |
|---|---|
| `pubname` | `supabase_realtime` |
| `puballtables` | `false` (tabel dipilih eksplisit) |
| `pubinsert` / `pubupdate` / `pubdelete` / `pubtruncate` | `true` / `true` / `true` / `true` |

**Tabel yang terdaftar di `supabase_realtime`:**

| schemaname | tablename |
|---|---|
| `public` | `barang` |

> Publication kedua `supabase_realtime_messages_publication` bersifat internal message queue realtime (partisi `realtime.messages_2026_*`), bukan untuk aplikasi.

## Yang disubscribe frontend

1. **`src/app/page.tsx`** — channel **`stok-realtime`**:
   ```ts
   supabase.channel('stok-realtime')
     .on('postgres_changes', { event: '*', schema: 'public', table: 'barang' }, ...)
     .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_levels' }, ...)
   ```
2. **`src/app/riwayat/page.tsx`** — channel **`riwayat-realtime`**:
   ```ts
   supabase.channel('riwayat-realtime')
     .on('postgres_changes', { event: '*', schema: 'public', table: 'transaksi' }, ...)
   ```

## Analisis / risiko

- Publication `supabase_realtime` **hanya berisi `barang`**. Secara native, event perubahan untuk `stock_levels` dan `transaksi` **tidak akan dikirim** oleh Supabase realtime kecuali tabel-tabel tsb ditambahkan ke publication (dari dashboard/console, bukan via SQL biasa).
- Dampak praktis:
  - Insert `barang` baru → event `barang` → halaman stok auto-refresh. ✓
  - Insert `transaksi` → **tidak** menyebabkan event `transaksi`; namun karena trigger `sync_saldo_transaksi` juga mengupdate `barang.stok` (via `UPDATE barang`), browser yang subscribe `stok-realtime` akan menerima event `barang` dan me-refresh tabel stok. ✓ (efek samping menguntungkan)
  - Perubahan `stock_levels` langsung (manual/test/service) → tanpa event, kecuali lewat path di atas.
  - Halaman riwayat memakai `riwayat-realtime` pada `transaksi`, namun publication tidak mengandung `transaksi` → **auto-refresh riwayat antar-browser kemungkinan tidak aktif**, kecuali di sisi lain publikasi dikonfigurasi via dashboard. Perlu verifikasi langsung dengan dua browser, atau tambahkan `transaksi` ke publication.
- Data konsistensi aplikasi tetap aman karena setiap aksi client memanggil ulang query (banyak halaman `load()` setelah aksi).

## Rekomendasi saat migrasi ke Homelab

- Tentukan strategi realtime target: reuse pola PostgreSQL LISTEN/NOTIFY + trigger + WebSocket (mis. via backend kecil), atau polling periodik, atau Supabase self-hosted (GoTrue + Realtime + PostgREST).
- Putuskan tabel mana yang perlu kena realtime: minimal `barang`; bila ingin halaman riwayat auto-refresh, sertakan `transaksi`.
- Catat bahwa konfigurasi publication `supabase_realtime` di sumber hanya berisi `barang` — jangan berasumsi `stock_levels`/`transaksi` pernah disiarkan.