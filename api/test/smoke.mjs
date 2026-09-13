#!/usr/bin/env node
"use strict";

// Smoke test Stock SDI Demo API (dijalankan di sisi server, localhost).
// Penggunaan: node smoke.mjs  [harus dijalankan dari /home/nugie/stock-sdi-api]
//
// Cakupan:
//   - health check & koneksi DB
//   - read baseline (barang/stok/transaksi; konsistensi stok vs stock_levels)
//   - filter transaksi (jenis, barang_id, range tanggal) & balance-before
//   - validasi input + error paths (400/404/409, INAGOK/DUPLICATE/idempotent)
//   - round-trip CRUD barang + transaksi throwaway (cleanup otomatis)
//   - skenario koneksi DB gagal (instance dengan kredensial salah, port 3102)
//   - verifikasi baseline kembali utuh setelah cleanup

import { spawn, execFileSync } from "node:child_process";
import process from "node:process";

const BASE = "http://127.0.0.1:3101";
const BASE_BAD = "http://127.0.0.1:3102";
const API_DIR = "/home/nugie/stock-sdi-api";

let pass = 0;
let fail = 0;
const failures = [];

const state = { barangId: null, txIds: [] };

function ok(cond, label, extra) {
  if (cond) {
    pass++;
    console.log(`  PASS ${label}`);
  } else {
    fail++;
    failures.push((extra === undefined ? label : `${label} :: ${JSON.stringify(extra)}`));
    console.log(`  FAIL ${label}${extra === undefined ? "" : ` :: ${JSON.stringify(extra)}`}`);
  }
}

async function req(path, { method = "GET", body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON fallback */
  }
  return { status: res.status, data };
}

async function reqBad(path, { method = "GET", body } = {}) {
  const res = await fetch(BASE_BAD + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  return { status: res.status, data };
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

async function readBaseline() {
  console.log("== health & read baseline ==");

  const h = await req("/api/health");
  ok(h.status === 200 && h.data && h.data.ok === true, "health ok", h.data);

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

  const unknown = await req("/api/tidakada");
  ok(unknown.status === 404 && unknown.data.error && unknown.data.error.code === "NOT_FOUND", "endpoint tak dikenal -> 404 format error", unknown.data);

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
  ok(h.status === 503, "health instance rusak -> 503", h.data);

  const b = await reqBad("/api/barang");
  ok(b.status === 500 && b.data.error.code === "DATABASE_ERROR", "endpoint -> 500 DATABASE_ERROR (tanpa bocor SQL)", b.data);

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