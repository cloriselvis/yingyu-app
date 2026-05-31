import { copyFile, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = resolve(root, "dist");
const appAssets = [
  "index.html",
  "privacy.html",
  "report.html",
  "feedback-report.html",
  "styles.css",
  "report.css",
  "app.js",
  "copy.js",
  "pwa.js",
  "sw.js",
  "audio-core.js",
  "live-quality.js",
  "audio-attachments.js",
  "audio-store.js",
  "feedback-store.js",
  "feedback-insights.js",
  "feedback-report.js",
  "report.js",
  "result-insights.js",
  "manifest.webmanifest",
  "icon.svg"
];

if (basename(outDir) !== "dist" || !outDir.startsWith(root)) {
  throw new Error(`Refusing to write outside project dist: ${outDir}`);
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const copied = [];
for (const asset of appAssets) {
  await copyFile(join(root, asset), join(outDir, asset));
  copied.push(asset);
}

await writeFile(
  join(outDir, "_headers"),
  `/*
  Cross-Origin-Opener-Policy: same-origin
  X-Content-Type-Options: nosniff
`,
  "utf8"
);

const size = await folderSize(outDir);
console.error(`Built dist with ${copied.length} files, ${Math.round(size / 1024)} KB.`);

async function folderSize(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) total += await folderSize(path);
    else total += (await stat(path)).size;
  }
  return total;
}
