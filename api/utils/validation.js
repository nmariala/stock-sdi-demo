"use strict";

const { validationError } = require("./errors");

const GUDANG = ["Puri", "CS TCL", "CS SBF"];
const KRITERIA = ["Good", "Bad"];
const JENIS = ["masuk", "keluar"];

// Batas pagination yang aman (cegah query dengan limit besar).
const MIN_PAGE = 1;
const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 50;

function toInt(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : NaN;
}

function isPositiveInt(n) {
  return Number.isInteger(n) && n > 0;
}

function trimOrNull(value, maxLength) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return typeof maxLength === "number" && s.length > maxLength ? s.slice(0, maxLength) : s;
}

// Escape karakter wildcard LIKE agar input user diperlakukan sebagai literal.
function escapeLike(term) {
  return String(term).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

// Parse & validasi ID positif dari req.params. Slow-path untuk /:id.
function parseId(req, label) {
  const n = toInt(req.params[label || "id"]);
  if (!isPositiveInt(n)) {
    throw validationError("ID tidak valid");
  }
  return n;
}

// Filter ID opsional: '' / undefined / null => null (tidak difilter).
function parseOptionalId(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = toInt(value);
  if (!isPositiveInt(n)) throw validationError("barang_id tidak valid");
  return n;
}

function parseEnum(value, allowed, field) {
  if (value === undefined || value === null || value === "") return null;
  if (!allowed.includes(value)) {
    throw validationError(`${field} harus salah satu dari: ${allowed.join(", ")}`);
  }
  return value;
}

function parseIntPaging(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = toInt(value);
  if (!isPositiveInt(n)) throw validationError("Pagination tidak valid");
  return Math.min(n, MAX_PAGE_SIZE);
}

// 'YYYY-MM-DD' => representasi local midnight ('YYYY-MM-DDT00:00:00'), null bila kosong.
function parseDateOrNull(value, field) {
  if (value === undefined || value === null || value === "") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).trim());
  if (!m) throw validationError(`${field} harus berformat YYYY-MM-DD`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    throw validationError(`${field} tanggal tidak valid`);
  }
  return dt.toISOString().slice(0, 10) + "T00:00:00";
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// Validasi body transaksi (POST /api/transaksi). Mengembalikan objek bersih.
function validateTransaksiBody(body) {
  const barangId = toInt(body && body.barang_id);
  if (!isPositiveInt(barangId)) throw validationError("barang_id harus bilangan bulat positif");

  const jenis = body && body.jenis;
  if (!jenis || !JENIS.includes(jenis)) {
    throw validationError(`jenis harus salah satu dari: ${JENIS.join(", ")}`);
  }

  const jumlah = toInt(body && body.jumlah);
  if (!isPositiveInt(jumlah)) throw validationError("jumlah harus bilangan bulat positif");

  const warehouse = body && body.warehouse;
  if (!warehouse || !GUDANG.includes(warehouse)) {
    throw validationError(`warehouse harus salah satu dari: ${GUDANG.join(", ")}`);
  }

  const kriteria = body && body.kriteria;
  if (!kriteria || !KRITERIA.includes(kriteria)) {
    throw validationError(`kriteria harus salah satu dari: ${KRITERIA.join(", ")}`);
  }

  const keterangan = trimOrNull(body && body.keterangan, 1000);
  const clientTxId = trimOrNull(body && body.client_tx_id, 64);
  if (clientTxId && !isUuid(clientTxId)) {
    throw validationError("client_tx_id harus berupa UUID yang valid");
  }

  return { barangId, jenis, jumlah, warehouse, kriteria, keterangan, clientTxId };
}

module.exports = {
  GUDANG,
  KRITERIA,
  JENIS,
  MIN_PAGE,
  MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  trimOrNull,
  escapeLike,
  parseId,
  parseOptionalId,
  parseEnum,
  parseIntPaging,
  parseDateOrNull,
  isUuid,
  toInt,
  validateTransaksiBody,
};