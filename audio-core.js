export const DEFAULT_AGE_CALIBRATION_STRENGTH = 0.5;

export function analyzeSamples(samples, sampleRate) {
  const durationSec = samples.length / sampleRate;
  const frameSize = 1024;
  const hop = 512;
  const frameCount = Math.max(0, Math.floor((samples.length - frameSize) / hop) + 1);
  const rms = [];
  const zcr = [];

  for (let frame = 0; frame < frameCount; frame += 1) {
    const start = frame * hop;
    let energy = 0;
    let crossings = 0;
    let last = samples[start];
    for (let i = 0; i < frameSize; i += 1) {
      const value = samples[start + i];
      energy += value * value;
      if ((value >= 0 && last < 0) || (value < 0 && last >= 0)) crossings += 1;
      last = value;
    }
    rms.push(Math.sqrt(energy / frameSize));
    zcr.push(crossings / frameSize);
  }

  const peakRms = max(rms);
  const noiseFloor = Math.max(percentile(rms, 0.2), 0.00001);
  const medianRms = percentile(rms, 0.5);
  const threshold = Math.max(
    Math.min(noiseFloor * 2.6, peakRms * 0.45),
    medianRms * 0.45,
    peakRms * 0.12,
    0.006
  );
  const active = rms.map((value) => value >= threshold);
  const activeIndices = active.map((isActive, index) => (isActive ? index : -1)).filter((index) => index >= 0);
  const activeRms = activeIndices.map((index) => rms[index]);
  const avgActiveRms = average(activeRms);
  const validCrySec = activeIndices.length * hop / sampleRate;
  const cryRatio = frameCount ? activeIndices.length / frameCount : 0;
  const snrDb = 20 * Math.log10(Math.max(avgActiveRms, 0.00001) / noiseFloor);
  const episodes = findEpisodes(active, hop / sampleRate);
  const pitchValues = estimatePitches(samples, sampleRate, active, rms, threshold);
  const spectral = estimateSpectralFeatures(samples, sampleRate, active, rms, threshold);
  const burstiness = estimateBurstiness(rms, active, peakRms);
  const irregularity = estimateIrregularity(episodes, pitchValues);
  const activeZcr = activeIndices.map((index) => zcr[index]);

  const features = {
    durationSec,
    validCrySec,
    cryRatio,
    peakRms,
    avgActiveRms,
    noiseFloor,
    snrDb: Number.isFinite(snrDb) ? snrDb : 0,
    episodeCount: episodes.length,
    avgEpisodeSec: average(episodes.map((item) => item.duration)),
    longestEpisodeSec: max(episodes.map((item) => item.duration)),
    pitchMedian: median(pitchValues),
    pitchP90: percentile(pitchValues, 0.9),
    pitchSpread: percentile(pitchValues, 0.9) - percentile(pitchValues, 0.1),
    zcrActive: average(activeZcr),
    burstiness,
    irregularity,
    ...spectral
  };

  features.quality = assessQuality(features);
  return features;
}

export function scoreAnalysis(features, options = {}) {
  const quality = features.quality;
  const babyProfile = normalizeBabyProfile(options.babyProfile);
  let highAlertScore = scoreHighAlert(features);
  const baseScores = scoreNeeds(features, highAlertScore);
  const ageAdjusted = applyAgeCalibration(baseScores, highAlertScore, babyProfile, options);
  highAlertScore = ageAdjusted.highAlertScore;
  const highAlertLevel = getHighAlertLevel(highAlertScore, options.highAlertThresholds);
  const personal = applyPersonalCalibration(ageAdjusted.scores, features, options.history || []);
  const ranking = rankScores(personal.scores);
  const uncertainty = ranking[1] ? 1 - (ranking[0].score - ranking[1].score) : 0;
  const contextQuestions = chooseContextQuestions(ranking, highAlertLevel, uncertainty, babyProfile);
  const question = contextQuestions[0] || null;

  return {
    quality,
    highAlertScore,
    highAlertLevel,
    scores: personal.scores,
    personalEvidence: personal.evidence,
    ranking,
    uncertainty,
    question,
    contextQuestions,
    babyProfile
  };
}

export function applyQuestionAnswerToAnalysis(analysis, option, options = {}) {
  const nextScores = { ...analysis.scores };
  for (const [key, delta] of Object.entries(option.delta || {})) {
    nextScores[key] = clamp(nextScores[key] + delta, 0.02, 1);
  }

  const highAlertScore = clamp01(analysis.highAlertScore + (option.highAlertDelta || 0));
  const highAlertLevel = getHighAlertLevel(highAlertScore, options.highAlertThresholds);
  const scores = normalizeScores(nextScores);
  const ranking = rankScores(scores);

  return {
    highAlertScore,
    highAlertLevel,
    scores,
    ranking,
    question: null,
    contextQuestions: []
  };
}

