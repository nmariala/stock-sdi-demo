#!/usr/bin/env node
"use strict";

// Smoke test Stock SDI Demo API (dijalankan di sisi server, localhost).
// Penggunaan: node smoke.mjs  [harus dijalankan dari /home/nugie/stock-sdi-api]
//
// Cakupan:
//   - health check & koneksi DB (publik)
//   - AUTHENTICATION + AUTHORIZATION (custom, HttpOnly cookie)
//       . login valid / salah password / username tak dikenal / body tak valid
//       . atribut cookie (HttpOnly, SameSite=Lax, Path=/, Secure console dev)
//       . /api/auth/me (200 valid, 401 tanpa sesi / token tak dikenal / expired)
//       . sesi bertahan antar request; logout mematikan sesi
//       . read endpoints: 401 tanpa sesi
//       . rule guest: read 200, write 403
//       . rule staff: write 201
//       . rate limit login (429 setelah N percobaan gagal)
//       . tidak ada password/hash/token mentah yang bocor di respons
//       . DB down → 500 DATABASE_ERROR tanpa bocor SQL/kredensial
//   - read baseline (barang/stok/transaksi; konsistensi stok vs stock_levels)
//   - filter transaksi (jenis, barang_id, range tanggal) & balance-before
//   - validasi input + error paths (400/404/409, idempotent client_tx_id)
//   - round-trip CRUD barang + transaksi throwaway (cleanup otomatis)
//   - skenario koneksi DB gagal (instance dengan kredensial salah, port 3102)
//   - verifikasi baseline kembali utuh setelah cleanup

import { spawn, execFileSync } from "node:child_process";
import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const BASE = "http://127.0.0.1:3101";
const BASE_BAD = "http://127.0.0.1:3102";
const API_DIR = "/home/nugie/stock-sdi-api";
const COOKIE_NAME = "hl_stock_demo_session";

let pass = 0;
let fail = 0;
const failures = [];

const state = { barangId: null, txIds: [] };
const session = { cookie: null, guestCookie: null };

function ok(cond, label, extra) {
  if (cond) {
    pass++;
    console.log(`  PASS ${label}`);
  } else {
    fail++;
    failures.push(extra === undefined ? label : `${label} :: ${JSON.stringify(extra)}`);
    console.log(`  FAIL ${label}${extra === undefined ? "" : ` :: ${JSON.stringify(extra)}`}`);
  }
}

async function raw(base, path, { method = "GET", body, cookie } = {}) {
  const headers = { "Content-Type": "application/json" };
  let finalCookie = cookie;
  if (finalCookie === undefined) finalCookie = session.cookie;
  if (finalCookie) headers.Cookie = finalCookie;

  const res = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON fallback */
  }
  return { status: res.status, headers: res.headers, data };
}

// Dipakai untuk request yang TIDAK boleh mengirim cookie apa pun.
function anon(path, opts = {}) {
  return raw(BASE, path, { ...opts, cookie: null });
}

// Request default: membawa cookie sesi staff (bila sudah login).
function req(path, opts = {}) {
  return raw(BASE, path, opts);
}

function reqBad(path, opts = {}) {
  return raw(BASE_BAD, path, opts);
}

async function loginAs(username, password, { via = anon } = {}) {
  const r = await via("/api/auth/login", { method: "POST", body: { username, password } });
  let setCookie = null;
  if (r.headers && typeof r.headers.getSetCookie === "function") {
    const arr = r.headers.getSetCookie();
    setCookie = arr && arr.length ? arr[0] : null;
  } else if (r.headers && typeof r.headers.get === "function") {
    setCookie = r.headers.get("set-cookie");
  }
  const m = cookieValue(setCookie);
  return { ...r, setCookie, cookieValue: m };
}

function cookieValue(setCookieHeader) {
  if (!setCookieHeader) return null;
  const part = setCookieHeader.split(";")[0].trim();
  return part.startsWith(COOKIE_NAME + "=") ? part.slice(COOKIE_NAME.length + 1) : null;
}

function psql(sql) {
  return execFileSync(
    "psql",
    ["-h", "127.0.0.1", "-U", "stock_sdi_demo_user", "-d", "stock_sdi_demo", "-tAc", sql],
    { encoding: "utf8" }
  ).trim();
}

function num(s) {
  return s === "" || s === null || s === undefined ? null : Number(s);
}

