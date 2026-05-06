// SPDX-License-Identifier: AGPL-3.0-or-later
import { spectrogramImageData } from "./spectrogram-image.js";

let matrix = null;
let columns = 0;
let bands = 0;
let matrixVersion = 0;
let bitmapCanvas = null;

self.onmessage = (event) => {
  const message = event.data;
  if (message.type === "set-matrix") {
    matrix = new Float32Array(message.matrix);
    columns = message.columns;
    bands = message.bands;
    matrixVersion = message.version;
    return;
  }

  if (message.type !== "render" || !matrix) return;
  const pixels = spectrogramImageData({
    matrix,
    columns,
    bands,
    minDb: message.minDb,
    maxDb: message.maxDb,
    palette: new Uint8ClampedArray(message.palette),
  });
  const canvas = getBitmapCanvas(columns, bands);
  const ctx = canvas.getContext("2d");
  ctx.putImageData(new ImageData(pixels, columns, bands), 0, 0);
  const bitmap = canvas.transferToImageBitmap();
  self.postMessage({
    type: "bitmap",
    id: message.id,
    key: message.key,
    version: matrixVersion,
    bitmap,
  }, [bitmap]);
};

function getBitmapCanvas(width, height) {
  if (!bitmapCanvas) bitmapCanvas = new OffscreenCanvas(width, height);
  if (bitmapCanvas.width !== width) bitmapCanvas.width = width;
  if (bitmapCanvas.height !== height) bitmapCanvas.height = height;
  return bitmapCanvas;
}
