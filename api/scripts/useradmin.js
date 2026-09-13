#!/usr/bin/env node
"use strict";

// -----------------------------------------------------------------------------
// Admin utility untuk user_accounts (auth custom Stock SDI Demo).
//
// Digunakan DI SERVER (bukan untuk frontend). Tidak ada endpoint API untuk
// membuat akun; hanya operator melalui CLI ini.
//
// Password TIDAK pernah dicetak ke stdout secara default. Untuk akun yang
// dibuat / di-rotate, password disimpan ke file kredensial (chmod 600) yang
// path-nya dikonfigurasi via AUTH_CREDENTIALS_FILE (default: ./.demo-users.json
// di direktori API).
//
// Usage:
//   node scripts/useradmin.js create <username> <profile-uuid>
//   node scripts/useradmin.js set-password <username>
//   node scripts/useradmin.js list
//   node scripts/useradmin.js deactivate <username>
//   node scripts/useradmin.js activate <username>
//
// Opsi tambahan:
//   --force     (create: update hash bila username sudah ada)
//         (set-password: abaikan akun nonaktif)
// -----------------------------------------------------------------------------

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { pool } = require("../db");
const { hashPassword } = require("../lib/passwords");

const CREQ_FILE =
  process.env.AUTH_CREDENTIALS_FILE ||
  path.join(__dirname, "..", ".demo-users.json");

function genPassword(len = 20) {
  const charset =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*-_=+";
  const rand = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += charset[rand[i] % charset.length];
  return out;
}

function loadCreds() {
  try {
    if (!fs.existsSync(CREQ_FILE)) return {};
    const raw = fs.readFileSync(CREQ_FILE, "utf8").trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCred(username, password) {
  const creds = loadCreds();
  creds[username] = creds[username] || {};
  creds[username].password = password;
  creds[username].updated_at = new Date().toISOString();
  fs.writeFileSync(CREQ_FILE, JSON.stringify(creds, null, 2));
  try {
    fs.chmodSync(CREQ_FILE, 0o600);
  } catch {
    /* chmod opsional */
  }
}

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

async function getProfile(uuid) {
  const { rows } = await pool.query(
    "SELECT id, nama, role FROM public.profiles WHERE id = $1",
    [uuid]
  );
  return rows[0] || null;
}

async function getAccount(username) {
  const { rows } = await pool.query(
    "SELECT u.*, p.role, p.nama AS profile_nama FROM public.user_accounts u JOIN public.profiles p ON p.id = u.profile_id WHERE lower(u.username) = lower($1) LIMIT 1",
    [username]
  );
  return rows[0] || null;
}

async function create(username, profileUuid, { force = false } = {}) {
  const uname = String(username || "").trim();
  if (!uname) fail("username wajib diisi");
  if (!/^[a-z0-9._-]{3,64}$/i.test(uname)) {
    fail("username hanya huruf/angka/titik/-/_ (3-64 karakter)");
  }

  const profile = await getProfile(profileUuid);
  if (!profile) fail(`profile ${profileUuid} tidak ditemukan`);

  const existing = await getAccount(uname);
  if (existing && !force) fail(`username '${uname}' sudah ada (gunakan --force untuk meng-update password)`);

  const password = genPassword();
  const passwordHash = await hashPassword(password);

  if (existing) {
    await pool.query(
      "UPDATE public.user_accounts SET password_hash = $1, is_active = true, updated_at = now() WHERE id = $2",
      [passwordHash, existing.id]
    );
  } else {
    await pool.query(
      "INSERT INTO public.user_accounts (profile_id, username, password_hash, is_active) VALUES ($1, $2, $3, true)",
      [profile.id, uname, passwordHash]
    );
  }

  saveCred(uname, password);

  console.log(`ok: user '${uname}' terdaftar (role=${profile.role}, profile=${profile.nama})`);
  console.log(`    password disimpan di: ${CREQ_FILE} (chmod 600)`);
  console.log("    DEMO: ganti password dengan: node scripts/useradmin.js set-password <username>");
}

async function setPassword(username) {
  const uname = String(username || "").trim();
  const account = await getAccount(uname);
  if (!account) fail(`username '${uname}' tidak ditemukan`);

  const password = genPassword();
  const passwordHash = await hashPassword(password);
  await pool.query(
    "UPDATE public.user_accounts SET password_hash = $1, updated_at = now() WHERE id = $2",
    [passwordHash, account.id]
  );

  saveCred(uname, password);
  console.log(`ok: password '${uname}' di-update`);
  console.log(`    password disimpan di: ${CREQ_FILE} (chmod 600)`);
}

async function setActive(username, active) {
  const uname = String(username || "").trim();
  const account = await getAccount(uname);
  if (!account) fail(`username '${uname}' tidak ditemukan`);

  await pool.query(
    "UPDATE public.user_accounts SET is_active = $1, updated_at = now() WHERE id = $2",
    [active, account.id]
  );

  // Hapus semua sesi aktif user tsb agar berlaku seketika.
  await pool.query("DELETE FROM public.sessions WHERE user_id = $1", [account.id]);

  console.log(`ok: user '${uname}' ${active ? "diaktifkan" : "dinonaktifkan"}`);
}

async function list() {
  const { rows } = await pool.query(
    `SELECT
        u.id,
        u.username,
        u.is_active,
        u.created_at,
        u.last_login_at,
        p.nama AS profile_nama,
        p.role
       FROM public.user_accounts u
       JOIN public.profiles p ON p.id = u.profile_id
      ORDER BY u.username`
  );

  if (!rows.length) {
    console.log("(belum ada user_accounts)");
    return;
  }

  for (const r of rows) {
    console.log(
      [
        String(r.username).padEnd(20),
        String(r.role).padEnd(6),
        r.is_active ? "active " : "INACTIVE",
        `profile=${r.profile_nama}`,
        r.last_login_at ? `last_login=${new Date(r.last_login_at).toISOString()}` : "",
      ]
        .filter(Boolean)
        .join("  ")
    );
  }
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd) {
    fail("usage: node scripts/useradmin.js <create|set-password|deactivate|activate|list> [...]");
  }

  try {
    switch (cmd) {
      case "create": {
        const force = args.includes("--force");
        const rest = args.filter((a) => a !== "--force");
        const [uname, profileUuid] = rest;
        if (!uname || !profileUuid) fail("create memerlukan <username> <profile-uuid>");
        await create(uname, profileUuid, { force });
        break;
      }
      case "set-password": {
        const [uname] = args;
        if (!uname) fail("set-password memerlukan <username>");
        await setPassword(uname);
        break;
      }
      case "deactivate": {
        const [uname] = args;
        if (!uname) fail("deactivate memerlukan <username>");
        await setActive(uname, false);
        break;
      }
      case "activate": {
        const [uname] = args;
        if (!uname) fail("activate memerlukan <username>");
        await setActive(uname, true);
        break;
      }
      case "list":
        await list();
        break;
      default:
        fail(`perintah tidak dikenal: ${cmd}`);
    }
  } catch (e) {
    fail(e && e.message ? e.message : String(e));
  } finally {
    await pool.end().catch(() => {});
  }
}

main();