function sumLevels(levels) {
  let s = 0;
  for (const wh of Object.keys(levels)) {
    for (const kr of Object.keys(levels[wh])) s += Number(levels[wh][kr]);
  }
  return s;
}

async function waitForServer(base, timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      await fetch(base + "/api/health", { signal: AbortSignal.timeout(5000) });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  return false;
}

function cleanup() {
  if (state.barangId !== null) {
    try {
      psql(`DELETE FROM public.transaksi WHERE barang_id = ${state.barangId}`);
      psql(`DELETE FROM public.barang WHERE id = ${state.barangId}`);
      console.log(`  cleanup: throwaway barang id=${state.barangId} dihapus`);
    } catch (e) {
      console.log(`  cleanup warning: ${e.message}`);
    }
    state.barangId = null;
    state.txIds = [];
  }
}

function demoCredentials() {
  const file = process.env.AUTH_CREDENTIALS_FILE || path.join(API_DIR, ".demo-users.json");
  try {
    const creds = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      staff: creds["admin.demo"] ? creds["admin.demo"].password : null,
      guest: creds["tamu.demo"] ? creds["tamu.demo"].password : null,
    };
  } catch (e) {
    return { staff: null, guest: null, error: e.message };
  }
}

// ===========================================================================
// AUTHENTICATION + AUTHORIZATION
// ===========================================================================

