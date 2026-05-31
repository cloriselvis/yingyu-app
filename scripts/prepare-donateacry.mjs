import { execFile } from "node:child_process";
import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { promisify } from "node:util";
import { isDonateACryAudioFile, parseDonateACryFilename } from "../donateacry.js";

const execFileAsync = promisify(execFile);
const source = process.argv[2];
const outArgIndex = process.argv.indexOf("--out");
const outDir = outArgIndex >= 0 ? process.argv[outArgIndex + 1] : "";
const convert = process.argv.includes("--convert-wav");

if (!source) {
  console.error("Usage: node scripts/prepare-donateacry.mjs <source-folder> [--out prepared-folder] [--convert-wav]");
  process.exit(1);
}

if (convert && !outDir) {
  console.error("--convert-wav requires --out <prepared-folder>");
  process.exit(1);
}

if (outDir) await mkdir(outDir, { recursive: true });

const rows = [];
for await (const file of walk(source)) {
  if (!isDonateACryAudioFile(file)) continue;
  const meta = parseDonateACryFilename(file);
  const row = {
    ...meta,
    file: relative(source, file),
    fileName: meta.file,
    parsed: meta.ok
  };

  if (convert && meta.ok) {
    const relativeSource = relative(source, file);
    const relativeWav = relativeSource.replace(/\.[^.\\/]+$/, ".wav");
    const target = join(outDir, relativeWav);
    try {
      await mkdir(dirname(target), { recursive: true });
      if (meta.extension === "wav") {
        await copyFile(file, target);
      } else {
        await execFileAsync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", file, "-ac", "1", "-ar", "16000", target]);
      }
      row.convertedWav = relative(outDir, target);
    } catch (error) {
      row.error = `ffmpeg_convert_failed: ${error.message}`;
    }
  }

  rows.push(row);
}

const manifest = rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : "");
if (outDir) {
  await writeFile(join(outDir, "manifest.jsonl"), manifest, "utf8");
} else {
  process.stdout.write(manifest);
}

console.error(`Prepared ${rows.length} Donate-a-Cry files${convert ? " with wav conversion" : ""}.`);

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}
