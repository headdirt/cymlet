// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  CANVAS_MAX_DPR,
  CANVAS_MIN_HEIGHT,
  CANVAS_MIN_WIDTH,
  DECODER_AUDIO_LABELS,
  DECODER_STREAM_LABELS,
  EXPORT_IMAGE_HEIGHT,
  EXPORT_IMAGE_WIDTH,
  FILE_ACCEPT_TYPES,
  LARGE_DECODED_BYTES,
  LARGE_INPUT_BYTES,
  NATIVE_AUDIO_FORMATS,
  SPECTROGRAM_MAX_COLUMNS,
  SPECTROGRAM_MIN_COLUMNS,
  SPECTROGRAM_NON_PLOT_WIDTH,
  STATUS,
  SUPPORTED_AUDIO_EXTENSIONS,
  TESTED_SAFARI_EXTRA_FORMATS,
  TESTED_WEB_AUDIO_FORMATS,
} from "./constants.js";
import { decodeAudioFile } from "./decoders/index.js";
import { downloadCanvasPng } from "./export.js";
import { decoderLabel, formatBytes, formatList, formatTimeMmSs, labelWindow } from "./format.js";
import { capColumnsForMatrixBudget, decodedByteSize } from "./memory.js";
import { makePalette } from "./palette.js";
import { formatReadout, spectrogramReadoutAtPoint } from "./readout.js";
import { drawSpectrogram, spectrogramPlot } from "./render.js";
import { applyStoredControlSettings, loadStoredSettings, saveStoredSettings } from "./settings-store.js";

const els = {
  fileInput: document.querySelector("#fileInput"),
  exportButton: document.querySelector("#exportButton"),
  dropZone: document.querySelector("#dropZone"),
  emptyState: document.querySelector("#emptyState"),
  nativeSupport: document.querySelector("#nativeSupport"),
  canvas: document.querySelector("#spectrogramCanvas"),
  fileMeta: document.querySelector("#fileMeta"),
  decoderHelpButton: document.querySelector("#decoderHelpButton"),
  decoderHelp: document.querySelector("#decoderHelp"),
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
  statusToast: document.querySelector("#statusToast"),
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
  renderWorker: null,
  renderVersion: 0,
  renderRequestId: 0,
  renderBitmap: null,
  renderBitmapKey: "",
  renderBitmapPendingKey: "",
};

const ctx = els.canvas.getContext("2d", { alpha: false });
let resizeTimer = 0;
let statusToastTimer = 0;
let renderedPaletteName = "";
let renderedPalette = null;
applyStoredControlSettings(els, loadStoredSettings());
els.fileInput.accept = FILE_ACCEPT_TYPES.join(",");
els.streamSelect.options[0].textContent = DECODER_STREAM_LABELS.browser;
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

function setStatus(text, { toast = false } = {}) {
  els.statusText.textContent = text;
  if (toast) showStatusToast(text);
}

function showStatusToast(text) {
  clearTimeout(statusToastTimer);
  els.statusToast.textContent = text;
  els.statusToast.classList.add("open");
  statusToastTimer = setTimeout(() => {
    hideStatusToast();
  }, 5200);
}

function hideStatusToast() {
  clearTimeout(statusToastTimer);
  statusToastTimer = 0;
  els.statusToast.classList.remove("open");
}

function setProgress(value) {
  els.progressBar.style.width = `${Math.max(0, Math.min(1, value)) * 100}%`;
}

function setWorkspaceHasFile(hasFile) {
  els.emptyState.classList.toggle("hidden", hasFile);
  els.dropZone.classList.toggle("hasFile", hasFile);
  if (hasFile) {
    els.dropZone.removeAttribute("role");
    els.dropZone.tabIndex = -1;
    els.dropZone.setAttribute("aria-label", "Spectrogram workspace");
  } else {
    els.dropZone.setAttribute("role", "button");
    els.dropZone.tabIndex = 0;
    els.dropZone.setAttribute("aria-label", "Open or drop an audio file");
  }
}

