// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from "node:assert/strict";
import test from "node:test";

import { createSweepFixture, encodeWavPcm16 } from "../src/fixtures.js";
import {
  sniffFlacSampleRate,
  sniffMp3SampleRate,
  sniffOggVorbisSampleRate,
  sniffSourceSampleRate,
  sniffWavSampleRate,
} from "../src/decoders/sample-rate-sniffer.js";

test("WAV sniffer reads sample rate from RIFF fmt chunk", () => {
  const wav = encodeWavPcm16(createSweepFixture({ sampleRate: 44100, seconds: 0.1, channels: 2 }));
  assert.equal(sniffWavSampleRate(wav), 44100);
  assert.equal(sniffSourceSampleRate(wav), 44100);
});

test("WAV sniffer ignores non-WAV bytes", () => {
  assert.equal(sniffWavSampleRate(new Uint8Array([1, 2, 3, 4]).buffer), null);
});

test("MP3 sniffer reads MPEG version 1 sample rate", () => {
  const frame = new Uint8Array([0xff, 0xfb, 0x90, 0x64]);
  assert.equal(sniffMp3SampleRate(frame.buffer), 44100);
  assert.equal(sniffSourceSampleRate(frame.buffer), 44100);
});

test("MP3 sniffer skips ID3v2 tag", () => {
  const bytes = new Uint8Array([
    0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03,
    0x00, 0x00, 0x00,
    0xff, 0xf3, 0x94, 0x64,
  ]);
  assert.equal(sniffMp3SampleRate(bytes.buffer), 24000);
});

test("MP3 sniffer rejects invalid frame headers", () => {
  assert.equal(sniffMp3SampleRate(new Uint8Array([0xff, 0xe8, 0xfc, 0x00]).buffer), null);
});

test("FLAC sniffer reads sample rate from STREAMINFO", () => {
  const bytes = flacStreamInfo(96000);
  assert.equal(sniffFlacSampleRate(bytes.buffer), 96000);
  assert.equal(sniffSourceSampleRate(bytes.buffer), 96000);
});

test("FLAC sniffer rejects missing STREAMINFO", () => {
  const bytes = flacStreamInfo(44100);
  bytes[4] = 0x01;
  assert.equal(sniffFlacSampleRate(bytes.buffer), null);
});

test("Ogg Vorbis sniffer reads sample rate from identification packet", () => {
  const bytes = oggVorbisIdentificationPage(48000);
  assert.equal(sniffOggVorbisSampleRate(bytes.buffer), 48000);
  assert.equal(sniffSourceSampleRate(bytes.buffer), 48000);
});

test("Ogg Vorbis sniffer rejects non-Vorbis first packets", () => {
  const bytes = oggVorbisIdentificationPage(44100);
  bytes[29] = 0x78;
  assert.equal(sniffOggVorbisSampleRate(bytes.buffer), null);
});

test("source-rate chain prefers FLAC over MP3 byte-scan false-positives", () => {
  const flac = flacStreamInfo(96000);
  const mp3Decoy = new Uint8Array([0xff, 0xfb, 0x90, 0x64]); // MP3-shaped sync that decodes to 44100
  const bytes = new Uint8Array(flac.length + mp3Decoy.length);
  bytes.set(flac, 0);
  bytes.set(mp3Decoy, flac.length);
  assert.equal(sniffMp3SampleRate(bytes.buffer), 44100);
  assert.equal(sniffSourceSampleRate(bytes.buffer), 96000);
});

function flacStreamInfo(sampleRate) {
  const bytes = new Uint8Array(42);
  writeAscii(bytes, 0, "fLaC");
  bytes[4] = 0x00;
  bytes[5] = 0x00;
  bytes[6] = 0x00;
  bytes[7] = 0x22;
  bytes[18] = (sampleRate >> 12) & 0xff;
  bytes[19] = (sampleRate >> 4) & 0xff;
  bytes[20] = (sampleRate & 0x0f) << 4;
  return bytes;
}

function oggVorbisIdentificationPage(sampleRate) {
  const packet = new Uint8Array(30);
  packet[0] = 0x01;
  writeAscii(packet, 1, "vorbis");
  packet[11] = 2;
  packet[12] = sampleRate & 0xff;
  packet[13] = (sampleRate >> 8) & 0xff;
  packet[14] = (sampleRate >> 16) & 0xff;
  packet[15] = (sampleRate >> 24) & 0xff;

  const bytes = new Uint8Array(28 + packet.length);
  writeAscii(bytes, 0, "OggS");
  bytes[4] = 0;
  bytes[5] = 0x02;
  bytes[26] = 1;
  bytes[27] = packet.length;
  bytes.set(packet, 28);
  return bytes;
}

function writeAscii(bytes, offset, text) {
  for (let i = 0; i < text.length; i++) {
    bytes[offset + i] = text.charCodeAt(i);
  }
}
