// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from "node:assert/strict";
import test from "node:test";

import { applyStoredControlSettings, loadStoredSettings, saveStoredSettings } from "../src/settings-store.js";

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return map.get(key) || null;
    },
    setItem(key, value) {
      map.set(key, value);
    },
  };
}

function fakeSelect(values) {
  return {
    options: values.map((value) => ({ value })),
    value: values[0],
  };
}

test("stored settings round-trip through storage", () => {
  const storage = memoryStorage();
  saveStoredSettings({ palette: "mono", fftSize: 4096 }, storage);
  assert.deepEqual(loadStoredSettings(storage), { palette: "mono", fftSize: 4096 });
});

test("invalid stored settings are ignored", () => {
  assert.deepEqual(loadStoredSettings(memoryStorage({ "cymlet-settings": "not-json" })), {});
});

test("stored settings apply only valid select values", () => {
  const els = {
    decoderModeSelect: fakeSelect(["browser", "ffmpeg"]),
    paletteSelect: fakeSelect(["sox", "mono"]),
    fftSizeSelect: fakeSelect(["2048", "4096"]),
    windowSelect: fakeSelect(["hann", "hamming"]),
    minDbInput: { value: "-120" },
    maxDbInput: { value: "0" },
  };

  applyStoredControlSettings(els, {
    decoderMode: "ffmpeg",
    palette: "mono",
    fftSize: 4096,
    windowFunction: "missing",
    minDb: -100,
    maxDb: -3,
  });

  assert.equal(els.decoderModeSelect.value, "ffmpeg");
  assert.equal(els.paletteSelect.value, "mono");
  assert.equal(els.fftSizeSelect.value, "4096");
  assert.equal(els.windowSelect.value, "hann");
  assert.equal(els.minDbInput.value, "-100");
  assert.equal(els.maxDbInput.value, "-3");
});