async function authSuite() {
  console.log("== authentication & authorization ==");

  const creds = demoCredentials();
  ok(creds.staff && creds.guest, "file kredensial demo .demo-users.json terbaca (staff & guest)", creds.error);

  // --- Login: body tak valid ------------------------------------------------
  const noUser = await anon("/api/auth/login", { method: "POST", body: { password: "x" } });
  ok(noUser.status === 400 && noUser.data.error.code === "VALIDATION_ERROR", "login tanpa username -> 400", noUser.data);

  const noPass = await anon("/api/auth/login", { method: "POST", body: { username: "admin.demo" } });
  ok(noPass.status === 400 && noPass.data.error.code === "VALIDATION_ERROR", "login tanpa password -> 400", noPass.data);

  // --- Login: kredensial salah / pengguna tak dikenal -> pesan generik -----
  const wrongPass = await anon("/api/auth/login", {
    method: "POST",
    body: { username: "admin.demo", password: "salah-password-123" },
  });
  ok(
    wrongPass.status === 401 && wrongPass.data.error.code === "UNAUTHORIZED",
    "password salah -> 401",
    wrongPass.data
  );
  ok(
    wrongPass.data.error.message === "Username atau password salah",
    "pesan gagal login GENERIK (anti-enumerasi)",
    wrongPass.data
  );

  const wrongUser = await anon("/api/auth/login", {
    method: "POST",
    body: { username: "pengguna-tidak-ada", password: "apa-saja" },
  });
  ok(
    wrongUser.status === 401 &&
      wrongUser.data.error.code === "UNAUTHORIZED" &&
      wrongUser.data.error.message === "Username atau password salah",
    "username tak dikenal -> 401 + pesan sama",
    wrongUser.data
  );

  // --- Login staff valid ----------------------------------------------------
  const login = await loginAs("admin.demo", creds.staff);
  ok(login.status === 200, "login staff valid -> 200", login.data);

  ok(
    login.data &&
      login.data.data &&
      login.data.data.user &&
      login.data.data.user.id > 0 &&
      login.data.data.user.username === "admin.demo" &&
      login.data.data.user.name === "Admin Demo" &&
      login.data.data.user.role === "staff",
    "shape user login {id, username, name, role}",
    login.data && login.data.data
  );
  ok(Boolean(login.data.data.expires_at), "respons login berisi expires_at", login.data);

  const rawLoginBody = JSON.stringify(login.data);
  ok(
    !/password|password_hash|"hash"|token/.test(rawLoginBody),
    "respons login TIDAK membocorkan password/hash/token",
    rawLoginBody
  );

  // --- Cookie attributes ----------------------------------------------------
  ok(Boolean(login.setCookie), "login mengirim Set-Cookie", login.setCookie);
  ok(
    String(login.setCookie || "").includes("HttpOnly"),
    "cookie HttpOnly",
    login.setCookie
  );
  ok(
    String(login.setCookie || "").includes("SameSite=Lax"),
    "cookie SameSite=Lax",
    login.setCookie
  );
  ok(
    String(login.setCookie || "").includes("Path=/"),
    "cookie Path=/",
    login.setCookie
  );
  const secureFlag = /;\s*Secure/i.test(String(login.setCookie || ""));
  ok(!secureFlag, "cookie Secure TIDAK diset pada dev loopback (COOKIE_SECURE=false)", login.setCookie);

  const tok = login.cookieValue;
  ok(
    tok && /^[A-Za-z0-9_-]{32,}$/.test(tok),
    "token cookie base64url (raw, random)",
    tok
  );
  const cookieHash = createHash("sha256").update(tok || "").digest("hex");
  const storedHash = psql(
    `SELECT count(*) FROM public.sessions WHERE token_hash = '${cookieHash}'`
  );
  ok(num(storedHash) === 1, "hanya HASH sha256 token yang tersimpan di DB (bukan token mentah)", storedHash);
  const storedRaw = psql(`SELECT count(*) FROM public.sessions WHERE token_hash = '${tok}'`);
  ok(num(storedRaw) === 0, "token mentah TIDAK ada di kolom token_hash", storedRaw);
  session.cookie = `hl_stock_demo_session=${tok}`;

  // --- /api/auth/me ----------------------------------------------------------
  const me = await req("/api/auth/me");
  ok(
    me.status === 200 && me.data.data.authenticated === true && me.data.data.user.role === "staff",
    "GET /api/auth/me (dengan sesi) -> 200",
    me.data
  );
  const meBody = JSON.stringify(me.data);
  ok(!/password|"hash"|token/.test(meBody), "respons /me tidak membocorkan password/hash/token", meBody);

  const me2 = await req("/api/auth/me");
  ok(me2.status === 200 && me2.data.data.user.id === me.data.data.user.id, "sesi bertahan antar request (refresh)", me2.data);

  const meAnon = await anon("/api/auth/me");
  ok(meAnon.status === 401 && meAnon.data.error.code === "UNAUTHORIZED", "GET /api/auth/me tanpa sesi -> 401", meAnon.data);

  // --- Read endpoints tanpa sesi -> 401 -------------------------------------
  const anonBarang = await anon("/api/barang");
  ok(anonBarang.status === 401 && anonBarang.data.error.code === "UNAUTHORIZED", "GET /api/barang tanpa sesi -> 401", anonBarang.data);
  const anonStock = await anon("/api/stock");
  ok(anonStock.status === 401, "GET /api/stock tanpa sesi -> 401", anonStock.data);
  const anonTx = await anon("/api/transaksi");
  ok(anonTx.status === 401, "GET /api/transaksi tanpa sesi -> 401", anonTx.data);

  // --- Token sesi tak dikenal -> 401 ----------------------------------------
  const badCookie = `hl_stock_demo_session=${"A".repeat(43)}`;
  const bad = await req("/api/auth/me", { cookie: badCookie });
  ok(bad.status === 401 && bad.data.error.code === "UNAUTHORIZED", "cookie token tak dikenal -> 401 (/me)", bad.data);
  const badB = await req("/api/barang", { cookie: badCookie });
  ok(badB.status === 401, "cookie token tak dikenal -> 401 (/api/barang)", badB.data);

  // --- Sesi expired -> 401 + baris dihapus ----------------------------------
  const adminId = psql("SELECT id FROM public.user_accounts WHERE username = 'admin.demo'");
  const expiredTok = "x".repeat(43);
  const expiredHash = createHash("sha256").update(expiredTok).digest("hex");
  psql(
    `INSERT INTO public.sessions (user_id, token_hash, expires_at, created_at, ip_address, user_agent)
     VALUES (${adminId}, '${expiredHash}', now() - interval '1 hour', now() - interval '2 hours', NULL, 'smoke')`
  );
  const expired = await req("/api/auth/me", { cookie: `hl_stock_demo_session=${expiredTok}` });
  ok(expired.status === 401 && expired.data.error.code === "UNAUTHORIZED", "sesi expired -> 401", expired.data);
  const expiredLeft = num(psql(`SELECT count(*) FROM public.sessions WHERE token_hash = '${expiredHash}'`));
  ok(expiredLeft === 0, "sesi expired otomatis dihapus saat divalidasi", expiredLeft);

  // --- Cleanup expired saat login (opportunistic) ----------------------------
  const guestId = psql("SELECT id FROM public.user_accounts WHERE username = 'tamu.demo'");
  psql(
    `INSERT INTO public.sessions (user_id, token_hash, expires_at)
     VALUES (${guestId}, '${createHash("sha256").update("yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy").digest("hex")}', now() - interval '30 minutes')`
  );
  const relog = await loginAs("admin.demo", creds.staff);
  ok(relog.status === 200, "login ulang tetap 200", relog.data);
  const stale = num(psql("SELECT count(*) FROM public.sessions WHERE expires_at <= now()"));
  ok(stale === 0, "login membersihkan sesi expired yang tersisa (opportunistic)", stale);
  session.cookie = `hl_stock_demo_session=${relog.cookieValue}`;

  // --- Guest: read OK, write 403 ---------------------------------------------
  const glogin = await loginAs("tamu.demo", creds.guest);
  ok(glogin.status === 200 && glogin.data.data.user.role === "guest", "login guest valid -> 200 (role guest)", glogin.data);
  session.guestCookie = `hl_stock_demo_session=${glogin.cookieValue}`;

  const gBarang = await req("/api/barang", { cookie: session.guestCookie });
  ok(gBarang.status === 200, "guest GET /api/barang -> 200", gBarang.data);
  const gStock = await req("/api/stock", { cookie: session.guestCookie });
  ok(gStock.status === 200, "guest GET /api/stock -> 200", gStock.data);
  const gTx = await req("/api/transaksi", { cookie: session.guestCookie });
  ok(gTx.status === 200, "guest GET /api/transaksi -> 200", gTx.data);

  const gWriteBarang = await req("/api/barang", {
    method: "POST",
    cookie: session.guestCookie,
    body: { nama: `Nama ${Date.now()}` },
  });
  ok(gWriteBarang.status === 403 && gWriteBarang.data.error.code === "FORBIDDEN", "guest POST /api/barang -> 403", gWriteBarang.data);
  const gWriteTx = await req("/api/transaksi", {
    method: "POST",
    cookie: session.guestCookie,
    body: { barang_id: 1, jenis: "masuk", jumlah: 1, warehouse: "Puri", kriteria: "Good" },
  });
  ok(gWriteTx.status === 403 && gWriteTx.data.error.code === "FORBIDDEN", "guest POST /api/transaksi -> 403", gWriteTx.data);

  // --- Staff: write OK (POST /api/barang) + cleanup langsung -----------------
  const staffName = `AuthTest ${Date.now()}`;
  const sCreate = await req("/api/barang", { method: "POST", body: { nama: staffName, stok: 0 } });
  ok(sCreate.status === 201 && sCreate.data.data.nama === staffName, "staff POST /api/barang -> 201", sCreate.data);
  psql(`DELETE FROM public.barang WHERE nama = '${staffName}'`);
  const left = num(psql(`SELECT count(*) FROM public.barang WHERE nama = '${staffName}'`));
  ok(left === 0, "barang uji auth dibersihkan (baseline terjaga)", left);

  // --- Logout ----------------------------------------------------------------
  const logoutCookie = session.cookie;
  const logoutTok = logoutCookie.split("=")[1];
  const logoutHash = createHash("sha256").update(logoutTok || "").digest("hex");
  const lg = await req("/api/auth/logout", { method: "POST", cookie: logoutCookie });
  ok(lg.status === 200 && lg.data.data.ok === true, "POST /api/auth/logout -> {ok:true}", lg.data);

  const meAfterLogout = await req("/api/auth/me", { cookie: logoutCookie });
  ok(meAfterLogout.status === 401, "sesi bekas logout -> 401", meAfterLogout.data);

  const loggedOutCount = num(psql(`SELECT count(*) FROM public.sessions WHERE token_hash = '${logoutHash}'`));
  ok(loggedOutCount === 0, "sesi benar-benar dihapus dari database (bukan hanya cookie)", loggedOutCount);

  // --- Re-login staff untuk tes berikutnya ----------------------------------
  const relog2 = await loginAs("admin.demo", creds.staff);
  ok(relog2.status === 200, "re-login staff -> 200", relog2.data);
  session.cookie = `hl_stock_demo_session=${relog2.cookieValue}`;

  // --- Rate limit login (terakhir: pakai username fiktif agar akun demo aman)
  const fakeUser = `bruteforce-${Date.now()}`;
  let rlStatuses = [];
  for (let i = 0; i < 5; i++) {
    const r = await anon("/api/auth/login", { method: "POST", body: { username: fakeUser, password: "salah" } });
    rlStatuses.push(r.status);
  }
  ok(rlStatuses.every((s) => s === 401), "5 percobaan gagal -> 401 (sebelum limit)", rlStatuses);
  const rl = await anon("/api/auth/login", { method: "POST", body: { username: fakeUser, password: "salah" } });
  ok(rl.status === 429 && rl.data.error.code === "RATE_LIMITED", "percobaan ke-6 -> 429 RATE_LIMITED", rl.data);

  console.log("  (auth login rate-limit window aktif untuk username fiktif tadi, akun demo tidak terpengaruh)");
}

