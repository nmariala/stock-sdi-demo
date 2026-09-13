# Stock SDI Demo — Autentikasi: Keamanan

Evaluasi & keputusan keamanan untuk autentikasi custom demo. Skala: **demo
internal**; bukan baseline produksi publik.

## Ringkasan kontrol yang diterapkan

| Area              | Keputusan                                                        |
|-------------------|------------------------------------------------------------------|
| Password storage  | `bcryptjs` cost 12; tidak pernah plaintext di DB/log/git. |
| Token sesi        | 32 byte acak (`crypto.randomBytes`) base64url; DB hanya simpan hash sha256. |
| Cookie            | `HttpOnly`, `SameSite=Lax`, `Path=/`; `Secure=false` hanya karena loopback dev. |
| Timing attack     | Perbandingan hash waktu-konstan; dummy hash saat user tak ada.   |
| User enumeration  | Error login seragam ("kredensial tidak valid") tanpa membedakan username tidak dikenal vs password salah. |
| Brute force       | Rate limit: 5 gagal / (IP+user) 15 mnt; 100 gagal / IP 15 mnt → 429 `RATE_LIMITED`. |
| SQL injection     | Semua query parameterized (`pg` placeholders), termasuk lookup sesi & akun. |
| Otorisasi         | Middleware `requireAuth` (401) + `requireRole` (403) di route tulis; guest = read-only. |
| CORS              | Whitelist `API_CORS_ORIGIN` (comma-separated); `credentials:true` hanya origin terpercaya. |
| Error leak        | Error handler tidak pernah mengembalikan SQL/bukan-trace; kode `DATABASE_ERROR` generik. |
| Sesi kadaluarsa   | `expires_at` di DB; cleanup oportunistik; logout menghapus baris sesi. |
| Secret handling   | `.env`, `.demo-users.json` di-gitignore; password akun demo tidak pernah muncul di repo/log/docs. |

## Batasan yang disadari (demo)

- **Rate limiter in-memory** → ter-reset saat proses restart; multi-instance
  butuh store bersama. Cukup untuk demo single-instance loopback.
- **Belum ada refresh token / sliding expiration**; sesi mati tepat 8 jam.
- **Cookie `Secure=false`** → hanya boleh pada loopback/HTTP dev. Begitu
  di-depan reverse-proxy HTTPS/TLS, set `COOKIE_SECURE=true`.
- **CSRF**: SameSite=Lax + metode POST ber-content-type JSON memblokir sebagian
  besar serangan lintas-situs; untuk produksi tambahkan token CSRF/Origin check.
- **`/api/auth/me` tidak pernah mengekspos hash/token apa pun** — hanya
  `{id, username, name, role, expires_at}`.
- Data bisnis (`barang`, `stock_levels`, `transaksi`) masih ditulis langsung ke
  Supabase dari komponen frontend baca (data layer) — ini di luar lingkup auth;
  lihat `docs/api/migration-map.md` untuk rencana migrasi penuh ke REST.
- TLS antar browser–API belum dipasang (loopback dev); produksi wajib HTTPS.

## Pengelolaan kredensial demo

- Dibuat via `node scripts/useradmin.js create <username> staff --password-file X`
  di server.
- Tersimpan di `/home/nugie/stock-sdi-api/.demo-users.json`, chmod **600**,
  di luar repo (`api/.demo-users.json` masuk `.gitignore`).
- Reset: `sudo pkill`? Tidak — gunakan `node scripts/useradmin.js set-password ...`.
- Prinsip: **tidak pernah** mencetak/commit password; verifikasi hash hanya lewat
  smoke test (perbandingan otomatis, bukan print).

## Checklist sebelum produksi

- [ ] HTTPS + `COOKIE_SECURE=true`.
- [ ] Reverse-proxy (Nginx/Caddy) di depan 3101; 3101 tetap loopback.
- [ ] MTLS/unauth API hanya via authn proxy (jika publik).
- [ ] Rate limiter ke store bersama bila >1 instance.
- [ ] CSRF token / SameSite=Strict bila tidak butuh login lintas-site.
- [ ] Audit log login (keberhasilan & kegagalan, ip, user-agent).
- [ ] Tinggalkan Supabase Auth: hapus `supabase.auth.*` di seluruh codebase.
- [ ] Migrasi full data layer ke REST (hapus akses DB langsung dari frontend).