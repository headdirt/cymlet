// SPDX-License-Identifier: AGPL-3.0-or-later
let pooledBuffer = null;

export function spectrogramImageData({ matrix, columns, bands, minDb, maxDb, palette }) {
  const length = columns * bands * 4;
  const data = pooledBuffer && pooledBuffer.length === length ? pooledBuffer : new Uint8ClampedArray(length);
  pooledBuffer = data;
  const lastColor = palette.length / 4 - 1;
  const range = maxDb - minDb;

  for (let row = 0; row < bands; row++) {
    const band = bands - row - 1;
    const rowOffset = row * columns * 4;
    for (let x = 0; x < columns; x++) {
      const db = matrix[x * bands + band];
      const level = db <= minDb ? 0 : db >= maxDb ? 1 : (db - minDb) / range;
      const colorIndex = Math.round(level * lastColor) * 4;
      const i = rowOffset + x * 4;
      data[i] = palette[colorIndex];
      data[i + 1] = palette[colorIndex + 1];
      data[i + 2] = palette[colorIndex + 2];
      data[i + 3] = palette[colorIndex + 3];
    }
  }

  return data;
}
