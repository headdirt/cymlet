// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  CANVAS_MAX_DPR,
  CANVAS_MIN_HEIGHT,
  CANVAS_MIN_WIDTH,
  LARGE_DECODED_BYTES,
  LARGE_INPUT_BYTES,
  SPECTROGRAM_MAX_COLUMNS,
  SPECTROGRAM_MIN_COLUMNS,
  SPECTROGRAM_NON_PLOT_WIDTH,
} from "./constants.js";
import { decodeAudioFile } from "./decoders/index.js";
import { downloadCanvasPng } from "./export.js";
import { createFixtureAudioBuffer, createSweepFixture, encodeWavPcm16 } from "./fixtures.js";
import { formatTimeMmSs } from "./format.js";
import { capColumnsForMatrixBudget, decodedByteSize } from "./memory.js";
import { makePalette } from "./palette.js";
import { formatReadout, spectrogramReadoutAtPoint } from "./readout.js";
import { drawSpectrogram, spectrogramPlot } from "./render.js";
import { applyStoredControlSettings, loadStoredSettings, saveStoredSettings } from "./settings-store.js";
import { canvasHasSignal, waitForCondition } from "./smoke.js";

const els = {
  fileInput: document.querySelector("#fileInput"),
  exportButton: document.querySelector("#exportButton"),
  dropZone: document.querySelector("#dropZone"),
  emptyState: document.querySelector("#emptyState"),
  nativeSupport: document.querySelector("#nativeSupport"),
  canvas: document.querySelector("#spectrogramCanvas"),
  fileMeta: document.querySelector("#fileMeta"),
  decoderModeSelect: document.querySelector("#decoderModeSelect"),
  streamSelect: document.querySelector("#streamSelect"),
  channelSelect: document.querySelector("#channelSelect"),
  paletteSelect: document.querySelector("#paletteSelect"),
  fftSizeSelect: document.querySelector("#fftSizeSelect"),
  windowSelect: document.querySelector("#windowSelect"),
  minDbInput: document.querySelector("#minDbInput"),
  maxDbInput: document.querySelector("#maxDbInput"),
  progressBar: document.querySelector("#progressBar"),
  statusText: document.querySelector("#statusText"),
};

const state = {
  audioBuffer: null,
  currentFile: null,
  streamIndex: 0,
  fileName: "",
  matrix: null,
  bands: 0,
  columns: 0,
  openId: 0,
  analysisId: 0,
  worker: null,
  workerBusy: false,
};

const ctx = els.canvas.getContext("2d", { alpha: false });
let resizeTimer = 0;
let renderedPaletteName = "";
let renderedPalette = null;
applyStoredControlSettings(els, loadStoredSettings());
clampDbInputs();
updateNativeSupportText();

function settings() {
  return {
    channel: Number(els.channelSelect.value || 0),
    decoderMode: els.decoderModeSelect.value,
    palette: els.paletteSelect.value,
    fftSize: Number(els.fftSizeSelect.value),
    windowFunction: els.windowSelect.value,
    minDb: Number(els.minDbInput.value),
    maxDb: Number(els.maxDbInput.value),
  };
}

function clampDbInputs() {
  const minDb = Math.max(-140, Math.min(-1, Number(els.minDbInput.value)));
  const maxDb = Math.max(minDb + 1, Math.min(0, Number(els.maxDbInput.value)));
  els.minDbInput.value = String(minDb);
  els.maxDbInput.value = String(maxDb);
}

function persistSettings() {
  saveStoredSettings(settings());
}

function setStatus(text) {
  els.statusText.textContent = text;
}

function setProgress(value) {
  els.progressBar.style.width = `${Math.max(0, Math.min(1, value)) * 100}%`;
}

function resizeCanvas() {
  const rect = els.canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(CANVAS_MAX_DPR, window.devicePixelRatio || 1));
  const width = Math.max(CANVAS_MIN_WIDTH, Math.floor(rect.width * dpr));
  const height = Math.max(CANVAS_MIN_HEIGHT, Math.floor(rect.height * dpr));
  if (els.canvas.width !== width || els.canvas.height !== height) {
    els.canvas.width = width;
    els.canvas.height = height;
    render();
  }
}