// ===========================================================================
// EST READBASELINE + TRANSAKSI + ERROR PATHS + THROWAWAY + DBDOWN
// ===========================================================================

async function readBaseline() {
  console.log("== health & read baseline ==");

  const h = await req("/api/health");
  ok(h.status === 200 && h.data && h.data.ok === true, "health ok (publik)", h.data);

  const barang = await req("/api/barang");
  ok(barang.status === 200, "GET /api/barang 200", barang.status);
  ok(barang.data && barang.data.total === 8, "barang total == 8", barang.data && barang.data.total);

  const b1 = await req("/api/barang/1");
  ok(b1.status === 200 && b1.data.data.nama === "Pancake SB110", "GET /api/barang/1 nama", b1.data);

  const bnf = await req("/api/barang/999999");
  ok(bnf.status === 404 && bnf.data.error.code === "NOT_FOUND", "GET /api/barang/999999 -> 404 NOT_FOUND", bnf.data);

  const srch = await req("/api/barang?search=vani");
  ok(
    srch.status === 200 && srch.data.total === 1 && srch.data.data[0].nama === "Ice Cream Vanilla",
    "GET /api/barang?search=vani",
    srch.data
  );

  const psqlBaseline = psql(
    `SELECT json_agg(json_build_object('id', id, 'stok', stok)) FROM public.barang`
  );
  const baselineMap = {};
  for (const r of JSON.parse(psqlBaseline)) baselineMap[r.id] = r.stok;

  const stk = await req("/api/stock");
  ok(stk.status === 200 && stk.data.total === 8, "GET /api/stock total == 8", stk.data && stk.data.total);
  let stokConsistent = true;
  let stokReason = "";
  for (const r of stk.data.data) {
    if (Number(r.stok) !== sumLevels(r.levels) || Number(r.stok) !== baselineMap[r.id]) {
      stokConsistent = false;
      stokReason = `id=${r.id} stok=${r.stok} sum=${sumLevels(r.levels)} baseline=${baselineMap[r.id]}`;
      break;
    }
  }
  ok(stokConsistent, "stok == SUM(stock_levels) == baseline (8 barang)", stokReason);

  const stkWh = await req("/api/stock?warehouse=CS%20SBF");
  ok(stkWh.status === 200 && stkWh.data.data.every((r) => Object.keys(r.levels).every((k) => k === "CS SBF")), "filter warehouse=CS SBF shape", stkWh.status);

  const stkKr = await req("/api/stock?kriteria=Bad");
  ok(
    stkKr.status === 200 && stkKr.data.data.every((r) => Object.keys(r.levels).length === 0 || Object.keys(r.levels).every((wh) => Object.keys(r.levels[wh]).length === 0 || Object.keys(r.levels[wh]).every((k) => k === "Bad"))),
    "filter kriteria=Bad shape",
    stkKr.status
  );

  const stkBad = await req("/api/stock?warehouse=XYZ");
  ok(stkBad.status === 400 && stkBad.data.error.code === "VALIDATION_ERROR", "stock invalid warehouse -> 400", stkBad.data);
}

