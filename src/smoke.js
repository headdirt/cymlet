// SPDX-License-Identifier: AGPL-3.0-or-later
export function canvasHasSignal(canvas, { minColoredPixels = 24, minBrightness = 24 } = {}) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return false;

  const { width, height } = canvas;
  const stepX = Math.max(1, Math.floor(width / 80));
  const stepY = Math.max(1, Math.floor(height / 50));
  let colored = 0;

  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const pixel = context.getImageData(x, y, 1, 1).data;
      if (pixel[0] + pixel[1] + pixel[2] > minBrightness) {
        colored++;
        if (colored >= minColoredPixels) return true;
      }
    }
  }

  return false;
}

export async function waitForCondition(predicate, { timeoutMs = 5000, intervalMs = 50 } = {}) {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}
