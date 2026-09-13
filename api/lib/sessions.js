"use strict";

const crypto = require("crypto");
const { pool } = require("../db");

const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

function generateToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// ---------------------------------------------------------------------------
// TTL (dikonfigurasi via environment)
// ---------------------------------------------------------------------------

function ttlMs() {
  const v = Number(process.env.SESSION_TTL_HOURS);
  if (Number.isFinite(v) && v > 0) return Math.round(v * 60 * 60 * 1000);
  return DEFAULT_TTL_MS;
}

// ---------------------------------------------------------------------------
// Create session
// ---------------------------------------------------------------------------

async function createSession(userId, { ip = null, userAgent = null } = {}) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + ttlMs());

  await pool.query(
    `INSERT INTO public.sessions (user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, hashToken(token), expiresAt, ip || null, (userAgent || "").slice(0, 500)]
  );

  return { token, expiresAt };
}

// ---------------------------------------------------------------------------
// Validate session (by raw token → hash lookup + expiry + is_active check)
// ---------------------------------------------------------------------------

async function findValidSessionByToken(token) {
  if (!token) return null;

  const { rows } = await pool.query(
    `SELECT
        s.id AS session_id,
        s.user_id,
        s.expires_at,
        u.username,
        u.is_active,
        u.profile_id,
        p.nama,
        p.role
       FROM public.sessions s
       JOIN public.user_accounts u ON u.id = s.user_id
       JOIN public.profiles     p ON p.id = u.profile_id
      WHERE s.token_hash = $1`,
    [hashToken(token)]
  );

  const row = rows[0];
  if (!row) return null;

  // Sesi kedaluwarsa → hapus & anggap tidak valid.
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await pool.query("DELETE FROM public.sessions WHERE id = $1", [row.session_id]).catch(() => {});
    return null;
  }

  // Akun dinonaktifkan → hapus sesi & anggap tidak valid.
  if (!row.is_active) {
    await pool.query("DELETE FROM public.sessions WHERE id = $1", [row.session_id]).catch(() => {});
    return null;
  }

  return {
    sessionId: Number(row.session_id),
    user: {
      id: Number(row.user_id),
      username: row.username,
      name: row.nama,
      role: row.role,
      profileId: row.profile_id,
    },
    expiresAt: row.expires_at,
  };
}

// ---------------------------------------------------------------------------
// Touch last_seen (opportunistic, throttle 10 menit)
// ---------------------------------------------------------------------------

async function touchLastSeen(sessionId) {
  if (!sessionId) return;
  try {
    await pool.query(
      `UPDATE public.sessions
          SET last_seen_at = now()
        WHERE id = $1
          AND (last_seen_at IS NULL
               OR last_seen_at < now() - interval '10 minutes')`,
      [sessionId]
    );
  } catch {
    /* swallow – non-critical */
  }
}

// ---------------------------------------------------------------------------
// Delete single session by raw token
// ---------------------------------------------------------------------------

async function deleteSessionByToken(token) {
  if (!token) return;
  try {
    await pool.query("DELETE FROM public.sessions WHERE token_hash = $1", [hashToken(token)]);
  } catch {
    /* swallow */
  }
}

// ---------------------------------------------------------------------------
// Cleanup expired sessions (opportunistic)
// ---------------------------------------------------------------------------

async function cleanupExpiredSessions() {
  try {
    await pool.query("DELETE FROM public.sessions WHERE expires_at <= now()");
  } catch {
    /* swallow */
  }
}

module.exports = {
  generateToken,
  hashToken,
  createSession,
  findValidSessionByToken,
  touchLastSeen,
  deleteSessionByToken,
  cleanupExpiredSessions,
};