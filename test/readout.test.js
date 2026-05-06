// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from "node:assert/strict";
import test from "node:test";

import { formatReadout, spectrogramReadoutAtPoint } from "../src/readout.js";

const plot = { x: 10, y: 20, width: 100, height: 50 };

test("readout maps canvas point to column, band, time, frequency, and dB", () => {
  const matrix = new Float32Array([
    -100, -90, -80,
    -70, -60, -50,
    -40, -30, -20,
    -10, -5, 0,
  ]);
  const readout = spectrogramReadoutAtPoint({
    x: 60,
    y: 30,
    plot,
    matrix,
    columns: 4,
    bands: 3,
    duration: 6,
    sampleRate: 48000,
  });

  assert.equal(readout.column, 2);
  assert.equal(readout.band, 2);
  assert.equal(readout.time, 4);
  assert.equal(readout.frequency, 24000);
  assert.equal(readout.db, -20);
});

test("readout can use an explicit display frequency range", () => {
  const readout = spectrogramReadoutAtPoint({
    x: 60,
    y: 30,
    plot,
    matrix: new Float32Array([
      -100, -90, -80,
      -70, -60, -50,
      -40, -30, -20,
      -10, -5, 0,
    ]),
    columns: 4,
    bands: 3,
    duration: 6,
    sampleRate: 48000,
    frequencyMax: 22050,
  });

  assert.equal(readout.frequency, 22050);
});

test("readout returns null outside the plot", () => {
  assert.equal(spectrogramReadoutAtPoint({
    x: 2,
    y: 30,
    plot,
    matrix: new Float32Array(4),
    columns: 2,
    bands: 2,
    duration: 1,
    sampleRate: 44100,
  }), null);
});

test("readout formatting is compact", () => {
  assert.equal(formatReadout({ time: 65.25, frequency: 12345, db: -42.125 }), "1:05.25 · 12.35 kHz · -42.1 dB");
});
