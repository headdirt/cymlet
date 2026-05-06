# Test Fixtures

Generated fixtures are created in code by `src/fixtures.js`.

Optional upstream codec sample files can be downloaded into `test/fixtures/codec-samples/` with:

```sh
node scripts/download-codec-samples.mjs
```

Those files are intentionally not committed by default. They are small, but keeping them downloaded-on-demand avoids mixing third-party binary fixtures into the source tree until we decide exactly which ones we want as golden references.

The local integrity test in `test/codec-fixtures-local.test.js` skips itself when these files have not been downloaded.
