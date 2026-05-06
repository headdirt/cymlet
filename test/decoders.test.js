// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from "node:assert/strict";
import test from "node:test";

import { decodeWithBrowser, fromAudioBuffer } from "../src/decoders/browser-decoder.js";
import { decodeAudioFile, shouldOfferCompatibilityDecoder } from "../src/decoders/index.js";
import {
  decodeWithFfmpeg,
  ffmpegAssetUrls,
  isFfmpegDecoderAvailable,
  parseFfprobeAudioStreams,
  resetFfmpegRuntimeForTests,
} from "../src/decoders/ffmpeg-decoder.js";

class FakeAudioContext {
  static closed = false;

  async decodeAudioData() {
    return fakeAudioBuffer();
  }

  async close() {
    FakeAudioContext.closed = true;
  }
}

class FailingAudioContext {
  async decodeAudioData() {
    throw new Error("Nope");
  }

  async close() {}
}

function fakeAudioBuffer() {
  const left = new Float32Array([0, 0.25, 0.5]);
  const right = new Float32Array([0, -0.25, -0.5]);
  return {
    duration: 3 / 44100,
    sampleRate: 44100,
    numberOfChannels: 2,
    length: 3,
    getChannelData(channel) {
      return channel === 0 ? left : right;
    },
  };
}

test("fromAudioBuffer exposes normalized decoded audio metadata", () => {
  const decoded = fromAudioBuffer(fakeAudioBuffer(), { fileName: "x.wav", inputBytes: 44 });
  assert.equal(decoded.backend, "browser");
  assert.equal(decoded.fileName, "x.wav");
  assert.equal(decoded.sampleRate, 44100);
  assert.equal(decoded.channelCount, 2);
  assert.equal(decoded.streamCount, 1);
  assert.equal(decoded.decodedBytes, 3 * 2 * Float32Array.BYTES_PER_ELEMENT);
  assert.equal(decoded.codecLongName, "");
  assert.equal(decoded.getChannelData(1)[2], -0.5);
});

test("browser decoder uses File-like input and closes AudioContext", async () => {
  FakeAudioContext.closed = false;
  const file = {
    name: "fake.wav",
    size: 128,
    async arrayBuffer() {
      return new ArrayBuffer(128);
    },
  };

  const decoded = await decodeWithBrowser(file, { AudioContextClass: FakeAudioContext });
  assert.equal(decoded.fileName, "fake.wav");
  assert.equal(decoded.inputBytes, 128);
  assert.equal(FakeAudioContext.closed, true);
});

test("FFmpeg boundary is present but unavailable until bundled", async () => {
  assert.equal(isFfmpegDecoderAvailable(), false);
  await assert.rejects(
    () => decodeAudioFile({ name: "x.ape" }, { backend: "ffmpeg" }),
    /FFmpeg WASM is not installed/
  );
});

test("normal browser decode does not load FFmpeg module", async () => {
  const file = {
    name: "fake.wav",
    size: 128,
    async arrayBuffer() {
      return new ArrayBuffer(128);
    },
  };
  let loaded = false;

  const decoded = await decodeAudioFile(file, {
    AudioContextClass: FakeAudioContext,
    loadFfmpegDecoder: async () => {
      loaded = true;
      throw new Error("should not load");
    },
  });

  assert.equal(decoded.backend, "browser");
  assert.equal(loaded, false);
});

test("explicit compatibility backend loads FFmpeg module lazily", async () => {
  const file = { name: "fake.ape" };
  let loaded = false;

  const decoded = await decodeAudioFile(file, {
    backend: "ffmpeg",
    loadFfmpegDecoder: async () => {
      loaded = true;
      return {
        async decodeWithFfmpeg() {
          return { backend: "ffmpeg", fileName: "fake.ape" };
        },
      };
    },
  });

  assert.equal(loaded, true);
  assert.equal(decoded.backend, "ffmpeg");
});

test("browser fallback prompts and loads only for compatibility-looking files", async () => {
  const apeFile = {
    name: "fake.ape",
    async arrayBuffer() {
      return new ArrayBuffer(8);
    },
  };
  let prompted = false;
  let loaded = false;

  const decoded = await decodeAudioFile(apeFile, {
    AudioContextClass: FailingAudioContext,
    promptForFfmpegFallback: async () => {
      prompted = true;
      return true;
    },
    loadFfmpegDecoder: async () => {
      loaded = true;
      return {
        async decodeWithFfmpeg() {
          return { backend: "ffmpeg" };
        },
      };
    },
  });

  assert.equal(prompted, true);
  assert.equal(loaded, true);
  assert.equal(decoded.backend, "ffmpeg");

  const mp3File = {
    name: "fake.mp3",
    async arrayBuffer() {
      return new ArrayBuffer(8);
    },
  };
  prompted = false;
  await assert.rejects(
    () => decodeAudioFile(mp3File, {
      AudioContextClass: FailingAudioContext,
      promptForFfmpegFallback: async () => {
        prompted = true;
        return true;
      },
    }),
    /Nope/
  );
  assert.equal(prompted, false);
});

test("compatibility decoder offer is extension-gated", () => {
  assert.equal(shouldOfferCompatibilityDecoder({ name: "album.flac" }), true);
  assert.equal(shouldOfferCompatibilityDecoder({ name: "sample.wma" }), true);
  assert.equal(shouldOfferCompatibilityDecoder({ name: "track.mp3" }), false);
  assert.equal(shouldOfferCompatibilityDecoder({ name: "track.wav" }), false);
});

