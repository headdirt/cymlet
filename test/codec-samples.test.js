// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from "node:assert/strict";
import test from "node:test";

import { BROWSER_EXTENSIONS, COMPATIBILITY_EXTENSIONS, FILE_ACCEPT_TYPES, SUPPORTED_AUDIO_EXTENSIONS } from "../src/constants.js";
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

test("browser and compatibility extension sets are disjoint", () => {
  const overlap = BROWSER_EXTENSIONS.filter((ext) => COMPATIBILITY_EXTENSIONS.includes(ext));
  assert.deepEqual(overlap, [], `extensions present in both lists: ${overlap.join(", ")}`);
  for (const ext of [...BROWSER_EXTENSIONS, ...COMPATIBILITY_EXTENSIONS]) {
    assert.ok(SUPPORTED_AUDIO_EXTENSIONS.includes(ext), `${ext} missing from SUPPORTED_AUDIO_EXTENSIONS`);
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
