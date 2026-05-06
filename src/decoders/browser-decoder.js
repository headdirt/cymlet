// SPDX-License-Identifier: AGPL-3.0-or-later
import { decodedByteSize } from "../memory.js";
import { sniffSourceSampleRate } from "./sample-rate-sniffer.js";

export async function decodeWithBrowser(file, { AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext } = {}) {
  if (!AudioContextClass) {
    throw new Error("Web Audio decoding is not available in this browser.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const sourceSampleRate = sniffSourceSampleRate(arrayBuffer);
  const context = new AudioContextClass(sourceSampleRate ? { sampleRate: sourceSampleRate } : undefined);
  try {
    const audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));
    return fromAudioBuffer(audioBuffer, {
      backend: "browser",
      fileName: file.name,
      inputBytes: file.size,
      sourceSampleRate,
      streamIndex: 0,
    });
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
    streamLabel: metadata.streamLabel || "Browser decoded stream",
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
