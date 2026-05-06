// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from "node:assert/strict";
import test from "node:test";

import { RealFft, SILENCE_DB, analyzeSamples, createWindow, fftToDb, planIntervals } from "../src/dsp.js";

const EPSILON = 1e-6;

test("Hann window has analysis-friendly endpoints", () => {
  const window = createWindow("hann", 8);
  assert.equal(window[0], 0);
  assert.equal(window[7], 0);
  assert.ok(window[3] > 0.9);
  assert.ok(window[4] > 0.9);
});

test("Hamming and Blackman-Harris use standard coefficients", () => {
  const hamming = createWindow("hamming", 8);
  assert.ok(Math.abs(hamming[0] - 0.07672) < EPSILON);

  const blackmanHarris = createWindow("blackmanHarris", 8);
  assert.ok(Math.abs(blackmanHarris[0] - 0.00006) < EPSILON);
});

test("FFT reports DC at 0 dB for constant full-scale input", () => {
  const n = 1024;
  const fft = new RealFft(n);
  const input = new Float64Array(n).fill(1);
  const db = fftToDb(fft.forward(input), n);

  assert.ok(Math.abs(db[0]) < EPSILON);
  for (let i = 1; i < db.length; i++) {
    assert.equal(db[i], SILENCE_DB);
  }
});

test("FFT reports a sine peak at the expected bin", () => {
  const n = 1024;
  const bin = 16;
  const fft = new RealFft(n);
  const input = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    input[i] = Math.sin((2 * Math.PI * bin * i) / n);
  }

  const db = fftToDb(fft.forward(input), n);
  assert.ok(Math.abs(db[bin] - -6.020599913279624) < 1e-9);
  for (let i = 0; i < db.length; i++) {
    if (i !== bin) assert.ok(db[i] < -190);
  }
});

test("analysis returns a column-major dB matrix and progress reaches one", () => {
  const sampleRate = 8192;
  const seconds = 1;
  const samples = new Float32Array(sampleRate * seconds);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.sin((2 * Math.PI * 512 * i) / sampleRate);
  }

  const progress = [];
  const result = analyzeSamples({
    samples,
    fftSize: 1024,
    columns: 32,
    windowFunction: "hann",
    onProgress: (value) => progress.push(value),
  });

  assert.equal(result.columns, 32);
  assert.equal(result.bands, 513);
  assert.equal(result.matrix.length, 32 * 513);
  assert.equal(progress.at(-1), 1);

  const firstColumn = result.matrix.slice(0, result.bands);
  let peakBin = 0;
  for (let i = 1; i < firstColumn.length; i++) {
    if (firstColumn[i] > firstColumn[peakBin]) peakBin = i;
  }
  assert.equal(peakBin, 64);
});

test("interval planner spreads remainder frames across columns", () => {
  assert.deepEqual(planIntervals(10, 3), [
    { start: 0, end: 3 },
    { start: 3, end: 6 },
    { start: 6, end: 10 },
  ]);
  assert.deepEqual(planIntervals(11, 4), [
    { start: 0, end: 2 },
    { start: 2, end: 5 },
    { start: 5, end: 8 },
    { start: 8, end: 11 },
  ]);
});

test("interval planner handles more columns than frames without overlap", () => {
  assert.deepEqual(planIntervals(3, 5), [
    { start: 0, end: 1 },
    { start: 1, end: 2 },
    { start: 2, end: 3 },
    { start: 3, end: 3 },
    { start: 3, end: 3 },
  ]);
});
