// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from "node:assert/strict";
import test from "node:test";

import { makePalette, paletteColor } from "../src/palette.js";

test("mono palette maps endpoints to black and white", () => {
  assert.equal(paletteColor("mono", 0), 0x000000);
  assert.equal(paletteColor("mono", 1), 0xffffff);
});

test("SoX palette preserves endpoint behavior", () => {
  assert.equal(paletteColor("sox", 0), 0x000000);
  assert.equal(paletteColor("sox", 1), 0xffffff);
});

test("spectrum palette clamps out-of-range values", () => {
  assert.equal(paletteColor("spectrum", -1), paletteColor("spectrum", 0));
  assert.equal(paletteColor("spectrum", 2), paletteColor("spectrum", 1));
});

test("palette table contains RGBA quads with opaque alpha", () => {
  const palette = makePalette("sox", 8);
  assert.ok(palette instanceof Uint8ClampedArray);
  assert.equal(palette.length, 32);
  for (let i = 0; i < palette.length; i++) {
    assert.ok(Number.isInteger(palette[i]));
    assert.ok(palette[i] >= 0 && palette[i] <= 255);
    if (i % 4 === 3) assert.equal(palette[i], 255);
  }
});
