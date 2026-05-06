// SPDX-License-Identifier: AGPL-3.0-or-later
import { decodeWithBrowser } from "./browser-decoder.js";

const COMPATIBILITY_EXTENSIONS = /\.(ape|wv|wma|wmv|ac3|dts|mpc|mka|mkv|opus|aiff?|caf|alac|flac|m4a)$/i;

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
  return COMPATIBILITY_EXTENSIONS.test(file?.name || "");
}

async function loadFfmpegDecoder(options) {
  if (options.loadFfmpegDecoder) return options.loadFfmpegDecoder();
  return import("./ffmpeg-decoder.js");
}
