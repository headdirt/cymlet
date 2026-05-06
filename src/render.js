// SPDX-License-Identifier: AGPL-3.0-or-later
import { FREQUENCY_TICK_FACTORS, PLOT_PADS, TIME_TICK_FACTORS } from "./constants.js";
import { formatTimeMmSs } from "./format.js";
import { spectrogramImageData } from "./spectrogram-image.js";

let bitmapCanvas = null;

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
  } = options;

  const plot = spectrogramPlot(width, height);
  const plotW = plot.width;
  const plotH = plot.height;
  const imageData = new ImageData(spectrogramImageData({ matrix, columns, bands, minDb, maxDb, palette }), columns, bands);

  const bitmap = getBitmapCanvas(columns, bands);
  const bitmapCtx = bitmap.getContext("2d");
  bitmapCtx.putImageData(imageData, 0, 0);

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
  const khz = frequency / 1000;
  return `${Number.isInteger(khz) ? khz : khz.toFixed(2)} kHz`;
}

function drawPalette(ctx, x, y, width, height, minDb, maxDb, palette) {
  const imageData = new ImageData(width, height);
  for (let row = 0; row < height; row++) {
    const level = 1 - row / Math.max(1, height - 1);
    const colorIndex = Math.round(level * (palette.length / 3 - 1)) * 3;
    for (let col = 0; col < width; col++) {
      const i = (row * width + col) * 4;
      imageData.data[i] = palette[colorIndex];
      imageData.data[i + 1] = palette[colorIndex + 1];
      imageData.data[i + 2] = palette[colorIndex + 2];
      imageData.data[i + 3] = 255;
    }
  }
  ctx.putImageData(imageData, x, y);
  ctx.strokeStyle = "#f4f6fb";
  ctx.strokeRect(x, y, width, height);
  const values = niceDbTicks(minDb, maxDb);
  for (const value of values) {
    const py = y + height - ((value - minDb) / (maxDb - minDb)) * height;
    drawTick(ctx, x + width, py, `${value} dB`, "right");
  }
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

function drawTick(ctx, x, y, label, side) {
  ctx.strokeStyle = "#f4f6fb";
  ctx.fillStyle = "#d9deea";
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.textBaseline = "middle";
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
  const ticks = [maxDb, minDb];
  const span = maxDb - minDb;
  const step = span > 80 ? 20 : span > 40 ? 10 : 5;
  for (let v = Math.ceil(minDb / step) * step; v < maxDb; v += step) {
    if (v !== minDb && v !== maxDb) ticks.push(v);
  }
  return ticks.sort((a, b) => b - a);
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
