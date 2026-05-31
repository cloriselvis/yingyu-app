import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { analyzeReviewAnnotations, createReviewAnnotationMarkdown, parseReviewAnnotationsPayload } from "../review-annotations.js";

const execFileAsync = promisify(execFile);

test("analyzeReviewAnnotations joins exported annotations to manifest items", () => {
  const summary = analyzeReviewAnnotations(samplePack(), sampleAnnotationPayload(), { minAnnotations: 2 });

  assert.equal(summary.totalItems, 4);
  assert.equal(summary.annotationCount, 4);
  assert.equal(summary.matchedCount, 4);
  assert.equal(summary.judgementCounts.weak_label_ok, 1);
  assert.equal(summary.priorities.confirmedModelMisses.length, 1);
  assert.equal(summary.priorities.weakLabelLikelyNoisy.length, 1);
  assert.equal(summary.priorities.safetyTooSensitive.length, 1);
  assert.equal(summary.priorities.qualityGateConfirmed.length, 1);
  assert.equal(summary.featureDiagnostics[0].values.snrDb, 13.5);

  const markdown = createReviewAnnotationMarkdown(summary);
  assert.match(markdown, /确认模型错判/);
  assert.match(markdown, /高警觉过敏/);
  assert.match(markdown, /质量门控确认正确/);
  assert.match(markdown, /关键特征均值/);
  assert.match(markdown, /P90 音高/);
});

test("parseReviewAnnotationsPayload accepts localStorage object shape", () => {
  const annotations = parseReviewAnnotationsPayload({
    annotations: {
      a: { key: "a", judgement: "weak_label_ok" },
      b: { key: "b", note: "needs another listen" },
      c: { key: "c" }
    }
  });

  assert.equal(annotations.length, 2);
  assert.equal(annotations[0].judgement, "weak_label_ok");
  assert.equal(annotations[1].note, "needs another listen");
  assert.equal(parseReviewAnnotationsPayload('\uFEFF{"annotations":[{"key":"a","judgement":"unclear"}]}').length, 1);
});

test("report-review CLI writes a markdown summary", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yingyu-review-report-"));
  const manifestPath = join(dir, "manifest.json");
  const annotationsPath = join(dir, "annotations.json");
  const outPath = join(dir, "review-report.md");
  await writeFile(manifestPath, JSON.stringify(samplePack()), "utf8");
  await writeFile(annotationsPath, `\uFEFF${JSON.stringify(sampleAnnotationPayload())}`, "utf8");

  await execFileAsync(process.execPath, ["scripts/report-review.mjs", manifestPath, annotationsPath, "--out", outPath], {
    cwd: new URL("..", import.meta.url)
  });

  const report = await readFile(outPath, "utf8");
  assert.match(report, /哭了么抽听标注汇总/);
  assert.match(report, /已标注：4/);
});

function samplePack() {
  return {
    selectedCount: 4,
    buckets: {
      "high-confidence-misses": 1,
      "top2-misses": 1,
      "high-alert": 1,
      rejected: 1
    },
    items: [
      item("high-confidence-misses", "高置信错判", "high/a.wav", "gas", "hunger", "tired"),
      item("top2-misses", "Top-2 未覆盖", "top2/b.wav", "hunger", "gas", "discomfort"),
      item("high-alert", "中/高警觉", "alert/c.wav", "hunger", "gas", "hunger"),
      item("rejected", "质量拒判", "rejected/d.wav", "tired", "", "")
    ]
  };
}

function sampleAnnotationPayload() {
  return {
    annotations: [
      annotation("high/a.wav#0", "high-confidence-misses", "high/a.wav", "weak_label_ok"),
      annotation("top2/b.wav#1", "top2-misses", "top2/b.wav", "model_top1_ok"),
      annotation("alert/c.wav#2", "high-alert", "alert/c.wav", "safety_too_sensitive"),
      annotation("rejected/d.wav#3", "rejected", "rejected/d.wav", "quality_bad")
    ]
  };
}

function item(bucket, bucketLabel, reviewFile, expected, top1, top2) {
  return {
    bucket,
    bucketLabel,
    file: reviewFile.replace("/", "\\"),
    reviewFile,
    expected,
    top1,
    top2,
    validCrySec: 3,
    cryRatio: 0.4,
    snrDb: 13.5,
    pitchP90: 700,
    highBandRatio: 0.3,
    veryHighBandRatio: 0.08,
    burstiness: 0.4,
    irregularity: 0.35
  };
}

function annotation(key, bucket, reviewFile, judgement) {
  return {
    key,
    bucket,
    file: reviewFile.replace("/", "\\"),
    reviewFile,
    judgement,
    note: `${judgement} note`,
    updatedAt: "2026-05-31T00:00:00.000Z"
  };
}