function clearLoadedAudio({ fileMetaText, statusText, toast = false }) {
  state.audioBuffer = null;
  state.matrix = null;
  els.exportButton.disabled = true;
  els.fileMeta.textContent = fileMetaText;
  setWorkspaceHasFile(false);
  setProgress(0);
  setStatus(statusText, { toast });
  render();
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

function isClearlyUnsupportedFile(file) {
  const type = String(file.type || "").toLowerCase();
  if (type.startsWith("video/") || type.startsWith("image/")) return true;
  if (type.startsWith("audio/")) return false;
  const name = String(file.name || "").toLowerCase();
  if (!/\.[a-z0-9]+$/i.test(name)) return false;
  return !SUPPORTED_AUDIO_EXTENSIONS.some((extension) => name.endsWith(`.${extension}`));
}

async function openFile(file, overrides = {}) {
  if (!file) return;
  const openId = ++state.openId;
  if (isClearlyUnsupportedFile(file)) {
    showStatusToast("Unsupported file. Choose an audio file in a supported format.");
    return;
  }
  state.currentFile = file;
  state.streamIndex = Number(overrides.streamIndex || 0);
  state.analysisId++;
  state.matrix = null;
  setWorkspaceHasFile(true);
  els.exportButton.disabled = true;
  setProgress(0);
  hideStatusToast();
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
    clearLoadedAudio({
      fileMetaText: file.name,
      statusText: `Could not decode this file. ${error.message || error}`,
      toast: true,
    });
  }
}

function populateSelect(select, count, { selectedIndex = 0, label, disabledWhen }) {
  select.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = label(i);
    select.append(option);
  }
  select.value = String(selectedIndex);
  select.disabled = disabledWhen(count);
}

function populateStreams(decoded) {
  populateSelect(els.streamSelect, decoded.streamCount, {
    selectedIndex: decoded.streamIndex,
    label: (i) => (i === decoded.streamIndex ? decoded.streamLabel : `Stream ${i + 1}`),
    disabledWhen: (count) => count <= 1,
  });
}

function populateChannels(count) {
  populateSelect(els.channelSelect, count, {
    label: (i) => (count === 1 ? "Mono" : `Channel ${i + 1}`),
    disabledWhen: (n) => n < 1,
  });
}

function metaText() {
  return [fileTitleText(), detailText()].filter(Boolean).join(" · ");
}

function fileTitleText() {
  if (!state.audioBuffer) return "Open an audio file to begin.";
  return state.fileName;
}

function detailText() {
  if (!state.audioBuffer) return "";
  const s = settings();
  const duration = formatTimeMmSs(state.audioBuffer.duration);
  const sourceRate = state.audioBuffer.sourceSampleRate && state.audioBuffer.sourceSampleRate !== state.audioBuffer.sampleRate
    ? `src ${state.audioBuffer.sourceSampleRate} Hz, decoded ${state.audioBuffer.sampleRate} Hz`
    : `${state.audioBuffer.sampleRate} Hz`;
  const stream = `Stream ${state.audioBuffer.streamIndex + 1} / ${state.audioBuffer.streamCount || 1}`;
  const codec = codecText(state.audioBuffer);
  const bits = state.audioBuffer.bitsPerSample ? `${state.audioBuffer.bitsPerSample} bits` : "";
  const channel = channelText();
  return [
    stream,
    codec,
    duration,
    sourceRate,
    bits,
    channel,
    `W:${s.fftSize}`,
    labelWindow(s.windowFunction),
  ].filter(Boolean).join(" · ");
}

function codecText(audio) {
  if (audio.codecLongName) return audio.codecLongName;
  if (audio.codecName) return audio.codecName.toUpperCase();
  return DECODER_AUDIO_LABELS[audio.backend] || DECODER_AUDIO_LABELS.browser;
}