function targetColumns() {
  const requested = Math.max(
    SPECTROGRAM_MIN_COLUMNS,
    Math.min(SPECTROGRAM_MAX_COLUMNS, els.canvas.width - SPECTROGRAM_NON_PLOT_WIDTH)
  );
  return capColumnsForMatrixBudget(requested, settings().fftSize);
}

async function openFile(file, overrides = {}) {
  if (!file) return;
  const openId = ++state.openId;
  state.currentFile = file;
  state.streamIndex = Number(overrides.streamIndex || 0);
  state.analysisId++;
  state.matrix = null;
  els.emptyState.classList.add("hidden");
  els.exportButton.disabled = true;
  setProgress(0);
  const s = settings();
  setStatus(file.size > LARGE_INPUT_BYTES
    ? `Decoding a large file (${formatBytes(file.size)}) with ${decoderLabel(s.decoderMode)}...`
    : `Decoding audio with ${decoderLabel(s.decoderMode)}...`);
  state.fileName = file.name;

  try {
    const decoded = await decodeAudioFile(file, {
      backend: s.decoderMode === "ffmpeg" ? "ffmpeg" : "browser",
      streamIndex: state.streamIndex,
      promptForFfmpegFallback: s.decoderMode === "browser" ? promptForCompatibilityDecoder : null,
      onFfmpegProgress: (event) => {
        if (openId === state.openId) updateFfmpegProgress(event);
      },
    });
    if (openId !== state.openId) return;
    state.audioBuffer = decoded;
    state.streamIndex = decoded.streamIndex;
    populateStreams(decoded);
    populateChannels(decoded.channelCount);
    els.fileMeta.textContent = metaText();
    analyze();
  } catch (error) {
    if (openId !== state.openId) return;
    state.audioBuffer = null;
    state.matrix = null;
    els.fileMeta.textContent = file.name;
    els.emptyState.classList.remove("hidden");
    setStatus(`Could not decode this file. ${error.message || error}`);
    render();
  }
}

function populateStreams(decoded) {
  els.streamSelect.innerHTML = "";
  for (let i = 0; i < decoded.streamCount; i++) {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = i === decoded.streamIndex ? decoded.streamLabel : `Stream ${i + 1}`;
    els.streamSelect.append(option);
  }
  els.streamSelect.value = String(decoded.streamIndex);
  els.streamSelect.disabled = decoded.streamCount <= 1;
}

function populateChannels(count) {
  els.channelSelect.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = count === 1 ? "Mono" : `Channel ${i + 1}`;
    els.channelSelect.append(option);
  }
  els.channelSelect.disabled = count < 1;
}

function metaText() {
  if (!state.audioBuffer) return "Open an audio file to begin.";
  const s = settings();
  const duration = formatTimeMmSs(state.audioBuffer.duration);
  const channels = state.audioBuffer.channelCount;
  const sourceRate = state.audioBuffer.sourceSampleRate && state.audioBuffer.sourceSampleRate !== state.audioBuffer.sampleRate
    ? `src ${state.audioBuffer.sourceSampleRate} Hz, decoded ${state.audioBuffer.sampleRate} Hz`
    : `${state.audioBuffer.sampleRate} Hz`;
  const codec = state.audioBuffer.codecName ? ` · ${state.audioBuffer.codecName}` : "";
  return `${state.fileName} · ${state.audioBuffer.backend}${codec} · ${duration} · ${sourceRate} · ${channels} channel${channels === 1 ? "" : "s"} · W:${s.fftSize} · ${labelWindow(s.windowFunction)}`;
}

