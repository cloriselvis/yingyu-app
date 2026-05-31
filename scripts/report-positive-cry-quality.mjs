import { readFile, writeFile } from "node:fs/promises";
import { analyzePositiveCryRows, createPositiveCryQualityMarkdown } from "../positive-cry-quality.js";
import { parseJsonl } from "../result-insights.js";

const rowsFile = process.argv[2];
const outArgIndex = process.argv.indexOf("--out");
const limitArgIndex = process.argv.indexOf("--limit");
const outFile = outArgIndex >= 0 ? process.argv[outArgIndex + 1] : "";
const limit = limitArgIndex >= 0 ? Number(process.argv[limitArgIndex + 1]) : 20;

if (!rowsFile) {
  console.error("Usage: node scripts/report-positive-cry-quality.mjs <rows.jsonl> [--out report.md] [--limit 20]");
  process.exit(1);
}

const rows = parseJsonl(stripBom(await readFile(rowsFile, "utf8")));
const report = analyzePositiveCryRows(rows, { limit });
const markdown = createPositiveCryQualityMarkdown(report);

if (outFile) {
  await writeFile(outFile, markdown, "utf8");
} else {
  process.stdout.write(markdown);
}

console.error(`Positive cry quality: ${report.usable}/${report.decoded} usable, ${report.mediumHighAlert} alert-review clips.`);

function stripBom(text) {
  return String(text || "").replace(/^\uFEFF/, "");
}
