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

export function fileExtensionIs(file, extension) {
  return String(file?.name || "").toLowerCase().endsWith(`.${extension}`);
}

export function readAscii(view, offset, length) {
  let text = "";
  for (let i = 0; i < length; i++) {
    text += String.fromCharCode(view.getUint8(offset + i));
  }
  return text;
}

export function writeAscii(view, offset, text) {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}
