// SPDX-License-Identifier: AGPL-3.0-or-later
import { analyzeSamples } from "./dsp.js";

self.onmessage = (event) => {
  const message = event.data;
  if (message.type !== "analyze") return;
  try {
    const result = analyzeSamples({
      samples: message.samples,
      fftSize: message.fftSize,
      windowFunction: message.windowFunction,
      columns: message.columns,
      onProgress: (progress) => self.postMessage({ type: "progress", id: message.id, progress }),
    });
    self.postMessage({
      type: "done",
      id: message.id,
      columns: result.columns,
      bands: result.bands,
      matrix: result.matrix.buffer,
    }, [result.matrix.buffer]);
  } catch (error) {
    self.postMessage({
      type: "error",
      id: message.id,
      error: error.message || String(error),
    });
  }
};
