// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from "node:assert/strict";
import test from "node:test";

import { EXPORT_IMAGE_HEIGHT, EXPORT_IMAGE_WIDTH } from "../src/constants.js";
import { downloadCanvasPng, exportFileName } from "../src/export.js";

test("export filename replaces extension with spectrogram suffix", () => {
  assert.equal(exportFileName("track.wav"), "track-spectrogram.png");
  assert.equal(exportFileName("archive.final.flac"), "archive.final-spectrogram.png");
});

test("export filename handles empty and unsafe names", () => {
  assert.equal(exportFileName(""), "spectrogram-spectrogram.png");
  assert.equal(exportFileName('bad:/name?.mp3'), "bad-name--spectrogram.png");
});

test("standard PNG export size is fixed and landscape", () => {
  assert.equal(EXPORT_IMAGE_WIDTH, 1600);
  assert.equal(EXPORT_IMAGE_HEIGHT, 1000);
  assert.ok(EXPORT_IMAGE_WIDTH > EXPORT_IMAGE_HEIGHT);
});

test("downloadCanvasPng creates a PNG download link and clicks it", () => {
  const clicks = [];
  const link = {
    download: "",
    href: "",
    click() {
      clicks.push({ download: this.download, href: this.href });
    },
  };
  const documentRef = {
    createElement(tagName) {
      assert.equal(tagName, "a");
      return link;
    },
  };
  const canvas = {
    toDataURL(type) {
      assert.equal(type, "image/png");
      return "data:image/png;base64,AAAA";
    },
  };

  downloadCanvasPng(canvas, "track.wav", documentRef);

  assert.deepEqual(clicks, [{
    download: "track-spectrogram.png",
    href: "data:image/png;base64,AAAA",
  }]);
});
