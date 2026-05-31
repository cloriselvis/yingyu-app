export const feedbackActions = {
  hunger: "喂奶",
  gas: "拍嗝/排气",
  tired: "抱哄/睡眠",
  discomfort: "尿布/冷热/衣物检查",
  unresolved: "没有缓解"
};

export const reliefOptions = {
  fast: { label: "5 分钟内明显缓解", reliefTimeSec: 300, resolved: true },
  slow: { label: "10 分钟内才缓解", reliefTimeSec: 600, resolved: true },
  partial: { label: "只是部分缓解", reliefTimeSec: null, resolved: true, partial: true },
  recurred: { label: "缓解后又哭", reliefTimeSec: null, resolved: true, recurred: true },
  unresolved: { label: "没有缓解", reliefTimeSec: null, resolved: false }
};

export function createSessionId(now = Date.now(), random = Math.random()) {
  return `yy_${now.toString(36)}_${Math.floor(random * 1e9).toString(36)}`;
}

export function buildSessionRecord({
  id = createSessionId(),
  ts = Date.now(),
  babyId,
  babyProfile = null,
  sourceName,
  features,
  analysis,
  questionAnswer = null,
  attempts = [],
  feedback,
  vector,
  audio = null
}) {
  return {
    id,
    ts,
    babyId,
    babyProfile: normalizeBabyProfile(babyProfile),
    sourceName,
    quality: {
      usable: Boolean(features?.quality?.usable),
      score: round(features?.quality?.score),
      issues: features?.quality?.issues || []
    },
    features: compactFeatures(features),
    analysis: {
      highAlertScore: round(analysis?.highAlertScore),
      highAlertLevel: analysis?.highAlertLevel || "low",
      ranking: (analysis?.ranking || []).map((item) => ({
        key: item.key,
        score: round(item.score)
      })),
      scores: roundObject(analysis?.scores || {}),
      uncertainty: round(analysis?.uncertainty)
    },
    questionAnswer,
    attempts: normalizeAttempts(attempts),
    feedback: normalizeFeedback(feedback),
    audio: normalizeAudioMeta(audio),
    vector: Array.isArray(vector) ? vector.map(round) : []
  };
}

export function buildCalibrationItem(session) {
  const action = session.feedback?.actionCategory || "unresolved";
  const resolved = Boolean(session.feedback?.resolved);
  return {
    ts: session.ts,
    sessionId: session.id,
    category: resolved ? action : "unresolved",
    attemptedCategory: action,
    result: resolved ? "resolved" : "unresolved",
    reliefTimeSec: session.feedback?.reliefTimeSec ?? null,
    recurred: Boolean(session.feedback?.recurred),
    partial: Boolean(session.feedback?.partial),
    vector: session.vector,
    scores: session.analysis?.scores || {},
    highAlertScore: session.analysis?.highAlertScore || 0
  };
}

export function buildCalibrationItems(session) {
  const finalItem = buildCalibrationItem(session);
  const items = [];
  const seen = new Set();
  const finalResolvedAction = finalItem.result === "resolved" ? finalItem.attemptedCategory : "";

  for (const attempt of session.attempts || []) {
    if (attempt.result !== "unresolved") continue;
    if (!feedbackActions[attempt.actionCategory] || attempt.actionCategory === "unresolved") continue;
    if (attempt.actionCategory === finalResolvedAction) continue;
    const key = `${attempt.actionCategory}:unresolved`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      ts: attempt.ts || session.ts,
      sessionId: session.id,
      category: "unresolved",
      attemptedCategory: attempt.actionCategory,
      result: "unresolved",
      reliefTimeSec: null,
      recurred: false,
      partial: false,
      vector: session.vector,
      scores: session.analysis?.scores || {},
      highAlertScore: session.analysis?.highAlertScore || 0
    });
  }

  const finalKey = `${finalItem.attemptedCategory}:${finalItem.result}`;
  if (!seen.has(finalKey)) items.push(finalItem);
  return items;
}

export function appendBounded(list, item, maxLength = 200) {
  const next = [...(Array.isArray(list) ? list : []), item];
  return next.slice(Math.max(0, next.length - maxLength));
}

export function appendManyBounded(list, items, maxLength = 200) {
  const next = [...(Array.isArray(list) ? list : []), ...(Array.isArray(items) ? items : [])];
  return next.slice(Math.max(0, next.length - maxLength));
}

export function exportPayload({
  babyId,
  babyProfile = null,
  sessions = [],
  history = [],
  audioAttachments = [],
  exportedAt = new Date().toISOString()
}) {
  return {
    schema: "yingyu.feedback.v1",
    exportedAt,
    babyId,
    babyProfile: normalizeBabyProfile(babyProfile),
    counts: {
      sessions: sessions.length,
      calibrationItems: history.length,
      audioAttachments: audioAttachments.length
    },
    sessions,
    calibrationHistory: history,
    audioAttachments
  };
}