export function applyContextAnswersToAnalysis(analysis, answers = [], options = {}) {
  const nextScores = { ...analysis.scores };
  let highAlertScore = analysis.highAlertScore;

  for (const answer of answers) {
    const option = answer?.option || answer;
    if (!option) continue;
    for (const [key, delta] of Object.entries(option.delta || {})) {
      nextScores[key] = clamp(nextScores[key] + delta, 0.02, 1);
    }
    highAlertScore = clamp01(highAlertScore + (option.highAlertDelta || 0));
  }

  highAlertScore = clamp01(highAlertScore);
  const highAlertLevel = getHighAlertLevel(highAlertScore, options.highAlertThresholds);
  const scores = normalizeScores(nextScores);
  const ranking = rankScores(scores);

  return {
    highAlertScore,
    highAlertLevel,
    scores,
    ranking,
    question: null,
    contextQuestions: []
  };
}

export function getQualityGuidance(quality) {
  const issues = quality?.issues || [];
  const guidance = issues.map((issue) => {
    if (issue === "录音少于 4 秒") return "录音时间太短：重新录 8-15 秒，尽量包含几次连续哭声。";
    if (issue === "整体音量偏低") return "音量偏低：手机靠近宝宝 20-40 厘米，麦克风不要被手或衣物挡住。";
    if (issue === "有效哭声不足") return "有效哭声太少：等宝宝正在哭时再录，至少保留 3 次呼气哭声。";
    if (issue === "哭声占比偏低") return "哭声占比偏低：减少前后空白和安静等待，录宝宝正在哭的 8-15 秒。";
    if (issue === "背景噪声偏强") return "背景噪声偏强：先关掉电视、音乐、白噪音或风扇，再靠近录。";
    if (issue === "疑似成人声音干扰") return "疑似成人声音干扰：录音时先不要说话，让宝宝哭声单独进入麦克风。";
    return `${issue}：建议重新录一段更清楚的哭声。`;
  });

  return guidance.length ? guidance : ["这段录音质量可以分析。"];
}

export function getDecisionSupport(features, analysis, options = {}) {
  const ranking = analysis?.ranking || [];
  const top = ranking[0] || null;
  const second = ranking[1] || null;
  const margin = top && second ? top.score - second.score : top?.score || 0;
  const qualityScore = analysis?.quality?.score ?? features?.quality?.score ?? 0;
  const highAlertLevel = analysis?.highAlertLevel || "low";
  const penalty = {
    medium: 0.12,
    high: 0.25,
    ...(options.highAlertPenalty || {})
  };
  const highAlertPenalty = highAlertLevel === "high" ? penalty.high : highAlertLevel === "medium" ? penalty.medium : 0;
  const confidenceScore = clamp01(
    norm(margin, 0.03, 0.16) * 0.45 +
      norm(top?.score || 0, 0.27, 0.48) * 0.35 +
      norm(qualityScore, 0.45, 0.82) * 0.2 -
      highAlertPenalty
  );
  const level = getConfidenceLevel(confidenceScore, options.confidenceThresholds);
  const safetyActionLevel = options.safetyActionLevel || "high";

  return {
    confidence: {
      level,
      score: confidenceScore,
      margin,
      label: level === "high" ? "较高" : level === "medium" ? "中等" : "偏低"
    },
    actionMode: isSafetyAction(highAlertLevel, safetyActionLevel) ? "safety" : level === "low" && second ? "top2" : "top1",
    evidence: buildDecisionEvidence(features, analysis, top?.key)
  };
}

export function getHighAlertLevel(score, thresholds = {}) {
  const fixed = normalizeThresholds(thresholds, { medium: 0.43, high: 0.67 });
  return score >= fixed.high ? "high" : score >= fixed.medium ? "medium" : "low";
}

export function getConfidenceLevel(score, thresholds = {}) {
  const fixed = normalizeThresholds(thresholds, { medium: 0.45, high: 0.72 });
  return score >= fixed.high ? "high" : score >= fixed.medium ? "medium" : "low";
}

export function featureVector(features) {
  return [
    scale(features.pitchMedian || 0, 180, 900),
    scale(features.pitchP90 || 0, 250, 1000),
    clamp01(features.cryRatio),
    clamp01(features.highBandRatio),
    clamp01(features.burstiness),
    clamp01(features.irregularity),
    scale(features.validCrySec, 0, 12),
    scale(features.snrDb, 0, 24)
  ];
}