async function readTransaksi() {
  console.log("== read transaksi & balance-before ==");

  const all = await req("/api/transaksi");
  ok(all.status === 200 && all.data.total === 15, "transaksi total == 15", all.data && all.data.total);

  const masuk = await req("/api/transaksi?jenis=masuk");
  ok(masuk.data.total === 8, "transaksi jenis=masuk == 8", masuk.data.total);

  const keluar = await req("/api/transaksi?jenis=keluar");
  ok(keluar.data.total === 7, "transaksi jenis=keluar == 7", keluar.data.total);

  const byBarang = await req("/api/transaksi?barang_id=1");
  ok(byBarang.data.total === 3 && byBarang.data.data.every((r) => r.barang_id === 1), "transaksi barang_id=1 == 3 rows", byBarang.data && byBarang.data.total);

  const wide = await req("/api/transaksi?from=2000-01-01&to=2099-12-31");
  ok(wide.data.total === 15, "range 2000..2099 -> 15", wide.data.total);

  const far = await req("/api/transaksi?from=2099-01-01");
  ok(far.data.total === 0, "dari 2099 -> 0", far.data.total);

  const d = new Date();
  const today = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  const todayRes = await req(`/api/transaksi?from=${today}&to=${today}`);
  ok(todayRes.data.total >= 1 && todayRes.data.total <= 15, "range hari ini -> sebagian/semua", todayRes.data.total);

  const t3 = await req("/api/transaksi/3");
  ok(
    t3.status === 200 &&
      t3.data.data.barang_id === 1 &&
      t3.data.data.jenis === "keluar" &&
      t3.data.data.jumlah === 1 &&
      t3.data.data.warehouse === "CS TCL" &&
      t3.data.data.kriteria === "Bad" &&
      t3.data.data.barang_nama === "Pancake SB110" &&
      t3.data.data.user_nama === "Admin Demo",
    "GET /api/transaksi/3 field lengkap",
    t3.data && t3.data.data
  );

  const bb = await req("/api/transaksi/3/balance-before");
  const bbPsql = num(psql(`SELECT public.riwayat_balance_before(1, created_at, 3) FROM public.transaksi WHERE id = 3`));
  ok(
    bb.status === 200 && Number(bb.data.data.balance_before) === bbPsql,
    "balance-before id=3 == hasil function PG (cross-check)",
    bb.data
  );

  const bbSingle = await req("/api/transaksi/2");
  ok(
    bbSingle.status === 200 && Number(bbSingle.data.data.balance_before) >= 0,
    "GET /api/transaksi/2 menyertakan balance_before",
    bbSingle.data && bbSingle.data.data
  );
}

