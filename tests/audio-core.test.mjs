import assert from "node:assert/strict";
import test from "node:test";
import * as core from "../audio-core.js";

const sampleRate = 16000;

test("silence is rejected instead of being guessed", () => {
  const samples = new Float32Array(sampleRate * 8);
  const features = core.analyzeSamples(samples, sampleRate);
  const analysis = core.scoreAnalysis(features);

  assert.equal(features.quality.usable, false);
  assert.ok(features.quality.issues.includes("有效哭声不足"));
  assert.equal(analysis.highAlertLevel, "low");
});

test("rhythmic moderate cry is analyzable and ranks hunger first", () => {
  const samples = synthCry({
    frequency: 520,
    amplitude: 0.16,
    episodeSec: 0.55,
    gapSec: 0.55,
    harmonic: 0.1,
    jitter: 0.015,
    burst: 0.05,
    seed: 1
  });
  const features = core.analyzeSamples(samples, sampleRate);
  const analysis = core.scoreAnalysis(features);

  assert.equal(features.quality.usable, true);
  assert.equal(analysis.highAlertLevel, "low");
  assert.equal(analysis.ranking[0].key, "hunger");
  assert.ok(analysis.ranking[0].score > analysis.ranking[1].score);
});

test("continuous sharp cry raises high-alert risk and safety question", () => {
  const baseline = core.scoreAnalysis(
    core.analyzeSamples(
      synthCry({
        frequency: 520,
        amplitude: 0.16,
        episodeSec: 0.55,
        gapSec: 0.55,
        harmonic: 0.1,
        jitter: 0.015,
        burst: 0.05,
        seed: 2
      }),
      sampleRate
    )
  );
  const features = core.analyzeSamples(
    synthCry({
      frequency: 880,
      amplitude: 0.26,
      episodeSec: 2.2,
      gapSec: 0.2,
      harmonic: 0.35,
      jitter: 0.08,
      burst: 0.6,
      seed: 3
    }),
    sampleRate
  );
  const analysis = core.scoreAnalysis(features);

  assert.equal(features.quality.usable, true);
  assert.ok(analysis.highAlertScore > baseline.highAlertScore + 0.15);
  assert.ok(["medium", "high"].includes(analysis.highAlertLevel));
  assert.equal(analysis.question?.id, "safety");
});

test("personal feedback can move a similar cry to the historically effective action", () => {
  const features = {
    durationSec: 10,
    validCrySec: 6,
    cryRatio: 0.55,
    peakRms: 0.2,
    avgActiveRms: 0.1,
    noiseFloor: 0.01,
    snrDb: 20,
    episodeCount: 8,
    avgEpisodeSec: 0.6,
    longestEpisodeSec: 0.9,
    pitchMedian: 650,
    pitchP90: 720,
    pitchSpread: 150,
    zcrActive: 0.1,
    burstiness: 0.7,
    irregularity: 0.6,
    spectralCentroid: 1500,
    highBandRatio: 0.08,
    veryHighBandRatio: 0.01,
    quality: { usable: true, score: 0.9, issues: [] }
  };
  const base = core.scoreAnalysis(features);
  const history = Array.from({ length: 12 }, () => ({
    ts: Date.now(),
    category: "gas",
    result: "resolved",
    vector: core.featureVector(features)
  }));
  const adjusted = core.scoreAnalysis(features, { history });

  assert.notEqual(base.ranking[0].key, "gas");
  assert.equal(adjusted.ranking[0].key, "gas");
  assert.ok(adjusted.scores.gas > base.scores.gas);
});

test("aggregate baby prior nudges repeated feedback even without close vector similarity", () => {
  const features = {
    durationSec: 10,
    validCrySec: 6,
    cryRatio: 0.55,
    peakRms: 0.2,
    avgActiveRms: 0.1,
    noiseFloor: 0.01,
    snrDb: 20,
    episodeCount: 8,
    avgEpisodeSec: 0.6,
    longestEpisodeSec: 0.9,
    pitchMedian: 650,
    pitchP90: 720,
    pitchSpread: 150,
    zcrActive: 0.1,
    burstiness: 0.7,
    irregularity: 0.6,
    spectralCentroid: 1500,
    highBandRatio: 0.08,
    veryHighBandRatio: 0.01,
    quality: { usable: true, score: 0.9, issues: [] }
  };
  const base = core.scoreAnalysis(features);
  const history = Array.from({ length: 3 }, () => ({
    ts: Date.now(),
    category: "gas",
    result: "resolved",
    vector: [1, 1, 1, 1, 1, 1, 1, 1]
  }));
  const adjusted = core.scoreAnalysis(features, { history });

  assert.equal(base.ranking[0].key, "hunger");
  assert.ok(adjusted.scores.gas > base.scores.gas);
  assert.equal(adjusted.ranking[0].key, "hunger");
  assert.ok(adjusted.personalEvidence.gas > 0);
});

