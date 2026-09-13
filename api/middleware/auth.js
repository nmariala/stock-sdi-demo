"use strict";

const { readCookie } = require("../utils/cookies");
const { findValidSessionByToken, touchLastSeen } = require("../lib/sessions");
const { unauthorizedError } = require("../utils/errors");

function cookieName() {
  return process.env.COOKIE_NAME || "hl_stock_demo_session";
}

/**
 * Middleware otentikasi: membaca cookie HttpOnly, memvalidasi sesi di DB,
 * dan menambahkan objek `req.auth`:
 *   req.auth.user  = { id, username, name, role, profileId }
 *   req.auth.sessionId
 *   req.auth.expiresAt
 *
 * Bila tidak ada atau tidak valid → 401 UNAUTHORIZED + clear cookie.
 */
async function requireAuth(req, res, next) {
  try {
    const token = readCookie(req, cookieName());
    const session = await findValidSessionByToken(token);

    if (!session) {
      res.clearCookie(cookieName(), { path: "/" });
      throw unauthorizedError("Belum login atau sesi berakhir");
    }

    req.auth = {
      user: session.user,
      sessionId: session.sessionId,
      expiresAt: session.expiresAt,
    };

    touchLastSeen(session.sessionId).catch(() => {});

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware otorisasi peran: hanya izinkan peran tertentu (mis. ['staff']).
 * Harus digunakan SETELAH requireAuth.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.auth) {
      return next(unauthorizedError("Belum login atau sesi berakhir"));
    }
    if (!allowedRoles.includes(req.auth.user.role)) {
      return res.status(403).json({
        error: { code: "FORBIDDEN", message: "Aksi ini hanya untuk staf" },
      });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, cookieName };