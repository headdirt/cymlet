// SPDX-License-Identifier: AGPL-3.0-or-later
export function spectrogramReadoutAtPoint({ x, y, plot, matrix, columns, bands, duration, sampleRate, frequencyMax = sampleRate / 2 }) {
  if (!matrix || !plot || x < plot.x || y < plot.y || x >= plot.x + plot.width || y >= plot.y + plot.height) {
    return null;
  }

  const column = Math.max(0, Math.min(columns - 1, Math.floor(((x - plot.x) / plot.width) * columns)));
  const rowFromTop = Math.max(0, Math.min(bands - 1, Math.floor(((y - plot.y) / plot.height) * bands)));
  const band = bands - rowFromTop - 1;
  const time = duration * (column / Math.max(1, columns - 1));
  const frequency = frequencyMax * (band / Math.max(1, bands - 1));
  const db = matrix[column * bands + band];

  return { column, band, time, frequency, db };
}

export function formatReadout(readout) {
  if (!readout) return "";
  return `${formatTime(readout.time)} · ${formatFrequency(readout.frequency)} · ${readout.db.toFixed(1)} dB`;
}

function formatTime(seconds) {
  const total = Math.max(0, seconds);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toFixed(2).padStart(5, "0")}`;
}

function formatFrequency(frequency) {
  if (frequency >= 1000) return `${(frequency / 1000).toFixed(2)} kHz`;
  return `${Math.round(frequency)} Hz`;
}
