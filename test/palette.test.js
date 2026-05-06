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

test("palette table contains RGB triples", () => {
  const palette = makePalette("sox", 8);
  assert.ok(palette instanceof Uint8ClampedArray);
  assert.equal(palette.length, 24);
  for (const channel of palette) {
    assert.ok(Number.isInteger(channel));
    assert.ok(channel >= 0 && channel <= 255);
  }
});
