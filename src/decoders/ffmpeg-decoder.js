// SPDX-License-Identifier: AGPL-3.0-or-later
import { DECODER_STREAM_LABELS } from "../constants.js";
import { safePathSegment, stripFileExtension } from "../file-utils.js";
import { decodeWithBrowser } from "./browser-decoder.js";

const DEFAULT_VENDOR_BASE = new URL("../../vendor/ffmpeg", import.meta.url).href;
const FFMPEG_CORE_SHA384 = {
  "ffmpeg-core.js": "f4a9409a01eee700ea76042f16140664eb4a742c0670ca690e133f901914a59e4b4bb286b801db13e360b494047fce22",
  "ffmpeg-core.wasm": "5355438643d8accdf04c24f8fef8d2a52b0aa86fd48e58d8ad8088e21052274dacbdb0a4c6e0a2e94eaefe97a0e6fa56",
};
let ffmpegInstancePromise = null;

export function isFfmpegDecoderAvailable(options = {}) {
  return Boolean(options.FFmpeg || options.loadRuntime || globalThis.FFmpegWASM?.FFmpeg);
}

export async function decodeWithFfmpeg(file, options = {}) {
  const ffmpeg = await loadFfmpegRuntime(options);
  const inputName = safeVirtualName(file.name || "input.audio");
  const outputName = `${inputName}.decoded.wav`;
  const inputData = new Uint8Array(await file.arrayBuffer());
  const requestedStreamIndex = Math.max(0, Number(options.streamIndex || 0));

  options.onFfmpegProgress?.({ phase: "write", ratio: 0 });
  await ffmpeg.writeFile(inputName, inputData);

  try {
    options.onFfmpegProgress?.({ phase: "probe", ratio: 0 });
    const streams = await probeAudioStreams(ffmpeg, inputName);
    const streamIndex = Math.min(requestedStreamIndex, Math.max(0, streams.length - 1));
    const stream = streams[streamIndex] || null;
    options.onFfmpegProgress?.({ phase: "transcode", ratio: 0 });
    await ffmpeg.exec([
      "-hide_banner",
      "-i", inputName,
      "-map", `0:a:${streamIndex}`,
      "-vn",
      "-acodec", "pcm_s16le",
      "-f", "wav",
      outputName,
    ]);
    options.onFfmpegProgress?.({ phase: "read", ratio: 1 });
    const wavData = await ffmpeg.readFile(outputName);
    const wavFile = new File([wavData], `${stripFileExtension(safeVirtualName(file.name || "decoded")) || "decoded"}.wav`, { type: "audio/wav" });
    const decoded = await decodeWithBrowser(wavFile, options);
    return {
      ...decoded,
      backend: "ffmpeg",
      fileName: file.name,
      inputBytes: file.size || inputData.byteLength,
      codecName: stream?.codecName || "",
      codecLongName: stream?.codecLongName || stream?.codecName || "",
      bitRate: stream?.bitRate || 0,
      bitsPerSample: stream?.bitsPerSample || 0,
      sourceSampleRate: stream?.sampleRate || decoded.sourceSampleRate,
      streamIndex,
      streamCount: Math.max(1, streams.length),
      streamLabel: stream ? formatStreamLabel(stream, streamIndex, streams.length) : DECODER_STREAM_LABELS.ffmpeg,
      streams,
    };
  } finally {
    await deleteIfPresent(ffmpeg, inputName);
    await deleteIfPresent(ffmpeg, outputName);
  }
}

export async function probeAudioStreams(ffmpeg, inputName) {
  const outputName = `${inputName}.ffprobe.json`;
  try {
    if (typeof ffmpeg.ffprobe !== "function") return [];
    await ffmpeg.ffprobe([
      "-v", "error",
      "-select_streams", "a",
      "-show_streams",
      "-of", "json",
      inputName,
      "-o", outputName,
    ]);
    const data = await ffmpeg.readFile(outputName, "utf8");
    const text = typeof data === "string" ? data : new TextDecoder().decode(data);
    return parseFfprobeAudioStreams(text);
  } catch {
    return [];
  } finally {
    await deleteIfPresent(ffmpeg, outputName);
  }
}

