# Auth & Profiles

Integrasi Auth Supabase (`auth` schema) dengan app schema (`public`).

## Model data

- `auth.users` (owner `supabase_auth_admin`) berisi akun email/password.
- `public.profiles` (owner `postgres`) berisi `id` (= `auth.users.id`), `nama`, `role` (`staff`|`guest`, default `staff`).
- `public.transaksi.user_id` default `auth.uid()` → otomatis menunjuk user yang login saat INSERT (nullable).
- `public.user_sessions` (PK `user_id` → `auth.users`) — sisa/jejak, tidak dipakai frontend.

## Trigger auth → profiles

**`auth.users` AFTER INSERT → `public.handle_new_user()`** (SECURITY DEFINER, `search_path=''`) membuat baris `profiles` otomatis saat user auth dibuat:

- `id` = `new.id`
- `nama` = `raw_user_meta_data.nama`, fallback `email`-prefix (bagian sebelum `@`)
- `role` = `raw_user_meta_data.role`, fallback `'staff'`

## Foreign keys ke `auth.users`

| Kunci | Keterangan |
|---|---|
| `profiles.id → auth.users.id` | `ON DELETE CASCADE` — hapus user → hapus profil |
| `transaksi.user_id → auth.users.id` | no cascade — riwayat tetap |
| `user_sessions.user_id → auth.users.id` | `ON DELETE CASCADE` |

## Penggunaan auth di frontend (src/lib/auth.tsx)

- Client: `createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)`.
- `getSession()` saat init, `onAuthStateChange` subscribe perubahan sesi.
- `signInWithPassword({ email, password })` — satu-satunya metode login (role-based, lihat cara sign in di aplikasi nyata; pada demo ini default role `staff` via trigger).
- `signOut()`.
- Ambil profil: `profiles.select('*').eq('id', user.id).single()` — dengan timeout 10s.

## Penanganan error login (frontend)

- 429 / rate-limit → pesan "terlalu banyak percobaan".
- `email_not_confirmed` → pesan konfirmasi email.
- `invalid_credentials` → "username atau password salah".
- timeout buatan 15s → "waktu login habis".

## Daftar role (pg_roles) relevan

Dari `pg_roles` (yang relevan untuk aplikasi; `postgres`, `anon`, `authenticated`, `authenticator`, `service_role` di antaranya yang penting):

- `anon` (no login) — dipakai request tanpa JWT; **0 baris** karena tidak ada policy.
- `authenticated` (no login) — dipakai melalui JWT sesi; semua policy.
- `service_role` (no login) — bypass RLS; untuk admin/backend (tidak dipakai frontend browser).
- `authenticator` (login) — role pintu masuk PostgREST internal Supabase.

## Catatan untuk migrasi ke Homelab

1. **Auth tidak datang gratis** — `auth.users`, trigger `on_auth_user_created`, kolom `auth.uid()`, dan JWT validation PostgREST adalah layanan Supabase. Di Homelab perlu: emulasi schema `auth` + validator JWT (mis. lewat PostgREST config dengan custom claims, atau auth server sendiri seperti GoTrue/Supabase self-hosted, Keycloak, dll).
2. Default role `staff` pada `handle_new_user` membuat **semua user terdaftar langsung staff**. Di konfigurasi production mungkin diset via `raw_user_meta_data`; perlu diputuskan mekanisme pemberian role staff di target.
3. `user_sessions` perlu diputuskan kelanjutannya.
4. `transaksi.user_id` nullable + default `auth.uid()`: pada data lama (sebelum ini) bisa NULL; pastikan migrasi mempertahankan default yang sama.