export function featureSnapshot(features) {
  return {
    featureSetVersion: 1,
    durationSec: round3(features.durationSec),
    validCrySec: round3(features.validCrySec),
    cryRatio: round3(features.cryRatio),
    peakRms: round3(features.peakRms),
    avgActiveRms: round3(features.avgActiveRms),
    noiseFloor: round3(features.noiseFloor),
    snrDb: round3(features.snrDb),
    episodeCount: round3(features.episodeCount),
    avgEpisodeSec: round3(features.avgEpisodeSec),
    longestEpisodeSec: round3(features.longestEpisodeSec),
    pitchMedian: round3(features.pitchMedian),
    pitchP90: round3(features.pitchP90),
    pitchSpread: round3(features.pitchSpread),
    zcrActive: round3(features.zcrActive),
    spectralCentroid: round3(features.spectralCentroid),
    highBandRatio: round3(features.highBandRatio),
    veryHighBandRatio: round3(features.veryHighBandRatio),
    burstiness: round3(features.burstiness),
    irregularity: round3(features.irregularity)
  };
}

export function rankScores(scores) {
  return Object.entries(scores)
    .map(([key, score]) => ({ key, score }))
    .sort((a, b) => b.score - a.score);
}

export function normalizeScores(scores) {
  const fixed = {};
  let sum = 0;
  for (const [key, value] of Object.entries(scores)) {
    fixed[key] = Math.max(0.02, value);
    sum += fixed[key];
  }
  for (const key of Object.keys(fixed)) fixed[key] /= sum || 1;
  return fixed;
}

export function clamp(value, min, maxValue) {
  return Math.min(maxValue, Math.max(min, Number.isFinite(value) ? value : min));
}

function assessQuality(features) {
  const issues = [];
  if (features.durationSec < 4) issues.push("录音少于 4 秒");
  if (features.peakRms < 0.014) issues.push("整体音量偏低");
  if (features.validCrySec < 2.2) issues.push("有效哭声不足");
  if (features.cryRatio < 0.14) issues.push("哭声占比偏低");
  if (features.snrDb < 5) issues.push("背景噪声偏强");
  if (features.pitchMedian > 0 && features.pitchMedian < 220 && features.highBandRatio < 0.2) {
    issues.push("疑似成人声音干扰");
  }

  const score = clamp01(
    norm(features.validCrySec, 1.5, 6) * 0.28 +
      norm(features.snrDb, 3, 15) * 0.24 +
      norm(features.cryRatio, 0.12, 0.45) * 0.2 +
      norm(features.peakRms, 0.012, 0.12) * 0.16 +
      norm(features.episodeCount, 1, 5) * 0.12
  );

  return {
    usable: issues.length === 0 || (issues.length === 1 && features.validCrySec >= 3 && features.snrDb >= 8),
    score,
    issues
  };
}

function findEpisodes(active, frameSec) {
  const episodes = [];
  let start = -1;
  for (let i = 0; i <= active.length; i += 1) {
    if (active[i] && start < 0) start = i;
    if ((!active[i] || i === active.length) && start >= 0) {
      const duration = (i - start) * frameSec;
      if (duration >= 0.14) {
        episodes.push({ start: start * frameSec, end: i * frameSec, duration });
      }
      start = -1;
    }
  }
  return episodes;
}

function estimatePitches(samples, sampleRate, active, rms, threshold) {
  const frameSize = Math.min(2048, nearestPowerOfTwo(Math.floor(sampleRate * 0.06)));
  const hopFrames = 4;
  const values = [];

  for (let frame = 0; frame < active.length && values.length < 80; frame += hopFrames) {
    if (!active[frame] || rms[frame] < threshold) continue;
    const start = frame * 512;
    if (start + frameSize >= samples.length) continue;
    const pitch = estimatePitch(samples, start, frameSize, sampleRate);
    if (pitch >= 180 && pitch <= 1100) values.push(pitch);
  }

  return values;
}

function estimatePitch(samples, start, length, sampleRate) {
  let mean = 0;
  for (let i = 0; i < length; i += 1) mean += samples[start + i];
  mean /= length;

  const minLag = Math.floor(sampleRate / 1100);
  const maxLag = Math.floor(sampleRate / 180);
  let bestLag = 0;
  let bestScore = 0;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0;
    let left = 0;
    let right = 0;
    const limit = length - lag;
    for (let i = 0; i < limit; i += 1) {
      const a = samples[start + i] - mean;
      const b = samples[start + i + lag] - mean;
      sum += a * b;
      left += a * a;
      right += b * b;
    }
    const score = sum / Math.sqrt(left * right + 1e-9);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  return bestScore > 0.34 ? sampleRate / bestLag : 0;
}

