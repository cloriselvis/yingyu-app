import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { compareDatasets, createDatasetComparisonMarkdown } from "../dataset-benchmarks.js";
import { parseJsonl } from "../result-insights.js";

const datasetArgs = valuesFor("--dataset");
const outArgIndex = process.argv.indexOf("--out");
const limitArgIndex = process.argv.indexOf("--limit");
const outFile = outArgIndex >= 0 ? process.argv[outArgIndex + 1] : "";
const limit = limitArgIndex >= 0 ? Number(process.argv[limitArgIndex + 1]) : 20;

if (!datasetArgs.length) {
  console.error('Usage: node scripts/report-datasets.mjs --dataset "Label=rows.jsonl" [--dataset "Other=rows.jsonl"] [--out report.md]');
  process.exit(1);
}

const datasets = [];
for (const arg of datasetArgs) {
  const parsed = parseDatasetArg(arg);
  const rows = parseJsonl(stripBom(await readFile(parsed.rowsFile, "utf8")));
  datasets.push({ ...parsed, rows });
}

const comparison = compareDatasets(datasets, { limit });
const markdown = createDatasetComparisonMarkdown(comparison);

if (outFile) {
  await writeFile(outFile, markdown, "utf8");
} else {
  process.stdout.write(markdown);
}

console.error(`Compared ${comparison.datasetCount} datasets, ${comparison.totalEvaluated} evaluated rows.`);

function valuesFor(flag) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag && process.argv[index + 1]) values.push(process.argv[index + 1]);
  }
  return values;
}

function parseDatasetArg(arg) {
  const text = String(arg || "");
  const equalsIndex = text.indexOf("=");
  if (equalsIndex > 0) {
    return {
      label: text.slice(0, equalsIndex).trim(),
      rowsFile: text.slice(equalsIndex + 1).trim()
    };
  }
  return {
    label: basename(text),
    rowsFile: text
  };
}

function stripBom(text) {
  return String(text || "").replace(/^\uFEFF/, "");
}
