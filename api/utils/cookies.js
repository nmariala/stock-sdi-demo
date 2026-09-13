"use strict";

function readCookie(req, name) {
  const header = req.headers.cookie || "";
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() !== name) continue;
    return part.slice(idx + 1).trim();
  }
  return null;
}

module.exports = { readCookie };