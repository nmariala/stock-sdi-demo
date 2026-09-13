"use strict";

const express = require("express");
const { checkConnection } = require("../db");

const router = express.Router();

// GET /api/health — health check ringan.
// Respon 200 { ok: true } bila database terjangkau; 503 bila tidak.
router.get("/", async (req, res) => {
  try {
    await checkConnection();
    res.json({ ok: true });
  } catch (err) {
    console.error("[api][health] database unreachable:", err.message);
    res.status(503).json({
      ok: false,
      error: { code: "DATABASE_ERROR", message: "Database tidak tersedia" },
    });
  }
});

module.exports = router;