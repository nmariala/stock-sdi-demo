"use strict";

const express = require("express");
const { pool } = require("../db");
const { notFoundError } = require("../utils/errors");
const {
  parseId,
  parseOptionalId,
  parseEnum,
  parseDateOrNull,
  parseIntPaging,
  validateTransaksiBody,
  MIN_PAGE,
} = require("../utils/validation");

const router = express.Router();

const TRANS_COLS = `
  t.id, t.barang_id, t.user_id, t.jenis, t.jumlah, t.created_at,
  t.warehouse, t.kriteria, t.keterangan, t.client_tx_id,
  b.nama AS barang_nama,
  p.nama AS user_nama`;

function rowToJson(row) {
  return {
    ...row,
    id: Number(row.id),
    barang_id: Number(row.barang_id),
    jumlah: Number(row.jumlah),
    user_nama: row.user_nama || null,
  };
}

function maybeNumeric(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

// GET /api/transaksi?barang_id=&warehouse=&kriteria=&jenis=&from=&to=&page=&pageSize=
router.get("/", async (req, res, next) => {
  try {
    const q = req.query;
    const barangId = parseOptionalId(q.barang_id);
    const warehouse = parseEnum(q.warehouse, ["Puri", "CS TCL", "CS SBF"], "warehouse");
    const kriteria = parseEnum(q.kriteria, ["Good", "Bad"], "kriteria");
    const jenis = parseEnum(q.jenis, ["masuk", "keluar"], "jenis");
    const from = parseDateOrNull(q.from, "from");
    const to = parseDateOrNull(q.to, "to");
    // "to" bersifat inklusif (ikut transaksi akhir tanggal tsb):
    // bandingkan dengan BESOK hari (exclusive upper bound).
    const toExclusive = to
      ? (() => {
          const dt = new Date(`${to.slice(0, 10)}T00:00:00Z`);
          dt.setUTCDate(dt.getUTCDate() + 1);
          return dt.toISOString().slice(0, 10) + "T00:00:00";
        })()
      : null;
    const page = parseIntPaging(q.page, MIN_PAGE);
    const pageSize = parseIntPaging(q.pageSize, 50);
    const maxPageSize = 200;
    const finalPageSize = Math.min(pageSize, maxPageSize);

    const conditions = [
      "$1::bigint IS NULL OR t.barang_id = $1",
      "$2::text IS NULL OR t.warehouse = $2",
      "$3::text IS NULL OR t.kriteria = $3",
      "$4::text IS NULL OR t.jenis = $4",
      "$5::timestamptz IS NULL OR t.created_at >= $5",
      "$6::timestamptz IS NULL OR t.created_at < $6",
    ];
    const params = [barangId, warehouse, kriteria, jenis, from, toExclusive];

    const where = `WHERE ${conditions.map((c) => `(${c})`).join(" AND ")}`;

    const countQ = `SELECT count(*)::int AS total FROM public.transaksi t ${where}`;
    const dataQ = `SELECT ${TRANS_COLS}
      FROM public.transaksi t
      LEFT JOIN public.barang b ON b.id = t.barang_id
      LEFT JOIN public.profiles p ON p.id = t.user_id
      ${where}
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

    const [countRes, dataRes] = await Promise.all([
      pool.query(countQ, params),
      pool.query(dataQ, [...params, finalPageSize, (page - 1) * finalPageSize]),
    ]);

    res.json({
      data: dataRes.rows.map(rowToJson),
      total: countRes.rows[0].total,
      page,
      pageSize: finalPageSize,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/transaksi/:id
router.get("/:id", async (req, res, next) => {
  try {
    const id = parseId(req);
    const { rows } = await pool.query(
      `SELECT ${TRANS_COLS}, public.riwayat_balance_before(t.barang_id, t.created_at, t.id) AS balance_before
       FROM public.transaksi t
       LEFT JOIN public.barang b ON b.id = t.barang_id
       LEFT JOIN public.profiles p ON p.id = t.user_id
       WHERE t.id = $1`,
      [id]
    );
    if (!rows[0]) throw notFoundError("Transaksi tidak ditemukan");
    res.json({ data: { ...rowToJson(rows[0]), balance_before: maybeNumeric(rows[0].balance_before) } });
  } catch (err) {
    next(err);
  }
});

// GET /api/transaksi/:id/balance-before
router.get("/:id/balance-before", async (req, res, next) => {
  try {
    const id = parseId(req);
    // Pakai t.created_at (nilai kolom, presisi penuh) sebagai argumen fungsi,
    // bukan nilai dari client yang bisa kehilangan presisi mikrodetik.
    const { rows } = await pool.query(
      `SELECT t.id, t.barang_id, t.created_at,
              public.riwayat_balance_before(t.barang_id, t.created_at, t.id) AS balance_before
       FROM public.transaksi t
       WHERE t.id = $1`,
      [id]
    );
    if (!rows[0]) throw notFoundError("Transaksi tidak ditemukan");

    res.json({
      data: {
        id: Number(rows[0].id),
        barang_id: Number(rows[0].barang_id),
        created_at: rows[0].created_at,
        balance_before: maybeNumeric(rows[0].balance_before),
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/transaksi
// Hanya INSERT; semua validasi stock, update stok & stock_levels, serta
// deteksi client_tx_id ganda ditangani trigger PostgreSQL (berlaku juga
// untuk transaksi yang masuk lewat jalur lain).
router.post("/", async (req, res, next) => {
  try {
    const v = validateTransaksiBody(req.body);

    let rows;
    try {
      const result = await pool.query(
        `INSERT INTO public.transaksi
           (barang_id, jenis, jumlah, warehouse, kriteria, keterangan, client_tx_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, barang_id, user_id, jenis, jumlah, created_at, warehouse, kriteria, keterangan, client_tx_id`,
        [v.barangId, v.jenis, v.jumlah, v.warehouse, v.kriteria, v.keterangan, v.clientTxId]
      );
      rows = result.rows;
    } catch (err) {
      // client_tx_id ganda => idempoten: kembalikan transaksi yang sudah ada
      // tanpa membuat data baru (aman untuk retry dari frontend).
      if (err && err.code === "23505" && v.clientTxId) {
        const existing = await pool.query(
          `SELECT id, barang_id, user_id, jenis, jumlah, created_at, warehouse, kriteria, keterangan, client_tx_id
           FROM public.transaksi
           WHERE client_tx_id = $1
           ORDER BY id DESC
           LIMIT 1`,
          [v.clientTxId]
        );
        return res.status(200).json({ data: rowToJson(existing.rows[0]) });
      }
      throw err;
    }

    res.status(201).json({ data: rowToJson(rows[0]) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;