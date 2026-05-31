import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import {
  analyzeFeedbackExport,
  createFeedbackMarkdownReport,
  parseFeedbackExport
} from "../feedback-insights.js";

const execFileAsync = promisify(execFile);

test("parseFeedbackExport accepts exported app payloads", () => {
  const payload = parseFeedbackExport(
    JSON.stringify({
      schema: "yingyu.feedback.v1",
      exportedAt: "2026-05-30T00:00:00.000Z",
      babyId: "宝宝",
      sessions: [{ id: "s1" }],
      calibrationHistory: [{ sessionId: "s1" }],
      audioAttachments: [{ sessionId: "s1", base64: "YQ==", size: 1 }]
    })
  );

  assert.equal(payload.schema, "yingyu.feedback.v1");
  assert.equal(payload.babyId, "宝宝");
  assert.equal(payload.sessions.length, 1);
  assert.equal(payload.history.length, 1);
  assert.equal(payload.audioAttachments.length, 1);
});

test("analyzeFeedbackExport computes feedback hit rates and review buckets", () => {
  const insights = analyzeFeedbackExport({
    schema: "yingyu.feedback.v1",
    exportedAt: "2026-05-30T00:00:00.000Z",
    babyId: "宝宝",
    audioAttachments: [{ sessionId: "s2", base64: "YQ==", size: 1 }],
    sessions: [
      session({
        id: "s1",
        ranking: ["hunger", "gas"],
        feedback: { actionCategory: "hunger", reliefKey: "fast", resolved: true },
        questionAnswer: { questionId: "fed_recently", optionLabel: "没喂过" }
      }),
      session({
        id: "s2",
        ranking: ["hunger", "gas"],
        attempts: [{ actionCategory: "hunger", result: "unresolved" }],
        feedback: { actionCategory: "gas", reliefKey: "slow", resolved: true },
        highAlertLevel: "medium",
        highAlertScore: 0.52
      }),
      session({
        id: "s3",
        ranking: ["hunger", "tired"],
        feedback: { actionCategory: "discomfort", reliefKey: "partial", resolved: true, partial: true }
      }),
      session({
        id: "s4",
        ranking: ["hunger", "gas"],
        feedback: { actionCategory: "hunger", reliefKey: "unresolved", resolved: false }
      })
    ]
  });

  assert.equal(insights.total, 4);
  assert.equal(insights.audioAttachmentCount, 1);
  assert.equal(insights.usable, 4);
  assert.equal(insights.withResolvedFeedback, 3);
  assert.equal(insights.unresolved, 1);
  assert.equal(insights.failedAttempts, 1);
  assert.equal(insights.partial, 1);
  assert.equal(insights.top1Match, 1);
  assert.equal(insights.top2Match, 2);
  assert.equal(insights.pilot.resolvedSamples, 3);
  assert.equal(insights.pilot.firstStepEffectiveRate, 1 / 3);
  assert.equal(insights.pilot.top2CoverageRate, 2 / 3);
  assert.equal(insights.pilot.recommendedCoverageRate, 2 / 3);
  assert.equal(insights.pilot.avgAttemptsToOutcome, 1.25);
  assert.equal(insights.pilot.avgFailedAttemptsBeforeResolution, 1 / 3);
  assert.equal(insights.pilot.fastReliefRate, 1 / 3);
  assert.equal(insights.pilot.medianReliefTimeSec, 450);
  assert.equal(insights.pilot.unresolvedRate, 0.25);
  assert.equal(insights.pilot.status, "collect");
  assert.equal(insights.byAction.gas.top2MatchRate, 1);
  assert.equal(insights.byAction.discomfort.top2MatchRate, 0);
  assert.equal(insights.attemptedNoRelief.hunger, 2);
  assert.equal(insights.questionAnswers["fed_recently:没喂过"].resolved, 1);
  assert.equal(insights.highAlert.length, 1);
  assert.equal(insights.highAlert[0].hasAudio, true);
  assert.equal(insights.misses.length, 2);
});

test("createFeedbackMarkdownReport renders actionable sections", () => {
  const insights = analyzeFeedbackExport({
    babyId: "宝宝",
    sessions: [
      session({
        id: "s1",
        ranking: ["hunger", "gas"],
        feedback: { actionCategory: "gas", reliefKey: "slow", resolved: true }
      })
    ]
  });
  const markdown = createFeedbackMarkdownReport(insights);

  assert.match(markdown, /# 哭了么反馈复盘报告/);
  assert.match(markdown, /Top-2 覆盖有效处理/);
  assert.match(markdown, /内测有效性指标/);
  assert.match(markdown, /首步有效率/);
  assert.match(markdown, /音频附件/);
  assert.match(markdown, /过程中未缓解尝试/);
  assert.match(markdown, /需要复盘的错判/);
  assert.match(markdown, /拍嗝\/胀气/);
});

test("feedback report page references existing local assets and audio helpers", async () => {
  const root = new URL("..", import.meta.url);
  const html = await readFile(new URL("feedback-report.html", root), "utf8");
  const js = await readFile(new URL("feedback-report.js", root), "utf8");

  assert.match(html, /feedback-report\.js/);
  assert.match(html, /report\.css/);
  assert.match(html, /feedbackFile/);
  assert.match(html, /pilotBox/);
  assert.match(js, /analyzeFeedbackExport/);
  assert.match(js, /renderPilotBox/);
  assert.match(js, /audioAttachmentToBlob/);
  assert.match(js, /mini-audio/);
});

test("report-feedback CLI writes a markdown report", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yingyu-feedback-"));
  const input = join(dir, "feedback.json");
  const output = join(dir, "report.md");
  await writeFile(
    input,
    JSON.stringify({
      schema: "yingyu.feedback.v1",
      babyId: "宝宝",
      sessions: [
        session({
          id: "s1",
          ranking: ["hunger", "gas"],
          feedback: { actionCategory: "hunger", reliefKey: "fast", resolved: true }
        })
      ]
    }),
    "utf8"
  );

  await execFileAsync(process.execPath, ["scripts/report-feedback.mjs", input, "--out", output], {
    cwd: process.cwd()
  });
  const markdown = await readFile(output, "utf8");

  assert.match(markdown, /哭了么反馈复盘报告/);
  assert.match(markdown, /宝宝/);

  await rm(dir, { recursive: true, force: true });
});

function session({
  id,
  ranking,
  feedback,
  attempts = [],
  highAlertLevel = "low",
  highAlertScore = 0.2,
  questionAnswer = null
}) {
  return {
    id,
    ts: Date.now(),
    quality: { usable: true, score: 0.9, issues: [] },
    analysis: {
      highAlertLevel,
      highAlertScore,
      ranking: ranking.map((key, index) => ({ key, score: index === 0 ? 0.62 : 0.28 })),
      scores: {},
      uncertainty: 0.6
    },
    questionAnswer,
    attempts,
    feedback,
    vector: [0.1, 0.2]
  };
}
