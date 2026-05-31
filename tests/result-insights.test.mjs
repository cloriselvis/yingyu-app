import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { analyzeResultRows, createMarkdownReport, parseJsonl } from "../result-insights.js";

const execFileAsync = promisify(execFile);

test("parseJsonl parses non-empty lines and reports bad lines", () => {
  const rows = parseJsonl('{"a":1}\n\n{"b":2}\n');
  assert.deepEqual(rows, [{ a: 1 }, { b: 2 }]);
  assert.throws(() => parseJsonl('{"a":1}\nnope\n'), /line 2/);
});

test("analyzeResultRows extracts failures, high-alert samples, and per-class metrics", () => {
  const insights = analyzeResultRows(sampleRows(), { limit: 2 });

  assert.equal(insights.total, 6);
  assert.equal(insights.parsed, 6);
  assert.equal(insights.usable, 4);
  assert.equal(insights.evaluated, 4);
  assert.equal(insights.top1Accuracy, 0.5);
  assert.equal(insights.top2Accuracy, 0.75);
  assert.equal(insights.algorithmGate.status, "fail");
  assert.equal(insights.algorithmGate.checks.some((check) => check.name === "Top-2 覆盖" && check.status === "达标"), true);
  assert.equal(insights.algorithmGate.checks.some((check) => check.name === "解码错误" && check.status === "需处理"), true);
  assert.equal(insights.majorityTop1, "hunger");
  assert.equal(insights.majorityTop1Accuracy, 0.5);
  assert.equal(insights.byExpected.hunger.top1Accuracy, 0.5);
  assert.equal(insights.highAlert.length, 1);
  assert.equal(insights.confidenceLevels.high, 2);
  assert.equal(insights.confidenceLevels.low, 1);
  assert.equal(insights.actionModes.top2, 1);
  assert.equal(insights.confidenceByLevel.high.top1Accuracy, 0.5);
  assert.equal(insights.actionModeStats.top2.top2Accuracy, 1);
  assert.equal(insights.lowConfidenceTop2.length, 1);
  assert.equal(insights.highConfidenceMisses.length, 1);
  assert.equal(insights.rejected.length, 2);
  assert.equal(insights.top1Misses.length, 2);
  assert.equal(insights.top2Misses.length, 1);
  assert.equal(insights.closeCalls.length, 2);
});

test("createMarkdownReport renders actionable sections", () => {
  const report = createMarkdownReport(analyzeResultRows(sampleRows(), { limit: 3 }));

  assert.match(report, /哭了么评估误差分析报告/);
  assert.match(report, /Top-1 弱标签命中率/);
  assert.match(report, /算法基本盘检查/);
  assert.match(report, /置信度分层/);
  assert.match(report, /高置信 Top-1 错判样本/);
  assert.match(report, /pitchP90/);
  assert.match(report, /高警觉样本/);
  assert.match(report, /Top-2 失败样本/);
  assert.match(report, /下一步调参建议/);
});

test("report-results CLI writes a markdown report", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yingyu-report-"));
  const rowsPath = join(dir, "rows.jsonl");
  const reportPath = join(dir, "report.md");
  await writeFile(rowsPath, sampleRows().map((row) => JSON.stringify(row)).join("\n"), "utf8");

  await execFileAsync(process.execPath, ["scripts/report-results.mjs", rowsPath, "--out", reportPath, "--limit", "2"], {
    cwd: new URL("..", import.meta.url)
  });

  const report = await readFile(reportPath, "utf8");
  assert.match(report, /哭了么评估误差分析报告/);
  assert.match(report, /拒判样本/);
});

test("report page references existing local assets", async () => {
  const root = new URL("..", import.meta.url);
  const html = await readFile(new URL("report.html", root), "utf8");

  assert.match(html, /report\.css/);
  assert.match(html, /report\.js/);
  assert.match(html, /gateBox/);
  assert.match(await readFile(new URL("report.css", root), "utf8"), /report-summary/);
  const reportJs = await readFile(new URL("report.js", root), "utf8");
  assert.match(reportJs, /analyzeResultRows/);
  assert.match(reportJs, /renderGateBox/);
});

function sampleRows() {
  return [
    row({
      file: "a.wav",
      yingyuLabel: "hunger",
      reasonLabel: "hungry",
      top1: "hunger",
      top2: "gas",
      top1Score: 0.52,
      top2Score: 0.28,
      confidenceLevel: "high",
      confidenceScore: 0.82,
      actionMode: "top1"
    }),
    row({
      file: "b.wav",
      yingyuLabel: "hunger",
      reasonLabel: "hungry",
      top1: "gas",
      top2: "hunger",
      top1Score: 0.39,
      top2Score: 0.36,
      confidenceLevel: "low",
      confidenceScore: 0.32,
      actionMode: "top2",
      questionId: "fed_recently"
    }),
    row({
      file: "c.wav",
      yingyuLabel: "tired",
      reasonLabel: "tired",
      top1: "gas",
      top2: "hunger",
      top1Score: 0.61,
      top2Score: 0.2,
      confidenceLevel: "high",
      confidenceScore: 0.79,
      actionMode: "top1",
      decisionEvidence: ["高位音高或尖锐度偏高。"]
    }),
    row({
      file: "d.wav",
      yingyuLabel: "gas",
      reasonLabel: "needs_burping",
      top1: "gas",
      top2: "hunger",
      top1Score: 0.42,
      top2Score: 0.4,
      highAlertLevel: "medium",
      highAlertScore: 0.51,
      confidenceLevel: "medium",
      confidenceScore: 0.48,
      actionMode: "top1"
    }),
    row({
      file: "e.wav",
      yingyuLabel: "discomfort",
      reasonLabel: "discomfort",
      usable: false,
      top1: "",
      top2: "",
      qualityScore: 0.12,
      qualityIssues: ["有效哭声不足", "背景噪声偏强"]
    }),
    row({ file: "f.wav", parsed: true, decoded: false, usable: false, comparable: false, error: "decode_failed" })
  ];
}

function row(overrides) {
  return {
    parsed: true,
    decoded: true,
    usable: true,
    comparable: true,
    ageLabel: "0-4_weeks",
    yingyuLabel: "hunger",
    reasonLabel: "hungry",
    qualityScore: 0.9,
    qualityIssues: [],
    highAlertLevel: "low",
    highAlertScore: 0.12,
    confidenceLevel: "medium",
    confidenceScore: 0.5,
    confidenceMargin: 0.2,
    actionMode: "top1",
    questionId: "",
    decisionEvidence: [],
    top1: "hunger",
    top1Score: 0.5,
    top2: "gas",
    top2Score: 0.3,
    validCrySec: 3.4,
    cryRatio: 0.42,
    snrDb: 16,
    pitchMedian: 520,
    pitchP90: 680,
    highBandRatio: 0.24,
    veryHighBandRatio: 0.08,
    burstiness: 0.31,
    irregularity: 0.22,
    ...overrides
  };
}
