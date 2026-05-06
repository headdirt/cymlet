// SPDX-License-Identifier: AGPL-3.0-or-later
import { sanitizeFileName, stripFileExtension } from "./file-utils.js";

export function exportFileName(fileName) {
  const clean = sanitizeFileName(fileName, { fallback: "spectrogram" });
  const base = stripFileExtension(clean) || "spectrogram";
  return `${base}-spectrogram.png`;
}

export function downloadCanvasPng(canvas, fileName, documentRef = globalThis.document) {
  const link = documentRef.createElement("a");
  link.download = exportFileName(fileName);
  link.href = canvas.toDataURL("image/png");
  link.click();
}