export function normalizeImportedPayload(payload, options = {}) {
  if (!payload || typeof payload !== "object") {
    throw new Error("导入文件不是有效的婴语数据。");
  }
  if (payload.schema && payload.schema !== "yingyu.feedback.v1") {
    throw new Error("导入文件版本不支持。");
  }

  const maxSessions = options.maxSessions ?? 300;
  const maxHistory = options.maxHistory ?? 120;
  const sessions = (Array.isArray(payload.sessions) ? payload.sessions : [])
    .map(normalizeImportedSession)
    .filter(Boolean)
    .slice(-maxSessions);
  const importedHistory = Array.isArray(payload.calibrationHistory)
    ? payload.calibrationHistory.map(normalizeImportedCalibrationItem).filter(Boolean)
    : [];
  const historySource = importedHistory.length ? importedHistory : sessions.flatMap(buildCalibrationItems);
  const history = historySource.slice(-maxHistory);

  return {
    babyId: cleanBabyId(payload.babyId),
    babyProfile: normalizeBabyProfile(payload.babyProfile),
    sessions,
    history,
    counts: {
      sessions: sessions.length,
      calibrationItems: history.length
    }
  };
}

export function mergeImportedData({
  currentSessions = [],
  currentHistory = [],
  importedSessions = [],
  importedHistory = [],
  maxSessions = 300,
  maxHistory = 120
}) {
  return {
    sessions: mergeByKey(currentSessions, importedSessions, (item) => item.id, maxSessions),
    history: mergeByKey(
      currentHistory,
      importedHistory,
      (item) => item.sessionId || `${item.ts}:${item.category}:${item.attemptedCategory}:${item.result}`,
      maxHistory
    )
  };
}

export function summarizeRecentSessions(sessions = [], limit = 5) {
  return (Array.isArray(sessions) ? sessions : [])
    .filter((session) => session && typeof session === "object" && session.id)
    .sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0))
    .slice(0, limit)
    .map((session) => {
      const ranking = Array.isArray(session.analysis?.ranking) ? session.analysis.ranking : [];
      const top1 = ranking[0]?.key || "";
      const top2 = ranking[1]?.key || "";
      const feedback = normalizeFeedback(session.feedback);
      return {
        id: String(session.id),
        ts: Number(session.ts) || 0,
        top1,
        top2,
        top1Score: round(ranking[0]?.score),
        top2Score: round(ranking[1]?.score),
        highAlertLevel: session.analysis?.highAlertLevel || "low",
        actionCategory: feedback.actionCategory,
        actionLabel: feedback.actionLabel,
        reliefLabel: feedback.reliefLabel,
        resolved: Boolean(feedback.resolved),
        partial: Boolean(feedback.partial),
        recurred: Boolean(feedback.recurred),
        attemptCount: Array.isArray(session.attempts) ? session.attempts.length : 0,
        hasAudio: Boolean(session.audio)
      };
    });
}

function normalizeAttempts(attempts = []) {
  return (Array.isArray(attempts) ? attempts : [])
    .map((attempt) => {
      if (!attempt || typeof attempt !== "object") return null;
      const actionCategory = feedbackActions[attempt.actionCategory] ? attempt.actionCategory : "";
      if (!actionCategory || actionCategory === "unresolved") return null;
      return {
        actionCategory,
        actionLabel: feedbackActions[actionCategory],
        result: attempt.result === "resolved" ? "resolved" : "unresolved",
        ts: Number(attempt.ts) || Date.now()
      };
    })
    .filter(Boolean)
    .slice(-8);
}

function normalizeFeedback(feedback = {}) {
  const actionCategory = feedback.actionCategory || "unresolved";
  const relief = reliefOptions[feedback.reliefKey] || reliefOptions.unresolved;
  return {
    actionCategory,
    actionLabel: feedbackActions[actionCategory] || actionCategory,
    reliefKey: feedback.reliefKey || "unresolved",
    reliefLabel: relief.label,
    reliefTimeSec: feedback.reliefTimeSec ?? relief.reliefTimeSec ?? null,
    resolved: feedback.resolved ?? relief.resolved,
    partial: Boolean(feedback.partial ?? relief.partial),
    recurred: Boolean(feedback.recurred ?? relief.recurred)
  };
}

function normalizeBabyProfile(profile = {}) {
  const labels = {
    "0-2w": "0-2 周",
    "3-8w": "3-8 周",
    "9-16w": "9-16 周",
    preterm_or_uncertain: "早产/不确定"
  };
  const ageBucket = labels[profile?.ageBucket] ? profile.ageBucket : "";
  if (!ageBucket) return {};
  return {
    ageBucket,
    ageLabel: labels[ageBucket],
    updatedAt: Number(profile.updatedAt) || 0
  };
}

