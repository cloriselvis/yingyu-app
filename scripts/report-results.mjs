import { readFile, writeFile } from "node:fs/promises";
import { analyzeResultRows, createMarkdownReport, parseJsonl } from "../result-insights.js";

const input = process.argv[2];
const outArgIndex = process.argv.indexOf("--out");
const limitArgIndex = process.argv.indexOf("--limit");
const outFile = outArgIndex >= 0 ? process.argv[outArgIndex + 1] : "";
const limit = limitArgIndex >= 0 ? Number(process.argv[limitArgIndex + 1]) : 20;

if (!input) {
  console.error("Usage: node scripts/report-results.mjs <rows.jsonl> [--out report.md] [--limit 20]");
  process.exit(1);
}

const rows = parseJsonl(await readFile(input, "utf8"));
const insights = analyzeResultRows(rows, { limit });
const markdown = createMarkdownReport(insights);

if (outFile) {
  await writeFile(outFile, markdown, "utf8");
} else {
  process.stdout.write(markdown);
}
