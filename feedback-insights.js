const labelNames = {
  hunger: "想吃奶",
  gas: "拍嗝/胀气",
  tired: "困烦/过度刺激",
  discomfort: "一般不适",
  unresolved: "没有缓解",
  unknown: "未知"
};

const reliefTimeByKey = {
  fast: 300,
  slow: 600
};

export function parseFeedbackExport(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid feedback JSON: ${error.message}`);
  }

  const sessions = Array.isArray(payload?.sessions) ? payload.sessions : [];
  const history = Array.isArray(payload?.calibrationHistory) ? payload.calibrationHistory : [];
  const audioAttachments = Array.isArray(payload?.audioAttachments) ? payload.audioAttachments : [];
  return {
    schema: payload?.schema || "unknown",
    exportedAt: payload?.exportedAt || "",
    babyId: payload?.babyId || "",
    sessions,
    history,
    audioAttachments
  };
}

export function analyzeFeedbackExport(payload, options = {}) {
  const limit = options.limit ?? 20;
  const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
  const audioAttachments = Array.isArray(payload.audioAttachments) ? payload.audioAttachments : [];
  const audioSessionIds = new Set(audioAttachments.map((item) => item?.sessionId).filter(Boolean));
  const insights = {
    schema: payload.schema || "unknown",
    exportedAt: payload.exportedAt || "",
    babyId: payload.babyId || "",
    total: sessions.length,
    audioAttachmentCount: audioAttachments.length,
    usable: 0,
    withResolvedFeedback: 0,
    unresolved: 0,
    failedAttempts: 0,
    partial: 0,
    recurred: 0,
    top1Match: 0,
    top2Match: 0,
    top1MatchRate: 0,
    top2MatchRate: 0,
    byAction: {},
    byTop1: {},
    questionAnswers: {},
    highAlert: [],
    misses: [],
    attemptedNoRelief: {},
    pilot: createEmptyPilotMetrics(),
    calibrationNotes: []
  };

  for (const session of sessions) {
    if (session.quality?.usable) insights.usable += 1;
    const feedback = session.feedback || {};
    const top1 = session.analysis?.ranking?.[0]?.key || "";
    const top2 = session.analysis?.ranking?.[1]?.key || "";
    const action = feedback.actionCategory || "unresolved";
    const resolved = Boolean(feedback.resolved) && action !== "unresolved";
    const attempts = Array.isArray(session.attempts) ? session.attempts : [];

    if (top1) bump(insights.byTop1, top1);
    if (feedback.partial) insights.partial += 1;
    if (feedback.recurred) insights.recurred += 1;
    for (const attempt of attempts) {
      if (attempt?.result !== "unresolved" || !attempt.actionCategory) continue;
      insights.failedAttempts += 1;
      bump(insights.attemptedNoRelief, attempt.actionCategory);
    }

    if (!resolved) {
      insights.unresolved += 1;
      const attempted = action === "unresolved" ? "unresolved" : action;
      bump(insights.attemptedNoRelief, attempted);
    } else {
      insights.withResolvedFeedback += 1;
      if (top1 === action) insights.top1Match += 1;
      if (top1 === action || top2 === action) insights.top2Match += 1;

      const stats = (insights.byAction[action] ||= {
        count: 0,
        top1Match: 0,
        top2Match: 0,
        top1MatchRate: 0,
        top2MatchRate: 0,
        relief: {},
        predictedTop1: {}
      });
      stats.count += 1;
      if (top1 === action) stats.top1Match += 1;
      if (top1 === action || top2 === action) stats.top2Match += 1;
      bump(stats.relief, feedback.reliefKey || "unknown");
      bump(stats.predictedTop1, top1 || "unknown");

      if (top1 !== action) {
        insights.misses.push({
          id: session.id,
          babyId: session.babyId || payload.babyId || "",
          sourceName: session.pilotSource || "",
          ts: session.ts,
          expected: action,
          top1,
          top2,
          top1Score: session.analysis?.ranking?.[0]?.score ?? 0,
          top2Score: session.analysis?.ranking?.[1]?.score ?? 0,
          highAlertLevel: session.analysis?.highAlertLevel || "low",
          qualityScore: session.quality?.score ?? 0,
          question: session.questionAnswer?.questionId || "",
          answer: session.questionAnswer?.optionLabel || "",
          hasAudio: audioSessionIds.has(session.id)
        });
      }
    }

    if (session.questionAnswer?.questionId) {
      const key = `${session.questionAnswer.questionId}:${session.questionAnswer.optionLabel || "未知"}`;
      const stats = (insights.questionAnswers[key] ||= {
        count: 0,
        resolved: 0,
        unresolved: 0,
        actions: {}
      });
      stats.count += 1;
      if (resolved) stats.resolved += 1;
      else stats.unresolved += 1;
      bump(stats.actions, action);
    }

    if (["medium", "high"].includes(session.analysis?.highAlertLevel)) {
      insights.highAlert.push({
        id: session.id,
        babyId: session.babyId || payload.babyId || "",
        sourceName: session.pilotSource || "",
        ts: session.ts,
        level: session.analysis.highAlertLevel,
        score: session.analysis.highAlertScore || 0,
        top1,
        action,
        resolved,
        question: session.questionAnswer?.questionId || "",
        answer: session.questionAnswer?.optionLabel || "",
        hasAudio: audioSessionIds.has(session.id)
      });
    }
  }

  insights.top1MatchRate = ratio(insights.top1Match, insights.withResolvedFeedback);
  insights.top2MatchRate = ratio(insights.top2Match, insights.withResolvedFeedback);
  insights.pilot = buildPilotMetrics(sessions);

  for (const stats of Object.values(insights.byAction)) {
    stats.top1MatchRate = ratio(stats.top1Match, stats.count);
    stats.top2MatchRate = ratio(stats.top2Match, stats.count);
  }

  insights.highAlert = insights.highAlert.sort((a, b) => b.score - a.score).slice(0, limit);
  insights.misses = insights.misses
    .sort((a, b) => Number(b.top1Score || 0) - Number(a.top1Score || 0))
    .slice(0, limit);
  insights.calibrationNotes = buildCalibrationNotes(insights);
  return insights;
}

export function createFeedbackMarkdownReport(insights) {
  const lines = [];
  lines.push("# 哭了么反馈复盘报告");
  lines.push("");
  lines.push("## 总览");
  lines.push("");
  lines.push(`- 宝宝：${insights.babyId || "未命名"}`);
  lines.push(`- 导出时间：${insights.exportedAt || "未知"}`);
  lines.push(`- 总 session：${insights.total}`);
  lines.push(`- 音频附件：${insights.audioAttachmentCount}`);
  lines.push(`- 可分析录音：${insights.usable}`);
  lines.push(`- 有效反馈：${insights.withResolvedFeedback}`);
  lines.push(`- 未缓解反馈：${insights.unresolved}`);
  lines.push(`- 过程中未缓解尝试：${insights.failedAttempts}`);
  lines.push(`- 部分缓解：${insights.partial}`);
  lines.push(`- 缓解后复哭：${insights.recurred}`);
  lines.push(`- Top-1 命中有效处理：${percent(insights.top1MatchRate)}`);
  lines.push(`- Top-2 覆盖有效处理：${percent(insights.top2MatchRate)}`);
  lines.push("");
  lines.push("说明：这里把“用户反馈的有效处理”当作弱真值，用来改进产品和当前宝宝个体化校准，不等同于医学诊断。");
  lines.push("");

  lines.push("## 内测有效性指标");
  lines.push("");
  lines.push(`- 结论：${insights.pilot.verdict}`);
  lines.push(`- 有效反馈样本：${insights.pilot.resolvedSamples}`);
  lines.push(`- 首步有效率：${percent(insights.pilot.firstStepEffectiveRate)}`);
  lines.push(`- Top-2 覆盖有效处理：${percent(insights.pilot.top2CoverageRate)}`);
  lines.push(`- 推荐路径覆盖有效处理：${percent(insights.pilot.recommendedCoverageRate)}`);
  lines.push(`- 平均尝试次数：${formatNumber(insights.pilot.avgAttemptsToOutcome)}`);
  lines.push(`- 平均未缓解尝试：${formatNumber(insights.pilot.avgFailedAttemptsBeforeResolution)}`);
  lines.push(`- 5 分钟内明显缓解：${percent(insights.pilot.fastReliefRate)}`);
  lines.push(`- 缓解时间中位数：${formatSeconds(insights.pilot.medianReliefTimeSec)}`);
  lines.push(`- 最终未缓解率：${percent(insights.pilot.unresolvedRate)}`);
  lines.push("");
  lines.push("| 检查项 | 通过线 | 当前 | 状态 |");
  lines.push("| --- | --- | --- | --- |");
  for (const check of insights.pilot.checks) {
    lines.push(`| ${check.name} | ${check.target} | ${check.value} | ${check.status} |`);
  }
  lines.push("");

  lines.push("## 有效处理分布");
  lines.push("");
  lines.push("| 有效处理 | 次数 | Top-1 命中 | Top-2 覆盖 | 初判 Top-1 分布 | 缓解情况 |");
  lines.push("| --- | ---: | ---: | ---: | --- | --- |");
  for (const [action, stats] of sortEntries(insights.byAction)) {
    lines.push(
      `| ${label(action)} | ${stats.count} | ${percent(stats.top1MatchRate)} | ${percent(stats.top2MatchRate)} | ${formatCounts(stats.predictedTop1)} | ${formatCounts(stats.relief)} |`
    );
  }
  if (!Object.keys(insights.byAction).length) lines.push("| 暂无 | 0 | - | - | - | - |");
  lines.push("");

  lines.push("## 初判分布");
  lines.push("");
  lines.push(formatCountsBlock(insights.byTop1, "暂无初判记录"));
  lines.push("");

  lines.push("## 未缓解尝试");
  lines.push("");
  lines.push(formatCountsBlock(insights.attemptedNoRelief, "暂无未缓解记录"));
  lines.push("");

  lines.push("## 追问答案");
  lines.push("");
  lines.push("| 追问:答案 | 次数 | 有效 | 未缓解 | 反馈分布 |");
  lines.push("| --- | ---: | ---: | ---: | --- |");
  for (const [question, stats] of sortEntries(insights.questionAnswers)) {
    lines.push(`| ${question} | ${stats.count} | ${stats.resolved} | ${stats.unresolved} | ${formatCounts(stats.actions)} |`);
  }
  if (!Object.keys(insights.questionAnswers).length) lines.push("| 暂无 | 0 | 0 | 0 | - |");
  lines.push("");

  lines.push("## 需要复盘的错判");
  lines.push("");
  lines.push("| Session | 有效处理 | Top-1 | Top-2 | Top-1 分数 | 质量 | 高警觉 | 音频 | 追问 |");
  lines.push("| --- | --- | --- | --- | ---: | ---: | --- | --- | --- |");
  for (const miss of insights.misses) {
    lines.push(
      `| ${miss.id || "-"} | ${label(miss.expected)} | ${label(miss.top1)} | ${label(miss.top2)} | ${percent(miss.top1Score)} | ${percent(miss.qualityScore)} | ${miss.highAlertLevel} | ${miss.hasAudio ? "有" : "无"} | ${miss.question ? `${miss.question}:${miss.answer}` : "-"} |`
    );
  }
  if (!insights.misses.length) lines.push("| 暂无 | - | - | - | - | - | - | - | - |");
  lines.push("");

  lines.push("## 高警觉样本");
  lines.push("");
  lines.push("| Session | 等级 | 分数 | Top-1 | 反馈 | 是否缓解 | 音频 | 追问 |");
  lines.push("| --- | --- | ---: | --- | --- | --- | --- | --- |");
  for (const item of insights.highAlert) {
    lines.push(
      `| ${item.id || "-"} | ${item.level} | ${percent(item.score)} | ${label(item.top1)} | ${label(item.action)} | ${item.resolved ? "是" : "否"} | ${item.hasAudio ? "有" : "无"} | ${item.question ? `${item.question}:${item.answer}` : "-"} |`
    );
  }
  if (!insights.highAlert.length) lines.push("| 暂无 | - | - | - | - | - | - | - |");
  lines.push("");

  lines.push("## 校准建议");
  lines.push("");
  lines.push(insights.calibrationNotes.map((note) => `- ${note}`).join("\n") || "- 暂无足够反馈形成建议。");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function buildCalibrationNotes(insights) {
  const notes = [];
  if (insights.pilot.status === "collect") {
    notes.push("内测有效反馈样本还不够，先继续收集到至少 20 条有效反馈，再判断产品是否通过第一阶段。");
  } else if (insights.pilot.status === "fail") {
    notes.push("内测有效性未过线，优先看 Top-2 未覆盖和高未缓解率相关样本。");
  } else if (insights.pilot.status === "pass") {
    notes.push("内测有效性指标已达到第一阶段通过线，可以扩大样本并继续监控安全相关复盘。");
  }
  if (insights.withResolvedFeedback < 8) {
    notes.push("有效反馈少于 8 条，先继续收集，不建议大幅调参。");
  }
  if (insights.withResolvedFeedback >= 8 && insights.top2MatchRate < 0.7) {
    notes.push("Top-2 覆盖低于 70%，优先复盘“需要复盘的错判”里的样本，检查是否某一类声学特征被系统性误判。");
  }
  for (const [action, stats] of Object.entries(insights.byAction)) {
    if (stats.count >= 3 && stats.top2MatchRate < 0.5) {
      notes.push(`${label(action)}有效的样本至少 3 条，但 Top-2 覆盖低于 50%，应考虑提高这一类在相似特征下的校准权重。`);
    }
  }
  for (const [action, count] of Object.entries(insights.attemptedNoRelief)) {
    if (action !== "unresolved" && count >= 3) {
      notes.push(`${label(action)}被多次尝试但未缓解，当前宝宝相似哭声里应继续降低该方向权重。`);
    }
  }
  if (insights.highAlert.length) {
    notes.push("存在中/高警觉样本，复盘时应先看追问答案和真实处理，不要只按普通需求类别调参。");
  }
  return notes;
}

function buildPilotMetrics(sessions) {
  const metrics = createEmptyPilotMetrics();
  const attemptsToOutcome = [];
  const failedBeforeResolved = [];
  const reliefTimes = [];

  for (const session of sessions) {
    const feedback = session.feedback || {};
    const action = feedback.actionCategory || "unresolved";
    const resolved = Boolean(feedback.resolved) && action !== "unresolved";
    const attempts = (Array.isArray(session.attempts) ? session.attempts : []).filter(
      (attempt) => attempt?.result === "unresolved" && attempt.actionCategory
    );
    const top1 = session.analysis?.ranking?.[0]?.key || "";
    const top2 = session.analysis?.ranking?.[1]?.key || "";
    const firstSuggested = firstSuggestedAction(session);
    const recommended = new Set([firstSuggested, top1, top2].filter(Boolean));
    const failedCount = attempts.length;

    metrics.totalSessions += 1;
    attemptsToOutcome.push(failedCount + (action === "unresolved" && !failedCount ? 1 : 1));

    if (!resolved) {
      metrics.unresolvedSessions += 1;
      continue;
    }

    metrics.resolvedSamples += 1;
    if (action === firstSuggested && !attempts.some((attempt) => attempt.actionCategory === firstSuggested)) {
      metrics.firstStepEffective += 1;
    }
    if (action === top1 || action === top2) metrics.top2Covered += 1;
    if (recommended.has(action)) metrics.recommendedCovered += 1;
    failedBeforeResolved.push(failedCount);

    const reliefTimeSec = Number(feedback.reliefTimeSec ?? reliefTimeByKey[feedback.reliefKey]);
    if (Number.isFinite(reliefTimeSec) && reliefTimeSec > 0) {
      reliefTimes.push(reliefTimeSec);
      if (reliefTimeSec <= 300) metrics.fastRelief += 1;
    }
  }

  metrics.firstStepEffectiveRate = ratio(metrics.firstStepEffective, metrics.resolvedSamples);
  metrics.top2CoverageRate = ratio(metrics.top2Covered, metrics.resolvedSamples);
  metrics.recommendedCoverageRate = ratio(metrics.recommendedCovered, metrics.resolvedSamples);
  metrics.avgAttemptsToOutcome = average(attemptsToOutcome);
  metrics.avgFailedAttemptsBeforeResolution = average(failedBeforeResolved);
  metrics.fastReliefRate = ratio(metrics.fastRelief, metrics.resolvedSamples);
  metrics.medianReliefTimeSec = median(reliefTimes);
  metrics.unresolvedRate = ratio(metrics.unresolvedSessions, metrics.totalSessions);
  metrics.checks = buildPilotChecks(metrics);
  const failing = metrics.checks.filter((check) => check.status === "未过线");
  const collecting = metrics.checks.filter((check) => check.status === "继续收集");
  metrics.status = collecting.length ? "collect" : failing.length ? "fail" : "pass";
  metrics.verdict =
    metrics.status === "pass" ? "达到第一阶段通过线" : metrics.status === "fail" ? "未过线，需要复盘" : "样本不足，继续收集";
  return metrics;
}

function createEmptyPilotMetrics() {
  return {
    totalSessions: 0,
    resolvedSamples: 0,
    unresolvedSessions: 0,
    firstStepEffective: 0,
    top2Covered: 0,
    recommendedCovered: 0,
    fastRelief: 0,
    firstStepEffectiveRate: 0,
    top2CoverageRate: 0,
    recommendedCoverageRate: 0,
    avgAttemptsToOutcome: 0,
    avgFailedAttemptsBeforeResolution: 0,
    fastReliefRate: 0,
    medianReliefTimeSec: 0,
    unresolvedRate: 0,
    status: "collect",
    verdict: "样本不足，继续收集",
    checks: []
  };
}

function buildPilotChecks(metrics) {
  return [
    {
      name: "有效反馈样本",
      target: "至少 20 条",
      value: `${metrics.resolvedSamples} 条`,
      status: metrics.resolvedSamples >= 20 ? "达标" : "继续收集"
    },
    {
      name: "Top-2 覆盖有效处理",
      target: ">= 70%",
      value: percent(metrics.top2CoverageRate),
      status: metrics.top2CoverageRate >= 0.7 ? "达标" : "未过线"
    },
    {
      name: "平均尝试次数",
      target: "<= 2.5 步",
      value: `${formatNumber(metrics.avgAttemptsToOutcome)} 步`,
      status: metrics.avgAttemptsToOutcome && metrics.avgAttemptsToOutcome <= 2.5 ? "达标" : "未过线"
    },
    {
      name: "最终未缓解率",
      target: "<= 25%",
      value: percent(metrics.unresolvedRate),
      status: metrics.unresolvedRate <= 0.25 ? "达标" : "未过线"
    }
  ];
}

function firstSuggestedAction(session) {
  if (session.analysis?.highAlertLevel === "high") return "discomfort";
  return session.analysis?.ranking?.[0]?.key || "";
}

function bump(object, key) {
  const safeKey = key || "unknown";
  object[safeKey] = (object[safeKey] || 0) + 1;
}

function ratio(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

function percent(value) {
  if (!Number.isFinite(Number(value))) return "-";
  return `${Math.round(Number(value) * 1000) / 10}%`;
}

function average(values) {
  const usable = values.filter((value) => Number.isFinite(Number(value)));
  return usable.length ? usable.reduce((sum, value) => sum + Number(value), 0) / usable.length : 0;
}

function median(values) {
  const usable = values.filter((value) => Number.isFinite(Number(value))).sort((a, b) => a - b);
  if (!usable.length) return 0;
  const middle = (usable.length - 1) / 2;
  const lower = Math.floor(middle);
  const upper = Math.ceil(middle);
  return lower === upper ? usable[lower] : (usable[lower] + usable[upper]) / 2;
}

function formatNumber(value) {
  return Number.isFinite(Number(value)) ? String(Math.round(Number(value) * 10) / 10) : "-";
}

function formatSeconds(value) {
  const seconds = Number(value) || 0;
  if (!seconds) return "-";
  if (seconds < 60) return `${Math.round(seconds)} 秒`;
  return `${Math.round((seconds / 60) * 10) / 10} 分钟`;
}

function label(key) {
  return labelNames[key] || key || "未知";
}

function sortEntries(object) {
  return Object.entries(object || {}).sort((a, b) => {
    const countA = typeof a[1] === "number" ? a[1] : a[1].count || 0;
    const countB = typeof b[1] === "number" ? b[1] : b[1].count || 0;
    return countB - countA || a[0].localeCompare(b[0]);
  });
}

function formatCounts(object) {
  return sortEntries(object)
    .map(([key, value]) => `${label(key)} ${typeof value === "number" ? value : value.count || 0}`)
    .join("；") || "-";
}

function formatCountsBlock(object, emptyText) {
  const entries = sortEntries(object);
  if (!entries.length) return emptyText;
  return entries.map(([key, value]) => `- ${label(key)}：${typeof value === "number" ? value : value.count || 0}`).join("\n");
}
