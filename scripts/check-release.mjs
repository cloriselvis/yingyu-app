import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const required = [
  "index.html",
  "privacy.html",
  "app.js",
  "copy.js",
  "audio-core.js",
  "live-quality.js",
  "feedback-store.js",
  "manifest.webmanifest",
  "sw.js",
  "icon.svg",
  "_headers"
];
const forbidden = ["server.mjs", "scripts", "tests", "wav-io.js", "offline-replay.js", "review-pack.js", "review-annotations.js"];

for (const file of required) {
  await mustExist(join(dist, file));
}

const distEntries = new Set((await readdir(dist)).map((entry) => entry.toLowerCase()));
for (const name of forbidden) {
  if (distEntries.has(name.toLowerCase())) throw new Error(`Forbidden release artifact in dist: ${name}`);
}

const index = await readFile(join(dist, "index.html"), "utf8");
if (!index.includes("测试版")) throw new Error("index.html is missing beta release notice.");
if (!index.includes("environmentHint")) throw new Error("index.html is missing mobile environment hint.");
if (!index.includes("privacy.html")) throw new Error("index.html is missing privacy and safety link.");

const privacy = await readFile(join(dist, "privacy.html"), "utf8");
if (!privacy.includes("录音默认只在当前浏览器本地分析")) throw new Error("privacy.html is missing local audio handling copy.");
if (!privacy.includes("不是医疗诊断")) throw new Error("privacy.html is missing medical disclaimer.");

const app = await readFile(join(dist, "app.js"), "utf8");
if (!app.includes("canUseMicrophone")) throw new Error("app.js is missing microphone secure-context guard.");
if (app.includes("试用样本")) throw new Error("release app still contains demo sample entry text.");

const manifest = JSON.parse(await readFile(join(dist, "manifest.webmanifest"), "utf8"));
if (manifest.name !== "哭了么") throw new Error("manifest name mismatch.");
if (manifest.display !== "standalone") throw new Error("manifest display must be standalone.");

const headers = await readFile(join(dist, "_headers"), "utf8");
if (!headers.includes("X-Content-Type-Options")) throw new Error("_headers missing security headers.");

const sw = await readFile(join(dist, "sw.js"), "utf8");
for (const asset of extractServiceWorkerAssets(sw)) {
  const cleaned = asset.replace(/^\.\//, "") || "index.html";
  if (cleaned === ".") continue;
  await mustExist(join(dist, cleaned));
}

const entries = await readdir(dist, { withFileTypes: true });
if (entries.some((entry) => entry.isDirectory())) throw new Error("dist must not contain nested directories.");
if (entries.length !== 22) throw new Error(`Unexpected dist file count: ${entries.length}`);

console.error("Release check passed.");

async function mustExist(path) {
  try {
    await stat(path);
  } catch {
    throw new Error(`Missing release artifact: ${path}`);
  }
}

function extractServiceWorkerAssets(source) {
  const match = source.match(/const appShell = \[([\s\S]*?)\];/);
  if (!match) throw new Error("Could not find appShell in service worker.");
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]).filter((asset) => asset !== "./");
}
