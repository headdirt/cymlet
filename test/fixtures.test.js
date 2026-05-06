// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from "node:assert/strict";
import test from "node:test";

import { createSweepFixture, encodeWavPcm16 } from "../src/fixtures.js";

function ascii(view, offset, length) {
  return String.fromCharCode(...new Uint8Array(view.buffer, offset, length));
}

test("sweep fixture creates deterministic channel data", () => {
  const fixture = createSweepFixture({ sampleRate: 8000, seconds: 0.5, channels: 2 });
  assert.equal(fixture.sampleRate, 8000);
  assert.equal(fixture.length, 4000);
  assert.equal(fixture.channelData.length, 2);
  assert.equal(fixture.channelData[0].length, 4000);
  assert.notDeepEqual(fixture.channelData[0].slice(200, 208), fixture.channelData[1].slice(200, 208));
});

test("WAV fixture encoder writes a valid PCM header", () => {
  const fixture = createSweepFixture({ sampleRate: 8000, seconds: 0.25, channels: 2 });
  const buffer = encodeWavPcm16(fixture);
  const view = new DataView(buffer);

  assert.equal(ascii(view, 0, 4), "RIFF");
  assert.equal(ascii(view, 8, 4), "WAVE");
  assert.equal(ascii(view, 12, 4), "fmt ");
  assert.equal(view.getUint16(20, true), 1);
  assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(24, true), 8000);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(ascii(view, 36, 4), "data");
  assert.equal(view.getUint32(40, true), fixture.length * fixture.channels * 2);
  assert.equal(buffer.byteLength, 44 + fixture.length * fixture.channels * 2);
});
