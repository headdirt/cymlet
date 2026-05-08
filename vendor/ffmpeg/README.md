# Optional FFmpeg WASM Vendor Bundle

This directory holds the single-thread ffmpeg.wasm build. It is loaded only when FFmpeg mode is explicitly selected or accepted after a browser decode failure — successful browser-native decoding never touches it.

`src/decoders/ffmpeg-decoder.js` imports `vendor/ffmpeg/ffmpeg.js` dynamically, relative to the app module URL, so the bundle works from subpath static deployments without a custom base URL.

The current bundle is `@ffmpeg/ffmpeg@0.12.15` plus `@ffmpeg/core@0.12.10`. A multi-thread build would require `@ffmpeg/core-mt`, an additional core worker file, and cross-origin isolation headers — we deliberately stick with the single-thread bundle so any plain static server works.

## Integrity

`src/decoders/ffmpeg-decoder.js` pins SHA-384 digests for `ffmpeg-core.js` and `ffmpeg-core.wasm` and verifies the bytes before passing them to `ffmpeg.load()`. When bumping the bundle, recompute the digests with `shasum -a 384` and update `FFMPEG_CORE_SHA384` in `ffmpeg-decoder.js`.

## Licensing

These files are third-party vendored artifacts and retain their upstream licenses and notices. The surrounding Cymlet app is AGPL-3.0-or-later, which does not relicense this bundle.

See `THIRD_PARTY_NOTICES.md` for package versions, license metadata, and the exact list of vendored files. FFmpeg licensing depends on the build configuration and linked codec libraries — verify and preserve upstream license material whenever this bundle is updated or redistributed.
