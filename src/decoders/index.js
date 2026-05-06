// SPDX-License-Identifier: AGPL-3.0-or-later
import { COMPATIBILITY_EXTENSIONS } from "../constants.js";
import { decodeWithBrowser } from "./browser-decoder.js";

export async function decodeAudioFile(file, options = {}) {
  const backend = options.backend || "browser";
  if (backend === "ffmpeg") {
    const ffmpeg = await loadFfmpegDecoder(options);
    return ffmpeg.decodeWithFfmpeg(file, options);
  }

  try {
    return await decodeWithBrowser(file, options);
  } catch (error) {
    const shouldFallback = options.fallbackToFfmpeg || (
      options.promptForFfmpegFallback &&
      shouldOfferCompatibilityDecoder(file) &&
      await options.promptForFfmpegFallback(file, error)
    );
    if (shouldFallback) {
      const ffmpeg = await loadFfmpegDecoder(options);
      return ffmpeg.decodeWithFfmpeg(file, { ...options, browserError: error });
    }
    throw error;
  }
}

export function shouldOfferCompatibilityDecoder(file) {
  return COMPATIBILITY_EXTENSIONS.some((extension) => fileExtensionIs(file, extension));
}

function fileExtensionIs(file, extension) {
  return String(file?.name || "").toLowerCase().endsWith(`.${extension}`);
}

async function loadFfmpegDecoder(options) {
  if (options.loadFfmpegDecoder) return options.loadFfmpegDecoder();
  return import("./ffmpeg-decoder.js");
}
