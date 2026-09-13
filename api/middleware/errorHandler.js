"use strict";

const { AppError } = require("../utils/errors");

const CONNECTION_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ECONNRESET",
  "EPIPE",
  "57P03", // cannot_connect_now
  "08P01", // protocol_violation
]);

// Pemetaan error PostgreSQL menjadi kode API yang aman untuk di-expose.
// Pesan SQL mentah TIDAK dikirim ke client kecuali untuk kasus tertentu
// (mis. INSUFFICIENT_STOCK yang memang pesannya untuk user).
function mapPgError(err) {
  if (CONNECTION_ERROR_CODES.has(err.code)) {
    return { status: 500, code: "DATABASE_ERROR", message: "Koneksi ke database gagal" };
  }
  if (err.code === "23505") {
    return { status: 409, code: "DUPLICATE_TRANSACTION", message: "Transaksi dengan client_tx_id tersebut sudah tercatat" };
  }
  if (err.code === "23503") {
    return { status: 404, code: "NOT_FOUND", message: "Barang tidak ditemukan" };
  }
  if (err.code === "23514") {
    const msg = String(err.message || "");
    if (msg.includes("Stok tidak mencukupi")) {
      return { status: 409, code: "INSUFFICIENT_STOCK", message: msg };
    }
    return { status: 400, code: "CONSTRAINT_ERROR", message: "Data tidak memenuhi aturan yang berlaku" };
  }
  if (err.code === "23502") {
    return { status: 400, code: "CONSTRAINT_ERROR", message: "Ada kolom wajib yang tidak terisi" };
  }
  if (err.code === "22P02") {
    return { status: 400, code: "VALIDATION_ERROR", message: "Nilai input tidak valid" };
  }
  return { status: 500, code: "DATABASE_ERROR", message: "Terjadi kesalahan pada database" };
}

module.exports = function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }

  // JSON body tidak valid (express.json)
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Body JSON tidak valid" } });
  }

  // Payload terlalu besar
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: { code: "VALIDATION_ERROR", message: "Ukuran body terlalu besar" } });
  }

  if (err && typeof err.code === "string") {
    const mapped = mapPgError(err);
    if (mapped.status === 500) {
      console.error("[api][pg-err]", err.code, err.message);
    }
    return res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
  }

  // Kegagalan koneksi pool (mis. connect timeout) mengantar AggregateError.
  if (err && err.name === "AggregateError") {
    console.error("[api][pg-conn]", err.message);
    return res.status(500).json({ error: { code: "DATABASE_ERROR", message: "Koneksi ke database gagal" } });
  }

  // Error koneksi socket murni tanpa kode PG (mis. net "timeout expired").
  const connMsg = String((err && err.message) || "");
  if (/timeout expired|connect ETIMEDOUT|connection terminated|connection timeout|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|ESOCKETTIMEDOUT/i.test(connMsg)) {
    console.error("[api][pg-conn]", connMsg);
    return res.status(500).json({ error: { code: "DATABASE_ERROR", message: "Koneksi ke database gagal" } });
  }

  // Hanya log di sisi server (tidak dibocorkan ke respons).
  console.error("[api][error]", err && err.stack ? err.stack : err);
  return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan internal" } });
};