function analyze() {
  if (!state.audioBuffer) return;
  const s = settings();
  state.analysisId++;
  const id = state.analysisId;
  const channel = Math.min(s.channel, state.audioBuffer.channelCount - 1);
  const samples = new Float32Array(state.audioBuffer.getChannelData(channel));
  state.matrix = null;
  setProgress(0);
  const decodedBytes = decodedByteSize(state.audioBuffer);
  setStatus(decodedBytes > LARGE_DECODED_BYTES
    ? `Analyzing large decoded audio (${formatBytes(decodedBytes)})...`
    : "Analyzing...");
  els.exportButton.disabled = true;
  els.fileMeta.textContent = metaText();
  const worker = ensureAnalysisWorker();
  state.workerBusy = true;
  worker.postMessage({
    type: "analyze",
    id,
    samples,
    sampleRate: state.audioBuffer.sampleRate,
    duration: state.audioBuffer.duration,
    fftSize: s.fftSize,
    windowFunction: s.windowFunction,
    columns: targetColumns(),
  }, [samples.buffer]);
}

function createAnalysisWorker() {
  const worker = new Worker("./src/analysis-worker.js", { type: "module" });
  worker.onmessage = handleWorkerMessage;
  worker.onerror = () => {
    state.workerBusy = false;
    setStatus("Analysis worker failed.");
  };
  return worker;
}

function ensureAnalysisWorker() {
  if (state.workerBusy && state.worker) {
    state.worker.terminate();
    state.worker = null;
    state.workerBusy = false;
  }
  if (!state.worker) state.worker = createAnalysisWorker();
  return state.worker;
}

function handleWorkerMessage(event) {
  const message = event.data;
  if (message.id !== state.analysisId) {
    if (message.type === "done" || message.type === "error") state.workerBusy = false;
    return;
  }
  if (message.type === "progress") {
    setProgress(message.progress);
    return;
  }
  state.workerBusy = false;
  if (message.type === "done") {
    state.matrix = new Float32Array(message.matrix);
    state.bands = message.bands;
    state.columns = message.columns;
    setProgress(1);
    setStatus("Analysis complete.");
    els.exportButton.disabled = false;
    render();
  }
  if (message.type === "error") {
    setStatus(message.error);
    setProgress(0);
  }
}

function render() {
  resizeCanvas();
  const s = settings();
  ctx.fillStyle = "#020306";
  ctx.fillRect(0, 0, els.canvas.width, els.canvas.height);
  if (!state.matrix || !state.audioBuffer) return;
  drawSpectrogram(ctx, {
    width: els.canvas.width,
    height: els.canvas.height,
    matrix: state.matrix,
    columns: state.columns,
    bands: state.bands,
    sampleRate: state.audioBuffer.sampleRate,
    frequencyMax: displayNyquist(state.audioBuffer),
    duration: state.audioBuffer.duration,
    minDb: s.minDb,
    maxDb: s.maxDb,
    palette: currentPalette(s.palette),
    fileName: state.fileName,
    meta: metaText(),
  });
}

function currentPalette(name) {
  if (renderedPaletteName !== name || !renderedPalette) {
    renderedPaletteName = name;
    renderedPalette = makePalette(name);
  }
  return renderedPalette;
}

function displayNyquist(audio) {
  return ((audio.sourceSampleRate || audio.sampleRate) / 2);
}

