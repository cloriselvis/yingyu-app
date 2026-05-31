import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { buildReviewPack, createReviewCsv, createReviewHtml, createReviewMarkdown } from "../review-pack.js";

const execFileAsync = promisify(execFile);

test("buildReviewPack selects high-value offline audit buckets", () => {
  const pack = buildReviewPack(sampleRows(), { limit: 5 });

  assert.equal(pack.totalRows, 6);
  assert.equal(pack.buckets["high-confidence-misses"], 1);
  assert.equal(pack.buckets["top2-misses"], 1);
  assert.equal(pack.buckets["high-alert"], 1);
  assert.equal(pack.buckets.rejected, 1);
  assert.equal(pack.buckets["top2-close-covered"], 1);
  assert.equal(pack.items.find((item) => item.file === "a.wav").snrDb, 16.2);
  assert.equal(pack.items.find((item) => item.file === "a.wav").ageBucket, "3-8w");
  assert.equal(pack.items.find((item) => item.file === "a.wav").comparable, true);
  assert.match(createReviewMarkdown(pack), /高置信错判/);
  assert.match(createReviewMarkdown(pack), /来源标签/);
  assert.match(createReviewMarkdown(pack), /3-8 weeks/);
  assert.match(createReviewCsv(pack), /snrDb/);
  assert.match(createReviewCsv(pack), /ageBucket/);
  const html = createReviewHtml(pack);
  assert.match(html, /<audio controls/);
  assert.match(html, /导出标注 JSON/);
  assert.match(html, /localStorage/);
  assert.match(html, /音高 P50\/P90/);
  assert.match(html, /月龄档案/);
});

test("build-review-pack CLI copies selected audio and writes manifests", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yingyu-review-"));
  const audioRoot = join(dir, "audio");
  const outDir = join(dir, "review");
  const rowsPath = join(dir, "rows.jsonl");
  await mkdir(audioRoot);
  await writeFile(join(audioRoot, "a.wav"), Buffer.from("a"));
  await writeFile(join(audioRoot, "b.wav"), Buffer.from("b"));
  await writeFile(rowsPath, sampleRows().map((row) => JSON.stringify(row)).join("\n"), "utf8");

  await execFileAsync(process.execPath, ["scripts/build-review-pack.mjs", rowsPath, audioRoot, "--out", outDir, "--limit", "3"], {
    cwd: new URL("..", import.meta.url)
  });

  const manifest = JSON.parse(await readFile(join(outDir, "manifest.json"), "utf8"));
  const review = await readFile(join(outDir, "REVIEW.md"), "utf8");
  const html = await readFile(join(outDir, "review.html"), "utf8");

  assert.equal(manifest.selectedCount, 6);
  assert.equal(manifest.copiedAudio, 2);
  assert.ok(manifest.missingAudio >= 1);
  assert.match(review, /哭了么离线抽听包/);
  assert.match(html, /哭了么离线抽听包/);
  assert.match(html, /<audio controls/);
});

function sampleRows() {
  return [
    row({
      file: "a.wav",
      yingyuLabel: "gas",
      top1: "hunger",
      top2: "tired",
      confidenceLevel: "high",
      confidenceScore: 0.82,
      top1Score: 0.61,
      top2Score: 0.2
    }),
    row({
      file: "b.wav",
      yingyuLabel: "hunger",
      top1: "gas",
      top2: "hunger",
      confidenceLevel: "low",
      confidenceScore: 0.3,
      actionMode: "top2",
      top1Score: 0.34,
      top2Score: 0.33
    }),
    row({
      file: "f.wav",
      yingyuLabel: "discomfort",
      top1: "hunger",
      top2: "gas",
      confidenceLevel: "medium",
      confidenceScore: 0.56,
      top1Score: 0.45,
      top2Score: 0.32
    }),
    row({
      file: "c.wav",
      yingyuLabel: "gas",
      top1: "gas",
      top2: "hunger",
      highAlertLevel: "high",
      highAlertScore: 0.75
    }),
    row({
      file: "d.wav",
      usable: false,
      comparable: false,
      top1: "",
      top2: "",
      qualityScore: 0.1,
      qualityIssues: ["有效哭声不足"]
    }),
    row({
      file: "e.wav",
      decoded: false,
      usable: false,
      comparable: false,
      error: "decode failed"
    })
  ];
}

function row(overrides) {
  return {
    parsed: true,
    decoded: true,
    usable: true,
    comparable: true,
    yingyuLabel: "hunger",
    reasonLabel: "self_label",
    ageBucket: "3-8w",
    ageLabel: "",
    qualityScore: 0.9,
    qualityIssues: [],
    highAlertLevel: "low",
    highAlertScore: 0.1,
    confidenceLevel: "medium",
    confidenceScore: 0.5,
    actionMode: "top1",
    top1: "hunger",
    top1Score: 0.5,
    top2: "gas",
    top2Score: 0.3,
    durationSec: 6,
    validCrySec: 3.4,
    cryRatio: 0.42,
    snrDb: 16.2,
    episodeCount: 5,
    longestEpisodeSec: 0.8,
    pitchMedian: 520,
    pitchP90: 680,
    pitchSpread: 220,
    spectralCentroid: 1600,
    highBandRatio: 0.24,
    veryHighBandRatio: 0.08,
    burstiness: 0.31,
    irregularity: 0.22,
    ...overrides
  };
}
