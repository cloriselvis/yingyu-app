import { readFile, writeFile } from "node:fs/promises";
import { compareAgeCalibration, createAgeCalibrationMarkdown } from "../age-calibration-sweep.js";
import { parseJsonl } from "../result-insights.js";

const rowsFile = process.argv[2];
const outArgIndex = process.argv.indexOf("--out");
const limitArgIndex = process.argv.indexOf("--limit");
const outFile = outArgIndex >= 0 ? process.argv[outArgIndex + 1] : "";
const limit = limitArgIndex >= 0 ? Number(process.argv[limitArgIndex + 1]) : 20;

if (!rowsFile) {
  console.error("Usage: node scripts/sweep-age-calibration.mjs <rows.jsonl> [--out age-sweep.md] [--limit 20]");
  process.exit(1);
}

const rows = parseJsonl(stripBom(await readFile(rowsFile, "utf8")));
const comparison = compareAgeCalibration(rows, undefined, { limit });
const markdown = createAgeCalibrationMarkdown(comparison);

if (outFile) {
  await writeFile(outFile, markdown, "utf8");
} else {
  process.stdout.write(markdown);
}

console.error(
  `Age calibration candidates: ${comparison.results.length}, rows with age context: ${comparison.ageRows}/${comparison.totalRows}.`
);

function stripBom(text) {
  return String(text || "").replace(/^\uFEFF/, "");
}
