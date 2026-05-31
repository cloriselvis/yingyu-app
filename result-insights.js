const labelNames = {
  hunger: "想吃奶",
  gas: "拍嗝/胀气",
  tired: "困烦/过度刺激",
  discomfort: "一般不适",
  high: "高",
  medium: "中",
  low: "低",
  top1: "单一初判",
  top2: "Top-2 模式",
  safety: "安全优先",
  unknown: "未知"
};

export function parseJsonl(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid JSONL at line ${index + 1}: ${error.message}`);
      }
    });
}

export function analyzeResultRows(rows, options = {}) {
  const limit = options.limit ?? 20;
  const insights = {
    total: rows.length,
    parsed: count(rows, (row) => row.parsed),
    decoded: count(rows, (row) => row.decoded),
    usable: count(rows, (row) => row.usable),
    comparable: count(rows, (row) => row.comparable),
    evaluated: 0,
    top1Correct: 0,
    top2Correct: 0,
    rejectionRate: 0,
    top1Accuracy: 0,
    top2Accuracy: 0,
    majorityTop1: "",
    majorityTop2: [],
    majorityTop1Accuracy: 0,
    majorityTop2Accuracy: 0,
    byExpected: {},
    confusion: {},
    qualityIssues: {},
    confidenceLevels: {},
    actionModes: {},
    questions: {},
    confidenceByLevel: {},
    actionModeStats: {},
    highConfidenceEvaluated: 0,
    highConfidenceTop1MissCount: 0,
    highConfidenceTop1MissRate: 0,
    top2ModeEvaluated: 0,
    top2ModeTop2Correct: 0,
    top2ModeCoverageRate: 0,
    highAlertCount: 0,
    rejectedCount: 0,
    algorithmGate: null,
    highAlert: [],
    rejected: [],
    lowConfidenceTop2: [],
    highConfidenceMisses: [],
    safetyMode: [],
    top1Misses: [],
    top2Misses: [],
    closeCalls: [],
    errors: []
  };

  for (const row of rows) {
    if (row.error) insights.errors.push(sample(row));
    for (const issue of row.qualityIssues || []) bump(insights.qualityIssues, issue);

    if (row.parsed && !row.usable) insights.rejected.push(sample(row));
    if (row.parsed && !row.usable) insights.rejectedCount += 1;
    if (["medium", "high"].includes(row.highAlertLevel)) {
      insights.highAlertCount += 1;
      insights.highAlert.push(sample(row));
    }

    if (row.usable && row.top1) {
      const confidenceLevel = row.confidenceLevel || "unknown";
      const actionMode = row.actionMode || "unknown";
      bump(insights.confidenceLevels, confidenceLevel);
      bump(insights.actionModes, actionMode);
      if (row.questionId) bump(insights.questions, row.questionId);
      if (actionMode === "safety") insights.safetyMode.push(sample(row));
    }

    if (!row.comparable || !row.usable || !row.top1 || !row.yingyuLabel) continue;

    insights.evaluated += 1;
    const expected = row.yingyuLabel;
    const top1Correct = row.top1 === expected;
    const top2Correct = row.top1 === expected || row.top2 === expected;
    if (top1Correct) insights.top1Correct += 1;
    if (top2Correct) insights.top2Correct += 1;

    const confidenceLevel = row.confidenceLevel || "unknown";
    const actionMode = row.actionMode || "unknown";
    addAccuracy(insights.confidenceByLevel, confidenceLevel, top1Correct, top2Correct);
    addAccuracy(insights.actionModeStats, actionMode, top1Correct, top2Correct);
    if (confidenceLevel === "high") {
      insights.highConfidenceEvaluated += 1;
      if (!top1Correct) insights.highConfidenceTop1MissCount += 1;
    }
    if (actionMode === "top2") {
      insights.top2ModeEvaluated += 1;
      if (top2Correct) insights.top2ModeTop2Correct += 1;
    }

    const expectedStats = (insights.byExpected[expected] ||= {
      count: 0,
      top1Correct: 0,
      top2Correct: 0,
      top1Accuracy: 0,
      top2Accuracy: 0,
      predicted: {}
    });
    expectedStats.count += 1;
    if (top1Correct) expectedStats.top1Correct += 1;
    if (top2Correct) expectedStats.top2Correct += 1;
    bump(expectedStats.predicted, row.top1);
    bumpNested(insights.confusion, expected, row.top1);

    const margin = Number(row.top1Score || 0) - Number(row.top2Score || 0);
    const sampled = { ...sample(row), margin: round(margin) };
    if (!top1Correct) insights.top1Misses.push(sampled);
    if (!top2Correct) insights.top2Misses.push({ ...sample(row), margin: round(margin) });
    if (Math.abs(margin) <= 0.08) insights.closeCalls.push({ ...sample(row), margin: round(margin) });
    if (confidenceLevel === "low" || actionMode === "top2") {
      insights.lowConfidenceTop2.push({ ...sampled, top2Covered: top2Correct });
    }
    if (confidenceLevel === "high" && !top1Correct) {
      insights.highConfidenceMisses.push(sampled);
    }
  }

  insights.rejectionRate = ratio(insights.parsed - insights.usable, insights.parsed);
  insights.top1Accuracy = ratio(insights.top1Correct, insights.evaluated);
  insights.top2Accuracy = ratio(insights.top2Correct, insights.evaluated);
  const majority = Object.entries(insights.byExpected)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([key]) => key);
  insights.majorityTop1 = majority[0] || "";
  insights.majorityTop2 = majority.slice(0, 2);
  if (insights.evaluated && insights.majorityTop1) {
    let majorityTop1Correct = 0;
    let majorityTop2Correct = 0;
    for (const row of rows) {
      if (!row.comparable || !row.usable || !row.top1 || !row.yingyuLabel) continue;
      if (row.yingyuLabel === insights.majorityTop1) majorityTop1Correct += 1;
      if (insights.majorityTop2.includes(row.yingyuLabel)) majorityTop2Correct += 1;
    }
    insights.majorityTop1Accuracy = ratio(majorityTop1Correct, insights.evaluated);
    insights.majorityTop2Accuracy = ratio(majorityTop2Correct, insights.evaluated);
  }

  for (const stats of Object.values(insights.byExpected)) {
    stats.top1Accuracy = ratio(stats.top1Correct, stats.count);
    stats.top2Accuracy = ratio(stats.top2Correct, stats.count);
  }
  finalizeAccuracyBuckets(insights.confidenceByLevel);
  finalizeAccuracyBuckets(insights.actionModeStats);
  insights.highConfidenceTop1MissRate = ratio(insights.highConfidenceTop1MissCount, insights.highConfidenceEvaluated);
  insights.top2ModeCoverageRate = ratio(insights.top2ModeTop2Correct, insights.top2ModeEvaluated);
  insights.algorithmGate = buildAlgorithmGate(insights);

  insights.highAlert = sortAndLimit(insights.highAlert, "highAlertScore", limit);
  insights.rejected = sortAndLimit(insights.rejected, "qualityScore", limit, "asc");
  insights.lowConfidenceTop2 = sortAndLimit(insights.lowConfidenceTop2, "margin", limit, "ascAbs");
  insights.highConfidenceMisses = sortAndLimit(insights.highConfidenceMisses, "confidenceScore", limit, "desc");
  insights.safetyMode = sortAndLimit(insights.safetyMode, "highAlertScore", limit, "desc");
  insights.top1Misses = sortAndLimit(insights.top1Misses, "margin", limit, "desc");
  insights.top2Misses = sortAndLimit(insights.top2Misses, "margin", limit, "desc");
  insights.closeCalls = sortAndLimit(insights.closeCalls, "margin", limit, "ascAbs");
  insights.errors = insights.errors.slice(0, limit);
  return insights;
}

export function createMarkdownReport(insights) {
  const lines = [];
  lines.push("# 婴语评估误差分析报告");
  lines.push("");
  lines.push("## 总览");
  lines.push("");
  lines.push(`- 总样本：${insights.total}`);
  lines.push(`- 已解析：${insights.parsed}`);
  lines.push(`- 已解码：${insights.decoded}`);
  lines.push(`- 可分析：${insights.usable}`);
  lines.push(`- 弱标签可比较：${insights.comparable}`);
  lines.push(`- 实际评估样本：${insights.evaluated}`);
  lines.push(`- 拒判率：${percent(insights.rejectionRate)}`);
  lines.push(`- Top-1 弱标签命中率：${percent(insights.top1Accuracy)}`);
  lines.push(`- Top-2 弱标签命中率：${percent(insights.top2Accuracy)}`);
  lines.push(`- 置信度分布：${formatCounts(insights.confidenceLevels) || "暂无"}`);
  lines.push(`- 行动模式分布：${formatCounts(insights.actionModes) || "暂无"}`);
  lines.push(`- 算法基本盘：${insights.algorithmGate.verdict}`);
  lines.push(
    `- 多数类弱标签基线：Top-1 ${label(insights.majorityTop1)} ${percent(insights.majorityTop1Accuracy)}；Top-2 ${insights.majorityTop2.map(label).join(" + ")} ${percent(insights.majorityTop2Accuracy)}`
  );
  lines.push("");
  lines.push("说明：公开数据和自采音频的标签通常是弱标签，这份报告用于工程调试和错误分析，不能当作产品准确率承诺。");
  lines.push("");

  lines.push("## 算法基本盘检查");
  lines.push("");
  lines.push("| 检查项 | 通过线 | 当前 | 状态 |");
  lines.push("| --- | --- | --- | --- |");
  for (const check of insights.algorithmGate.checks) {
    lines.push(`| ${check.name} | ${check.target} | ${check.value} | ${check.status} |`);
  }
  lines.push("");

  lines.push("## 分类别表现");
  lines.push("");
  lines.push("| 弱标签 | 样本 | Top-1 | Top-2 | 最常预测 |");
  lines.push("| --- | ---: | ---: | ---: | --- |");
  for (const [expected, stats] of sortEntries(insights.byExpected)) {
    lines.push(
      `| ${label(expected)} | ${stats.count} | ${percent(stats.top1Accuracy)} | ${percent(stats.top2Accuracy)} | ${formatCounts(stats.predicted)} |`
    );
  }
  lines.push("");

  lines.push("## 置信度分层");
  lines.push("");
  lines.push(formatAccuracyTable(insights.confidenceByLevel, "置信度"));
  lines.push("");

  lines.push("## 行动模式分层");
  lines.push("");
  lines.push(formatAccuracyTable(insights.actionModeStats, "模式"));
  lines.push("");

  lines.push("## 质量门控问题");
  lines.push("");
  lines.push(formatCountsBlock(insights.qualityIssues, "没有质量问题记录"));
  lines.push("");

  lines.push("## 高警觉样本");
  lines.push("");
  lines.push(formatSampleTable(insights.highAlert, ["file", "highAlertLevel", "highAlertScore", "actionMode", "top1", "top2", "pitchP90", "highBandRatio", "burstiness", "reasonLabel"]));
  lines.push("");

  lines.push("## 低置信/Top-2 模式样本");
  lines.push("");
  lines.push(
    formatSampleTable(insights.lowConfidenceTop2, [
      "file",
      "yingyuLabel",
      "top1",
      "top2",
      "confidenceLevel",
      "confidenceScore",
      "margin",
      "top2Covered",
      "pitchP90",
      "irregularity",
      "questionId"
    ])
  );
  lines.push("");

  lines.push("## 高置信 Top-1 错判样本");
  lines.push("");
  lines.push(
    formatSampleTable(insights.highConfidenceMisses, [
      "file",
      "yingyuLabel",
      "top1",
      "top2",
      "confidenceScore",
      "margin",
      "pitchP90",
      "highBandRatio",
      "burstiness",
      "irregularity",
      "decisionEvidence"
    ])
  );
  lines.push("");

  lines.push("## 拒判样本");
  lines.push("");
  lines.push(formatSampleTable(insights.rejected, ["file", "qualityScore", "qualityIssues", "validCrySec", "cryRatio", "snrDb", "reasonLabel", "ageLabel"]));
  lines.push("");

  lines.push("## Top-1 失败样本");
  lines.push("");
  lines.push(
    formatSampleTable(insights.top1Misses, [
      "file",
      "yingyuLabel",
      "top1",
      "top1Score",
      "top2",
      "top2Score",
      "confidenceLevel",
      "actionMode",
      "margin",
      "pitchP90",
      "irregularity"
    ])
  );
  lines.push("");

  lines.push("## Top-2 失败样本");
  lines.push("");
  lines.push(
    formatSampleTable(insights.top2Misses, [
      "file",
      "yingyuLabel",
      "top1",
      "top2",
      "confidenceLevel",
      "actionMode",
      "highAlertLevel",
      "qualityScore",
      "pitchP90",
      "highBandRatio",
      "irregularity"
    ])
  );
  lines.push("");

  lines.push("## 接近样本");
  lines.push("");
  lines.push(formatSampleTable(insights.closeCalls, ["file", "yingyuLabel", "top1", "top1Score", "top2", "top2Score", "margin", "pitchP90", "irregularity"]));
  lines.push("");

  if (insights.errors.length) {
    lines.push("## 解码或处理错误");
    lines.push("");
    lines.push(formatSampleTable(insights.errors, ["file", "error"]));
    lines.push("");
  }

  lines.push("## 下一步调参建议");
  lines.push("");
  lines.push("- 先看拒判样本，确认质量门控是否过严或过松。");
  lines.push("- 优先抽听高置信 Top-1 错判样本，它们最可能暴露打分规则方向性错误。");
  lines.push("- 低置信/Top-2 模式如果 Top-2 覆盖高，产品上就应继续保持追问和组合处理，不要强行单判。");
  lines.push("- 再看 Top-2 失败样本，优先处理连第二候选都没覆盖到的类别。");
  lines.push("- 高警觉样本要人工抽听，确认是否被过度触发或漏触发。");
  lines.push("- 接近样本适合设计动态追问，不适合强行调成单一答案。");
  lines.push("");

  return `${lines.join("\n").trim()}\n`;
}

function sample(row) {
  return {
    file: row.file,
    reasonLabel: row.reasonLabel,
    yingyuLabel: row.yingyuLabel,
    ageLabel: row.ageLabel,
    qualityScore: row.qualityScore,
    qualityIssues: row.qualityIssues,
    highAlertLevel: row.highAlertLevel,
    highAlertScore: row.highAlertScore,
    confidenceLevel: row.confidenceLevel,
    confidenceScore: row.confidenceScore,
    confidenceMargin: row.confidenceMargin,
    actionMode: row.actionMode,
    questionId: row.questionId,
    decisionEvidence: row.decisionEvidence,
    top1: row.top1,
    top1Score: row.top1Score,
    top2: row.top2,
    top2Score: row.top2Score,
    validCrySec: row.validCrySec,
    cryRatio: row.cryRatio,
    snrDb: row.snrDb,
    pitchMedian: row.pitchMedian,
    pitchP90: row.pitchP90,
    highBandRatio: row.highBandRatio,
    veryHighBandRatio: row.veryHighBandRatio,
    burstiness: row.burstiness,
    irregularity: row.irregularity,
    error: row.error
  };
}

function formatSampleTable(rows, columns) {
  if (!rows.length) return "没有样本。";
  const header = `| ${columns.join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${columns.map((column) => cell(row[column])).join(" | ")} |`);
  return [header, divider, ...body].join("\n");
}

function cell(value) {
  if (Array.isArray(value)) return value.join("、") || "-";
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "number") return String(round(value));
  return label(String(value)).replaceAll("|", "\\|");
}

function formatCountsBlock(counts, emptyText) {
  const entries = sortEntries(counts);
  if (!entries.length) return emptyText;
  return entries.map(([key, value]) => `- ${key}: ${value}`).join("\n");
}

function formatCounts(counts) {
  return sortEntries(counts)
    .slice(0, 4)
    .map(([key, value]) => `${label(key)} ${value}`)
    .join("，");
}

function formatAccuracyTable(stats, labelName) {
  const entries = sortEntries(stats);
  if (!entries.length) return "没有分层数据。";
  const lines = [`| ${labelName} | 样本 | Top-1 | Top-2 |`, "| --- | ---: | ---: | ---: |"];
  for (const [key, item] of entries) {
    lines.push(`| ${label(key)} | ${item.count} | ${percent(item.top1Accuracy)} | ${percent(item.top2Accuracy)} |`);
  }
  return lines.join("\n");
}

function label(key) {
  return labelNames[key] || key || "-";
}

function sortEntries(object) {
  return Object.entries(object || {}).sort((a, b) => b[1].count - a[1].count || b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

function sortAndLimit(rows, key, limit, direction = "desc") {
  const sorted = [...rows].sort((a, b) => {
    const av = Number(a[key] || 0);
    const bv = Number(b[key] || 0);
    if (direction === "asc") return av - bv;
    if (direction === "ascAbs") return Math.abs(av) - Math.abs(bv);
    return bv - av;
  });
  return sorted.slice(0, limit);
}

function count(rows, predicate) {
  return rows.reduce((sum, row) => sum + (predicate(row) ? 1 : 0), 0);
}

function bump(target, key) {
  target[key || "unknown"] = (target[key || "unknown"] || 0) + 1;
}

function bumpNested(target, outer, inner) {
  const bucket = (target[outer] ||= {});
  bump(bucket, inner);
}

function addAccuracy(target, key, top1Correct, top2Correct) {
  const bucket = (target[key || "unknown"] ||= {
    count: 0,
    top1Correct: 0,
    top2Correct: 0,
    top1Accuracy: 0,
    top2Accuracy: 0
  });
  bucket.count += 1;
  if (top1Correct) bucket.top1Correct += 1;
  if (top2Correct) bucket.top2Correct += 1;
}

function finalizeAccuracyBuckets(target) {
  for (const bucket of Object.values(target)) {
    bucket.top1Accuracy = ratio(bucket.top1Correct, bucket.count);
    bucket.top2Accuracy = ratio(bucket.top2Correct, bucket.count);
  }
}

function buildAlgorithmGate(insights) {
  const checks = [
    {
      name: "可比较样本",
      target: ">= 100",
      value: `${insights.evaluated}`,
      status: insights.evaluated >= 100 ? "达标" : "继续收集"
    },
    {
      name: "质量拒判率",
      target: "<= 45%",
      value: percent(insights.rejectionRate),
      status: insights.parsed ? (insights.rejectionRate <= 0.45 ? "达标" : "需复盘") : "继续收集"
    },
    {
      name: "Top-2 覆盖",
      target: ">= 70%",
      value: insights.evaluated ? percent(insights.top2Accuracy) : "缺少标签",
      status: insights.evaluated ? (insights.top2Accuracy >= 0.7 ? "达标" : "需调参") : "继续收集"
    },
    {
      name: "Top-2 模式覆盖",
      target: ">= 70%",
      value: insights.top2ModeEvaluated ? `${percent(insights.top2ModeCoverageRate)} / ${insights.top2ModeEvaluated} 段` : "样本不足",
      status:
        insights.top2ModeEvaluated >= 10
          ? insights.top2ModeCoverageRate >= 0.7
            ? "达标"
            : "需调参"
          : "继续收集"
    },
    {
      name: "高置信错判率",
      target: "<= 10%",
      value: insights.highConfidenceEvaluated
        ? `${percent(insights.highConfidenceTop1MissRate)} / ${insights.highConfidenceEvaluated} 段`
        : "无高置信样本",
      status:
        insights.highConfidenceEvaluated >= 10
          ? insights.highConfidenceTop1MissRate <= 0.1
            ? "达标"
            : "需抽听"
          : "继续抽听"
    },
    {
      name: "解码错误",
      target: "0",
      value: `${insights.errors.length}`,
      status: insights.errors.length ? "需处理" : "达标"
    }
  ];
  const hasHardIssue = checks.some((check) => ["需调参", "需抽听", "需处理"].includes(check.status));
  const hasCollectionIssue = checks.some((check) => ["继续收集", "继续抽听"].includes(check.status));
  return {
    status: hasHardIssue ? "fail" : hasCollectionIssue ? "collect" : "pass",
    verdict: hasHardIssue ? "未过线，需要复盘" : hasCollectionIssue ? "样本不足，继续收集/抽听" : "达到当前工程通过线",
    checks
  };
}

function ratio(value, total) {
  return total ? round(value / total) : 0;
}

function percent(value) {
  return `${Math.round((Number(value) || 0) * 1000) / 10}%`;
}

function round(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}