function compactFeatures(features = {}) {
  return {
    durationSec: round(features.durationSec),
    validCrySec: round(features.validCrySec),
    cryRatio: round(features.cryRatio),
    snrDb: round(features.snrDb),
    pitchMedian: round(features.pitchMedian),
    pitchP90: round(features.pitchP90),
    highBandRatio: round(features.highBandRatio),
    burstiness: round(features.burstiness),
    episodeCount: features.episodeCount || 0,
    irregularity: round(features.irregularity)
  };
}

function roundObject(object) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, round(value)]));
}

function normalizeImportedSession(session) {
  if (!session || typeof session !== "object" || !session.id) return null;
  const analysis = session.analysis || {};
  return {
    id: String(session.id),
    ts: Number(session.ts) || Date.now(),
    babyId: cleanBabyId(session.babyId),
    babyProfile: normalizeBabyProfile(session.babyProfile),
    sourceName: typeof session.sourceName === "string" ? session.sourceName.slice(0, 160) : "",
    quality: {
      usable: Boolean(session.quality?.usable),
      score: round(session.quality?.score),
      issues: Array.isArray(session.quality?.issues) ? session.quality.issues.map(String).slice(0, 8) : []
    },
    features: compactFeatures(session.features || {}),
    analysis: {
      highAlertScore: round(analysis.highAlertScore),
      highAlertLevel: ["low", "medium", "high"].includes(analysis.highAlertLevel) ? analysis.highAlertLevel : "low",
      ranking: Array.isArray(analysis.ranking)
        ? analysis.ranking
            .filter((item) => item?.key)
            .slice(0, 4)
            .map((item) => ({ key: String(item.key), score: round(item.score) }))
        : [],
      scores: roundObject(analysis.scores || {}),
      uncertainty: round(analysis.uncertainty)
    },
    questionAnswer: normalizeQuestionAnswer(session.questionAnswer),
    attempts: normalizeAttempts(session.attempts),
    feedback: normalizeFeedback(session.feedback),
    audio: normalizeAudioMeta(session.audio),
    vector: normalizeVector(session.vector)
  };
}

function normalizeImportedCalibrationItem(item) {
  if (!item || typeof item !== "object") return null;
  const vector = normalizeVector(item.vector);
  if (!vector.length) return null;
  const result = item.result === "resolved" ? "resolved" : "unresolved";
  const action = item.category || "unresolved";
  return {
    ts: Number(item.ts) || Date.now(),
    sessionId: item.sessionId ? String(item.sessionId) : "",
    category: result === "resolved" ? String(action) : "unresolved",
    attemptedCategory: item.attemptedCategory ? String(item.attemptedCategory) : String(action),
    result,
    reliefTimeSec: item.reliefTimeSec == null ? null : Number(item.reliefTimeSec),
    recurred: Boolean(item.recurred),
    partial: Boolean(item.partial),
    vector,
    scores: roundObject(item.scores || {}),
    highAlertScore: round(item.highAlertScore)
  };
}

function normalizeQuestionAnswer(questionAnswer) {
  if (!questionAnswer || typeof questionAnswer !== "object") return null;
  return {
    questionId: questionAnswer.questionId ? String(questionAnswer.questionId) : "",
    questionText: questionAnswer.questionText ? String(questionAnswer.questionText).slice(0, 240) : "",
    optionLabel: questionAnswer.optionLabel ? String(questionAnswer.optionLabel).slice(0, 80) : "",
    answeredAt: Number(questionAnswer.answeredAt) || 0
  };
}

function normalizeAudioMeta(audio) {
  if (!audio || typeof audio !== "object" || !audio.sessionId) return null;
  return {
    schema: audio.schema ? String(audio.schema) : "yingyu.audio-attachment.v1",
    sessionId: String(audio.sessionId),
    mimeType: audio.mimeType ? String(audio.mimeType).slice(0, 80) : "application/octet-stream",
    size: Number(audio.size) || 0,
    createdAt: Number(audio.createdAt) || Date.now(),
    sourceName: typeof audio.sourceName === "string" ? audio.sourceName.slice(0, 160) : "",
    filename: audio.filename ? String(audio.filename).slice(0, 180) : ""
  };
}

function normalizeVector(vector) {
  return Array.isArray(vector) ? vector.map(round).filter(Number.isFinite).slice(0, 16) : [];
}

function mergeByKey(current, imported, keyFn, maxLength) {
  const map = new Map();
  let fallback = 0;
  for (const item of [...(Array.isArray(current) ? current : []), ...(Array.isArray(imported) ? imported : [])]) {
    if (!item || typeof item !== "object") continue;
    const key = keyFn(item) || `fallback:${fallback}`;
    fallback += 1;
    map.set(key, item);
  }
  return [...map.values()].sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0)).slice(-maxLength);
}

function cleanBabyId(value) {
  return (typeof value === "string" ? value.trim() : "").slice(0, 18) || "宝宝";
}

function round(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}
