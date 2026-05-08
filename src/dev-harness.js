// SPDX-License-Identifier: AGPL-3.0-or-later
import { STATUS, SYNTHETIC_SAMPLE_RATE } from "./constants.js";
import { safePathSegment } from "./file-utils.js";
import { createFixtureAudioBuffer, createSweepFixture, encodeWavPcm16 } from "./fixtures.js";
import { decodedByteSize } from "./memory.js";
import { canvasHasSignal, waitForCondition } from "./smoke.js";

export function installDevHarness(api) {
  const {
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
  } = api;

  window.__loadSyntheticSpectrogram = async () => {
    const sampleRate = SYNTHETIC_SAMPLE_RATE;
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
    setWorkspaceHasFile(true);
    populateStreams(fixtureMeta);
    populateChannels(fixtureMeta.channelCount);
    els.fileMeta.textContent = metaText();
    analyze();
  };

  window.__loadGeneratedStressFile = async ({ seconds = 120, decoderMode = "browser" } = {}) => {
    const sampleRate = SYNTHETIC_SAMPLE_RATE;
    const channels = 2;
    const fixture = createSweepFixture({ sampleRate, seconds, channels });
    const wav = encodeWavPcm16(fixture);
    const file = new File([wav], `generated-${seconds}s-stress.wav`, { type: "audio/wav" });
    const previousDecoder = els.decoderModeSelect.value;
    els.decoderModeSelect.value = decoderMode;
    try {
      await openFile(file);
    } finally {
      els.decoderModeSelect.value = previousDecoder;
    }
  };

  window.__loadLocalSample = async (name) => {
    const safeName = safePathSegment(name);
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
        const complete = await waitForCondition(() => els.statusText.textContent === STATUS.analysisComplete, {
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
    const complete = await waitForCondition(() => els.statusText.textContent === STATUS.analysisComplete, {
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
    const complete = await waitForCondition(() => els.statusText.textContent === STATUS.analysisComplete, {
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

  dispatchUrlParams(api);
}

function dispatchUrlParams({ els, setStatus }) {
  const params = new URLSearchParams(location.search);

  if (params.get("demo") === "1") {
    window.__loadSyntheticSpectrogram();
  }

  if (params.get("smoke") === "1") {
    runDevTask({
      promise: window.__spectrogramSmokeTest(),
      datasetKey: "smokeResult",
      label: "Smoke test",
      passed: testRunPassed,
      setStatus,
    });
  }

  if (params.get("stress")) {
    const decoderMode = params.get("stress") === "compatibility" ? "ffmpeg" : "browser";
    const seconds = Math.max(1, Math.min(900, Number(params.get("seconds") || 120)));
    runDevTask({
      promise: window.__spectrogramStressTest({ seconds, decoderMode }),
      datasetKey: "stressResult",
      label: "Stress test",
      passed: testRunPassed,
      setStatus,
    });
  }

  if (params.get("sample")) {
    window.__loadLocalSample(params.get("sample")).catch((error) => {
      document.body.dataset.sampleError = error.message || String(error);
      setStatus("Sample load failed.");
    });
  }

  if (params.get("suite") === "browser" || params.get("suite") === "compatibility") {
    const mode = params.get("suite") === "compatibility" ? "compatibility" : "browser";
    const promise = import("../test/codec-samples.js").then(({ codecSamplesByMode, codecSamplesForReleaseBrowserSuite }) => {
      if (mode === "compatibility") els.decoderModeSelect.value = "ffmpeg";
      const selectedSamples = mode === "browser" ? codecSamplesForReleaseBrowserSuite() : codecSamplesByMode(mode);
      return window.__runBrowserSampleSuite(selectedSamples.map((sample) => sample.name));
    });
    runDevTask({
      promise,
      datasetKey: "suiteResult",
      label: "Fixture suite",
      passed: (result) => result.passed,
      failureDetail: (result) => result.results
        .filter((item) => !item.complete || !item.nonblank || !item.exportPng || item.error)
        .map((item) => item.sample)
        .join(", "),
      errorPayload: (error) => ({ passed: false, error: error.message || String(error) }),
      setStatus,
    });
  }
}

function runDevTask({ promise, datasetKey, label, passed, failureDetail, errorPayload, setStatus }) {
  promise.then((result) => {
    document.body.dataset[datasetKey] = JSON.stringify(result);
    if (passed(result)) {
      setStatus(`${label} passed.`);
    } else {
      const detail = failureDetail?.(result);
      setStatus(detail ? `${label} failed: ${detail}` : `${label} failed.`);
    }
  }).catch((error) => {
    document.body.dataset[datasetKey] = JSON.stringify(
      errorPayload ? errorPayload(error) : { error: error.message || String(error) }
    );
    setStatus(`${label} failed.`);
  });
}

function testRunPassed(result) {
  return result.complete && result.nonblank && result.exportPng;
}
