// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { CODEC_SAMPLES, codecSampleUrl } from "../test/codec-samples.js";

const outDir = new URL("../test/fixtures/codec-samples", import.meta.url);
await mkdir(outDir, { recursive: true });

for (const sample of CODEC_SAMPLES) {
  const response = await fetch(codecSampleUrl(sample.name));
  if (!response.ok) {
    throw new Error(`Could not download ${sample.name}: ${response.status} ${response.statusText}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  await writeFile(join(outDir.pathname, sample.name), bytes);
  console.log(`${sample.name} ${bytes.byteLength} bytes`);
}