test("decision support marks close rankings as low confidence top-2 mode", () => {
  const features = {
    durationSec: 10,
    validCrySec: 5,
    cryRatio: 0.5,
    pitchMedian: 520,
    pitchP90: 650,
    highBandRatio: 0.2,
    burstiness: 0.5,
    irregularity: 0.4,
    longestEpisodeSec: 1.2,
    episodeCount: 6,
    snrDb: 16,
    quality: { usable: true, score: 0.82, issues: [] }
  };
  const analysis = {
    quality: features.quality,
    highAlertLevel: "low",
    highAlertScore: 0.2,
    ranking: [
      { key: "hunger", score: 0.31 },
      { key: "gas", score: 0.3 },
      { key: "tired", score: 0.21 },
      { key: "discomfort", score: 0.18 }
    ],
    personalEvidence: null
  };
  const support = core.getDecisionSupport(features, analysis);

  assert.equal(support.confidence.level, "low");
  assert.equal(support.actionMode, "top2");
  assert.ok(support.evidence.length > 0);
});

test("decision support prioritizes safety mode for high-alert analysis", () => {
  const features = {
    durationSec: 10,
    validCrySec: 7,
    cryRatio: 0.75,
    pitchMedian: 760,
    pitchP90: 920,
    highBandRatio: 0.5,
    burstiness: 0.65,
    irregularity: 0.55,
    longestEpisodeSec: 3.2,
    episodeCount: 3,
    snrDb: 18,
    quality: { usable: true, score: 0.86, issues: [] }
  };
  const analysis = {
    quality: features.quality,
    highAlertLevel: "high",
    highAlertScore: 0.75,
    ranking: [
      { key: "discomfort", score: 0.46 },
      { key: "gas", score: 0.24 }
    ]
  };
  const support = core.getDecisionSupport(features, analysis);

  assert.equal(support.actionMode, "safety");
  assert.match(support.evidence[0], /高警觉/);
});

test("scoring thresholds can be adjusted for offline replay", () => {
  assert.equal(core.getHighAlertLevel(0.61), "medium");
  assert.equal(core.getHighAlertLevel(0.61, { high: 0.6 }), "high");
  assert.equal(core.getConfidenceLevel(0.5), "medium");
  assert.equal(core.getConfidenceLevel(0.5, { medium: 0.52 }), "low");

  const features = {
    durationSec: 10,
    validCrySec: 7,
    cryRatio: 0.75,
    pitchMedian: 760,
    pitchP90: 920,
    highBandRatio: 0.5,
    veryHighBandRatio: 0.12,
    burstiness: 0.65,
    irregularity: 0.55,
    longestEpisodeSec: 3.2,
    episodeCount: 3,
    snrDb: 18,
    quality: { usable: true, score: 0.86, issues: [] }
  };
  const analysis = {
    quality: features.quality,
    highAlertLevel: "medium",
    highAlertScore: 0.55,
    ranking: [
      { key: "discomfort", score: 0.46 },
      { key: "gas", score: 0.24 }
    ]
  };

  assert.equal(core.getDecisionSupport(features, analysis).actionMode, "top1");
  assert.equal(core.getDecisionSupport(features, analysis, { safetyActionLevel: "medium" }).actionMode, "safety");
});

