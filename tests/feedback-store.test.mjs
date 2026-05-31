import assert from "node:assert/strict";
import test from "node:test";
import * as feedbackStore from "../feedback-store.js";

const features = {
  durationSec: 8.1234,
  validCrySec: 4.5678,
  cryRatio: 0.5432,
  snrDb: 18.8888,
  pitchMedian: 512.3456,
  pitchP90: 690.1234,
  highBandRatio: 0.2345,
  burstiness: 0.4567,
  episodeCount: 7,
  irregularity: 0.3456,
  quality: { usable: true, score: 0.9123, issues: [] }
};

const analysis = {
  highAlertScore: 0.2345,
  highAlertLevel: "medium",
  ranking: [
    { key: "hunger", score: 0.6677 },
    { key: "gas", score: 0.3322 }
  ],
  scores: { hunger: 0.6677, gas: 0.3322, tired: 0.12, discomfort: 0.25 },
  uncertainty: 0.6645
};

test("session record preserves compact features, ranking, question answer, and feedback", () => {
  const session = feedbackStore.buildSessionRecord({
    id: "s1",
    ts: 123,
    babyId: "宝宝",
    sourceName: "sample.wav",
    features,
    analysis,
    questionAnswer: {
      questionId: "fed_recently",
      questionText: "刚才 1 小时内喂过吗？",
      optionLabel: "没喂过",
      answeredAt: 122
    },
    attempts: [{ actionCategory: "hunger", result: "unresolved", ts: 120 }],
    feedback: { actionCategory: "hunger", reliefKey: "fast" },
    audio: {
      sessionId: "s1",
      mimeType: "audio/webm",
      size: 1000,
      createdAt: 121,
      filename: "s1.webm"
    },
    vector: [0.12345, 0.98765]
  });

  assert.equal(session.id, "s1");
  assert.equal(session.quality.score, 0.912);
  assert.equal(session.features.durationSec, 8.123);
  assert.deepEqual(session.analysis.ranking, [
    { key: "hunger", score: 0.668 },
    { key: "gas", score: 0.332 }
  ]);
  assert.equal(session.questionAnswer.optionLabel, "没喂过");
  assert.equal(session.attempts.length, 1);
  assert.equal(session.attempts[0].actionLabel, "喂奶");
  assert.equal(session.feedback.actionLabel, "喂奶");
  assert.equal(session.feedback.reliefTimeSec, 300);
  assert.equal(session.audio.filename, "s1.webm");
  assert.deepEqual(session.vector, [0.123, 0.988]);
});

test("calibration items include failed attempts before the final effective action", () => {
  const session = feedbackStore.buildSessionRecord({
    id: "s1-attempts",
    ts: 321,
    babyId: "宝宝",
    sourceName: "sample.wav",
    features,
    analysis,
    attempts: [
      { actionCategory: "hunger", result: "unresolved", ts: 300 },
      { actionCategory: "gas", result: "unresolved", ts: 310 }
    ],
    feedback: { actionCategory: "gas", reliefKey: "fast" },
    vector: [0.1, 0.2]
  });

  const items = feedbackStore.buildCalibrationItems(session);

  assert.equal(items.length, 2);
  assert.equal(items[0].attemptedCategory, "hunger");
  assert.equal(items[0].result, "unresolved");
  assert.equal(items[1].attemptedCategory, "gas");
  assert.equal(items[1].result, "resolved");
});

test("calibration item carries category, result, relief time, scores, and vector", () => {
  const session = feedbackStore.buildSessionRecord({
    id: "s2",
    ts: 456,
    babyId: "宝宝",
    sourceName: "sample.wav",
    features,
    analysis,
    feedback: { actionCategory: "gas", reliefKey: "partial" },
    vector: [0.2, 0.4]
  });

  const item = feedbackStore.buildCalibrationItem(session);

  assert.equal(item.sessionId, "s2");
  assert.equal(item.category, "gas");
  assert.equal(item.attemptedCategory, "gas");
  assert.equal(item.result, "resolved");
  assert.equal(item.reliefTimeSec, null);
  assert.equal(item.partial, true);
  assert.deepEqual(item.vector, [0.2, 0.4]);
  assert.equal(item.scores.hunger, 0.668);
});

test("unresolved action is kept as attempted category but not used as positive calibration", () => {
  const session = feedbackStore.buildSessionRecord({
    id: "s3",
    ts: 789,
    babyId: "宝宝",
    sourceName: "sample.wav",
    features,
    analysis,
    feedback: { actionCategory: "hunger", reliefKey: "unresolved" },
    vector: [0.3, 0.5]
  });

  const item = feedbackStore.buildCalibrationItem(session);

  assert.equal(item.category, "unresolved");
  assert.equal(item.attemptedCategory, "hunger");
  assert.equal(item.result, "unresolved");
});

test("appendBounded keeps the newest items within max length", () => {
  const next = feedbackStore.appendBounded([1, 2, 3], 4, 2);

  assert.deepEqual(next, [3, 4]);
});