function estimateSpectralFeatures(samples, sampleRate, active, rms, threshold) {
  const fftSize = 2048;
  const activeFrames = active.map((flag, index) => (flag ? index : -1)).filter((index) => index >= 0);
  const step = Math.max(1, Math.floor(activeFrames.length / 36));
  const centroids = [];
  const highRatios = [];
  const veryHighRatios = [];

  for (let cursor = 0; cursor < activeFrames.length; cursor += step) {
    const frame = activeFrames[cursor];
    if (rms[frame] < threshold) continue;
    const start = frame * 512;
    if (start + fftSize >= samples.length) continue;
    const spectrum = getSpectrum(samples, start, fftSize);
    let total = 0;
    let weighted = 0;
    let midHigh = 0;
    let veryHigh = 0;
    for (let bin = 1; bin < fftSize / 2; bin += 1) {
      const freq = bin * sampleRate / fftSize;
      const energy = spectrum[bin];
      if (freq < 120 || freq > 7000) continue;
      total += energy;
      weighted += energy * freq;
      if (freq >= 1000 && freq <= 3500) midHigh += energy;
      if (freq > 3500 && freq <= 6500) veryHigh += energy;
    }
    if (total > 0) {
      centroids.push(weighted / total);
      highRatios.push(midHigh / total);
      veryHighRatios.push(veryHigh / total);
    }
  }

  return {
    spectralCentroid: median(centroids),
    highBandRatio: median(highRatios),
    veryHighBandRatio: median(veryHighRatios)
  };
}

function getSpectrum(samples, start, size) {
  const real = new Float32Array(size);
  const imag = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
    real[i] = samples[start + i] * window;
  }
  fft(real, imag);
  const spectrum = new Float32Array(size / 2);
  for (let i = 0; i < spectrum.length; i += 1) {
    spectrum[i] = real[i] * real[i] + imag[i] * imag[i];
  }
  return spectrum;
}

function fft(real, imag) {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wLenReal = Math.cos(angle);
    const wLenImag = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let wReal = 1;
      let wImag = 0;
      for (let j = 0; j < len / 2; j += 1) {
        const uReal = real[i + j];
        const uImag = imag[i + j];
        const vReal = real[i + j + len / 2] * wReal - imag[i + j + len / 2] * wImag;
        const vImag = real[i + j + len / 2] * wImag + imag[i + j + len / 2] * wReal;
        real[i + j] = uReal + vReal;
        imag[i + j] = uImag + vImag;
        real[i + j + len / 2] = uReal - vReal;
        imag[i + j + len / 2] = uImag - vImag;
        const nextReal = wReal * wLenReal - wImag * wLenImag;
        wImag = wReal * wLenImag + wImag * wLenReal;
        wReal = nextReal;
      }
    }
  }
}

function estimateBurstiness(rms, active, peakRms) {
  if (!rms.length || !peakRms) return 0;
  let rise = 0;
  let count = 0;
  for (let i = 1; i < rms.length; i += 1) {
    if (!active[i]) continue;
    rise += Math.max(0, rms[i] - rms[i - 1]) / peakRms;
    count += 1;
  }
  return clamp01((rise / Math.max(count, 1)) * 12);
}

function estimateIrregularity(episodes, pitchValues) {
  const durations = episodes.map((item) => item.duration);
  const gaps = [];
  for (let i = 1; i < episodes.length; i += 1) {
    gaps.push(Math.max(0, episodes[i].start - episodes[i - 1].end));
  }
  const durationCv = coefficientOfVariation(durations);
  const gapCv = coefficientOfVariation(gaps);
  const pitchCv = coefficientOfVariation(pitchValues);
  return clamp01(durationCv * 0.36 + gapCv * 0.34 + pitchCv * 1.8);
}

function scoreHighAlert(features) {
  if (!features.quality.usable && features.validCrySec < 1.5) return 0;
  return clamp01(
    norm(features.pitchP90 || features.pitchMedian, 520, 850) * 0.25 +
      norm(features.highBandRatio, 0.28, 0.58) * 0.18 +
      norm(features.veryHighBandRatio, 0.08, 0.24) * 0.12 +
      norm(features.burstiness, 0.22, 0.62) * 0.16 +
      norm(features.longestEpisodeSec, 2.2, 6.5) * 0.12 +
      norm(features.irregularity, 0.38, 0.9) * 0.11 +
      norm(features.peakRms, 0.08, 0.24) * 0.06
  );
}

