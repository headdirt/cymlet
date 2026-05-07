// SPDX-License-Identifier: AGPL-3.0-or-later
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, relative } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = normalize(join(dirname(fileURLToPath(import.meta.url)), ".."));
const port = Number(process.env.CYML_CODEC_MATRIX_PORT || 4174);
const browsers = (process.env.CYML_CODEC_MATRIX_BROWSERS || "Safari,Firefox,Helium")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const results = new Map();

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (request.method === "POST" && url.pathname === "/codec-matrix-results") {
      const body = await readBody(request);
      const result = JSON.parse(body);
      results.set(result.browser, result);
      response.writeHead(204).end();
      return;
    }
    if (url.pathname === "/codec-matrix-runner.js") {
      send(response, 200, runnerJs(), "text/javascript; charset=utf-8");
      return;
    }
    if (url.pathname === "/codec-matrix-runner.html") {
      send(response, 200, runnerHtml(), "text/html; charset=utf-8");
      return;
    }
    await serveStatic(url.pathname, response);
  } catch (error) {
    send(response, 500, String(error?.stack || error), "text/plain; charset=utf-8");
  }
});

server.listen(port, "127.0.0.1", async () => {
  console.log(`Codec matrix server: http://127.0.0.1:${port}/codec-matrix-runner.html`);
  let exitCode = 0;
  try {
    for (const browser of browsers) {
      await runBrowser(browser);
    }
    printReport();
  } catch (error) {
    exitCode = 1;
    console.error(error?.stack || error);
  } finally {
    server.closeAllConnections?.();
    server.close(() => process.exit(exitCode));
  }
});

async function runBrowser(browser) {
  const url = `http://127.0.0.1:${port}/codec-matrix-runner.html?browser=${encodeURIComponent(browser)}`;
  console.log(`\nLaunching ${browser}: ${url}`);
  await openBrowser(browser, url);
  const result = await waitForResult(browser, 10 * 60 * 1000);
  console.log(`${browser}: ${result.samples.length} samples tested.`);
}

function openBrowser(browser, url) {
  return new Promise((resolve, reject) => {
    const child = spawn("open", ["-a", browser, url], { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`open -a ${browser} exited ${code}`)));
  });
}

function waitForResult(browser, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (results.has(browser)) {
        clearInterval(timer);
        resolve(results.get(browser));
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`Timed out waiting for ${browser}`));
      }
    }, 1000);
  });
}

async function serveStatic(pathname, response) {
  const cleanPath = decodeURIComponent(pathname).replace(/^\/+/, "") || "index.html";
  const fullPath = normalize(join(repoRoot, cleanPath));
  if (relative(repoRoot, fullPath).startsWith("..")) {
    send(response, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }
  const bytes = await readFile(fullPath);
  send(response, 200, bytes, mimeType(fullPath));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function send(response, status, body, type) {
  response.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
  });
  response.end(body);
}

function mimeType(path) {
  return {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".wasm": "application/wasm",
  }[extname(path)] || "application/octet-stream";
}

function printReport() {
  const ordered = browsers.map((browser) => results.get(browser)).filter(Boolean);
  console.log("\n# Browser Codec Matrix\n");
  for (const result of ordered) {
    console.log(`## ${result.browser}`);
    console.log(`User agent: ${result.userAgent}`);
    console.log(`Native canPlayType reports: ${result.nativeFormats.join(", ") || "none"}`);
    console.log("");
    console.log("| Sample | Source Hz | AudioContext Hz | OfflineAudioContext Hz | Δ | FFmpeg Hz |");
    console.log("|---|---:|---:|---:|:---:|---:|");
    for (const sample of result.samples) {
      const onlineRate = sample.browserOnline.ok ? sample.browserOnline.sampleRate : "—";
      const offlineRate = sample.browser.ok ? sample.browser.sampleRate : "—";
      const sourceRate = sample.sourceSampleRate || "—";
      const ffmpegRate = sample.ffmpeg.ok ? sample.ffmpeg.sampleRate : "—";
      const moved = sample.browser.ok && sample.browserOnline.ok && sample.browser.sampleRate !== sample.browserOnline.sampleRate ? "yes" : " ";
      console.log(`| ${sample.name} | ${sourceRate} | ${onlineRate} | ${offlineRate} | ${moved} | ${ffmpegRate} |`);
    }
    console.log("");
  }
  console.log("JSON:");
  console.log(JSON.stringify(ordered, null, 2));
}

