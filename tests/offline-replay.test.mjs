import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { compareReplayCandidates, createReplayComparisonMarkdown, replayRow } from "../offline-replay.js";

const execFileAsync = promisify(execFile);

test("replayRow recomputes decisions from stored feature snapshots", () => {
  const row = sampleRow({ highAlertLevel: "medium", actionMode: "top1" });
  const replayed = replayRow(row, { safetyActionLevel: "medium" });

  assert.equal(replayed.replayed, true);
  assert.ok(replayed.top1);
  assert.equal(replayed.actionMode, "safety");
  assert.ok(Number.isFinite(replayed.confidenceScore));
});

test("compareReplayCandidates renders candidate metric deltas", () => {
  const comparison = compareReplayCandidates([sampleRow(), sampleRow({ file: "b.wav", yingyuLabel: "gas", top1: "hunger", top2: "tired" })]);
  const markdown = createReplayComparisonMarkdown(comparison);

  assert.equal(comparison.totalRows, 2);
  assert.equal(comparison.replayableRows, 2);
  assert.ok(comparison.results.some((result) => result.key === "more_top2"));
  assert.match(markdown, /离线复评分候选对比/);
  assert.match(markdown, /Top-2 Δ/);
  assert.match(markdown, /高警觉更克制/);
});

test("sweep-thresholds CLI writes a replay comparison report", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yingyu-sweep-"));
  const rowsPath = join(dir, "rows.jsonl");
  const reportPath = join(dir, "threshold-report.md");
  await writeFile(rowsPath, [sampleRow(), sampleRow({ file: "b.wav", yingyuLabel: "gas" })].map((row) => JSON.stringify(row)).join("\n"), "utf8");

  await execFileAsync(process.execPath, ["scripts/sweep-thresholds.mjs", rowsPath, "--out", reportPath], {
    cwd: new URL("..", import.meta.url)
  });

  const report = await readFile(reportPath, "utf8");
  assert.match(report, /婴语离线复评分候选对比/);
  assert.match(report, /候选概览/);
});

function sampleRow(overrides = {}) {
  return {
    file: "a.wav",
    parsed: true,
    decoded: true,
    usable: true,
    comparable: true,
    yingyuLabel: "hunger",
    reasonLabel: "self_label",
    sampleRate: 16000,
    qualityScore: 0.86,
    qualityIssues: [],
    highAlertScore: 0.55,
    highAlertLevel: "medium",
    top1: "hunger",
    top1Score: 0.42,
    top2: "gas",
    top2Score: 0.28,
    confidenceLevel: "medium",
    confidenceScore: 0.5,
    confidenceMargin: 0.14,
    actionMode: "top1",
    questionId: "safety",
    decisionEvidence: [],
    featureSetVersion: 1,
    durationSec: 8,
    validCrySec: 5.4,
    cryRatio: 0.56,
    peakRms: 0.18,
    avgActiveRms: 0.08,
    noiseFloor: 0.006,
    snrDb: 22,
    episodeCount: 6,
    avgEpisodeSec: 0.7,
    longestEpisodeSec: 2.4,
    pitchMedian: 610,
    pitchP90: 780,
    pitchSpread: 190,
    zcrActive: 0.14,
    spectralCentroid: 1500,
    highBandRatio: 0.36,
    veryHighBandRatio: 0.12,
    burstiness: 0.52,
    irregularity: 0.48,
    ...overrides
  };
}
