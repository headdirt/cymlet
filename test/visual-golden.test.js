// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { analyzeSamples } from "../src/dsp.js";
import { createSweepFixture } from "../src/fixtures.js";
import { makePalette } from "../src/palette.js";
import { spectrogramImageData } from "../src/spectrogram-image.js";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("generated sweep spectrogram bitmap stays visually stable", () => {
  const fixture = createSweepFixture({ sampleRate: 8192, seconds: 1, channels: 1 });
  const analysis = analyzeSamples({
    samples: fixture.channelData[0],
    fftSize: 512,
    columns: 96,
    windowFunction: "hann",
  });
  const pixels = spectrogramImageData({
    matrix: analysis.matrix,
    columns: analysis.columns,
    bands: analysis.bands,
    minDb: -120,
    maxDb: 0,
    palette: makePalette("sox"),
  });

  assert.equal(sha256(pixels), "d9ede7d368bef071d19e9a1d42a86e1f53b6a558d97706703c7507ed274403e7");
});
