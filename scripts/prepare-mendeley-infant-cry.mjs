import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  buildMendeleyInfantCryManifest,
  createMendeleyLabelsCsv,
  createMendeleyManifestJsonl,
  summarizeMendeleyManifest
} from "../mendeley-infant-cry.js";

const execFileAsync = promisify(execFile);
const metadataFile = process.argv[2];
const outArgIndex = process.argv.indexOf("--out");
const download = process.argv.includes("--download");
const convertWav = process.argv.includes("--convert-wav");
const outDir = outArgIndex >= 0 ? process.argv[outArgIndex + 1] : "";

if (!metadataFile || !outDir) {
  console.error(
    "Usage: node scripts/prepare-mendeley-infant-cry.mjs <metadata.json> --out <folder> [--download] [--convert-wav]"
  );
  process.exit(1);
}

const metadata = JSON.parse(stripBom(await readFile(metadataFile, "utf8")));
const manifest = buildMendeleyInfantCryManifest(metadata);
const summary = summarizeMendeleyManifest(manifest);

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, "manifest.jsonl"), createMendeleyManifestJsonl(manifest), "utf8");
await writeFile(join(outDir, "labels.csv"), createMendeleyLabelsCsv(manifest), "utf8");
await writeFile(join(outDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");

if (download) {
  await downloadRawFiles(manifest, outDir);
}

if (convertWav) {
  await convertRawFiles(manifest, outDir);
}

console.error(
  `Mendeley Infant Cry Sound: ${summary.total} files, labels ${JSON.stringify(summary.labels)}, output ${outDir}.`
);

async function downloadRawFiles(manifestItems, root) {
  for (const item of manifestItems) {
    if (!item.downloadUrl) continue;
    const target = join(root, "raw", ...item.rawFile.split("/"));
    await mkdir(dirname(target), { recursive: true });
    const response = await fetch(item.downloadUrl);
    if (!response.ok) throw new Error(`Download failed ${response.status} ${item.filename}`);
    await writeFile(target, Buffer.from(await response.arrayBuffer()));
  }
}

async function convertRawFiles(manifestItems, root) {
  for (const item of manifestItems) {
    const source = join(root, "raw", ...item.rawFile.split("/"));
    const target = join(root, "wav", ...item.wavFile.split("/"));
    await mkdir(dirname(target), { recursive: true });
    await execFileAsync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", source, "-ac", "1", "-ar", "16000", target]);
  }
}

function stripBom(text) {
  return String(text || "").replace(/^\uFEFF/, "");
}