function scoreNeeds(features, highAlertScore) {
  const rhythmic = clamp01(1 - Math.abs(features.cryRatio - 0.45) / 0.38);
  const moderatePitch = clamp01(1 - Math.abs((features.pitchMedian || 480) - 520) / 360);
  const repeated = norm(features.episodeCount, 3, 10);
  const longWhine = norm(features.longestEpisodeSec, 1.2, 4.8);
  const gasSharp = norm(features.pitchP90 || 0, 560, 820) * 0.45 + norm(features.irregularity, 0.35, 0.8) * 0.55;
  const tiredSoft = clamp01(1 - highAlertScore) * 0.4 + norm(features.validCrySec, 3, 10) * 0.3 + longWhine * 0.3;
  const discomfortFlat = clamp01(0.58 - Math.max(rhythmic, gasSharp, tiredSoft) * 0.28);

  const scores = {
    hunger:
      0.2 +
      rhythmic * 0.28 +
      moderatePitch * 0.22 +
      repeated * 0.16 +
      clamp01(1 - highAlertScore) * 0.14,
    gas:
      0.18 +
      gasSharp * 0.34 +
      norm(features.burstiness, 0.16, 0.56) * 0.2 +
      norm(features.highBandRatio, 0.26, 0.55) * 0.14 +
      repeated * 0.14,
    tired:
      0.18 +
      tiredSoft * 0.34 +
      norm(features.cryRatio, 0.42, 0.82) * 0.17 +
      clamp01(1 - features.burstiness) * 0.17 +
      clamp01(1 - highAlertScore) * 0.14,
    discomfort:
      0.18 +
      discomfortFlat * 0.3 +
      norm(features.irregularity, 0.25, 0.75) * 0.18 +
      norm(features.validCrySec, 2, 7) * 0.14 +
      norm(features.snrDb, 5, 18) * 0.1
  };

  return normalizeScores(scores);
}

function applyPersonalCalibration(scores, features, history) {
  const knownCategories = new Set(Object.keys(scores));
  const usableHistory = history.filter(
    (item) =>
      Array.isArray(item.vector) &&
      (knownCategories.has(item.category) ||
        (item.result === "unresolved" && knownCategories.has(item.attemptedCategory)))
  );
  if (!usableHistory.length) return { scores, evidence: null };

  const vector = featureVector(features);
  const adjusted = { ...scores };
  const evidence = {};
  const now = Date.now();

  applyAggregateBabyPrior(adjusted, evidence, usableHistory, knownCategories, now);

  for (const item of usableHistory) {
    const ageDays = (now - item.ts) / 86400000;
    const recency = Math.exp(-ageDays / 14);
    const similarity = vectorSimilarity(vector, item.vector);
    if (similarity < 0.35) continue;
    const weight = similarity * recency;

    if (item.result === "resolved" && knownCategories.has(item.category)) {
      const confidence = item.partial ? 0.55 : item.recurred ? 0.72 : 1;
      adjusted[item.category] = (adjusted[item.category] || 0) + weight * confidence * 0.28;
      evidence[item.category] = (evidence[item.category] || 0) + weight * confidence;
      continue;
    }

    if (item.result === "unresolved" && knownCategories.has(item.attemptedCategory)) {
      adjusted[item.attemptedCategory] = Math.max(0.02, (adjusted[item.attemptedCategory] || 0) - weight * 0.07);
      evidence[item.attemptedCategory] = (evidence[item.attemptedCategory] || 0) - weight * 0.35;
    }
  }

  return {
    scores: normalizeScores(adjusted),
    evidence: Object.keys(evidence).length ? evidence : null
  };
}

function applyAggregateBabyPrior(adjusted, evidence, history, knownCategories, now) {
  const positive = {};
  const negative = {};

  for (const item of history) {
    const ageDays = (now - item.ts) / 86400000;
    const recency = Math.exp(-ageDays / 30);
    if (item.result === "resolved" && knownCategories.has(item.category)) {
      const confidence = item.partial ? 0.45 : item.recurred ? 0.6 : 0.8;
      positive[item.category] = (positive[item.category] || 0) + recency * confidence;
    } else if (item.result === "unresolved" && knownCategories.has(item.attemptedCategory)) {
      negative[item.attemptedCategory] = (negative[item.attemptedCategory] || 0) + recency * 0.55;
    }
  }

  for (const category of knownCategories) {
    const net = (positive[category] || 0) - (negative[category] || 0);
    const magnitude = Math.min(0.08, Math.log1p(Math.abs(net)) * 0.018);
    if (magnitude < 0.01) continue;
    if (net > 0) {
      adjusted[category] = (adjusted[category] || 0) + magnitude;
      evidence[category] = (evidence[category] || 0) + magnitude * 0.75;
    } else {
      adjusted[category] = Math.max(0.02, (adjusted[category] || 0) - magnitude);
      evidence[category] = (evidence[category] || 0) - magnitude * 0.75;
    }
  }
}

