// SPDX-License-Identifier: AGPL-3.0-or-later
import { FREQUENCY_TICK_FACTORS, PLOT_PADS, TIME_TICK_FACTORS } from "./constants.js";
import { formatTimeMmSs } from "./format.js";
import { spectrogramImageData } from "./spectrogram-image.js";

let bitmapCanvas = null;
let paletteImageCache = null;

export function spectrogramPlot(width, height) {
  return {
    x: PLOT_PADS.left,
    y: PLOT_PADS.top,
    width: Math.max(1, width - PLOT_PADS.left - PLOT_PADS.right),
    height: Math.max(1, height - PLOT_PADS.top - PLOT_PADS.bottom),
  };
}

export function drawSpectrogram(ctx, options) {
  const {
    width,
    height,
    matrix,
    columns,
    bands,
    sampleRate,
    frequencyMax = sampleRate / 2,
    duration,
    minDb,
    maxDb,
    palette,
    fileName,
    meta,
    bitmap: bitmapOverride,
  } = options;

  const plot = spectrogramPlot(width, height);
  const plotW = plot.width;
  const plotH = plot.height;
  const bitmap = bitmapOverride || renderSpectrogramBitmap({ matrix, columns, bands, minDb, maxDb, palette });

  ctx.fillStyle = "#020306";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(bitmap, plot.x, plot.y, plotW, plotH);

  ctx.strokeStyle = "#f4f6fb";
  ctx.lineWidth = 1;
  ctx.strokeRect(plot.x, plot.y, plotW, plotH);

  drawText(ctx, trimMiddle(ctx, fileName, plotW), plot.x, plot.y - 40, 18, "#f4f6fb", "700");
  drawText(ctx, trimEnd(ctx, meta, plotW), plot.x, plot.y - 18, 13, "#aab3c6", "400");

  drawTimeRuler(ctx, duration, plot.x, plot.y + plotH, plotW);
  drawFrequencyRuler(ctx, frequencyMax, plot.x, plot.y, plotH);
  drawPalette(ctx, width - PLOT_PADS.right + PLOT_PADS.gap, plot.y, PLOT_PADS.ruler, plotH, minDb, maxDb, palette);
}

function drawTimeRuler(ctx, duration, x, y, width) {
  beginTickPainting(ctx);
  const factor = chooseFactor(TIME_TICK_FACTORS, width / Math.max(1, duration), 64);
  drawTick(ctx, x, y, "0:00", "bottom");
  drawTick(ctx, x + width, y, formatTimeMmSs(duration), "bottom");
  if (!factor) return;
  for (let t = factor; t < duration; t += factor) {
    const px = x + (t / duration) * width;
    if (width - (px - x) < 42) break;
    drawTick(ctx, px, y, formatTimeMmSs(t), "bottom");
  }
}

function drawFrequencyRuler(ctx, maxFreq, x, y, height) {
  beginTickPainting(ctx);
  const factor = chooseFactor(FREQUENCY_TICK_FACTORS, height / Math.max(1, maxFreq), 38);
  drawTick(ctx, x, y + height, "0 kHz", "left");
  drawTick(ctx, x, y, formatFrequencyTick(maxFreq), "left");
  if (!factor) return;
  for (let f = factor; f < maxFreq; f += factor) {
    const py = y + height - (f / maxFreq) * height;
    if (py - y < 20) break;
    drawTick(ctx, x, py, formatFrequencyTick(f), "left");
  }
}

function formatFrequencyTick(frequency) {
  if (frequency < 1000) return `${Math.round(frequency)} Hz`;
  return `${Math.round(frequency / 1000)} kHz`;
}

function drawPalette(ctx, x, y, width, height, minDb, maxDb, palette) {
  const imageData = cachedPaletteImageData(width, height, palette);
  ctx.putImageData(imageData, x, y);
  ctx.strokeStyle = "#f4f6fb";
  ctx.strokeRect(x, y, width, height);
  beginTickPainting(ctx);
  for (const value of niceDbTicks(minDb, maxDb)) {
    const py = y + height - ((value - minDb) / (maxDb - minDb)) * height;
    drawTick(ctx, x + width, py, `${value} dB`, "right");
  }
}

function renderSpectrogramBitmap({ matrix, columns, bands, minDb, maxDb, palette }) {
  const imageData = new ImageData(spectrogramImageData({ matrix, columns, bands, minDb, maxDb, palette }), columns, bands);
  const bitmap = getBitmapCanvas(columns, bands);
  bitmap.getContext("2d").putImageData(imageData, 0, 0);
  return bitmap;
}

function cachedPaletteImageData(width, height, palette) {
  if (
    paletteImageCache &&
    paletteImageCache.width === width &&
    paletteImageCache.height === height &&
    paletteImageCache.palette === palette
  ) {
    return paletteImageCache.imageData;
  }

  const imageData = new ImageData(width, height);
  const lastColor = palette.length / 4 - 1;
  for (let row = 0; row < height; row++) {
    const level = 1 - row / Math.max(1, height - 1);
    const colorIndex = Math.round(level * lastColor) * 4;
    for (let col = 0; col < width; col++) {
      const i = (row * width + col) * 4;
      imageData.data[i] = palette[colorIndex];
      imageData.data[i + 1] = palette[colorIndex + 1];
      imageData.data[i + 2] = palette[colorIndex + 2];
      imageData.data[i + 3] = palette[colorIndex + 3];
    }
  }
  paletteImageCache = { width, height, palette, imageData };
  return imageData;
}

function getBitmapCanvas(width, height) {
  if (!bitmapCanvas) {
    bitmapCanvas = typeof OffscreenCanvas === "function"
      ? new OffscreenCanvas(width, height)
      : document.createElement("canvas");
  }
  if (bitmapCanvas.width !== width) bitmapCanvas.width = width;
  if (bitmapCanvas.height !== height) bitmapCanvas.height = height;
  return bitmapCanvas;
}

function beginTickPainting(ctx) {
  ctx.strokeStyle = "#f4f6fb";
  ctx.fillStyle = "#d9deea";
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.textBaseline = "middle";
}

function drawTick(ctx, x, y, label, side) {
  if (side === "bottom") {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + 5);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillText(label, x, y + 18);
  } else if (side === "left") {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 5, y);
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(label, x - 10, y);
  } else {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 5, y);
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillText(label, x + 10, y);
  }
}

function chooseFactor(factors, scale, labelSize) {
  return factors.find((factor) => Math.abs(scale * factor) >= labelSize) || 0;
}

function niceDbTicks(minDb, maxDb) {
  const span = maxDb - minDb;
  const step = span > 80 ? 20 : span > 40 ? 10 : 5;
  const ticks = [maxDb];
  const firstStep = Math.floor(maxDb / step) * step;
  for (let v = firstStep; v > minDb; v -= step) {
    if (v < maxDb) ticks.push(v);
  }
  ticks.push(minDb);
  return ticks;
}

function drawText(ctx, text, x, y, size, color, weight) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, x, y);
}

function trimToWidth(ctx, text, maxWidth, build) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (ctx.measureText(build(text, mid)).width <= maxWidth) lo = mid;
    else hi = mid;
  }
  return build(text, lo);
}

function trimEnd(ctx, text, maxWidth) {
  return trimToWidth(ctx, text, maxWidth, (s, n) => `${s.slice(0, n)}...`);
}

function trimMiddle(ctx, text, maxWidth) {
  return trimToWidth(ctx, text, maxWidth, (s, n) => `...${s.slice(s.length - n)}`);
}
