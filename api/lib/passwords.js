"use strict";

const bcrypt = require("bcryptjs");

const COST = 12;

// Hash palsu agar waktu respons ~sama antara username yang ada vs tidak ada.
const DUMMY_HASH = bcrypt.hashSync("x", 10);

async function hashPassword(plain) {
  return bcrypt.hash(String(plain), COST);
}

async function verifyPassword(plain, hash) {
  // Jika hash null/tidak terbaca, tetap jalankan compare pada hash palsu
  // agar timing secara praktis identik (mencegah enumerasi user).
  return bcrypt.compare(String(plain), hash || DUMMY_HASH);
}

module.exports = { hashPassword, verifyPassword };