# Third-Party Notices for Vendored FFmpeg WASM

This directory contains vendored browser artifacts from the ffmpeg.wasm project.

Source project: https://github.com/ffmpegwasm/ffmpeg.wasm

## @ffmpeg/ffmpeg

- Package: `@ffmpeg/ffmpeg`
- Version: `0.12.15`
- License in package metadata: `MIT`
- Author in package metadata: Jerome Wu
- Package tarball used for audit: https://registry.npmjs.org/@ffmpeg/ffmpeg/-/ffmpeg-0.12.15.tgz
- Vendored files:
  - `ffmpeg.js`
  - `classes.js`
  - `const.js`
  - `errors.js`
  - `types.js`
  - `utils.js`
  - `worker.js`

The npm tarball for this version does not include a standalone LICENSE file. Preserve this notice and verify upstream metadata when updating the bundle.

## @ffmpeg/core

- Package: `@ffmpeg/core`
- Version: `0.12.10`
- License in package metadata: `GPL-2.0-or-later`
- Author in package metadata: Jerome Wu
- Package tarball used for audit: https://registry.npmjs.org/@ffmpeg/core/-/core-0.12.10.tgz
- Vendored files:
  - `ffmpeg-core.js`
  - `ffmpeg-core.wasm`

The npm tarball for this version does not include a standalone LICENSE file. The package metadata marks this core build as `GPL-2.0-or-later`; the surrounding Cymlet app is `AGPL-3.0-or-later`, which is compatible with distributing this optional core under GPLv3-or-later terms.

FFmpeg licensing depends on the exact build configuration and linked libraries. Re-audit this notice whenever the core bundle is replaced.
