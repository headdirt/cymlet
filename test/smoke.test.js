// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from "node:assert/strict";
import test from "node:test";

import { waitForCondition } from "../src/smoke.js";

test("waitForCondition resolves true when predicate succeeds", async () => {
  let attempts = 0;
  const result = await waitForCondition(() => ++attempts >= 2, { timeoutMs: 100, intervalMs: 1 });
  assert.equal(result, true);
  assert.equal(attempts, 2);
});

test("waitForCondition resolves false on timeout", async () => {
  const result = await waitForCondition(() => false, { timeoutMs: 5, intervalMs: 1 });
  assert.equal(result, false);
});
