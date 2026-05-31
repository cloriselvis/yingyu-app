import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  analyzeEnesBabyCriesRows,
  createEnesBabyCriesMarkdown,
  parseCsv
} from "../enesbabycries-insights.js";

const input = process.argv[2];
const outArgIndex = process.argv.indexOf("--out");
const outFile = outArgIndex >= 0 ? process.argv[outArgIndex + 1] : "";

if (!input) {
  console.error("Usage: node scripts/report-enesbabycries.mjs <enesbabycries-folder-or-csv> [--out report.md]");
  process.exit(1);
}

const inputStat = await stat(input);
const root = inputStat.isDirectory() ? input : "";
const datasetCsv = inputStat.isDirectory() ? join(input, "data", "dataset_44605_short.csv") : input;
const figureDir = root ? join(root, "source-data-for-figures") : "";

const rows = parseCsv(await readFile(datasetCsv, "utf8"));
const ageEffects = figureDir ? await readOptionalCsv(join(figureDir, "fig1a_ac~age.csv")) : [];
const ageRfMatrix = figureDir ? await readOptionalCsv(join(figureDir, "fig2b_RF-matrix.csv")) : [];
const causeRfMatrix = figureDir ? await readOptionalCsv(join(figureDir, "fig3b_RF-matrix.csv")) : [];

const insights = analyzeEnesBabyCriesRows(rows, {
  ageEffects,
  ageRfMatrix,
  causeRfMatrix
});
const markdown = createEnesBabyCriesMarkdown(insights);

if (outFile) {
  await writeFile(outFile, markdown, "utf8");
} else {
  process.stdout.write(markdown);
}

async function readOptionalCsv(file) {
  try {
    return parseCsv(await readFile(file, "utf8"));
  } catch {
    return [];
  }
}
