"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");

const { pool } = require("./db");
const errorHandler = require("./middleware/errorHandler");
const health = require("./routes/health");
const barang = require("./routes/barang");
const stock = require("./routes/stock");
const transaksi = require("./routes/transaksi");

const app = express();
app.disable("x-powered-by");

app.use(express.json({ limit: "100kb" }));
app.use(
  cors({
    origin: process.env.API_CORS_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use("/api/health", health);
app.use("/api/barang", barang);
app.use("/api/stock", stock);
app.use("/api/transaksi", transaksi);

// 404 untuk endpoint yang tidak dikenal (format error konsisten).
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `Endpoint ${req.method} ${req.path} tidak ditemukan`,
    },
  });
});

app.use(errorHandler);

const port = Number(process.env.PORT) || 3101;

// Bind khusus loopback: API tidak diekspos ke interface LAN/internet.
const server = app.listen(port, "127.0.0.1", () => {
  console.log(`[api] listening on http://127.0.0.1:${port}`);
});

// Shutdown yang bersih (SIGINT/SIGTERM).
function shutdown(signal) {
  console.log(`[api] received ${signal}, shutting down...`);
  server.close(() => {
    pool.end(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

module.exports = app;