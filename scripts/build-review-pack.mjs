import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { buildReviewPack, createReviewCsv, createReviewHtml, createReviewMarkdown, reviewCopyName } from "../review-pack.js";
import { parseJsonl } from "../result-insights.js";

const rowsFile = process.argv[2];
const audioRoot = process.argv[3];
const outArgIndex = process.argv.indexOf("--out");
const limitArgIndex = process.argv.indexOf("--limit");
const outDir = outArgIndex >= 0 ? process.argv[outArgIndex + 1] : "";
const limit = limitArgIndex >= 0 ? Number(process.argv[limitArgIndex + 1]) : 20;

if (!rowsFile || !audioRoot || !outDir) {
  console.error("Usage: node scripts/build-review-pack.mjs <rows.jsonl> <audio-root> --out <review-folder> [--limit 20]");
  process.exit(1);
}

const rows = parseJsonl(await readFile(rowsFile, "utf8"));
const pack = buildReviewPack(rows, { limit });
await mkdir(outDir, { recursive: true });

let copied = 0;
let missing = 0;
for (let i = 0; i < pack.items.length; i += 1) {
  const item = pack.items[i];
  const copyName = reviewCopyName(item, i);
  const relativeTarget = join(item.bucket, copyName);
  const source = resolveAudioPath(audioRoot, item.file);
  const target = join(outDir, relativeTarget);
  item.reviewFile = relativeTarget;

  try {
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
    copied += 1;
  } catch {
    item.missingAudio = true;
    missing += 1;
  }
}

pack.copiedAudio = copied;
pack.missingAudio = missing;

await writeFile(join(outDir, "manifest.json"), JSON.stringify(pack, null, 2), "utf8");
await writeFile(join(outDir, "manifest.csv"), createReviewCsv(pack), "utf8");
await writeFile(join(outDir, "REVIEW.md"), createReviewMarkdown(pack), "utf8");
await writeFile(join(outDir, "review.html"), createReviewHtml(pack), "utf8");

console.error(`Review pack: ${pack.selectedCount} selected, ${copied} copied, ${missing} missing.`);

function resolveAudioPath(root, relativeFile) {
  const parts = String(relativeFile || "").split(/[\\/]+/).filter(Boolean);
  return normalize(join(root, ...parts));
}