export function parseFfprobeAudioStreams(jsonText) {
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return [];
  }
  if (!Array.isArray(data.streams)) return [];
  return data.streams.map((stream, index) => ({
    index,
    sourceIndex: Number.isInteger(stream.index) ? stream.index : index,
    codecName: stream.codec_name || stream.codec_long_name || "",
    codecLongName: stream.codec_long_name || stream.codec_name || "",
    sampleRate: Number(stream.sample_rate) || 0,
    channels: Number(stream.channels) || 0,
    channelLayout: stream.channel_layout || "",
    bitRate: Number(stream.bit_rate) || 0,
    bitsPerSample: Number(stream.bits_per_raw_sample || stream.bits_per_sample) || 0,
  }));
}

export async function loadFfmpegRuntime(options = {}) {
  if (!ffmpegInstancePromise) {
    ffmpegInstancePromise = createFfmpegRuntime(options);
    ffmpegInstancePromise.catch(() => {
      ffmpegInstancePromise = null;
    });
  }
  return ffmpegInstancePromise;
}

export function resetFfmpegRuntimeForTests() {
  ffmpegInstancePromise = null;
}

export function ffmpegAssetUrls(base = DEFAULT_VENDOR_BASE) {
  const cleanBase = String(base).replace(/\/$/, "");
  return {
    coreURL: `${cleanBase}/ffmpeg-core.js`,
    wasmURL: `${cleanBase}/ffmpeg-core.wasm`,
  };
}

async function createFfmpegRuntime(options) {
  if (options.loadRuntime) {
    return options.loadRuntime(options);
  }

  const FFmpeg = options.FFmpeg || await importFfmpegClass(options);
  if (!FFmpeg) {
    throw new Error(
      "FFmpeg WASM is not installed. Add the optional vendor files under vendor/ffmpeg, then retry FFmpeg mode."
    );
  }

  const ffmpeg = new FFmpeg();
  if (typeof ffmpeg.on === "function" && options.onFfmpegProgress) {
    ffmpeg.on("progress", ({ progress = 0 }) => {
      options.onFfmpegProgress({ phase: "load", ratio: progress });
    });
  }

  options.onFfmpegProgress?.({ phase: "load", ratio: 0 });
  const verifiedAssets = await fetchVerifiedFfmpegAssets(options);
  await ffmpeg.load({
    ...verifiedAssets,
    ...(options.loadConfig || {}),
  });
  options.onFfmpegProgress?.({ phase: "load", ratio: 1 });
  return ffmpeg;
}

async function fetchVerifiedFfmpegAssets(options) {
  const sourceUrls = ffmpegAssetUrls(options.vendorBase || DEFAULT_VENDOR_BASE);
  const [coreURL, wasmURL] = await Promise.all([
    fetchAndVerify(sourceUrls.coreURL, FFMPEG_CORE_SHA384["ffmpeg-core.js"], "text/javascript"),
    fetchAndVerify(sourceUrls.wasmURL, FFMPEG_CORE_SHA384["ffmpeg-core.wasm"], "application/wasm"),
  ]);
  return { coreURL, wasmURL };
}

async function fetchAndVerify(url, expectedSha384Hex, mimeType) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not fetch ${url}: ${response.status}`);
  const bytes = await response.arrayBuffer();
  const actualHex = await sha384Hex(bytes);
  if (actualHex !== expectedSha384Hex) {
    throw new Error(`Integrity check failed for ${url}: expected SHA-384 ${expectedSha384Hex}, got ${actualHex}`);
  }
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

async function sha384Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-384", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function importFfmpegClass(options) {
  if (globalThis.FFmpegWASM?.FFmpeg) return globalThis.FFmpegWASM.FFmpeg;
  if (typeof Worker === "undefined") return null;
  const moduleURL = options.moduleURL || `${String(options.vendorBase || DEFAULT_VENDOR_BASE).replace(/\/$/, "")}/ffmpeg.js`;
  try {
    const module = await import(moduleURL);
    return module.FFmpeg || module.default?.FFmpeg || module.default;
  } catch {
    return null;
  }
}

async function deleteIfPresent(ffmpeg, path) {
  try {
    if (typeof ffmpeg.deleteFile === "function") await ffmpeg.deleteFile(path);
  } catch {
    // Best-effort cleanup; stale virtual files should not hide the decode result.
  }
}

function safeVirtualName(name) {
  return safePathSegment(name, "_") || "input.audio";
}

function formatStreamLabel(stream, index, count) {
  const parts = [`Stream ${index + 1} / ${count}`];
  if (stream.codecLongName || stream.codecName) parts.push(stream.codecLongName || stream.codecName);
  if (stream.sampleRate) parts.push(`${stream.sampleRate} Hz`);
  if (stream.channels) parts.push(`${stream.channels} ch`);
  return parts.join(", ");
}
