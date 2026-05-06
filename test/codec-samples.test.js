// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from "node:assert/strict";
import test from "node:test";

import { COMPATIBILITY_EXTENSIONS, FILE_ACCEPT_TYPES } from "../src/constants.js";
import { shouldOfferCompatibilityDecoder } from "../src/decoders/index.js";
import { CODEC_SAMPLES, codecSampleUrl, codecSamplesByMode, codecSamplesForReleaseBrowserSuite } from "./codec-samples.js";

test("codec sample manifest has browser and compatibility coverage", () => {
  assert.ok(codecSamplesByMode("browser").length >= 6);
  assert.ok(codecSamplesByMode("compatibility").length >= 6);
});

test("codec sample URLs point at upstream raw fixtures", () => {
  assert.equal(
    codecSampleUrl("2ch-44100Hz-16bps.wav"),
    "https://raw.githubusercontent.com/alexkay/spek/master/tests/samples/2ch-44100Hz-16bps.wav"
  );
});

test("compatibility sample manifest aligns with decoder offer heuristic", () => {
  for (const sample of CODEC_SAMPLES) {
    if (sample.expectedMode === "compatibility") {
      assert.equal(shouldOfferCompatibilityDecoder(sample), true, sample.name);
    }
  }
});

test("file picker accepts advertised compatibility extensions without broad media wildcard", () => {
  assert.equal(FILE_ACCEPT_TYPES.includes("audio/*"), false);
  for (const extension of COMPATIBILITY_EXTENSIONS) {
    assert.equal(FILE_ACCEPT_TYPES.includes(`.${extension}`), true, extension);
  }
});

test("browser sample manifest keeps clear native formats off the compatibility path", () => {
  for (const sample of codecSamplesByMode("browser").filter((item) => /\.(wav|mp3|ogg)$/i.test(item.name))) {
    assert.equal(shouldOfferCompatibilityDecoder(sample), false, sample.name);
  }
});

test("release browser suite uses baseline native formats", () => {
  const samples = codecSamplesForReleaseBrowserSuite();
  assert.ok(samples.length >= 4);
  for (const sample of samples) {
    assert.match(sample.name, /\.(wav|mp3)$/i);
  }
});
