// SPDX-License-Identifier: AGPL-3.0-or-later
export const MATRIX_BYTE_BUDGET = 96 * 1024 * 1024;

export function decodedByteSize(decodedAudio) {
  return decodedAudio.length * decodedAudio.channelCount * Float32Array.BYTES_PER_ELEMENT;
}

export function matrixByteSize(columns, bands) {
  return columns * bands * Float32Array.BYTES_PER_ELEMENT;
}

export function capColumnsForMatrixBudget(columns, fftSize, budget = MATRIX_BYTE_BUDGET) {
  const bands = fftSize / 2 + 1;
  const capped = Math.floor(budget / (bands * Float32Array.BYTES_PER_ELEMENT));
  return Math.max(1, Math.min(columns, capped));
}