function exportPng() {
  render();
  downloadCanvasPng(els.canvas, state.fileName);
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function labelWindow(value) {
  if (value === "blackmanHarris") return "Blackman-Harris";
  return value[0].toUpperCase() + value.slice(1);
}

function decoderLabel(value) {
  if (value === "ffmpeg") return "the FFmpeg decoder";
  return "the browser backend";
}

async function promptForCompatibilityDecoder(file) {
  return window.confirm(
    `${file.name} may need the FFmpeg decoder for broader format support. It is a large optional WASM download and runs locally in your browser. Load it now?`
  );
}

function updateFfmpegProgress(event) {
  const labels = {
    load: "Loading FFmpeg decoder",
    write: "Preparing file for FFmpeg",
    probe: "Reading stream metadata",
    transcode: "Transcoding to analysis audio",
    read: "Reading decoded audio",
  };
  setStatus(`${labels[event.phase] || "Running FFmpeg"}...`);
  if (Number.isFinite(event.ratio)) setProgress(event.ratio);
}

function updateNativeSupportText() {
  const supported = nativeAudioSupport();
  els.nativeSupport.textContent = supported.length
    ? `Native here: ${supported.join(", ")}. Use FFmpeg for the rest.`
    : "Native support could not be detected. FFmpeg is available for broader formats.";
}

function nativeAudioSupport() {
  const audio = document.createElement("audio");
  if (typeof audio.canPlayType !== "function") return [];
  const formats = [
    { label: "WAV", types: ['audio/wav; codecs="1"', "audio/wav", "audio/x-wav"] },
    { label: "MP3", types: ["audio/mpeg", "audio/mp3"] },
    { label: "AAC/M4A", types: ['audio/mp4; codecs="mp4a.40.2"', "audio/aac", "audio/x-m4a"] },
    { label: "Ogg Vorbis", types: ['audio/ogg; codecs="vorbis"', "audio/ogg"] },
    { label: "Opus", types: ['audio/ogg; codecs="opus"', 'audio/webm; codecs="opus"'] },
    { label: "FLAC", types: ["audio/flac", "audio/x-flac", 'audio/ogg; codecs="flac"'] },
  ];
  return formats
    .filter((format) => format.types.some((type) => audio.canPlayType(type) !== ""))
    .map((format) => format.label);
}

function openFilePicker() {
  els.fileInput.value = "";
  els.fileInput.click();
}

els.fileInput.addEventListener("change", () => openFile(els.fileInput.files[0]));
els.exportButton.addEventListener("click", exportPng);
els.streamSelect.addEventListener("change", () => {
  const streamIndex = Number(els.streamSelect.value || 0);
  if (state.currentFile && state.audioBuffer?.backend === "ffmpeg") {
    openFile(state.currentFile, { streamIndex });
  } else {
    els.streamSelect.value = String(state.audioBuffer?.streamIndex || 0);
    setStatus("Multiple stream selection is available in FFmpeg mode.");
  }
});
els.channelSelect.addEventListener("change", analyze);
els.decoderModeSelect.addEventListener("change", () => {
  persistSettings();
  if (state.currentFile) {
    const streamIndex = state.audioBuffer?.backend === "ffmpeg" ? state.audioBuffer.streamIndex : 0;
    openFile(state.currentFile, { streamIndex });
  }
});
els.fftSizeSelect.addEventListener("change", () => {
  persistSettings();
  analyze();
});
els.windowSelect.addEventListener("change", () => {
  persistSettings();
  analyze();
});
els.paletteSelect.addEventListener("change", () => {
  persistSettings();
  render();
});
els.minDbInput.addEventListener("change", () => {
  clampDbInputs();
  persistSettings();
  render();
});
els.maxDbInput.addEventListener("change", () => {
  clampDbInputs();
  persistSettings();
  render();
});

for (const name of ["dragenter", "dragover"]) {
  els.dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    els.dropZone.classList.add("dragging");
  });
}

for (const name of ["dragleave", "drop"]) {
  els.dropZone.addEventListener(name, (event) => {
    event.preventDefault();
    els.dropZone.classList.remove("dragging");
  });
}

els.dropZone.addEventListener("drop", (event) => {
  openFile(event.dataTransfer.files[0]);
});

els.dropZone.addEventListener("click", () => {
  openFilePicker();
});

els.dropZone.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  openFilePicker();
});

els.canvas.addEventListener("mousemove", (event) => {
  if (!state.matrix || !state.audioBuffer) return;
  const rect = els.canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * els.canvas.width;
  const y = ((event.clientY - rect.top) / rect.height) * els.canvas.height;
  const readout = spectrogramReadoutAtPoint({
    x,
    y,
    plot: spectrogramPlot(els.canvas.width, els.canvas.height),
    matrix: state.matrix,
    columns: state.columns,
    bands: state.bands,
    duration: state.audioBuffer.duration,
    sampleRate: state.audioBuffer.sampleRate,
    frequencyMax: displayNyquist(state.audioBuffer),
  });
  if (readout) setStatus(formatReadout(readout));
});

