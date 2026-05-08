// SPDX-License-Identifier: AGPL-3.0-or-later
export function makePalette(name, size = 256) {
  const colors = new Uint8ClampedArray(size * 4);
  for (let i = 0; i < size; i++) {
    const packed = paletteColor(name, i / (size - 1));
    const offset = i * 4;
    colors[offset] = (packed >> 16) & 255;
    colors[offset + 1] = (packed >> 8) & 255;
    colors[offset + 2] = packed & 255;
    colors[offset + 3] = 255;
  }
  return colors;
}

export function paletteColor(name, level) {
  const clamped = Math.max(0, Math.min(1, level));
  if (name === "spectrum") return spectrum(clamped);
  if (name === "mono") return mono(clamped);
  return sox(clamped);
}

function spectrum(level) {
  level *= 0.6625;
  let r = 0;
  let g = 0;
  let b = 0;
  if (level >= 0 && level < 0.15) {
    r = (0.15 - level) / 0.225;
    b = 1;
  } else if (level < 0.275) {
    g = (level - 0.15) / 0.125;
    b = 1;
  } else if (level < 0.325) {
    g = 1;
    b = (0.325 - level) / 0.05;
  } else if (level < 0.5) {
    r = (level - 0.325) / 0.175;
    g = 1;
  } else if (level < 0.6625) {
    r = 1;
    g = (0.6625 - level) / 0.1625;
  }
  let cf = level >= 0 && level < 0.1 ? level / 0.1 : 1;
  cf *= 255;
  return pack(r * cf, g * cf, b * cf);
}

function sox(level) {
  let r = 0;
  if (level >= 0.13 && level < 0.73) r = Math.sin(((level - 0.13) / 0.6) * Math.PI / 2);
  else if (level >= 0.73) r = 1;
  let g = 0;
  if (level >= 0.6 && level < 0.91) g = Math.sin(((level - 0.6) / 0.31) * Math.PI / 2);
  else if (level >= 0.91) g = 1;
  let b = 0;
  if (level < 0.6) b = 0.5 * Math.sin((level / 0.6) * Math.PI);
  else if (level >= 0.78) b = (level - 0.78) / 0.22;
  return pack(r * 255, g * 255, b * 255);
}

function mono(level) {
  const v = Math.round(level * 255);
  return (v << 16) + (v << 8) + v;
}

function pack(r, g, b) {
  return (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b);
}