function buildDecisionEvidence(features, analysis, topKey) {
  const evidence = [];
  if (analysis?.highAlertLevel === "high") {
    evidence.push("尖锐度、持续性或爆发度偏高，先按高警觉流程排查。");
  } else if (analysis?.highAlertLevel === "medium") {
    evidence.push("高警觉风险不是低位，建议先回答安全追问。");
  }

  if ((features?.quality?.score || 0) < 0.58) {
    evidence.push("录音质量一般，结论需要更保守。");
  }

  if (topKey === "hunger") {
    if (features.episodeCount >= 4 && features.cryRatio >= 0.25 && features.cryRatio <= 0.68) {
      evidence.push("哭声分段较清楚，节律相对重复。");
    }
    if ((features.pitchMedian || 0) >= 360 && (features.pitchMedian || 0) <= 680) {
      evidence.push("中位音高处在普通需求哭声常见区间。");
    }
  } else if (topKey === "gas") {
    if ((features.pitchP90 || 0) >= 620 || features.highBandRatio >= 0.22) {
      evidence.push("高位音高或尖锐度偏高。");
    }
    if (features.irregularity >= 0.42) {
      evidence.push("哭声不稳定度偏高，拍嗝/排气需要靠前排查。");
    }
  } else if (topKey === "tired") {
    if (features.burstiness <= 0.48 || features.cryRatio >= 0.55) {
      evidence.push("哭声更连续或爆发度较低，可能和困烦/过度刺激有关。");
    }
    if (features.highBandRatio >= 0.18) {
      evidence.push("高频占比不低，需结合醒着多久判断。");
    }
  } else if (topKey === "discomfort") {
    if (features.irregularity >= 0.45 || features.longestEpisodeSec >= 1.5) {
      evidence.push("哭声不稳定或单段持续较长，先排查身体和环境不适。");
    }
    if (features.validCrySec >= 5) {
      evidence.push("有效哭声持续时间较长，一般不适需要快速检查。");
    }
  }

  if (analysis?.personalEvidence) {
    evidence.push("已叠加当前宝宝历史反馈的个体化校准。");
  }

  if (!evidence.length && topKey) {
    evidence.push(`声学特征组合得分最高的是 ${needLabel(topKey)}。`);
  }
  return evidence.slice(0, 3);
}

function needLabel(key) {
  const labels = {
    hunger: "想吃奶",
    gas: "拍嗝/胀气",
    tired: "困烦/过度刺激",
    discomfort: "一般不适"
  };
  return labels[key] || key || "未知";
}

function chooseContextQuestions(ranking, highAlertLevel, uncertainty, babyProfile = {}) {
  const questions = [];
  const add = (question) => {
    if (!question || questions.some((item) => item.id === question.id)) return;
    questions.push(question);
  };

  if (highAlertLevel === "high" || highAlertLevel === "medium") {
    add({
      id: "safety",
      text: "是否伴随发热、摔碰、刚接种或精神状态异常？",
      options: [
        { label: "有", delta: { discomfort: 0.08 }, highAlertDelta: 0.25 },
        { label: "没有", delta: {}, highAlertDelta: -0.08 },
        { label: "不确定", delta: { discomfort: 0.04 }, highAlertDelta: 0.05 }
      ]
    });
  }

  if (!normalizeAgeBucket(babyProfile.ageBucket)) {
    add(ageQuestion());
  }

  const tired = ranking.find((item) => item.key === "tired");
  const hunger = ranking.find((item) => item.key === "hunger");
  const top = ranking[0];
  const tiredCouldMatter =
    tired &&
    top?.key !== "tired" &&
    tired.score >= 0.18 &&
    (uncertainty >= 0.74 || top?.key === "hunger" || Math.abs((hunger?.score || 0) - tired.score) <= 0.12);

  if (tiredCouldMatter) {
    add(awakeQuestion(babyProfile));
  }

  if (!ranking[1]) {
    add(topQuestion(top?.key, babyProfile));
    return questions.slice(0, 3);
  }

  const pair = [ranking[0].key, ranking[1].key].sort().join("-");
  if (pair === "hunger-tired") {
    add(feedingQuestion(babyProfile));
    add(awakeQuestion(babyProfile));
  } else if (pair === "gas-hunger") {
    add(feedingQuestion(babyProfile));
    add(gasQuestion());
  } else if (pair === "discomfort-gas") {
    add(gasQuestion());
    add(bodyQuestion());
  } else if (pair === "discomfort-hunger") {
    add(feedingQuestion(babyProfile));
    add(bodyQuestion());
  } else if (pair === "discomfort-tired") {
    add(awakeQuestion(babyProfile));
    add(bodyQuestion());
  } else if (pair === "gas-tired") {
    add(gasQuestion());
    add(awakeQuestion(babyProfile));
  }

  if (uncertainty >= 0.83) {
    add(topQuestion(top?.key, babyProfile));
  }

  if (!questions.length) {
    add(topQuestion(top?.key, babyProfile));
  }

  return questions.filter(Boolean).slice(0, 3);
}