test("unresolved attempted action lowers that action for a similar cry", () => {
  const features = {
    durationSec: 10,
    validCrySec: 6,
    cryRatio: 0.55,
    peakRms: 0.2,
    avgActiveRms: 0.1,
    noiseFloor: 0.01,
    snrDb: 20,
    episodeCount: 8,
    avgEpisodeSec: 0.6,
    longestEpisodeSec: 0.9,
    pitchMedian: 650,
    pitchP90: 720,
    pitchSpread: 150,
    zcrActive: 0.1,
    burstiness: 0.7,
    irregularity: 0.6,
    spectralCentroid: 1500,
    highBandRatio: 0.08,
    veryHighBandRatio: 0.01,
    quality: { usable: true, score: 0.9, issues: [] }
  };
  const base = core.scoreAnalysis(features);
  const history = Array.from({ length: 2 }, () => ({
    ts: Date.now(),
    category: "unresolved",
    attemptedCategory: "hunger",
    result: "unresolved",
    vector: core.featureVector(features)
  }));
  const adjusted = core.scoreAnalysis(features, { history });

  assert.ok(adjusted.scores.hunger < base.scores.hunger - 0.05);
  assert.ok(adjusted.personalEvidence.hunger < 0);
});

test("question answer updates probabilities and high-alert score", () => {
  const features = core.analyzeSamples(
    synthCry({
      frequency: 880,
      amplitude: 0.26,
      episodeSec: 2.2,
      gapSec: 0.2,
      harmonic: 0.35,
      jitter: 0.08,
      burst: 0.6,
      seed: 4
    }),
    sampleRate
  );
  const analysis = core.scoreAnalysis(features);
  const yes = analysis.question.options.find((option) => option.label === "有");
  const updated = core.applyQuestionAnswerToAnalysis(analysis, yes);

  assert.ok(updated.highAlertScore > analysis.highAlertScore);
  assert.equal(updated.highAlertLevel, "high");
  assert.equal(updated.question, null);
});

test("tired risk is surfaced through awake-time question even when hunger ranks first", () => {
  const features = {
    durationSec: 10,
    validCrySec: 4.5,
    cryRatio: 0.5,
    peakRms: 0.12,
    avgActiveRms: 0.08,
    noiseFloor: 0.005,
    snrDb: 20,
    episodeCount: 8,
    avgEpisodeSec: 0.5,
    longestEpisodeSec: 1.1,
    pitchMedian: 500,
    pitchP90: 540,
    pitchSpread: 120,
    zcrActive: 0.1,
    burstiness: 0.55,
    irregularity: 0.7,
    spectralCentroid: 1200,
    highBandRatio: 0.25,
    veryHighBandRatio: 0.02,
    quality: { usable: true, score: 0.9, issues: [] }
  };
  const analysis = core.scoreAnalysis(features);
  const awakeLong = analysis.question.options.find((option) => option.label === "超过 1 小时");
  const updated = core.applyQuestionAnswerToAnalysis(analysis, awakeLong);

  assert.equal(analysis.ranking[0].key, "hunger");
  assert.equal(analysis.question?.id, "awake_long");
  assert.equal(updated.ranking[0].key, "tired");
});

test("quality guidance turns rejection issues into concrete recording advice", () => {
  const guidance = core.getQualityGuidance({
    usable: false,
    score: 0.2,
    issues: ["有效哭声不足", "背景噪声偏强"]
  });

  assert.equal(guidance.length, 2);
  assert.match(guidance[0], /至少保留 3 次呼气哭声/);
  assert.match(guidance[1], /电视、音乐、白噪音或风扇/);
});

function synthCry({
  frequency,
  durationSec = 10,
  amplitude,
  episodeSec,
  gapSec,
  harmonic,
  jitter,
  burst,
  seed
}) {
  const rng = mulberry32(seed);
  const samples = new Float32Array(Math.floor(sampleRate * durationSec));
  let phase = 0;

  for (let i = 0; i < samples.length; i += 1) {
    const t = i / sampleRate;
    const cycleSec = episodeSec + gapSec;
    const episodePosition = t % cycleSec;
    const inEpisode = episodePosition < episodeSec;
    const envPosition = episodePosition / episodeSec;
    const envelope = inEpisode ? Math.min(1, envPosition * 8, (1 - envPosition) * 8 + 0.2) : 0;
    const modulatedFrequency =
      frequency * (1 + Math.sin(t * 18) * jitter + Math.sin(t * 3.1) * jitter * 0.5);
    phase += (2 * Math.PI * modulatedFrequency) / sampleRate;

    const noise = (rng() * 2 - 1) * 0.006;
    const burstBoost = 1 + (Math.sin(t * 21) > 0.92 ? burst : 0);
    samples[i] =
      envelope *
        amplitude *
        burstBoost *
        (Math.sin(phase) + harmonic * Math.sin(phase * 2.02) + harmonic * 0.4 * Math.sin(phase * 3.01)) +
      noise;
  }

  return samples;
}

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
