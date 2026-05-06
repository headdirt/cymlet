// SPDX-License-Identifier: AGPL-3.0-or-later
export const CODEC_SAMPLE_BASE_URL = "https://raw.githubusercontent.com/alexkay/spek/master/tests/samples";

export const CODEC_SAMPLES = [
  { name: "1ch-96000Hz-24bps.ape", expectedMode: "compatibility", channels: 1, sampleRate: 96000 },
  { name: "1ch-96000Hz-24bps.flac", expectedMode: "compatibility", channels: 1, sampleRate: 96000 },
  { name: "1ch-96000Hz-24bps.wv", expectedMode: "compatibility", channels: 1, sampleRate: 96000 },
  { name: "2ch-44100Hz-128cbr.mp3", expectedMode: "browser", channels: 2, sampleRate: 44100, releaseBrowserSuite: true },
  { name: "2ch-44100Hz-16bps.m4a", expectedMode: "compatibility", channels: 2, sampleRate: 44100, codec: "ALAC" },
  { name: "2ch-44100Hz-16bps.wav", expectedMode: "browser", channels: 2, sampleRate: 44100, releaseBrowserSuite: true },
  { name: "2ch-44100Hz-320cbr.mp3", expectedMode: "browser", channels: 2, sampleRate: 44100, releaseBrowserSuite: true },
  { name: "2ch-44100Hz-V0.mp3", expectedMode: "browser", channels: 2, sampleRate: 44100, releaseBrowserSuite: true },
  { name: "2ch-44100Hz-V2.mp3", expectedMode: "browser", channels: 2, sampleRate: 44100, releaseBrowserSuite: true },
  { name: "2ch-44100Hz-q100.m4a", expectedMode: "browser", channels: 2, sampleRate: 44100, codec: "AAC" },
  { name: "2ch-44100Hz-q5.ogg", expectedMode: "browser", channels: 2, sampleRate: 44100 },
  { name: "2ch-44100Hz-std.mpc", expectedMode: "compatibility", channels: 2, sampleRate: 44100 },
  { name: "2ch-44100Hz-v1.wma", expectedMode: "compatibility", channels: 2, sampleRate: 44100 },
  { name: "2ch-44100Hz-v2.wma", expectedMode: "compatibility", channels: 2, sampleRate: 44100 },
  { name: "2ch-44100Hz.ac3", expectedMode: "compatibility", channels: 2, sampleRate: 44100 },
  { name: "2ch-44100Hz.dts", expectedMode: "compatibility", channels: 2, sampleRate: 44100 },
  { name: "2ch-48000Hz-16bps.ape", expectedMode: "compatibility", channels: 2, sampleRate: 48000 },
  { name: "2ch-48000Hz-16bps.flac", expectedMode: "compatibility", channels: 2, sampleRate: 48000 },
  { name: "2ch-48000Hz-16bps.wv", expectedMode: "compatibility", channels: 2, sampleRate: 48000 },
];

export function codecSampleUrl(name) {
  return `${CODEC_SAMPLE_BASE_URL}/${name}`;
}

export function codecSamplesByMode(mode) {
  return CODEC_SAMPLES.filter((sample) => sample.expectedMode === mode);
}

export function codecSamplesForReleaseBrowserSuite() {
  return CODEC_SAMPLES.filter((sample) => sample.releaseBrowserSuite);
}
