// SPDX-License-Identifier: AGPL-3.0-or-later
const STORAGE_KEY = "cymlet-settings";

export function loadStoredSettings(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export function saveStoredSettings(settings, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Settings persistence should never block analysis.
  }
}

export function applyStoredControlSettings(els, stored) {
  setIfOptionExists(els.decoderModeSelect, stored.decoderMode);
  setIfOptionExists(els.paletteSelect, stored.palette);
  setIfOptionExists(els.fftSizeSelect, stored.fftSize);
  setIfOptionExists(els.windowSelect, stored.windowFunction);
  setNumberIfFinite(els.minDbInput, stored.minDb);
  setNumberIfFinite(els.maxDbInput, stored.maxDb);
}

function setIfOptionExists(select, value) {
  if (!select || value === undefined) return;
  const stringValue = String(value);
  if ([...select.options].some((option) => option.value === stringValue)) {
    select.value = stringValue;
  }
}

function setNumberIfFinite(input, value) {
  if (!input || !Number.isFinite(Number(value))) return;
  input.value = String(value);
}
