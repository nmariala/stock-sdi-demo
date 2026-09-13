"use strict";

const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DATABASE_HOST || "127.0.0.1",
  port: Number(process.env.DATABASE_PORT) || 5432,
  database: process.env.DATABASE_NAME || "stock_sdi_demo",
  user: process.env.DATABASE_USER || "stock_sdi_demo_user",
  password: process.env.DATABASE_PASSWORD || "",
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: Number(process.env.DATABASE_CONNECT_TIMEOUT) || 5000,
});

// Cek ringan apakah database bisa dijangkau (dipakai endpoint /api/health).
async function checkConnection() {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
  } finally {
    client.release();
  }
}

module.exports = { pool, checkConnection };