async function errorPaths() {
  console.log("== error paths ==");

  const badJenis = await req("/api/transaksi", { method: "POST", body: { barang_id: 1, jenis: "retur", jumlah: 1, warehouse: "Puri", kriteria: "Good" } });
  ok(badJenis.status === 400 && badJenis.data.error.code === "VALIDATION_ERROR", "POST jenis invalid -> 400", badJenis.data);

  const noJumlah = await req("/api/transaksi", { method: "POST", body: { barang_id: 1, jenis: "keluar", warehouse: "Puri", kriteria: "Good" } });
  ok(noJumlah.status === 400, "POST tanpa jumlah -> 400", noJumlah.data);

  const badBarangId = await req("/api/transaksi", { method: "POST", body: { barang_id: "abc", jenis: "masuk", jumlah: 1, warehouse: "Puri", kriteria: "Good" } });
  ok(badBarangId.status === 400, "POST barang_id bukan angka -> 400", badBarangId.data);

  const barangNotFound = await req("/api/transaksi", { method: "POST", body: { barang_id: 999999, jenis: "keluar", jumlah: 1, warehouse: "Puri", kriteria: "Good" } });
  ok(barangNotFound.status === 404 && barangNotFound.data.error.code === "NOT_FOUND", "POST barang tidak ada -> 404 NOT_FOUND", barangNotFound.data);

  const badTxId = await req("/api/transaksi", { method: "POST", body: { barang_id: 1, jenis: "masuk", jumlah: 1, warehouse: "Puri", kriteria: "Good", client_tx_id: "bukan-uuid" } });
  ok(badTxId.status === 400, "client_tx_id bukan UUID -> 400", badTxId.data);

  const badDate = await req("/api/transaksi?from=13-13-2026");
  ok(badDate.status === 400 && badDate.data.error.code === "VALIDATION_ERROR", "filter tanggal invalid -> 400", badDate.data);

  const badPage = await req("/api/transaksi?page=0");
  ok(badPage.status === 400, "page=0 -> 400", badPage.data);

  const cap = await req("/api/transaksi?pageSize=9999");
  ok(cap.status === 200 && cap.data.pageSize <= 200, "pageSize di-cap <= 200", cap.data && cap.data.pageSize);

  const badJson = await req("/api/transaksi");
  const bjRes = await fetch(BASE + "/api/transaksi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{invalid json",
  });
  ok(bjRes.status === 400, "body JSON tidak valid -> 400", bjRes.status);

  const unknown = await anon("/api/tidakada");
  ok(unknown.status === 404 && unknown.data.error && unknown.data.error.code === "NOT_FOUND", "endpoint tak dikenal -> 404 format error (publik)", unknown.data);

  const insuff = await req("/api/transaksi", { method: "POST", body: { barang_id: 8, jenis: "keluar", jumlah: 100, warehouse: "Puri", kriteria: "Good" } });
  ok(insuff.status === 409 && insuff.data.error.code === "INSUFFICIENT_STOCK", "keluar melebihi stok -> 409 INSUFFICIENT_STOCK", insuff.data);
}

