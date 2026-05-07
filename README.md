# Cymlet

Cymlet is a local-first audio spectrogram analyzer that runs entirely in your browser. Drop in an audio file, get an inspectable, exportable spectrogram — nothing is uploaded.

## Features

- Native browser decoding for WAV, MP3, AAC/M4A, Ogg Vorbis, and FLAC, plus ALAC and AC-3 on Safari.
- Optional FFmpeg WASM fallback for formats the browser can't handle (APE, WavPack, WMA, DTS, Musepack, and similar). The bundle is loaded lazily, only when needed.
- Worker-based FFT analysis with configurable size, window, palette, and dB range.
- Stream and channel selection (FFmpeg path), hover readout for time/frequency/dB, and PNG export.

## Run

There's no build step. Serve the directory with any static server:

```sh
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Browser support

The browser decoder uses Web Audio's `decodeAudioData`, so supported formats vary by browser, OS, container, and codec. The table below reflects the local fixture matrix on Safari 26.4, Firefox 150, and Chromium 148:

| Format | Path | Notes |
| --- | --- | --- |
| WAV PCM | Browser | All three browsers. |
| MP3 | Browser | All three browsers. |
| M4A/AAC | Browser | All three browsers. |
| Ogg Vorbis | Browser | All three browsers. |
| FLAC | Browser | All three browsers, including 96 kHz at source rate. |
| ALAC/M4A | Safari only | Firefox and Helium/Chromium need FFmpeg. |
| AC-3 | Safari only | Firefox and Helium/Chromium need FFmpeg. |
| DTS | FFmpeg | No native support in tested browsers. |
| APE, WavPack, WMA, Musepack | FFmpeg | No browser support. |

Cymlet sniffs WAV, MP3, FLAC, and Ogg Vorbis source rates and decodes through an `OfflineAudioContext` at that rate. The offline context's sample rate is decoupled from the device output, so it stays reliable on platforms that override `new AudioContext({ sampleRate })` (older browsers, iOS, unusual audio-device rates). If the offline path rejects the rate, decoding falls back to `AudioContext`, and the UI shows both the source and decoded sample rates whenever they differ. For source-rate parity in other containers, use FFmpeg mode.

The vendored FFmpeg build is single-threaded so any plain static server works — threaded builds need cross-origin isolation headers, which we deliberately avoid.

### Decoder modes

- **Browser first** (default): native Web Audio decode. If the file is a likely compatibility format and decoding fails, the UI prompts before loading FFmpeg.
- **FFmpeg for more formats**: loads the WASM bundle directly. Use this when you already know the file needs FFmpeg, or when you want stream metadata and source-rate parity.

Browser-mode limitations to be aware of:

- The whole file is read before decoding starts.
- Decoders may resample to the `AudioContext` rate.
- Codec name, bitrate, bit depth, and stream metadata are limited or unavailable.
- Multi-stream containers aren't exposed as selectable streams.

The app also reads `HTMLAudioElement.canPlayType()` at runtime and surfaces additional reported native support as a hint. Treat that as browser-advertised support, not proof that every codec inside that container will actually decode through Web Audio.

## Architecture

The UI lives in `src/main.js`. Decoding is split into `src/decoders/`: a statically-imported browser path and a dynamically-imported FFmpeg path that only loads when selected or accepted. FFT, windowing, and matrix generation happen in a Web Worker (`src/analysis-worker.js`, `src/dsp.js`); rendering is offloaded to a bitmap-canvas worker (`src/render.js`, `src/render-bitmap-worker.js`). Settings persist via `src/settings-store.js`, and `src/memory.js` caps spectrogram column counts so very long files don't blow out memory.

## Develop

Run the test suite (DSP, decoders, rendering, palettes, settings, export, readouts, fixtures):

```sh
node --test
```

Syntax-check the browser modules and scripts:

```sh
node --run check
```

Load the built-in sweep fixture through the real worker/render path:

```text
http://localhost:4173/?demo=1
```

Run the in-browser smoke test:

```js
await window.__spectrogramSmokeTest()
```

Or visit `http://localhost:4173/?smoke=1` and read `document.body.dataset.smokeResult`.

Run the full fixture suites against the browser or FFmpeg path; results land in `document.body.dataset.suiteResult`:

```text
http://localhost:4173/?suite=browser
http://localhost:4173/?suite=compatibility
```

External codec samples referenced by `test/codec-samples.js` are not part of the distribution. Download them with:

```sh
node scripts/download-codec-samples.mjs
```

Then load any sample directly with `?sample=<filename>` (localhost only).

## Provenance

Cymlet is a greenfield project. During planning, [Spek](https://github.com/alexkay/spek) was reviewed for desktop-analyzer expectations — decode and metadata shape, FFT intervaling, window functions, dB averaging, palette formulas, and ruler conventions. Cymlet is not a port.

The SoX palette derives from Rob Sykes' SoX default; the Spectrum palette follows a modified Dan Bruton spectrum algorithm.

The optional FFmpeg WASM bundle in `vendor/ffmpeg/` is `@ffmpeg/ffmpeg@0.12.15` (MIT) and single-thread `@ffmpeg/core@0.12.10` (GPL-2.0-or-later). Upstream notices live in `vendor/ffmpeg/THIRD_PARTY_NOTICES.md` and must stay intact when redistributing. FFmpeg licensing varies with build configuration, codecs, and linked libraries, so verify provenance for any release that ships the bundle.

## License

Project source is AGPL-3.0-or-later; see `LICENSE`. The vendored FFmpeg bundle keeps its upstream licenses — Cymlet does not relicense it.
