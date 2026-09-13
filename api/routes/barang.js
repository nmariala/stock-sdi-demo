"use strict";

const express = require("express");
const { pool } = require("../db");
const {
  validationError,
  notFoundError,
  duplicateError,
} = require("../utils/errors");
const {
  trimOrNull,
  escapeLike,
  parseId,
  parseIntPaging,
  toInt,
  MIN_PAGE,
  DEFAULT_PAGE_SIZE,
} = require("../utils/validation");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// Semua endpoint barang butuh sesi valid (staff untuk tulis).
router.use(requireAuth);

const BARANG_COLS = "b.id, b.nama, b.stok, b.updated_at";

// bigint dari pg berupa string; normalisasi ke number agar konsisten.
function mapBarang(row) {
  return { ...row, id: Number(row.id) };
}

// GET /api/barang?search=&page=&pageSize=&sort=&order=
router.get("/", async (req, res, next) => {
  try {
    const q = req.query;
    const search = trimOrNull(q.search, 200);
    const page = parseIntPaging(q.page, MIN_PAGE);
    const pageSize = parseIntPaging(q.pageSize, DEFAULT_PAGE_SIZE);
    const sort = q.sort === "id" ? "b.id" : "b.nama";
    const order = q.order === "desc" ? "DESC" : "ASC";

    const clauses = [];
    const params = [];
    if (search) {
      params.push(escapeLike(search));
      clauses.push(`b.nama ILIKE '%' || $${params.length} || '%'`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    const countQ = `SELECT count(*)::int AS total FROM public.barang b ${where}`;
    const dataQ = `SELECT ${BARANG_COLS} FROM public.barang b ${where} ORDER BY ${sort} ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

    const [countRes, dataRes] = await Promise.all([
      pool.query(countQ, params),
      pool.query(dataQ, [...params, pageSize, (page - 1) * pageSize]),
    ]);

    res.json({ data: dataRes.rows.map(mapBarang), total: countRes.rows[0].total, page, pageSize });
  } catch (err) {
    next(err);
  }
});

// GET /api/barang/:id
router.get("/:id", async (req, res, next) => {
  try {
    const id = parseId(req);
    const { rows } = await pool.query(
      `SELECT id, nama, stok, updated_at FROM public.barang WHERE id = $1`,
      [id]
    );
    if (!rows[0]) throw notFoundError("Barang tidak ditemukan");
    res.json({ data: mapBarang(rows[0]) });
  } catch (err) {
    next(err);
  }
});

// POST /api/barang  -> body: { nama, stok? }  (khusus staff)
router.post("/", requireRole("staff"), async (req, res, next) => {
  try {
    const body = req.body || {};
    const nama = trimOrNull(body.nama, 200);
    if (!nama) throw validationError("nama wajib diisi");

    let stok = 0;
    if (body.stok !== undefined && body.stok !== null && body.stok !== "") {
      const n = toInt(body.stok);
      if (!Number.isInteger(n) || n < 0) {
        throw validationError("stok harus bilangan bulat >= 0");
      }
      stok = n;
    }

    const dup = await pool.query(
      "SELECT id FROM public.barang WHERE lower(nama) = lower($1) LIMIT 1",
      [nama]
    );
    if (dup.rows[0]) {
      throw duplicateError("Barang dengan nama tersebut sudah terdaftar");
    }

    const { rows } = await pool.query(
      `INSERT INTO public.barang (nama, stok) VALUES ($1, $2)
       RETURNING id, nama, stok, updated_at`,
      [nama, stok]
    );
    res.status(201).json({ data: mapBarang(rows[0]) });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/barang/:id  -> body: { nama }  (khusus staff)
router.patch("/:id", requireRole("staff"), async (req, res, next) => {
  try {
    const id = parseId(req);
    const nama = trimOrNull((req.body || {}).nama, 200);
    if (!nama) throw validationError("nama wajib diisi");

    const dup = await pool.query(
      "SELECT id FROM public.barang WHERE lower(nama) = lower($1) AND id <> $2 LIMIT 1",
      [nama, id]
    );
    if (dup.rows[0]) {
      throw duplicateError("Barang dengan nama tersebut sudah terdaftar");
    }

    const { rows } = await pool.query(
      `UPDATE public.barang SET nama = $1, updated_at = now()
       WHERE id = $2 RETURNING id, nama, stok, updated_at`,
      [nama, id]
    );
    if (!rows[0]) throw notFoundError("Barang tidak ditemukan");
    res.json({ data: mapBarang(rows[0]) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/barang/:id  (khusus staff)
router.delete("/:id", requireRole("staff"), async (req, res, next) => {
  try {
    const id = parseId(req);

    const exists = await pool.query("SELECT id FROM public.barang WHERE id = $1", [id]);
    if (!exists.rows[0]) throw notFoundError("Barang tidak ditemukan");

    try {
      await pool.query("DELETE FROM public.barang WHERE id = $1", [id]);
    } catch (err) {
      if (err && err.code === "23503") {
        return res.status(409).json({
          error: {
            code: "FOREIGN_KEY_ERROR",
            message: "Barang ini sudah memiliki riwayat transaksi sehingga tidak bisa dihapus. (Hubungi Admin)",
          },
        });
      }
      throw err;
    }

    res.json({ data: { id } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;