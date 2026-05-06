// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from "node:assert/strict";
import test from "node:test";

import { capColumnsForMatrixBudget, decodedByteSize, matrixByteSize } from "../src/memory.js";

test("decoded byte size estimates float32 channel storage", () => {
  assert.equal(decodedByteSize({ length: 1000, channelCount: 2 }), 8000);
});

test("matrix byte size estimates column-major dB storage", () => {
  assert.equal(matrixByteSize(100, 513), 100 * 513 * 4);
});

test("column cap respects matrix byte budget", () => {
  assert.equal(capColumnsForMatrixBudget(1000, 1024, 1000 * 513 * 4), 1000);
  assert.equal(capColumnsForMatrixBudget(1000, 1024, 100 * 513 * 4), 100);
  assert.equal(capColumnsForMatrixBudget(1000, 16384, 8193 * 4), 1);
});
