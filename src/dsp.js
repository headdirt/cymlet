// SPDX-License-Identifier: AGPL-3.0-or-later
export const SILENCE_DB = -200;

export function analyzeSamples({ samples, fftSize, columns, windowFunction, onProgress }) {
  if (!samples || samples.length === 0) {
    throw new Error("No audio samples to analyze.");
  }
  if (!Number.isInteger(columns) || columns <= 0) {
    throw new Error("Column count must be a positive integer.");
  }

  const bands = fftSize / 2 + 1;
  const matrix = new Float32Array(columns * bands);
  const window = createWindow(windowFunction, fftSize);
  const fft = new RealFft(fftSize);
  const input = new Float64Array(fftSize);
  const accum = new Float64Array(bands);
  const intervals = planIntervals(samples.length, columns);
  const n2 = fftSize * fftSize;
  let lastProgress = 0;

  for (let x = 0; x < columns; x++) {
    const { start, end } = intervals[x];
    const interval = end - start;
    accum.fill(0);
    let count = 0;

    if (interval >= fftSize) {
      for (let pos = start; pos + fftSize <= end; pos += fftSize) {
        fillWindowedInput(input, samples, pos, window);
        accumulateDbFromSpectrum(accum, fft.forward(input), n2);
        count++;
      }
    }

    if (count === 0) {
      const pos = Math.max(0, Math.min(samples.length - fftSize, end - fftSize));
      fillWindowedInput(input, samples, pos, window);
      accumulateDbFromSpectrum(accum, fft.forward(input), n2);
      count = 1;
    }

    const offset = x * bands;
    for (let y = 0; y < bands; y++) {
      matrix[offset + y] = accum[y] / count;
    }

    const progress = (x + 1) / columns;
    if (onProgress && (progress - lastProgress > 0.015 || x === columns - 1)) {
      lastProgress = progress;
      onProgress(progress);
    }
  }

  return { columns, bands, matrix };
}

export function planIntervals(totalFrames, columns) {
  if (!Number.isInteger(totalFrames) || totalFrames <= 0) {
    throw new Error("Frame count must be a positive integer.");
  }
  if (!Number.isInteger(columns) || columns <= 0) {
    throw new Error("Column count must be a positive integer.");
  }

  const intervals = [];
  const base = Math.floor(totalFrames / columns);
  const remainder = totalFrames % columns;
  let start = 0;
  let error = 0;

  for (let column = 0; column < columns; column++) {
    let length = base;
    error += remainder;
    if (error >= columns) {
      length++;
      error -= columns;
    }

    if (base === 0 && column < totalFrames) {
      length = 1;
    }

    const end = Math.min(totalFrames, start + length);
    intervals.push({ start, end });
    start = end;
  }

  return intervals;
}

export function createWindow(name, n) {
  const window = new Float64Array(n);
  const factor = (2 * Math.PI) / (n - 1);
  for (let i = 0; i < n; i++) {
    const c = Math.cos(factor * i);
    if (name === "hamming") {
      window[i] = 0.53836 - 0.46164 * c;
    } else if (name === "blackmanHarris") {
      window[i] = 0.35875 - 0.48829 * c + 0.14128 * Math.cos(2 * factor * i) - 0.01168 * Math.cos(3 * factor * i);
    } else {
      window[i] = 0.5 * (1 - c);
    }
  }
  return window;
}

export function fftToDb(spectrum, fftSize) {
  const values = new Float64Array(fftSize / 2 + 1);
  accumulateDbFromSpectrum(values, spectrum, fftSize * fftSize);
  return values;
}

function fillWindowedInput(input, samples, start, window) {
  const n = input.length;
  const available = samples.length - start;
  const limit = available < n ? available : n;
  for (let i = 0; i < limit; i++) {
    input[i] = samples[start + i] * window[i];
  }
  for (let i = limit; i < n; i++) {
    input[i] = 0;
  }
}

function accumulateDbFromSpectrum(accum, spectrum, n2) {
  const bands = accum.length;
  const real = spectrum.real;
  const imag = spectrum.imag;
  const last = bands - 1;
  for (let i = 0; i < bands; i++) {
    const re = real[i];
    const im = imag[i];
    const power = i === 0 || i === last ? (re * re) / n2 : (re * re + im * im) / n2;
    accum[i] += power > 0 ? 10 * Math.log10(power) : SILENCE_DB;
  }
}

export class RealFft {
  constructor(size) {
    if ((size & (size - 1)) !== 0) throw new Error("FFT size must be a power of two.");
    this.size = size;
    this.levels = Math.log2(size);
    this.cos = new Float64Array(size / 2);
    this.sin = new Float64Array(size / 2);
    this.rev = new Uint32Array(size);
    this.real = new Float64Array(size);
    this.imag = new Float64Array(size);
    this.outReal = new Float64Array(size / 2 + 1);
    this.outImag = new Float64Array(size / 2 + 1);
    for (let i = 0; i < size / 2; i++) {
      const angle = (-2 * Math.PI * i) / size;
      this.cos[i] = Math.cos(angle);
      this.sin[i] = Math.sin(angle);
    }
    for (let i = 0; i < size; i++) {
      this.rev[i] = reverseBits(i, this.levels);
    }
  }

  forward(input) {
    const n = this.size;
    for (let i = 0; i < n; i++) {
      this.real[i] = input[this.rev[i]];
      this.imag[i] = 0;
    }

    for (let size = 2; size <= n; size *= 2) {
      const half = size / 2;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0; j < half; j++) {
          const k = j * step;
          const l = i + j;
          const r = l + half;
          const tre = this.real[r] * this.cos[k] - this.imag[r] * this.sin[k];
          const tim = this.real[r] * this.sin[k] + this.imag[r] * this.cos[k];
          this.real[r] = this.real[l] - tre;
          this.imag[r] = this.imag[l] - tim;
          this.real[l] += tre;
          this.imag[l] += tim;
        }
      }
    }

    for (let i = 0; i <= n / 2; i++) {
      this.outReal[i] = this.real[i];
      this.outImag[i] = this.imag[i];
    }
    return { real: this.outReal, imag: this.outImag };
  }
}

function reverseBits(value, bits) {
  let reversed = 0;
  for (let i = 0; i < bits; i++) {
    reversed = (reversed << 1) | (value & 1);
    value >>>= 1;
  }
  return reversed;
}
