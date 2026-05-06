# Cymlet

Cymlet is a local-first audio spectrogram analyzer that runs entirely in the browser. Click or drop an audio file, decode it client-side, analyze it in a worker, and render an exportable spectrogram without server-side audio processing.

## Features

- Browser-native decoding for common formats such as WAV, MP3, AAC/M4A, and Ogg/Vorbis where supported by the current browser.
- Optional FFmpeg WASM decoder for formats and metadata paths that native browser decoders do not expose.
- Channel and stream selection, FFT size and window controls, palette selection, dB range controls, hover readout, and PNG export.
- Worker-based FFT analysis with memory caps for large matrices.
- Lazy compatibility bundle loading: the FFmpeg WASM files are not fetched during successful browser-native decoding.

## Run

Serve the directory with any static server, then open the local URL:

```sh
python3 -m http.server 4173
```

Then visit `http://localhost:4173`.

The app performs browser-native audio decoding and worker-based FFT analysis entirely on the client. Browser-supported formats vary; Browser mode can offer the optional FFmpeg WASM decoder after native decode failure, and FFmpeg mode loads it directly.

## Architecture

- `src/main.js` owns UI state, decode orchestration, worker lifecycle, settings persistence, and local QA hooks.
- `src/constants.js` contains shared canvas, memory, column, plot, and tick constants.
- `src/decoders/browser-decoder.js` wraps Web Audio decoding in a common decoded-audio shape.
- `src/decoders/index.js` gates decoder selection. The browser decoder is imported statically; FFmpeg is loaded only through a dynamic import when FFmpeg mode is explicitly selected or accepted after browser decode failure.
- `src/decoders/ffmpeg-decoder.js` lazy-loads the optional FFmpeg runtime, transcodes unsupported input to a temporary WAV, then reuses browser decoding for normalized channel data.
- The FFmpeg decoder also probes audio stream metadata and maps selected streams with `-map 0:a:N`.
- `vendor/ffmpeg/` contains the optional single-thread FFmpeg WASM bundle and its setup/licensing notes.
- `src/dsp.js` owns FFT, windowing, dB conversion, and matrix generation.
- `src/render.js` owns annotated canvas rendering and cached bitmap-canvas drawing.
- `src/palette.js` provides compact typed-array palette tables.
- `src/fixtures.js` creates deterministic sweep fixtures and WAV data for tests.
- `src/export.js` owns PNG export naming and download behavior.
- `src/memory.js` owns decoded-audio and matrix memory estimates plus the spectrogram column cap.
- `src/readout.js` maps canvas hover coordinates to time, frequency, and dB readouts.
- `src/smoke.js` provides the localhost browser smoke-test helpers.
- `src/settings-store.js` persists user-facing control settings in localStorage.

## Test

```sh
node --test
```

Run syntax checks for browser modules and scripts:

```sh
node --run check
```

The test suite covers DSP behavior, decoding boundaries, sample-rate sniffing, memory estimates, palettes, rendering image stability, settings persistence, export naming, readouts, and fixture metadata.

Open `http://localhost:4173/?demo=1` to load the built-in generated sweep fixture through the same worker/render path as a real file.

For a lightweight browser smoke test, open the app on localhost and run:

```js
await window.__spectrogramSmokeTest()
```

Or visit `http://localhost:4173/?smoke=1` and inspect `document.body.dataset.smokeResult`.

## Fixtures

Optional upstream audio fixtures are tracked in `test/codec-samples.js`. They are used for codec coverage only and are not part of the app distribution.

Download them with:

```sh
node scripts/download-codec-samples.mjs
```

After downloading the fixtures, load a native browser fixture directly with:

```text
http://localhost:4173/?sample=2ch-44100Hz-16bps.wav
```

The `?sample=` helper is localhost-only and intended for manual/browser smoke testing.

Run all browser-expected fixtures through the real browser decode/analyze/render path with:

```text
http://localhost:4173/?suite=browser
```

The JSON result is written to `document.body.dataset.suiteResult`.

Run compatibility fixtures with the vendored FFmpeg WASM bundle:

```text
http://localhost:4173/?suite=compatibility
```

The current vendored bundle is `@ffmpeg/ffmpeg@0.12.15` plus single-thread `@ffmpeg/core@0.12.10`.

## Browser Support

Cymlet has two visible decoder modes:

- Browser: default, fast startup, native Web Audio decode first, with a consent prompt before loading the optional FFmpeg bundle after likely compatibility-format failures.
- FFmpeg: lazy FFmpeg WASM path selected directly for formats the browser cannot decode.

The Browser decoder uses Web Audio `decodeAudioData`. It is available in current Chromium, Firefox, and Safari, but supported audio formats vary by browser and OS.

Expected common Browser-mode support:

| Format | Expected Path | Notes |
| --- | --- | --- |
| WAV PCM | Browser | Best native fixture format. |
| MP3 | Browser | Broad support. |
| M4A/AAC | Browser | Broad support for AAC; M4A can also contain ALAC. |
| Ogg/Vorbis | Browser | Common in Chromium/Firefox; Safari support can vary. |

Important Browser decoder limitations:

- The full file is read before decoding.
- Browser decoders may resample to the `AudioContext` sample rate.
- Codec name, bitrate, bits per sample, and stream metadata are limited.
- Multi-stream containers are not exposed as selectable streams.

The Browser decoder sniffs WAV, MP3, FLAC, and Ogg Vorbis source sample rates before creating `AudioContext`, then requests that rate via `new AudioContext({ sampleRate })`. If a browser does not honor the requested rate, the UI shows both source and decoded sample rates. Source-rate parity for more containers still requires FFmpeg mode.

FFmpeg mode is gated behind a dynamic import and only loads when explicitly selected or accepted after browser decode failure in Browser mode.

Expected FFmpeg-mode cases:

| Format | Expected Path | Notes |
| --- | --- | --- |
| FLAC | FFmpeg | Some browsers support FLAC, but FFmpeg gives more consistent metadata/parity. |
| ALAC/M4A | FFmpeg | ALAC-in-M4A is not a reliable native browser target. |
| APE | FFmpeg | External fixture coverage target. |
| WavPack | FFmpeg | External fixture coverage target. |
| WMA | FFmpeg | External fixture coverage target. |
| AC3/DTS | FFmpeg | External fixture coverage target. |
| Musepack | FFmpeg | External fixture coverage target. |

Threaded FFmpeg builds may require cross-origin isolation headers. The current integration uses an unthreaded bundle so ordinary static servers stay simple.

## Provenance

Cymlet is a greenfield browser application. Its source is project-authored code, with the third-party dependencies and external fixtures noted here.

During early planning, selected open-source spectrogram behavior was reviewed for comparison with common desktop-analyzer expectations: decode and metadata shape, FFT intervaling, window functions, dB averaging, palette formulas, and ruler conventions. One reference project was Spek: https://github.com/alexkay/spek. Cymlet is not a direct port.

The optional FFmpeg decoder vendors browser files from:

- `@ffmpeg/ffmpeg@0.12.15`
- `@ffmpeg/core@0.12.10`

Vendored files live under `vendor/ffmpeg/` and are loaded only when FFmpeg mode is selected or accepted after browser decode failure in Browser mode. The current vendored package license metadata is documented in `vendor/ffmpeg/THIRD_PARTY_NOTICES.md`: `@ffmpeg/ffmpeg@0.12.15` is MIT and `@ffmpeg/core@0.12.10` is GPL-2.0-or-later.

Keep the FFmpeg bundle's upstream license notices intact when updating or redistributing the vendored files. FFmpeg licensing can vary with build configuration, codecs, and linked libraries, so release packaging should verify the exact bundle provenance.

The SoX and Spectrum palettes follow established spectrogram color formulas. The SoX palette derives from Rob Sykes' SoX default palette; the Spectrum palette follows a modified Dan Bruton spectrum algorithm.

## License

Project-authored source code is licensed under AGPL-3.0-or-later. See `LICENSE`.

The optional FFmpeg WASM bundle under `vendor/ffmpeg/` retains its upstream licenses and notices; Cymlet does not relicense it.
