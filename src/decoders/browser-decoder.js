// SPDX-License-Identifier: AGPL-3.0-or-later
import { decodedByteSize } from "../memory.js";
import { DECODER_STREAM_LABELS } from "../constants.js";
import { sniffSourceSampleRate } from "./sample-rate-sniffer.js";

export async function decodeWithBrowser(file, options = {}) {
  const {
    AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext,
    OfflineAudioContextClass = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext,
  } = options;
  if (!AudioContextClass && !OfflineAudioContextClass) {
    throw new Error("Web Audio decoding is not available in this browser.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const sourceSampleRate = sniffSourceSampleRate(arrayBuffer);
  const audioBuffer = await decodeAudioBuffer(arrayBuffer, {
    AudioContextClass,
    OfflineAudioContextClass,
    sourceSampleRate,
  });
  return fromAudioBuffer(audioBuffer, {
    backend: "browser",
    fileName: file.name,
    inputBytes: file.size,
    sourceSampleRate,
    streamIndex: 0,
  });
}

async function decodeAudioBuffer(arrayBuffer, { AudioContextClass, OfflineAudioContextClass, sourceSampleRate }) {
  // OfflineAudioContext's sample rate is decoupled from the device output, so platforms
  // that silently override AudioContext({ sampleRate }) still honor the requested rate here.
  // The offline path may detach the buffer on failure, so we slice only when a fallback path exists.
  if (OfflineAudioContextClass && sourceSampleRate) {
    try {
      const offline = new OfflineAudioContextClass(1, 1, sourceSampleRate);
      const input = AudioContextClass ? arrayBuffer.slice(0) : arrayBuffer;
      return await offline.decodeAudioData(input);
    } catch {
      // Fall through to the online AudioContext path.
    }
  }
  if (!AudioContextClass) {
    throw new Error("Web Audio decoding is not available in this browser.");
  }
  const context = new AudioContextClass(sourceSampleRate ? { sampleRate: sourceSampleRate } : undefined);
  try {
    return await context.decodeAudioData(arrayBuffer);
  } finally {
    if (typeof context.close === "function") await context.close();
  }
}

export function fromAudioBuffer(audioBuffer, metadata = {}) {
  return {
    backend: metadata.backend || "browser",
    fileName: metadata.fileName || "",
    inputBytes: metadata.inputBytes || 0,
    streamIndex: metadata.streamIndex || 0,
    streamCount: metadata.streamCount || 1,
    streamLabel: metadata.streamLabel || DECODER_STREAM_LABELS.browser,
    codecName: metadata.codecName || "",
    codecLongName: metadata.codecLongName || metadata.codecName || "",
    bitRate: metadata.bitRate || 0,
    bitsPerSample: metadata.bitsPerSample || 0,
    streams: metadata.streams || [],
    duration: audioBuffer.duration,
    sampleRate: audioBuffer.sampleRate,
    sourceSampleRate: metadata.sourceSampleRate || audioBuffer.sampleRate,
    channelCount: audioBuffer.numberOfChannels,
    length: audioBuffer.length,
    decodedBytes: decodedByteSize({
      length: audioBuffer.length,
      channelCount: audioBuffer.numberOfChannels,
    }),
    getChannelData(channel) {
      return audioBuffer.getChannelData(channel);
    },
  };
}
