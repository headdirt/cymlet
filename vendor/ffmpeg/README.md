# Optional FFmpeg WASM Vendor Bundle

The app does not load this directory during successful browser-native decoding.

FFmpeg mode uses the single-thread ffmpeg.wasm bundle vendored here:

```text
vendor/ffmpeg/ffmpeg.js
vendor/ffmpeg/classes.js
vendor/ffmpeg/const.js
vendor/ffmpeg/errors.js
vendor/ffmpeg/types.js
vendor/ffmpeg/utils.js
vendor/ffmpeg/worker.js
vendor/ffmpeg/ffmpeg-core.js
vendor/ffmpeg/ffmpeg-core.wasm
vendor/ffmpeg/THIRD_PARTY_NOTICES.md
```

`src/decoders/ffmpeg-decoder.js` dynamically imports `vendor/ffmpeg/ffmpeg.js` relative to the app module URL only when FFmpeg mode is selected or accepted after browser decode failure in Browser mode. This keeps the optional bundle working from subpath static deployments without a custom base URL.

The current bundle uses `@ffmpeg/ffmpeg@0.12.15` with `@ffmpeg/core@0.12.10`. A multi-thread bundle would need `@ffmpeg/core-mt`, an additional core worker file, and cross-origin isolation headers.

## Licensing

These files are third-party vendored artifacts and retain their upstream licenses and notices. The surrounding Cymlet app is AGPL-3.0-or-later, but that does not relicense this FFmpeg WASM bundle.

See `THIRD_PARTY_NOTICES.md` for the package names, versions, license metadata, and exact vendored files.

FFmpeg licensing depends on the exact build configuration and linked codec libraries. Verify and preserve upstream license material whenever this bundle is updated or redistributed.