function ageQuestion() {
  return {
    id: "age_bucket",
    text: "宝宝现在多大？",
    options: [
      {
        label: "0-2 周",
        delta: { hunger: 0.04, discomfort: 0.02 },
        highAlertDelta: 0.04,
        profilePatch: { ageBucket: "0-2w" }
      },
      {
        label: "3-8 周",
        delta: { gas: 0.03, tired: 0.02 },
        highAlertDelta: 0.01,
        profilePatch: { ageBucket: "3-8w" }
      },
      {
        label: "9-16 周",
        delta: { tired: 0.04, hunger: -0.02 },
        highAlertDelta: 0,
        profilePatch: { ageBucket: "9-16w" }
      },
      {
        label: "早产/不确定",
        delta: { discomfort: 0.04 },
        highAlertDelta: 0.06,
        profilePatch: { ageBucket: "preterm_or_uncertain" }
      }
    ]
  };
}

function feedingQuestion(babyProfile = {}) {
  const ageOptions = feedingOptionsForAge(normalizeAgeBucket(babyProfile.ageBucket));
  if (ageOptions) {
    return {
      id: "feeding_timing",
      text: "上次喂奶大概多久前？",
      options: ageOptions
    };
  }

  return {
    id: "feeding_timing",
    text: "上次喂奶大概多久前？",
    options: [
      { label: "45 分钟内", delta: { hunger: -0.14, gas: 0.1, discomfort: 0.04 } },
      { label: "45-120 分钟", delta: { hunger: 0.1 } },
      { label: "超过 2 小时/不确定", delta: { hunger: 0.12, gas: -0.03 } }
    ]
  };
}

function awakeQuestion(babyProfile = {}) {
  const ageOptions = awakeOptionsForAge(normalizeAgeBucket(babyProfile.ageBucket));
  if (ageOptions) {
    return {
      id: "awake_long",
      text: "这次哭前醒着多久？",
      options: ageOptions
    };
  }

  return {
    id: "awake_long",
    text: "这次哭前醒着多久？",
    options: [
      { label: "超过 1 小时", delta: { tired: 0.22, hunger: -0.08, gas: -0.04 } },
      { label: "30-60 分钟", delta: { tired: 0.06 } },
      { label: "刚醒不久", delta: { hunger: 0.12, tired: -0.1 } }
    ]
  };
}

function feedingOptionsForAge(ageBucket) {
  const byAge = {
    "0-2w": [
      { label: "45 分钟内", delta: { hunger: -0.12, gas: 0.1, discomfort: 0.04 } },
      { label: "45-120 分钟", delta: { hunger: 0.08 } },
      { label: "超过 2 小时/不确定", delta: { hunger: 0.14, gas: -0.03 } }
    ],
    "3-8w": [
      { label: "60 分钟内", delta: { hunger: -0.12, gas: 0.1, discomfort: 0.03 } },
      { label: "1-3 小时", delta: { hunger: 0.08 } },
      { label: "超过 3 小时/不确定", delta: { hunger: 0.13, gas: -0.03 } }
    ],
    "9-16w": [
      { label: "90 分钟内", delta: { hunger: -0.1, gas: 0.08, discomfort: 0.02 } },
      { label: "1.5-3 小时", delta: { hunger: 0.06 } },
      { label: "超过 3 小时/不确定", delta: { hunger: 0.12, gas: -0.03 } }
    ],
    preterm_or_uncertain: [
      { label: "45 分钟内", delta: { hunger: -0.1, gas: 0.09, discomfort: 0.05 } },
      { label: "45-120 分钟", delta: { hunger: 0.06 } },
      { label: "超过 2 小时/不确定", delta: { hunger: 0.12, discomfort: 0.02 } }
    ]
  };
  return byAge[ageBucket] || null;
}

function awakeOptionsForAge(ageBucket) {
  const byAge = {
    "0-2w": [
      { label: "超过 45 分钟", delta: { tired: 0.2, hunger: -0.06, gas: -0.03 } },
      { label: "20-45 分钟", delta: { tired: 0.04 } },
      { label: "刚醒不久", delta: { hunger: 0.1, tired: -0.08 } }
    ],
    "3-8w": [
      { label: "超过 1 小时", delta: { tired: 0.22, hunger: -0.08, gas: -0.04 } },
      { label: "30-60 分钟", delta: { tired: 0.06 } },
      { label: "刚醒不久", delta: { hunger: 0.12, tired: -0.1 } }
    ],
    "9-16w": [
      { label: "超过 90 分钟", delta: { tired: 0.22, hunger: -0.08, gas: -0.04 } },
      { label: "45-90 分钟", delta: { tired: 0.06 } },
      { label: "刚醒不久", delta: { hunger: 0.1, tired: -0.1 } }
    ],
    preterm_or_uncertain: [
      { label: "超过 45 分钟", delta: { tired: 0.18, discomfort: 0.04, hunger: -0.05 } },
      { label: "20-45 分钟", delta: { tired: 0.04 } },
      { label: "刚醒不久", delta: { hunger: 0.08, tired: -0.07 } }
    ]
  };
  return byAge[ageBucket] || null;
}

