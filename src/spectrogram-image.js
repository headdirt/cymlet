// SPDX-License-Identifier: AGPL-3.0-or-later
export function spectrogramImageData({ matrix, columns, bands, minDb, maxDb, palette }) {
  const data = new Uint8ClampedArray(columns * bands * 4);
  const range = maxDb - minDb;

  for (let x = 0; x < columns; x++) {
    for (let y = 0; y < bands; y++) {
      const db = matrix[x * bands + y];
      const level = Math.max(0, Math.min(1, (db - minDb) / range));
      const colorIndex = Math.round(level * (palette.length / 3 - 1)) * 3;
      const row = bands - y - 1;
      const i = (row * columns + x) * 4;
      data[i] = palette[colorIndex];
      data[i + 1] = palette[colorIndex + 1];
      data[i + 2] = palette[colorIndex + 2];
      data[i + 3] = 255;
    }
  }

  return data;
}