function channelText() {
  if (!state.audioBuffer) return "";
  const channels = state.audioBuffer.channelCount;
  const selected = Math.min(settings().channel, Math.max(0, channels - 1));
  return channels === 1 ? "Mono" : `Channel ${selected + 1} / ${channels}`;
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
  const worker = new Worker(new URL("./analysis-worker.js", import.meta.url), { type: "module" });
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
    state.renderVersion++;
    clearRenderBitmap();
    prepareRenderWorkerMatrix();
    setProgress(1);
    setStatus(STATUS.analysisComplete);
    els.exportButton.disabled = false;
    render();
  }
  if (message.type === "error") {
    setStatus(message.error);
    setProgress(0);
  }
}

function render({ forceSync = false } = {}) {
  resizeCanvas();
  const s = settings();
  if (!state.matrix || !state.audioBuffer) {
    ctx.fillStyle = "#020306";
    ctx.fillRect(0, 0, els.canvas.width, els.canvas.height);
    return;
  }
  const options = spectrogramRenderOptions(s);
  const key = renderBitmapKey(s);
  if (!forceSync && state.renderBitmap && state.renderBitmapKey === key) {
    drawSpectrogram(ctx, { ...options, bitmap: state.renderBitmap });
    return;
  }
  if (!forceSync && requestRenderWorkerBitmap(s, key)) {
    setStatus("Rendering...");
    return;
  }
  drawSpectrogram(ctx, options);
}

function spectrogramRenderOptions(s) {
  return {
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
    fileName: fileTitleText(),
    meta: detailText(),
  };
}

function renderBitmapKey(s) {
  return `${state.renderVersion}:${s.minDb}:${s.maxDb}:${s.palette}`;
}

function currentPalette(name) {
  if (renderedPaletteName !== name || !renderedPalette) {
    renderedPaletteName = name;
    renderedPalette = makePalette(name);
  }
  return renderedPalette;
}

function clearRenderBitmap() {
  if (state.renderBitmap && typeof state.renderBitmap.close === "function") state.renderBitmap.close();
  state.renderBitmap = null;
  state.renderBitmapKey = "";
  state.renderBitmapPendingKey = "";
}

function canUseRenderWorker() {
  return (
    typeof Worker === "function" &&
    typeof OffscreenCanvas === "function" &&
    typeof OffscreenCanvas.prototype.transferToImageBitmap === "function"
  );
}

function ensureRenderWorker() {
  if (!canUseRenderWorker()) return null;
  if (!state.renderWorker) {
    state.renderWorker = new Worker(new URL("./render-bitmap-worker.js", import.meta.url), { type: "module" });
    state.renderWorker.onmessage = handleRenderWorkerMessage;
    state.renderWorker.onerror = () => {
      state.renderWorker?.terminate();
      state.renderWorker = null;
      state.renderBitmapPendingKey = "";
      if (state.matrix && state.audioBuffer) render({ forceSync: true });
    };
  }
  return state.renderWorker;
}

function prepareRenderWorkerMatrix() {
  const worker = ensureRenderWorker();
  if (!worker || !state.matrix) return;
  const matrixCopy = new Float32Array(state.matrix);
  worker.postMessage({
    type: "set-matrix",
    version: state.renderVersion,
    matrix: matrixCopy.buffer,
    columns: state.columns,
    bands: state.bands,
  }, [matrixCopy.buffer]);
}

function requestRenderWorkerBitmap(s, key) {
  const worker = ensureRenderWorker();
  if (!worker || !state.matrix) return false;
  if (state.renderBitmapPendingKey === key) return true;
  const palette = new Uint8ClampedArray(currentPalette(s.palette));
  worker.postMessage({
    type: "render",
    id: ++state.renderRequestId,
    key,
    minDb: s.minDb,
    maxDb: s.maxDb,
    palette: palette.buffer,
  }, [palette.buffer]);
  state.renderBitmapPendingKey = key;
  return true;
}

