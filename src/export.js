// SPDX-License-Identifier: AGPL-3.0-or-later
export function exportFileName(fileName) {
  const clean = (fileName || "spectrogram").replace(/[\\/:"*?<>|]+/g, "-").trim();
  const base = clean.replace(/\.[^.]+$/, "") || "spectrogram";
  return `${base}-spectrogram.png`;
}

export function downloadCanvasPng(canvas, fileName, documentRef = globalThis.document) {
  const link = documentRef.createElement("a");
  link.download = exportFileName(fileName);
  link.href = canvas.toDataURL("image/png");
  link.click();
}
