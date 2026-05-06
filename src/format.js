// SPDX-License-Identifier: AGPL-3.0-or-later
export function formatTimeMmSs(seconds) {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function formatList(items) {
  if (items.length <= 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

export function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export function labelWindow(value) {
  if (value === "blackmanHarris") return "Blackman-Harris";
  return value[0].toUpperCase() + value.slice(1);
}

export function decoderLabel(value) {
  if (value === "ffmpeg") return "the FFmpeg decoder";
  return "the browser backend";
}
