"use strict";

// Error aplikasi yang membawa status HTTP + kode yang konsisten dengan
// format respons { error: { code, message } }.
class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    Error.captureStackTrace(this, AppError);
  }
}

function validationError(msg) {
  return new AppError(400, "VALIDATION_ERROR", msg);
}

function notFoundError(msg) {
  return new AppError(404, "NOT_FOUND", msg);
}

function duplicateError(msg) {
  return new AppError(409, "DUPLICATE_NAME", msg);
}

function unauthorizedError(msg) {
  return new AppError(401, "UNAUTHORIZED", msg);
}

function forbiddenError(msg) {
  return new AppError(403, "FORBIDDEN", msg);
}

function rateLimitError(msg) {
  return new AppError(429, "RATE_LIMITED", msg);
}

module.exports = {
  AppError,
  validationError,
  notFoundError,
  duplicateError,
  unauthorizedError,
  forbiddenError,
  rateLimitError,
};