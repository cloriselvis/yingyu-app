import { readFile, writeFile } from "node:fs/promises";
import { analyzeReviewAnnotations, createReviewAnnotationMarkdown, stripBom } from "../review-annotations.js";

const manifestFile = process.argv[2];
const annotationsFile = process.argv[3];
const outArgIndex = process.argv.indexOf("--out");
const limitArgIndex = process.argv.indexOf("--limit");
const outFile = outArgIndex >= 0 ? process.argv[outArgIndex + 1] : "";
const limit = limitArgIndex >= 0 ? Number(process.argv[limitArgIndex + 1]) : 20;

if (!manifestFile || !annotationsFile) {
  console.error("Usage: node scripts/report-review.mjs <manifest.json> <annotations.json> [--out review-report.md] [--limit 20]");
  process.exit(1);
}

const pack = JSON.parse(stripBom(await readFile(manifestFile, "utf8")));
const annotations = JSON.parse(stripBom(await readFile(annotationsFile, "utf8")));
const summary = analyzeReviewAnnotations(pack, annotations);
const markdown = createReviewAnnotationMarkdown(summary, { limit });

if (outFile) {
  await writeFile(outFile, markdown, "utf8");
} else {
  process.stdout.write(markdown);
}

console.error(`Review annotations: ${summary.annotationCount}/${summary.totalItems} annotated, ${summary.matchedCount} matched.`);
