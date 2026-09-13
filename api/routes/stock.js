"use strict";

const express = require("express");
const { pool } = require("../db");
const { trimOrNull, escapeLike, parseEnum, parseOptionalId } = require("../utils/validation");

const router = express.Router();

// GET /api/stock?warehouse=&kriteria=&barang_id=&search=
// Data tingkat stok per barang diambil langsung dari stock_levels + barang
// (PostgreSQL adalah source of truth; server TIDAK menghitung ulang stok).
router.get("/", async (req, res, next) => {
  try {
    const q = req.query;
    const search = trimOrNull(q.search, 200);
    const barangId = parseOptionalId(q.barang_id);
    const warehouse = parseEnum(q.warehouse, ["Puri", "CS TCL", "CS SBF"], "warehouse");
    const kriteria = parseEnum(q.kriteria, ["Good", "Bad"], "kriteria");

    const { rows } = await pool.query(
      `SELECT
         b.id,
         b.nama,
         b.stok,
         COALESCE((
           SELECT COALESCE(json_agg(l ORDER BY l.warehouse, l.kriteria), '[]'::json)
           FROM (
             SELECT s.warehouse, s.kriteria, s.jumlah
             FROM public.stock_levels s
             WHERE s.item_id = b.id
               AND ($3::text IS NULL OR s.warehouse = $3)
               AND ($4::text IS NULL OR s.kriteria = $4)
           ) l
         ), '[]'::json) AS levels
       FROM public.barang b
       WHERE ($1::text IS NULL OR b.nama ILIKE '%' || $1 || '%')
         AND ($2::bigint IS NULL OR b.id = $2)
       ORDER BY b.nama ASC`,
      [search ? escapeLike(search) : null, barangId, warehouse, kriteria]
    );

    const data = rows.map((row) => {
      const levels = {};
      let total = 0;
      for (const l of row.levels || []) {
        const jumlah = Number(l.jumlah);
        total += jumlah;
        if (!levels[l.warehouse]) levels[l.warehouse] = {};
        levels[l.warehouse][l.kriteria] = jumlah;
      }
      // Tanpa filter warehouse/kriteria, total = nilai stok utama barang
      // (balance trigger sudah menjaga konsistensi stok vs level).
      const finalTotal = warehouse || kriteria ? total : Number(row.stok);
      return {
        id: Number(row.id),
        nama: row.nama,
        stok: Number(row.stok),
        total: finalTotal,
        levels,
      };
    });

    res.json({ data, total: data.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;