function runnerHtml() {
  return `<!doctype html>
<meta charset="utf-8">
<title>Cymlet codec matrix</title>
<style>
  body { background: #08090c; color: #f4f6fb; font: 14px system-ui, sans-serif; margin: 24px; }
  table { border-collapse: collapse; margin-top: 16px; width: 100%; }
  th, td { border: 1px solid #30384a; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #151a24; }
  .ok { color: #8ff0b4; }
  .fail { color: #ff9a9a; }
</style>
<h1>Cymlet codec matrix</h1>
<p id="status">Starting...</p>
<table>
  <thead><tr><th>Sample</th><th>Source Hz</th><th>AudioContext Hz</th><th>OfflineAudioContext Hz</th><th>FFmpeg WASM Hz</th></tr></thead>
  <tbody id="rows"></tbody>
</table>
<script type="module" src="./codec-matrix-runner.js"></script>`;
}

function runnerJs() {
  return `import { decodeWithBrowser } from "./src/decoders/browser-decoder.js";
import { decodeWithFfmpeg } from "./src/decoders/ffmpeg-decoder.js";
import { NATIVE_AUDIO_FORMATS } from "./src/constants.js";
import { CODEC_SAMPLES } from "./test/codec-samples.js";

const params = new URLSearchParams(location.search);
const browser = params.get("browser") || navigator.userAgent;
const status = document.querySelector("#status");
const rows = document.querySelector("#rows");
const audio = document.createElement("audio");
const nativeFormats = NATIVE_AUDIO_FORMATS
  .filter((format) => format.types.some((type) => audio.canPlayType(type) !== ""))
  .map((format) => format.label);

const samples = [];
for (const sample of CODEC_SAMPLES) {
  status.textContent = \`\${browser}: testing \${sample.name}\`;
  const response = await fetch(\`./test/fixtures/codec-samples/\${sample.name}\`);
  const blob = await response.blob();
  const file = new File([blob], sample.name, { type: mimeFor(sample.name) });
  const browserOnlineResult = await attempt(() => decodeWithBrowser(file, { OfflineAudioContextClass: null }));
  const browserResult = await attempt(() => decodeWithBrowser(file));
  const ffmpegResult = await attempt(() => decodeWithFfmpeg(file));
  const sourceSampleRate = browserResult.sourceSampleRate ?? browserOnlineResult.sourceSampleRate ?? null;
  const result = { name: sample.name, expectedMode: sample.expectedMode, sourceSampleRate, browserOnline: browserOnlineResult, browser: browserResult, ffmpeg: ffmpegResult };
  samples.push(result);
  appendRow(result);
}

const result = { browser, userAgent: navigator.userAgent, nativeFormats, samples };
await fetch("./codec-matrix-results", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(result),
});
status.textContent = \`\${browser}: complete\`;

async function attempt(task) {
  const started = performance.now();
  try {
    const decoded = await task();
    return {
      ok: true,
      backend: decoded.backend,
      sampleRate: decoded.sampleRate,
      sourceSampleRate: decoded.sourceSampleRate,
      channels: decoded.channelCount,
      duration: decoded.duration,
      codecName: decoded.codecName || "",
      codecLongName: decoded.codecLongName || "",
      ms: Math.round(performance.now() - started),
    };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || String(error),
      ms: Math.round(performance.now() - started),
    };
  }
}

function appendRow(sample) {
  const row = document.createElement("tr");
  const source = sample.sourceSampleRate || "—";
  const cell = (result) => {
    if (!result.ok) return \`<td class="fail">\${escapeHtml(result.error)}</td>\`;
    return \`<td class="ok">\${result.sampleRate}</td>\`;
  };
  row.innerHTML = \`
    <td>\${sample.name}</td>
    <td>\${source}</td>
    \${cell(sample.browserOnline)}
    \${cell(sample.browser)}
    \${cell(sample.ffmpeg)}
  \`;
  rows.append(row);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

function mimeFor(name) {
  const extension = name.split(".").pop().toLowerCase();
  return {
    wav: "audio/wav",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    flac: "audio/flac",
    aif: "audio/aiff",
    aiff: "audio/aiff",
    wma: "audio/x-ms-wma",
  }[extension] || "application/octet-stream";
}`;
}
