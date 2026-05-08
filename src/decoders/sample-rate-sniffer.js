// SPDX-License-Identifier: AGPL-3.0-or-later
import { readAscii } from "../file-utils.js";

const MP3_SAMPLE_RATES = {
  0b11: [44100, 48000, 32000],
  0b10: [22050, 24000, 16000],
  0b00: [11025, 12000, 8000],
};

export function sniffSourceSampleRate(arrayBuffer) {
  // Magic-byte sniffers (WAV/FLAC/Ogg) run before MP3's byte-scan heuristic, which
  // otherwise false-positives on FLAC frame sync (0xFF F8) and similar patterns.
  return sniffWavSampleRate(arrayBuffer)
    || sniffFlacSampleRate(arrayBuffer)
    || sniffOggVorbisSampleRate(arrayBuffer)
    || sniffMp3SampleRate(arrayBuffer)
    || null;
}

export function sniffWavSampleRate(arrayBuffer) {
  if (arrayBuffer.byteLength < 28) return null;
  const view = new DataView(arrayBuffer);
  if (readAscii(view, 0, 4) !== "RIFF" || readAscii(view, 8, 4) !== "WAVE") return null;

  let offset = 12;
  while (offset + 8 <= view.byteLength) {
    const id = readAscii(view, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const dataOffset = offset + 8;
    if (id === "fmt " && size >= 16 && dataOffset + 16 <= view.byteLength) {
      const sampleRate = view.getUint32(dataOffset + 4, true);
      return validSampleRate(sampleRate) ? sampleRate : null;
    }
    offset = dataOffset + size + (size % 2);
  }

  return null;
}

export function sniffMp3SampleRate(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let offset = 0;
  if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const tagSize = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
    offset = 10 + tagSize;
  }

  for (let i = offset; i + 4 <= bytes.length && i < offset + 4096; i++) {
    if (bytes[i] !== 0xff || (bytes[i + 1] & 0xe0) !== 0xe0) continue;
    const version = (bytes[i + 1] >> 3) & 0x03;
    const layer = (bytes[i + 1] >> 1) & 0x03;
    const sampleRateIndex = (bytes[i + 2] >> 2) & 0x03;
    if (version === 0b01 || layer === 0 || sampleRateIndex === 0b11) continue;
    return MP3_SAMPLE_RATES[version]?.[sampleRateIndex] || null;
  }

  return null;
}

export function sniffFlacSampleRate(arrayBuffer) {
  if (arrayBuffer.byteLength < 18) return null;
  const view = new DataView(arrayBuffer);
  if (readAscii(view, 0, 4) !== "fLaC") return null;
  const isStreamInfo = (view.getUint8(4) & 0x7f) === 0;
  const blockLength = (view.getUint8(5) << 16) | (view.getUint8(6) << 8) | view.getUint8(7);
  if (!isStreamInfo || blockLength < 34 || 8 + blockLength > view.byteLength) return null;

  const sampleRate = (view.getUint8(18) << 12) | (view.getUint8(19) << 4) | (view.getUint8(20) >> 4);
  return validSampleRate(sampleRate) ? sampleRate : null;
}

export function sniffOggVorbisSampleRate(arrayBuffer) {
  const page = firstOggPagePacket(arrayBuffer);
  if (!page || page.length < 16) return null;
  const view = new DataView(page.buffer, page.byteOffset, page.byteLength);
  if (view.getUint8(0) !== 0x01 || readAscii(view, 1, 6) !== "vorbis") return null;
  const sampleRate = view.getUint32(12, true);
  return validSampleRate(sampleRate) ? sampleRate : null;
}

function firstOggPagePacket(arrayBuffer) {
  if (arrayBuffer.byteLength < 28) return null;
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  if (readAscii(view, 0, 4) !== "OggS" || view.getUint8(4) !== 0) return null;
  const segments = view.getUint8(26);
  const segmentTableOffset = 27;
  const dataOffset = segmentTableOffset + segments;
  if (dataOffset > bytes.length) return null;

  let packetLength = 0;
  for (let i = 0; i < segments; i++) {
    const lacing = bytes[segmentTableOffset + i];
    packetLength += lacing;
    if (lacing < 255) {
      const packetEnd = dataOffset + packetLength;
      return packetEnd <= bytes.length ? bytes.subarray(dataOffset, packetEnd) : null;
    }
  }

  return null;
}

function validSampleRate(sampleRate) {
  return Number.isInteger(sampleRate) && sampleRate >= 8000 && sampleRate <= 384000;
}
