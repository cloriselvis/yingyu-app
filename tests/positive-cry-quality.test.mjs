import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { analyzePositiveCryRows, createPositiveCryQualityMarkdown } from "../positive-cry-quality.js";

const execFileAsync = promisify(execFile);

test("analyzePositiveCryRows summarizes quality gate behavior without reason labels", () => {
  const report = analyzePositiveCryRows([
    row({ file: "a.wav", top1: "hunger", highAlertLevel: "low", questionId: "feeding_timing" }),
    row({ file: "b.wav", top1: "gas", highAlertLevel: "medium", highAlertScore: 0.6, questionId: "safety" }),
    row({ file: "c.wav", usable: false, qualityScore: 0.2, qualityIssues: ["too_short"], top1: "" })
  ]);

  assert.equal(report.total, 3);
  assert.equal(report.decoded, 3);
  assert.equal(report.usable, 2);
  assert.equal(report.rejected, 1);
  assert.equal(report.rejectionRate, 0.333);
  assert.equal(report.mediumHighAlert, 1);
  assert.equal(report.top1.hunger, 1);
  assert.equal(report.qualityIssues.too_short, 1);
  assert.equal(report.gate.status, "review");
});

test("createPositiveCryQualityMarkdown renders quality-only sections", () => {
  const markdown = createPositiveCryQualityMarkdown(analyzePositiveCryRows([row(), row({ file: "b.wav", highAlertLevel: "medium" })]));

  assert.match(markdown, /Positive Cry Quality Report/);
  assert.match(markdown, /Top-1 Distribution/);
  assert.match(markdown, /Medium\/High Alert Samples/);
  assert.match(markdown, /passed quality gate/);
});

test("report-positive-cry-quality CLI writes markdown", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yingyu-positive-cry-"));
  const rows = join(dir, "rows.jsonl");
  const out = join(dir, "report.md");
  await writeFile(rows, [row(), row({ file: "b.wav", usable: false, qualityIssues: ["too_short"] })].map(JSON.stringify).join("\n"), "utf8");

  await execFileAsync(process.execPath, ["scripts/report-positive-cry-quality.mjs", rows, "--out", out], {
    cwd: new URL("..", import.meta.url)
  });

  const markdown = await readFile(out, "utf8");
  assert.match(markdown, /Positive Cry Quality Report/);
  assert.match(markdown, /quality rejection rate/);
});

function row(overrides = {}) {
  return {
    file: "sample.wav",
    parsed: true,
    decoded: true,
    comparable: false,
    usable: true,
    qualityScore: 0.9,
    qualityIssues: [],
    highAlertLevel: "low",
    highAlertScore: 0.2,
    top1: "hunger",
    top2: "gas",
    questionId: "feeding_timing",
    actionMode: "top2",
    validCrySec: 5,
    cryRatio: 0.5,
    snrDb: 20,
    ...overrides
  };
}
