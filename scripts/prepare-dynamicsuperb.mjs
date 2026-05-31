import { execFile } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import {
  createDynamicSuperbLabelsCsv,
  createDynamicSuperbRows,
  summarizeDynamicSuperbRows
} from "../dynamicsuperb.js";

const execFileAsync = promisify(execFile);

const parquetFile = process.argv[2];
const outArgIndex = process.argv.indexOf("--out");
const pythonArgIndex = process.argv.indexOf("--python");
const pyarrowPathArgIndex = process.argv.indexOf("--pyarrow-path");
const ffmpegArgIndex = process.argv.indexOf("--ffmpeg");
const convertWav = process.argv.includes("--convert-wav");
const outDir = outArgIndex >= 0 ? process.argv[outArgIndex + 1] : "";
const python = pythonArgIndex >= 0 ? process.argv[pythonArgIndex + 1] : process.env.PYTHON || "python";
const pyarrowPath = pyarrowPathArgIndex >= 0 ? process.argv[pyarrowPathArgIndex + 1] : process.env.PYARROW_PATH || "";
const ffmpeg = ffmpegArgIndex >= 0 ? process.argv[ffmpegArgIndex + 1] : "ffmpeg";

const pythonExtractor = String.raw`
import json
import os
import re
import sys

parquet_file = sys.argv[1]
raw_dir = sys.argv[2]
pyarrow_path = sys.argv[3] if len(sys.argv) > 3 else ""
if pyarrow_path:
    sys.path.insert(0, pyarrow_path)

import pyarrow.parquet as pq

os.makedirs(raw_dir, exist_ok=True)
table = pq.read_table(parquet_file)
rows = []
for index in range(table.num_rows):
    audio = table["audio"][index].as_py()
    file_id = table["file"][index].as_py()
    safe_id = re.sub(r"[^A-Za-z0-9_.-]+", "_", str(file_id)).strip("_") or f"audio_{index}"
    source_file = f"{safe_id}.caf"
    with open(os.path.join(raw_dir, source_file), "wb") as handle:
        handle.write(audio["bytes"])
    rows.append({
        "fileId": safe_id,
        "sourceFile": source_file,
        "sourceLabel": table["label"][index].as_py(),
        "instruction": table["instruction"][index].as_py(),
    })
print(json.dumps(rows, ensure_ascii=False))
`;

if (!parquetFile || !outDir) {
  console.error(
    "Usage: node scripts/prepare-dynamicsuperb.mjs <test.parquet> --out <folder> [--python python.exe] [--pyarrow-path folder] [--convert-wav] [--ffmpeg ffmpeg]"
  );
  process.exit(1);
}

await mkdir(outDir, { recursive: true });
const rawDir = join(outDir, "raw");
const wavDir = join(outDir, "wav");
await mkdir(rawDir, { recursive: true });
if (convertWav) await mkdir(wavDir, { recursive: true });

const sourceRows = await extractParquetAudio({ parquetFile, rawDir, python, pyarrowPath });
const rows = createDynamicSuperbRows(sourceRows);
const summary = summarizeDynamicSuperbRows(rows);
summary.parquetFile = parquetFile;
summary.rawDir = rawDir;
summary.wavDir = convertWav ? wavDir : "";
summary.convertedWav = 0;

await writeFile(join(outDir, "labels.csv"), createDynamicSuperbLabelsCsv(rows), "utf8");
await writeFile(join(outDir, "metadata.jsonl"), rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");

if (convertWav) {
  const files = (await readdir(rawDir, { withFileTypes: true })).filter((entry) => entry.isFile() && /\.caf$/i.test(entry.name));
  for (const file of files) {
    const input = join(rawDir, file.name);
    const output = join(wavDir, `${basename(file.name, ".caf")}.wav`);
    await execFileAsync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-i", input, "-ac", "1", "-ar", "16000", output], {
      maxBuffer: 1024 * 1024 * 10
    });
    summary.convertedWav += 1;
  }
}

await writeFile(join(outDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
console.error(
  `DynamicSuperb prepared: ${summary.total} rows, ${summary.comparable} comparable, ${summary.convertedWav} wav converted.`
);

async function extractParquetAudio(options) {
  const { stdout } = await execFileAsync(options.python, ["-c", pythonExtractor, options.parquetFile, options.rawDir, options.pyarrowPath || ""], {
    maxBuffer: 1024 * 1024 * 50
  });
  return JSON.parse(stdout);
}
