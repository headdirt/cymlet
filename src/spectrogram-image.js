// SPDX-License-Identifier: AGPL-3.0-or-later
const rgbaPaletteCache = new WeakMap();

export function spectrogramImageData({ matrix, columns, bands, minDb, maxDb, palette }) {
  const data = new Uint8ClampedArray(columns * bands * 4);
  const rgbaPalette = paletteRgba(palette);
  const range = maxDb - minDb;

  for (let x = 0; x < columns; x++) {
    for (let y = 0; y < bands; y++) {
      const db = matrix[x * bands + y];
      const level = Math.max(0, Math.min(1, (db - minDb) / range));
      const colorIndex = Math.round(level * (rgbaPalette.length / 4 - 1)) * 4;
      const row = bands - y - 1;
      const i = (row * columns + x) * 4;
      data[i] = rgbaPalette[colorIndex];
      data[i + 1] = rgbaPalette[colorIndex + 1];
      data[i + 2] = rgbaPalette[colorIndex + 2];
      data[i + 3] = rgbaPalette[colorIndex + 3];
    }
  }

  return data;
}

function paletteRgba(palette) {
  const cached = rgbaPaletteCache.get(palette);
  if (cached) return cached;
  const rgba = new Uint8ClampedArray((palette.length / 3) * 4);
  for (let rgb = 0, out = 0; rgb < palette.length; rgb += 3, out += 4) {
    rgba[out] = palette[rgb];
    rgba[out + 1] = palette[rgb + 1];
    rgba[out + 2] = palette[rgb + 2];
    rgba[out + 3] = 255;
  }
  rgbaPaletteCache.set(palette, rgba);
  return rgba;
}