function handleRenderWorkerMessage(event) {
  const message = event.data;
  if (
    message.type !== "bitmap" ||
    message.id !== state.renderRequestId ||
    message.version !== state.renderVersion ||
    message.key !== state.renderBitmapPendingKey
  ) {
    if (message.bitmap && typeof message.bitmap.close === "function") message.bitmap.close();
    return;
  }
  clearRenderBitmap();
  state.renderBitmap = message.bitmap;
  state.renderBitmapKey = message.key;
  state.renderBitmapPendingKey = "";
  render();
  setStatus(STATUS.analysisComplete);
}

function displayNyquist(audio) {
  return ((audio.sourceSampleRate || audio.sampleRate) / 2);
}

function exportPng() {
  if (!state.matrix || !state.audioBuffer) return;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = EXPORT_IMAGE_WIDTH;
  exportCanvas.height = EXPORT_IMAGE_HEIGHT;
  const exportCtx = exportCanvas.getContext("2d", { alpha: false });
  drawSpectrogram(exportCtx, {
    ...spectrogramRenderOptions(settings()),
    width: EXPORT_IMAGE_WIDTH,
    height: EXPORT_IMAGE_HEIGHT,
  });
  downloadCanvasPng(exportCanvas, state.fileName);
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
  const formats = nativeBrowserFormats(navigator.userAgent);
  els.nativeSupport.textContent = `Browser mode supports ${formatList(formats)} natively.`;
}

function nativeBrowserFormats(userAgent) {
  return uniqueLabels([
    ...testedBrowserFormats(userAgent),
    ...nativeAudioSupport(),
  ]);
}

function testedBrowserFormats(userAgent) {
  const formats = [...TESTED_WEB_AUDIO_FORMATS];
  if (isSafari(userAgent)) formats.push(...TESTED_SAFARI_EXTRA_FORMATS);
  return formats;
}

function isSafari(userAgent) {
  return /Safari\//.test(userAgent) && !/Chrome\/|Chromium\/|Firefox\/|Edg\//.test(userAgent);
}

function nativeAudioSupport() {
  const audio = document.createElement("audio");
  if (typeof audio.canPlayType !== "function") return [];
  return NATIVE_AUDIO_FORMATS
    .filter((format) => format.types.some((type) => audio.canPlayType(type) !== ""))
    .map((format) => format.label);
}

function uniqueLabels(labels) {
  return [...new Set(labels)];
}

function openFilePicker() {
  els.fileInput.value = "";
  els.fileInput.click();
}

function setDecoderHelpOpen(open) {
  els.decoderHelp.classList.toggle("open", open);
  els.decoderHelpButton.setAttribute("aria-expanded", String(open));
}

function toggleDecoderHelp() {
  setDecoderHelpOpen(!els.decoderHelp.classList.contains("open"));
}

els.fileInput.addEventListener("change", () => openFile(els.fileInput.files[0]));
els.exportButton.addEventListener("click", exportPng);
els.decoderHelpButton.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleDecoderHelp();
});
document.addEventListener("click", () => setDecoderHelpOpen(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setDecoderHelpOpen(false);
});
els.decoderModeSelect.addEventListener("pointerdown", () => setDecoderHelpOpen(false));
els.decoderModeSelect.addEventListener("focus", () => setDecoderHelpOpen(false));
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
  setDecoderHelpOpen(false);
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
  if (els.dropZone.classList.contains("hasFile")) return;
  openFilePicker();
});

els.dropZone.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  if (els.dropZone.classList.contains("hasFile")) return;
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
  if (state.matrix) setStatus(STATUS.analysisComplete);
});

window.addEventListener("resize", () => {
  resizeCanvas();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state.audioBuffer) analyze();
  }, 250);
});

resizeCanvas();

const params = new URLSearchParams(location.search);

if (params.get("decoder")) {
  const decoder = params.get("decoder") === "ffmpeg" ? "ffmpeg" : "browser";
  els.decoderModeSelect.value = decoder;
  persistSettings();
}

if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
  import("./dev-harness.js").then(({ installDevHarness }) => {
    installDevHarness({
      state,
      els,
      setWorkspaceHasFile,
      populateStreams,
      populateChannels,
      metaText,
      analyze,
      openFile,
      render,
      setStatus,
    });
  });
}
