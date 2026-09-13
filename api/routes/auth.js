"use strict";

const express = require("express");
const { pool } = require("../db");
const { trimOrNull } = require("../utils/validation");
const { validationError, unauthorizedError } = require("../utils/errors");
const { verifyPassword } = require("../lib/passwords");
const { createSession, cleanupExpiredSessions, deleteSessionByToken } = require("../lib/sessions");
const { requireAuth, cookieName } = require("../middleware/auth");
const { loginRateLimit, recordLoginFailure, recordLoginSuccess } = require("../middleware/rateLimit");
const { readCookie } = require("../utils/cookies");
const { findValidSessionByToken, touchLastSeen } = require("../lib/sessions");

const router = express.Router();

function sessionCookieName() {
  return cookieName();
}

function setSessionCookie(res, token, expiresAt) {
  const secure = String(process.env.COOKIE_SECURE || "") === "true";
  res.cookie(sessionCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: expiresAt,
    maxAge: expiresAt.getTime() - Date.now(),
  });
}

// ---------------------------------------------------------------------------
// POST /api/auth/login
// Body: { username, password }
// Returns: { data: { user: { id, username, name, role }, expires_at } }
// Sets: Set-Cookie: hl_stock_demo_session=...; HttpOnly; SameSite=Lax; Path=/
// ---------------------------------------------------------------------------

router.post("/login", loginRateLimit, async (req, res, next) => {
  try {
    const username = trimOrNull(req.body && req.body.username, 200);
    const password = req.body && req.body.password;

    if (!username) throw validationError("nama pengguna wajib diisi");
    if (!password) throw validationError("password wajib diisi");

    const ip = req.ip || "";

    // Lookup akun (case-insensitive) + join profiles untuk mendapatkan role.
    const { rows } = await pool.query(
      `SELECT
          u.id        AS user_id,
          u.username  AS username,
          u.password_hash,
          u.is_active,
          p.nama,
          p.role
         FROM public.user_accounts u
         JOIN public.profiles p ON p.id = u.profile_id
        WHERE lower(u.username) = lower($1)
        LIMIT 1`,
      [username]
    );

    const account = rows[0] || null;

    // Verifikasi password. Jika akun tidak ada, verifyPassword tetap
    // berjalan (hash palsu) agar timing ~identik (anti-enumerasi).
    const ok = await verifyPassword(
      String(password || ""),
      account ? account.password_hash : null
    );

    if (!account || !ok || !account.is_active) {
      recordLoginFailure(ip, username);
      throw unauthorizedError("Username atau password salah");
    }

    recordLoginSuccess(ip, username);

    // Update last_login_at (fire & forget).
    pool.query("UPDATE public.user_accounts SET last_login_at = now() WHERE id = $1", [account.user_id]).catch(() => {});

    // Opportunistic cleanup expired sessions.
    cleanupExpiredSessions().catch(() => {});

    const { token, expiresAt } = await createSession(account.user_id, {
      ip,
      userAgent: String(req.headers["user-agent"] || "").slice(0, 500),
    });

    setSessionCookie(res, token, expiresAt);

    res.status(200).json({
      data: {
        user: {
          id: Number(account.user_id),
          username: account.username,
          name: account.nama,
          role: account.role,
        },
        expires_at: expiresAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/auth/me
// 200: { data: { authenticated: true, user: { id, username, name, role }, expires_at } }
// 401: { error: { code: "UNAUTHORIZED", ... } }
// ---------------------------------------------------------------------------

router.get("/me", async (req, res, next) => {
  try {
    const token = readCookie(req, sessionCookieName());
    const session = await findValidSessionByToken(token);

    if (!session) {
      res.clearCookie(sessionCookieName(), { path: "/" });
      throw unauthorizedError("Belum login atau sesi berakhir");
    }

    touchLastSeen(session.sessionId).catch(() => {});

    res.json({
      data: {
        authenticated: true,
        user: {
          id: session.user.id,
          username: session.user.username,
          name: session.user.name,
          role: session.user.role,
        },
        expires_at: session.expiresAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// Logout idempoten: hapus sesi (jika ada) + clear cookie.
// Bisa dipanggil meskipun tidak ada sesi aktif (idempoten).
// ---------------------------------------------------------------------------

router.post("/logout", async (req, res, next) => {
  try {
    const token = readCookie(req, sessionCookieName());
    if (token) {
      await deleteSessionByToken(token);
    }
    res.clearCookie(sessionCookieName(), { path: "/" });
    res.json({ data: { ok: true } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;