test("FFmpeg asset URLs point at the optional vendor bundle", () => {
  assert.match(ffmpegAssetUrls().coreURL, /\/vendor\/ffmpeg\/ffmpeg-core\.js$/);
  assert.match(ffmpegAssetUrls().wasmURL, /\/vendor\/ffmpeg\/ffmpeg-core\.wasm$/);
  assert.deepEqual(ffmpegAssetUrls("/x/"), {
    coreURL: "/x/ffmpeg-core.js",
    wasmURL: "/x/ffmpeg-core.wasm",
  });
});

test("FFmpeg decoder lazily transcodes to WAV and reuses browser decode shape", async () => {
  resetFfmpegRuntimeForTests();
  const calls = [];
  const progress = [];
  const ffmpeg = {
    async writeFile(name, data) {
      calls.push(["writeFile", name, data.byteLength]);
    },
    async ffprobe(args) {
      calls.push(["ffprobe", args]);
    },
    async exec(args) {
      calls.push(["exec", args]);
    },
    async readFile(name, encoding) {
      calls.push(["readFile", name, encoding || "binary"]);
      if (name.endsWith(".ffprobe.json")) {
        return JSON.stringify({
          streams: [
            { index: 1, codec_name: "alac", codec_long_name: "ALAC", sample_rate: "44100", channels: 2, bit_rate: "0" },
            { index: 2, codec_name: "aac", codec_long_name: "AAC", sample_rate: "48000", channels: 6, bit_rate: "128000" },
          ],
        });
      }
      return new Uint8Array([82, 73, 70, 70]);
    },
    async deleteFile(name) {
      calls.push(["deleteFile", name]);
    },
  };
  const file = {
    name: "song.flac",
    size: 4,
    async arrayBuffer() {
      return new Uint8Array([1, 2, 3, 4]).buffer;
    },
  };

  const decoded = await decodeWithFfmpeg(file, {
    AudioContextClass: FakeAudioContext,
    loadRuntime: async () => ffmpeg,
    streamIndex: 1,
    onFfmpegProgress: (event) => progress.push(event.phase),
  });

  assert.equal(decoded.backend, "ffmpeg");
  assert.equal(decoded.fileName, "song.flac");
  assert.equal(decoded.streamIndex, 1);
  assert.equal(decoded.streamCount, 2);
  assert.equal(decoded.codecName, "aac");
  assert.equal(decoded.codecLongName, "AAC");
  assert.equal(decoded.sourceSampleRate, 48000);
  assert.match(decoded.streamLabel, /Stream 2 \/ 2/);
  assert.deepEqual(calls[0], ["writeFile", "song.flac", 4]);
  assert.equal(calls[1][0], "ffprobe");
  assert.deepEqual(calls[2], ["readFile", "song.flac.ffprobe.json", "utf8"]);
  assert.equal(calls[4][0], "exec");
  assert.ok(calls[4][1].includes("0:a:1"));
  assert.ok(calls[4][1].includes("song.flac.decoded.wav"));
  assert.deepEqual(calls[5], ["readFile", "song.flac.decoded.wav", "binary"]);
  assert.deepEqual(calls.slice(-2), [["deleteFile", "song.flac"], ["deleteFile", "song.flac.decoded.wav"]]);
  assert.deepEqual(progress, ["write", "probe", "transcode", "read"]);
});

test("FFmpeg runtime loader is cached after first load", async () => {
  resetFfmpegRuntimeForTests();
  let loads = 0;
  const makeFile = (name) => ({
    name,
    size: 4,
    async arrayBuffer() {
      return new Uint8Array([1, 2, 3, 4]).buffer;
    },
  });
  const ffmpeg = {
    async writeFile() {},
    async ffprobe() {},
    async exec() {},
    async readFile(name) {
      if (name.endsWith(".ffprobe.json")) return JSON.stringify({ streams: [] });
      return new Uint8Array([82, 73, 70, 70]);
    },
    async deleteFile() {},
  };

  await decodeWithFfmpeg(makeFile("a.flac"), {
    AudioContextClass: FakeAudioContext,
    loadRuntime: async () => {
      loads++;
      return ffmpeg;
    },
  });
  await decodeWithFfmpeg(makeFile("b.flac"), {
    AudioContextClass: FakeAudioContext,
    loadRuntime: async () => {
      loads++;
      return ffmpeg;
    },
  });

  assert.equal(loads, 1);
});

test("ffprobe stream parser normalizes audio metadata", () => {
  assert.deepEqual(parseFfprobeAudioStreams(JSON.stringify({
    streams: [
      {
        index: 3,
        codec_name: "flac",
        codec_long_name: "FLAC lossless audio",
        sample_rate: "96000",
        channels: 2,
        channel_layout: "stereo",
        bit_rate: "123456",
        bits_per_raw_sample: "24",
      },
    ],
  })), [{
    index: 0,
    sourceIndex: 3,
    codecName: "flac",
    codecLongName: "FLAC lossless audio",
    sampleRate: 96000,
    channels: 2,
    channelLayout: "stereo",
    bitRate: 123456,
    bitsPerSample: 24,
  }]);
  assert.deepEqual(parseFfprobeAudioStreams("not json"), []);
});