els.canvas.addEventListener("mouseleave", () => {
  if (state.matrix) setStatus("Analysis complete.");
});

window.addEventListener("resize", () => {
  resizeCanvas();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state.audioBuffer) analyze();
  }, 250);
});

if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
  window.__loadSyntheticSpectrogram = async () => {
    const sampleRate = 44100;
    const seconds = 3;
    const context = new AudioContext({ sampleRate });
    const fixture = createSweepFixture({ sampleRate, seconds, channels: 2 });
    const buffer = createFixtureAudioBuffer(context, fixture);
    await context.close();
    const fixtureMeta = {
      backend: "fixture",
      fileName: "synthetic-sweep.wav",
      inputBytes: 0,
      streamIndex: 0,
      streamCount: 1,
      streamLabel: "Synthetic test stream",
      duration: buffer.duration,
      sampleRate: buffer.sampleRate,
      sourceSampleRate: buffer.sampleRate,
      channelCount: buffer.numberOfChannels,
      length: buffer.length,
      getChannelData: (channel) => buffer.getChannelData(channel),
    };
    fixtureMeta.decodedBytes = decodedByteSize(fixtureMeta);
    state.audioBuffer = fixtureMeta;
    state.fileName = "synthetic-sweep.wav";
    els.emptyState.classList.add("hidden");
    populateStreams(fixtureMeta);
    populateChannels(fixtureMeta.channelCount);
    els.fileMeta.textContent = metaText();
    analyze();
  };

  window.__loadGeneratedStressFile = async ({ seconds = 120, decoderMode = "browser" } = {}) => {
    const sampleRate = 44100;
    const channels = 2;
    const fixture = createSweepFixture({ sampleRate, seconds, channels });
    const wav = encodeWavPcm16(fixture);
    const file = new File([wav], `generated-${seconds}s-stress.wav`, { type: "audio/wav" });
    els.decoderModeSelect.value = decoderMode;
    persistSettings();
    await openFile(file);
  };

  window.__loadLocalSample = async (name) => {
    const safeName = name.replace(/[^a-z0-9._-]+/gi, "");
    const response = await fetch(`./test/fixtures/codec-samples/${safeName}`);
    if (!response.ok) {
      throw new Error(`Could not load local sample ${safeName}: ${response.status}`);
    }
    const blob = await response.blob();
    await openFile(new File([blob], safeName, { type: blob.type || "application/octet-stream" }));
  };

  window.__runBrowserSampleSuite = async (sampleNames) => {
    const results = [];
    for (const sampleName of sampleNames) {
      try {
        await window.__loadLocalSample(sampleName);
        const complete = await waitForCondition(() => els.statusText.textContent === "Analysis complete.", {
          timeoutMs: 10000,
          intervalMs: 50,
        });
        render();
        const png = els.canvas.toDataURL("image/png");
        results.push({
          sample: sampleName,
          complete,
          nonblank: canvasHasSignal(els.canvas, { minColoredPixels: 1, minBrightness: 12 }),
          exportPng: complete && png.startsWith("data:image/png") && png.length > 1000,
          meta: els.fileMeta.textContent,
          status: els.statusText.textContent,
        });
      } catch (error) {
        results.push({
          sample: sampleName,
          complete: false,
          nonblank: false,
          exportPng: false,
          error: error.message || String(error),
        });
      }
    }
    return {
      passed: results.every((result) => result.complete && result.nonblank && result.exportPng),
      results,
    };
  };

  window.__spectrogramSmokeTest = async () => {
    if (!state.matrix) await window.__loadSyntheticSpectrogram();
    const complete = await waitForCondition(() => els.statusText.textContent === "Analysis complete.", {
      timeoutMs: 8000,
      intervalMs: 50,
    });
    render();
    const png = els.canvas.toDataURL("image/png");
    return {
      complete,
      nonblank: canvasHasSignal(els.canvas),
      exportPng: png.startsWith("data:image/png") && png.length > 1000,
      status: els.statusText.textContent,
      meta: els.fileMeta.textContent,
      width: els.canvas.width,
      height: els.canvas.height,
    };
  };

  window.__spectrogramStressTest = async ({ seconds = 120, decoderMode = "browser" } = {}) => {
    await window.__loadGeneratedStressFile({ seconds, decoderMode });
    const complete = await waitForCondition(() => els.statusText.textContent === "Analysis complete.", {
      timeoutMs: decoderMode === "ffmpeg" ? 45000 : 20000,
      intervalMs: 100,
    });
    render();
    const png = els.canvas.toDataURL("image/png");
    return {
      complete,
      nonblank: canvasHasSignal(els.canvas),
      exportPng: png.startsWith("data:image/png") && png.length > 1000,
      status: els.statusText.textContent,
      meta: els.fileMeta.textContent,
      width: els.canvas.width,
      height: els.canvas.height,
      decoderMode,
      seconds,
    };
  };
}