async function throwaway() {
  console.log("== round-trip CRUD barang + transaksi ==");

  const cname = `Item API ${Date.now()}`;
  // Stok awal 0: semua pergerakan saldo berasal dari transaksi, sehingga
  // balance-before (hitungan transaksi sebelum baris) mudah diverifikasi.
  const created = await req("/api/barang", { method: "POST", body: { nama: cname, stok: 0 } });
  ok(created.status === 201 && created.data.data.nama === cname && created.data.data.stok === 0, "POST /api/barang -> 201", created.data);
  state.barangId = created.data.data.id;

  const idp = created.data.data.id;
  const dupName = await req("/api/barang", { method: "POST", body: { nama: cname } });
  ok(dupName.status === 409 && dupName.data.error.code === "DUPLICATE_NAME", "nama barang duplikat -> 409 DUPLICATE_NAME", dupName.data);

  const g = await req(`/api/barang/${idp}`);
  ok(g.status === 200 && g.data.data.stok === 0, `GET /api/barang/${idp} stok == 0`, g.data);

  const renamed = await req(`/api/barang/${idp}`, { method: "PATCH", body: { nama: `${cname} (renamed)` } });
  ok(renamed.status === 200 && renamed.data.data.nama.includes("renamed"), "PATCH rename barang -> 200", renamed.data);

  const u1 = crypto.randomUUID();
  const u2 = crypto.randomUUID();
  const u3 = crypto.randomUUID();

  const t1 = await req("/api/transaksi", { method: "POST", body: { barang_id: idp, jenis: "masuk", jumlah: 5, warehouse: "Puri", kriteria: "Good", keterangan: "smoke", client_tx_id: u1 } });
  ok(t1.status === 201 && t1.data.data.jenis === "masuk", "POST transaksi masuk -> 201", t1.data);
  ok(t1.data.data.user_id !== null, "transaksi tersimpan dengan user_id (dari sesi aktif)", t1.data.data.user_id);
  state.txIds.push(t1.data.data.id);

  const gAfter1 = await req(`/api/barang/${idp}`);
  ok(gAfter1.data.data.stok === 5, "stok barang naik menjadi 5", gAfter1.data.data.stok);

  const stAfter1 = await req(`/api/stock?barang_id=${idp}`);
  ok(
    stAfter1.data.data[0] && stAfter1.data.data[0].levels["Puri"].Good === 5 && stAfter1.data.data[0].total === 5,
    "stock_levels Puri/Good == 5 (pivot api)",
    stAfter1.data.data[0]
  );

  const dupTx = await req("/api/transaksi", { method: "POST", body: { barang_id: idp, jenis: "masuk", jumlah: 5, warehouse: "Puri", kriteria: "Good", client_tx_id: u1 } });
  ok(dupTx.status === 200 && dupTx.data.data.id === t1.data.data.id, "client_tx_id duplikat -> idempotent 200 (row sama)", dupTx.data);

  const t2 = await req("/api/transaksi", { method: "POST", body: { barang_id: idp, jenis: "masuk", jumlah: 2, warehouse: "Puri", kriteria: "Good", client_tx_id: u2 } });
  ok(t2.status === 201, "POST transaksi masuk kedua -> 201", t2.data);
  state.txIds.push(t2.data.data.id);

  const t3 = await req("/api/transaksi", { method: "POST", body: { barang_id: idp, jenis: "keluar", jumlah: 4, warehouse: "Puri", kriteria: "Good", client_tx_id: u3 } });
  ok(t3.status === 201, "POST transaksi keluar -> 201", t3.data);
  state.txIds.push(t3.data.data.id);

  const gEnd = await req(`/api/barang/${idp}`);
  ok(gEnd.data.data.stok === 3, "stok akhir barang == 3", gEnd.data.data.stok);

  const t3bb = await req(`/api/transaksi/${t3.data.data.id}/balance-before`);
  // balance-before = jumlah transaksi SEBELUM baris ini (5+2=7), bukan saldo
  // total termasuk stok awal barang.
  ok(Number(t3bb.data.data.balance_before) === 7, "balance-before keluar == 7", t3bb.data);

  const list = await req(`/api/transaksi?barang_id=${idp}`);
  ok(list.data.total === 3, "riwayat barang throwaway == 3 row", list.data.total);

  const del = await req(`/api/barang/${idp}`, { method: "DELETE" });
  ok(del.status === 409 && del.data.error.code === "FOREIGN_KEY_ERROR", "DELETE barang ber-riwayat -> 409 FOREIGN_KEY_ERROR", del.data);
}

