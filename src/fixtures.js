// SPDX-License-Identifier: AGPL-3.0-or-later
import { writeAscii } from "./file-utils.js";

export function createSweepFixture({ sampleRate = 44100, seconds = 3, channels = 2 } = {}) {
  const length = Math.floor(sampleRate * seconds);
  const channelData = Array.from({ length: channels }, () => new Float32Array(length));
  for (let channel = 0; channel < channels; channel++) {
    const data = channelData[channel];
    for (let i = 0; i < data.length; i++) {
      const t = i / sampleRate;
      const sweep = 240 + 5200 * (t / seconds);
      const tone = channel === 0 ? sweep : 900;
      data[i] = 0.55 * Math.sin(2 * Math.PI * tone * t);
    }
  }
  return { sampleRate, seconds, channels, length, channelData };
}

export function createFixtureAudioBuffer(audioContext, fixture) {
  const buffer = audioContext.createBuffer(fixture.channels, fixture.length, fixture.sampleRate);
  for (let channel = 0; channel < fixture.channels; channel++) {
    buffer.getChannelData(channel).set(fixture.channelData[channel]);
  }
  return buffer;
}

export function encodeWavPcm16(fixture) {
  const bytesPerSample = 2;
  const blockAlign = fixture.channels * bytesPerSample;
  const dataBytes = fixture.length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, fixture.channels, true);
  view.setUint32(24, fixture.sampleRate, true);
  view.setUint32(28, fixture.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let i = 0; i < fixture.length; i++) {
    for (let channel = 0; channel < fixture.channels; channel++) {
      const value = Math.max(-1, Math.min(1, fixture.channelData[channel][i]));
      view.setInt16(offset, Math.round(value * 32767), true);
      offset += 2;
    }
  }
  return buffer;
}