resizeCanvas();

const params = new URLSearchParams(location.search);

if (params.get("decoder")) {
  const decoder = params.get("decoder") === "ffmpeg" ? "ffmpeg" : "browser";
  els.decoderModeSelect.value = decoder;
  persistSettings();
}

if (params.get("demo") === "1" && window.__loadSyntheticSpectrogram) {
  window.__loadSyntheticSpectrogram();
}

if (params.get("smoke") === "1" && window.__spectrogramSmokeTest) {
  window.__spectrogramSmokeTest().then((result) => {
    document.body.dataset.smokeResult = JSON.stringify(result);
    setStatus(result.complete && result.nonblank && result.exportPng ? "Smoke test passed." : "Smoke test failed.");
  }).catch((error) => {
    document.body.dataset.smokeResult = JSON.stringify({ error: error.message || String(error) });
    setStatus("Smoke test failed.");
  });
}

if (params.get("stress") && window.__spectrogramStressTest) {
  const decoderMode = params.get("stress") === "compatibility" ? "ffmpeg" : "browser";
  const seconds = Math.max(1, Math.min(900, Number(params.get("seconds") || 120)));
  window.__spectrogramStressTest({ seconds, decoderMode }).then((result) => {
    document.body.dataset.stressResult = JSON.stringify(result);
    setStatus(result.complete && result.nonblank && result.exportPng ? "Stress test passed." : "Stress test failed.");
  }).catch((error) => {
    document.body.dataset.stressResult = JSON.stringify({ error: error.message || String(error) });
    setStatus("Stress test failed.");
  });
}

if (params.get("sample") && window.__loadLocalSample) {
  window.__loadLocalSample(params.get("sample")).catch((error) => {
    document.body.dataset.sampleError = error.message || String(error);
    setStatus("Sample load failed.");
  });
}

if ((params.get("suite") === "browser" || params.get("suite") === "compatibility") && window.__runBrowserSampleSuite) {
  import("../test/codec-samples.js").then(({ codecSamplesByMode, codecSamplesForReleaseBrowserSuite }) => {
    const mode = params.get("suite") === "compatibility" ? "compatibility" : "browser";
    if (mode === "compatibility") els.decoderModeSelect.value = "ffmpeg";
    const selectedSamples = mode === "browser" ? codecSamplesForReleaseBrowserSuite() : codecSamplesByMode(mode);
    const samples = selectedSamples.map((sample) => sample.name);
    return window.__runBrowserSampleSuite(samples);
  }).then((result) => {
    document.body.dataset.suiteResult = JSON.stringify(result);
    const failures = result.results.filter((item) => !item.complete || !item.nonblank || !item.exportPng || item.error);
    setStatus(result.passed ? "Fixture suite passed." : `Fixture suite failed: ${failures.map((item) => item.sample).join(", ")}`);
  }).catch((error) => {
    document.body.dataset.suiteResult = JSON.stringify({ passed: false, error: error.message || String(error) });
    setStatus("Fixture suite failed.");
  });
}
