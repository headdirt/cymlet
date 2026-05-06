// SPDX-License-Identifier: AGPL-3.0-or-later
export const CANVAS_MIN_WIDTH = 640;
export const CANVAS_MIN_HEIGHT = 420;
export const CANVAS_MAX_DPR = 2;

export const LARGE_INPUT_BYTES = 250 * 1024 * 1024;
export const LARGE_DECODED_BYTES = 600 * 1024 * 1024;

export const SPECTROGRAM_MIN_COLUMNS = 160;
export const SPECTROGRAM_MAX_COLUMNS = 2400;
export const SPECTROGRAM_NON_PLOT_WIDTH = 170;
export const SYNTHETIC_SAMPLE_RATE = 44100;

export const STATUS = {
  analysisComplete: "Analysis complete.",
};

export const PLOT_PADS = {
  left: 74,
  top: 68,
  right: 96,
  bottom: 46,
  gap: 10,
  ruler: 12,
};

export const TIME_TICK_FACTORS = [1, 2, 5, 10, 20, 30, 60, 120, 300, 600, 1200, 1800];
export const FREQUENCY_TICK_FACTORS = [1000, 2000, 5000, 10000, 20000];

export const DECODER_STREAM_LABELS = {
  browser: "Browser-decoded stream",
  ffmpeg: "FFmpeg-decoded stream",
};

export const DECODER_AUDIO_LABELS = {
  browser: "Browser-decoded audio",
  ffmpeg: "FFmpeg-decoded audio",
};

export const BROWSER_EXTENSIONS = [
  "wav",
  "wave",
  "mp3",
  "aac",
  "ogg",
  "oga",
];

export const COMPATIBILITY_EXTENSIONS = [
  "m4a",
  "opus",
  "flac",
  "aif",
  "aiff",
  "caf",
  "alac",
  "ape",
  "wv",
  "wma",
  "ac3",
  "dts",
  "mpc",
  "mka",
  "mkv",
  "wmv",
];

export const AUDIO_MIME_TYPES = [
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
  "audio/opus",
  "audio/flac",
  "audio/x-flac",
  "audio/aiff",
  "audio/x-aiff",
  "audio/x-caf",
  "audio/x-ms-wma",
];

export const FILE_ACCEPT_TYPES = [
  ...BROWSER_EXTENSIONS.map((extension) => `.${extension}`),
  ...COMPATIBILITY_EXTENSIONS.map((extension) => `.${extension}`),
  ...AUDIO_MIME_TYPES,
];

export const NATIVE_AUDIO_FORMATS = [
  { label: "WAV", types: ['audio/wav; codecs="1"', "audio/wav", "audio/x-wav"] },
  { label: "MP3", types: ["audio/mpeg", "audio/mp3"] },
  { label: "AAC/M4A", types: ['audio/mp4; codecs="mp4a.40.2"', "audio/aac", "audio/x-m4a"] },
  { label: "Ogg Vorbis", types: ['audio/ogg; codecs="vorbis"', "audio/ogg"] },
  { label: "Opus", types: ['audio/ogg; codecs="opus"', 'audio/webm; codecs="opus"'] },
  { label: "FLAC", types: ["audio/flac", "audio/x-flac", 'audio/ogg; codecs="flac"'] },
];

export const TESTED_WEB_AUDIO_FORMATS = [
  "WAV",
  "MP3",
  "AAC/M4A",
  "Ogg Vorbis",
  "FLAC",
];

export const TESTED_SAFARI_EXTRA_FORMATS = [
  "ALAC/M4A",
  "AC-3",
];

export const TESTED_FFMPEG_FORMATS = [
  "APE",
  "WavPack",
  "Musepack",
  "WMA",
  "DTS",
];