async function dbDown() {
  console.log("== skenario koneksi DB gagal (instance 3102) ==");
  const child = spawn("node", ["server.js"], {
    cwd: API_DIR,
    env: {
      ...process.env,
      PORT: "3102",
      DATABASE_HOST: "203.0.113.99",
      DATABASE_PORT: "5432",
      DATABASE_PASSWORD: "wrong",
      DATABASE_CONNECT_TIMEOUT: "2500",
    },
    stdio: "ignore",
  });

  const up = await waitForServer(BASE_BAD, 15000);
  ok(up, "instance 3102 bangkit", up);

  const h = await reqBad("/api/health");
  ok(h.status === 503, "health instance rusak -> 503 (publik)", h.data);

  // Dengan cookie valid sekalipun: DB down => kegagalan validasi sesi disamarkan
  // menjadi 500 DATABASE_ERROR tanpa membocorkan SQL/kredensial.
  const b = await reqBad("/api/barang", { cookie: session.cookie });
  ok(b.status === 500 && b.data.error.code === "DATABASE_ERROR", "endpoint dengan sesi + DB down -> 500 DATABASE_ERROR", b.data);
  const bBody = JSON.stringify(b.data);
  ok(
    !/password|token_hash|stack|syntax error|PG::/i.test(bBody),
    "error DB tidak membocorkan SQL/kredensial/stack",
    bBody
  );

  const meDown = await reqBad("/api/auth/me", { cookie: session.cookie });
  ok(meDown.status === 500 && meDown.data.error.code === "DATABASE_ERROR", "/api/auth/me dengan sesi + DB down -> 500 DATABASE_ERROR", meDown.data);

  const meDownAnon = await reqBad("/api/auth/me", { cookie: null });
  ok(meDownAnon.status === 401, "/api/auth/me tanpa sesi + DB down -> 401 (tanpa query DB)", meDownAnon.data);

  child.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 1000));
}

async function baselineAfter() {
  console.log("== verifikasi baseline setelah cleanup ==");
  const barang = await req("/api/barang");
  ok(barang.data.total === 8, "barang total kembali 8", barang.data.total);

  const txAll = await req("/api/transaksi");
  ok(txAll.data.total === 15, "transaksi total kembali 15", txAll.data.total);

  const slCount = num(psql("SELECT count(*) FROM public.stock_levels"));
  ok(slCount === 13, "stock_levels kembali 13", slCount);

  const profiles = num(psql("SELECT count(*) FROM public.profiles"));
  ok(profiles === 2, "profiles tetap 2", profiles);

  const stk = await req("/api/stock");
  let consistent = true;
  let reason = "";
  for (const r of stk.data.data) {
    if (Number(r.stok) !== sumLevels(r.levels)) {
      consistent = false;
      reason = `id=${r.id}`;
      break;
    }
  }
  ok(stk.status === 200 && stk.data.total === 8 && consistent, "barang & stok konsisten (8/8)", reason);
}

async function main() {
  try {
    await authSuite();
    await readBaseline();
    await readTransaksi();
    await errorPaths();
    await throwaway();
    await dbDown();
  } finally {
    cleanup();
  }
  await baselineAfter();

  console.log("");
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log("Failures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("smoke crash:", e);
  process.exit(2);
});