function gasQuestion() {
  return {
    id: "gas_signs",
    text: "有没有拱背、蹬腿、吐奶或肚子紧？",
    options: [
      { label: "有", delta: { gas: 0.18, discomfort: -0.04 } },
      { label: "没有", delta: { discomfort: 0.08, gas: -0.08 } },
      { label: "不确定", delta: { gas: 0.03 } }
    ]
  };
}

function bodyQuestion() {
  return {
    id: "body_check",
    text: "尿布、冷热、衣物勒痕有明显不舒服吗？",
    options: [
      { label: "有", delta: { discomfort: 0.2, hunger: -0.06, tired: -0.04 } },
      { label: "没有", delta: { discomfort: -0.08 } },
      { label: "不确定", delta: { discomfort: 0.04 } }
    ]
  };
}

function topQuestion(key, babyProfile = {}) {
  if (key === "hunger") return feedingQuestion(babyProfile);
  if (key === "gas") return gasQuestion();
  if (key === "tired") return awakeQuestion(babyProfile);
  if (key === "discomfort") return bodyQuestion();
  return null;
}

function applyAgeCalibration(scores, highAlertScore, babyProfile = {}, options = {}) {
  const ageBucket = normalizeAgeBucket(babyProfile.ageBucket);
  if (!ageBucket) return { scores, highAlertScore };
  const strength = clamp(Number(options.ageCalibrationStrength ?? DEFAULT_AGE_CALIBRATION_STRENGTH), 0, 3);
  if (strength === 0) return { scores, highAlertScore };

  const priors = {
    "0-2w": { delta: { hunger: 0.035, discomfort: 0.02 }, highAlertDelta: 0.035 },
    "3-8w": { delta: { gas: 0.025, tired: 0.015 }, highAlertDelta: 0.01 },
    "9-16w": { delta: { tired: 0.035, hunger: -0.015 }, highAlertDelta: 0 },
    preterm_or_uncertain: { delta: { discomfort: 0.04 }, highAlertDelta: 0.06 }
  };
  const prior = priors[ageBucket];
  const adjusted = { ...scores };
  for (const [key, delta] of Object.entries(prior.delta)) {
    adjusted[key] = clamp((adjusted[key] || 0) + delta * strength, 0.02, 1);
  }

  return {
    scores: normalizeScores(adjusted),
    highAlertScore: clamp01(highAlertScore + prior.highAlertDelta * strength)
  };
}

function normalizeBabyProfile(profile = {}) {
  const ageBucket = normalizeAgeBucket(profile.ageBucket);
  if (!ageBucket) return {};
  return { ageBucket };
}

function normalizeAgeBucket(value) {
  return ["0-2w", "3-8w", "9-16w", "preterm_or_uncertain"].includes(value) ? value : "";
}

function vectorSimilarity(a, b) {
  if (!Array.isArray(b) || a.length !== b.length) return 0;
  let distance = 0;
  for (let i = 0; i < a.length; i += 1) {
    distance += (a[i] - b[i]) ** 2;
  }
  return Math.exp(-Math.sqrt(distance) * 2.4);
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  return percentile(values, 0.5);
}

function percentile(values, q) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * q;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (upper - index) + sorted[upper] * (index - lower);
}

function max(values) {
  return values.length ? Math.max(...values) : 0;
}

function coefficientOfVariation(values) {
  if (!values.length) return 0;
  const mean = average(values);
  if (!mean) return 0;
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance) / mean;
}

function norm(value, min, maxValue) {
  return clamp01((value - min) / (maxValue - min));
}

function scale(value, min, maxValue) {
  return clamp01((value - min) / (maxValue - min));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function normalizeThresholds(thresholds, defaults) {
  const medium = Number.isFinite(Number(thresholds.medium)) ? Number(thresholds.medium) : defaults.medium;
  const high = Number.isFinite(Number(thresholds.high)) ? Number(thresholds.high) : defaults.high;
  return {
    medium: clamp(medium, 0, 1),
    high: clamp(Math.max(high, medium), 0, 1)
  };
}

function isSafetyAction(level, safetyActionLevel) {
  if (safetyActionLevel === "medium") return level === "medium" || level === "high";
  return level === "high";
}

function round3(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

function nearestPowerOfTwo(value) {
  let result = 1;
  while (result * 2 <= value) result *= 2;
  return result;
}
