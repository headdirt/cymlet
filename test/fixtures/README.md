# Test Fixtures

Generated fixtures are created in code by `src/fixtures.js`.

Optional upstream codec samples can be downloaded into `test/fixtures/codec-samples/`:

```sh
node scripts/download-codec-samples.mjs
```

These files are downloaded on demand rather than committed, so third-party binary fixtures don't enter the source tree before we decide which to keep as golden references. The local integrity test in `test/codec-fixtures-local.test.js` skips itself when they aren't present.