test("appendManyBounded keeps the newest items within max length", () => {
  const next = feedbackStore.appendManyBounded([1, 2], [3, 4], 3);

  assert.deepEqual(next, [2, 3, 4]);
});

test("exportPayload includes schema and item counts", () => {
  const payload = feedbackStore.exportPayload({
    babyId: "宝宝",
    sessions: [{ id: "s1" }, { id: "s2" }],
    history: [{ sessionId: "s1" }],
    audioAttachments: [{ sessionId: "s1", base64: "YQ==" }],
    exportedAt: "2026-05-30T00:00:00.000Z"
  });

  assert.equal(payload.schema, "yingyu.feedback.v1");
  assert.equal(payload.exportedAt, "2026-05-30T00:00:00.000Z");
  assert.equal(payload.counts.sessions, 2);
  assert.equal(payload.counts.calibrationItems, 1);
  assert.equal(payload.counts.audioAttachments, 1);
  assert.equal(payload.audioAttachments.length, 1);
});

test("normalizeImportedPayload sanitizes sessions and derives missing calibration history", () => {
  const payload = feedbackStore.exportPayload({
    babyId: " 小宝宝 ",
    sessions: [
      feedbackStore.buildSessionRecord({
        id: "s1",
        ts: 123,
        babyId: "小宝宝",
        sourceName: "sample.wav",
        features,
        analysis,
    feedback: { actionCategory: "hunger", reliefKey: "fast" },
    attempts: [{ actionCategory: "gas", result: "unresolved", ts: 122 }],
    vector: [0.1, 0.2, 0.3]
  }),
      { id: "", vector: [] }
    ],
    history: []
  });
  delete payload.calibrationHistory;

  const imported = feedbackStore.normalizeImportedPayload(payload);

  assert.equal(imported.babyId, "小宝宝");
  assert.equal(imported.counts.sessions, 1);
  assert.equal(imported.counts.calibrationItems, 2);
  assert.equal(imported.history.length, 2);
  assert.equal(imported.history[0].sessionId, "s1");
  assert.equal(imported.history[0].category, "unresolved");
  assert.equal(imported.history[1].category, "hunger");
});

test("mergeImportedData deduplicates by session id and keeps newest bounded records", () => {
  const merged = feedbackStore.mergeImportedData({
    currentSessions: [
      { id: "s1", ts: 1, value: "old" },
      { id: "s2", ts: 2, value: "current" }
    ],
    importedSessions: [
      { id: "s1", ts: 3, value: "imported" },
      { id: "s3", ts: 4, value: "new" }
    ],
    currentHistory: [
      { sessionId: "s1", ts: 1, category: "gas", result: "resolved" },
      { sessionId: "s2", ts: 2, category: "hunger", result: "resolved" }
    ],
    importedHistory: [
      { sessionId: "s1", ts: 3, category: "tired", result: "resolved" },
      { sessionId: "s3", ts: 4, category: "discomfort", result: "resolved" }
    ],
    maxSessions: 2,
    maxHistory: 2
  });

  assert.deepEqual(
    merged.sessions.map((item) => `${item.id}:${item.value}`),
    ["s1:imported", "s3:new"]
  );
  assert.deepEqual(
    merged.history.map((item) => `${item.sessionId}:${item.category}`),
    ["s1:tired", "s3:discomfort"]
  );
});

test("summarizeRecentSessions returns newest compact feedback rows", () => {
  const sessions = [
    feedbackStore.buildSessionRecord({
      id: "old",
      ts: 100,
      babyId: "宝宝",
      sourceName: "a.wav",
      features,
      analysis,
      feedback: { actionCategory: "hunger", reliefKey: "fast" },
      vector: [0.1]
    }),
    feedbackStore.buildSessionRecord({
      id: "new",
      ts: 200,
      babyId: "宝宝",
      sourceName: "b.wav",
      features,
      analysis: {
        ...analysis,
        highAlertLevel: "high",
        ranking: [
          { key: "gas", score: 0.5 },
          { key: "hunger", score: 0.3 }
        ]
      },
      feedback: { actionCategory: "gas", reliefKey: "recurred" },
      audio: { sessionId: "new", mimeType: "audio/webm", size: 10 },
      vector: [0.2]
    })
  ];

  const rows = feedbackStore.summarizeRecentSessions(sessions, 1);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "new");
  assert.equal(rows[0].top1, "gas");
  assert.equal(rows[0].actionLabel, "拍嗝/排气");
  assert.equal(rows[0].recurred, true);
  assert.equal(rows[0].attemptCount, 0);
  assert.equal(rows[0].hasAudio, true);
  assert.equal(rows[0].highAlertLevel, "high");
});

test("normalizeImportedPayload rejects unsupported schema", () => {
  assert.throws(
    () => feedbackStore.normalizeImportedPayload({ schema: "other", sessions: [] }),
    /版本不支持/
  );
});

test("createSessionId can be deterministic for tests", () => {
  assert.equal(feedbackStore.createSessionId(36, 0), "yy_10_0");
});
