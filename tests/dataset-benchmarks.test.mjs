import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { compareDatasets, createDatasetComparisonMarkdown } from "../dataset-benchmarks.js";

const execFileAsync = promisify(execFile);

test("compareDatasets summarizes per-source gates and cautions", () => {
  const comparison = compareDatasets([
    { label: "Set A", rows: [row({ file: "a.wav" }), row({ file: "b.wav", top1: "gas", top2: "tired" })] },
    { label: "Set B", rows: [row({ file: "c.wav", yingyuLabel: "discomfort", top1: "hunger", top2: "gas" })] }
  ]);
  const markdown = createDatasetComparisonMarkdown(comparison);

  assert.equal(comparison.datasetCount, 2);
  assert.equal(comparison.totalRows, 3);
  assert.equal(comparison.totalEvaluated, 3);
  assert.ok(comparison.results[0].cautions.some((item) => item.includes("Only 2 evaluated rows")));
  assert.match(markdown, /Public Audio Benchmark Comparison/);
  assert.match(markdown, /Majority Top-2/);
  assert.match(markdown, /Set A/);
});

test("report-datasets CLI writes a comparison markdown report", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yingyu-datasets-"));
  const first = join(dir, "first.jsonl");
  const second = join(dir, "second.jsonl");
  const out = join(dir, "report.md");
  await writeFile(first, [row({ file: "a.wav" }), row({ file: "b.wav", top1: "gas", top2: "tired" })].map(JSON.stringify).join("\n"), "utf8");
  await writeFile(second, [row({ file: "c.wav", yingyuLabel: "discomfort", top1: "hunger", top2: "gas" })].map(JSON.stringify).join("\n"), "utf8");

  await execFileAsync(
    process.execPath,
    ["scripts/report-datasets.mjs", "--dataset", `First=${first}`, "--dataset", `Second=${second}`, "--out", out],
    { cwd: new URL("..", import.meta.url) }
  );

  const report = await readFile(out, "utf8");
  assert.match(report, /Public Audio Benchmark Comparison/);
  assert.match(report, /First/);
  assert.match(report, /Second/);
});

function row(overrides = {}) {
  return {
    file: "sample.wav",
    parsed: true,
    decoded: true,
    usable: true,
    comparable: true,
    yingyuLabel: "hunger",
    reasonLabel: "self_label",
    qualityScore: 0.9,
    qualityIssues: [],
    highAlertLevel: "low",
    highAlertScore: 0.2,
    confidenceLevel: "low",
    confidenceScore: 0.3,
    actionMode: "top2",
    top1: "hunger",
    top1Score: 0.34,
    top2: "gas",
    top2Score: 0.3,
    questionId: "age_bucket",
    durationSec: 8,
    validCrySec: 5,
    cryRatio: 0.5,
    snrDb: 20,
    ...overrides
  };
}
