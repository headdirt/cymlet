// SPDX-License-Identifier: AGPL-3.0-or-later
export function sanitizeFileName(name, { fallback = "", replacement = "-" } = {}) {
  return String(name || fallback).replace(/[\\/:"*?<>|]+/g, replacement).trim() || fallback;
}

export function stripFileExtension(name) {
  return String(name).replace(/\.[^.]+$/, "");
}

export function safePathSegment(name, replacement = "") {
  return String(name || "").replace(/[^a-z0-9._-]+/gi, replacement);
}
