// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from "node:assert/strict";
import { access, stat } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { CODEC_SAMPLES } from "./codec-samples.js";

const fixtureDir = new URL("./fixtures/codec-samples", import.meta.url).pathname;

test("downloaded codec fixtures are present when fixture directory is populated", async (t) => {
  try {
    await access(join(fixtureDir, CODEC_SAMPLES[0].name));
  } catch {
    t.skip("codec fixtures have not been downloaded; run node scripts/download-codec-samples.mjs");
    return;
  }

  for (const sample of CODEC_SAMPLES) {
    const info = await stat(join(fixtureDir, sample.name));
    assert.ok(info.size > 0, sample.name);
  }
});
