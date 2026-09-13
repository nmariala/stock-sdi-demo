"use strict";

const { rateLimitError } = require("../utils/errors");

// ---------------------------------------------------------------------------
// Configuration (from environment)
// ---------------------------------------------------------------------------

const MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS) || 5;
const WINDOW_MS = Number(process.env.LOGIN_WINDOW_MS) || 15 * 60 * 1000;
const IP_MAX_ATTEMPTS = Number(process.env.LOGIN_IP_MAX_ATTEMPTS) || 100;

// ---------------------------------------------------------------------------
// In-memory store (key → timestamp[])
// ---------------------------------------------------------------------------

const store = new Map();

function pruneWindow(arr, now) {
  return arr.filter((ts) => now - ts < WINDOW_MS);
}

function countAttempts(key, now) {
  const arr = store.get(key) || [];
  return pruneWindow(arr, now);
}

function addAttempt(key, now, max) {
  const arr = pruneWindow(store.get(key) || [], now);
  arr.push(now);
  store.set(key, arr.slice(-max));
}

function clearKey(key) {
  store.delete(key);
}

// ---------------------------------------------------------------------------
// Middleware: loginRateLimit
// Dipasang SEBELUM handler login. Cek batas percobaan berdasarkan:
//   - per (ip, username): MAX_ATTEMPTS per WINDOW_MS
//   - per ip: IP_MAX_ATTEMPTS per WINDOW_MS
// ---------------------------------------------------------------------------

function loginRateLimit(req, res, next) {
  const username = String((req.body && req.body.username) || "").trim().toLowerCase();
  const ip = req.ip || "unknown";
  const now = Date.now();

  const userAttempts = countAttempts(`${ip}:${username}`, now);
  const ipAttempts = countAttempts(`ip:${ip}`, now);

  if (userAttempts.length >= MAX_ATTEMPTS || ipAttempts.length >= IP_MAX_ATTEMPTS) {
    return next(rateLimitError("Terlalu banyak percobaan login. Coba lagi beberapa saat."));
  }

  next();
}

/**
 * Rekam kegagalan login (dipanggil dari handler setelah verifikasi gagal).
 */
function recordLoginFailure(ip, username) {
  const now = Date.now();
  const userKey = `${ip || "unknown"}:${String(username || "").trim().toLowerCase()}`;
  const ipKey = `ip:${ip || "unknown"}`;
  addAttempt(userKey, now, MAX_ATTEMPTS + 5);
  addAttempt(ipKey, now, IP_MAX_ATTEMPTS + 5);
}

/**
 * Hapus percobaan gagal untuk user tertentu (dipanggil saat login sukses).
 */
function recordLoginSuccess(ip, username) {
  const userKey = `${ip || "unknown"}:${String(username || "").trim().toLowerCase()}`;
  clearKey(userKey);
}

module.exports = { loginRateLimit, recordLoginFailure, recordLoginSuccess };