// SPDX-License-Identifier: AGPL-3.0-or-later
export function formatTimeMmSs(seconds) {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
