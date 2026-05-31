import { getDecisionSupport, scoreAnalysis } from "./audio-core.js";
import { analyzeResultRows } from "./result-insights.js";

export const replayCandidates = [
  {
    key: "current",
    label: "当前规则",
    config: {}
  },
  {
    key: "less_safety",
    label: "高警觉更克制",
    config: {
      highAlertThresholds: { medium: 0.5, high: 0.74 }
    }
  },
  {
    key: "more_safety",
    label: "高警觉更敏感",
    config: {
      highAlertThresholds: { medium: 0.38, high: 0.6 }
    }
  },
  {
    key: "more_top2",
    label: "更多 Top-2 排查",
    config: {
      confidenceThresholds: { medium: 0.52, high: 0.78 }
    }
  },
  {
    key: "more_single",
    label: "更多单一初判",
    config: {
      confidenceThresholds: { medium: 0.38, high: 0.66 }
    }
  },
  {
    key: "medium_safety",
    label: "中警觉也安全优先",
    config: {
      safetyActionLevel: "medium"
    }
  }
];

const replayFeatureFields = [
  "durationSec",
  "validCrySec",
  "cryRatio",
  "peakRms",
  "avgActiveRms",
  "noiseFloor",
  "snrDb",
  "episodeCount",
  "avgEpisodeSec",
  "longestEpisodeSec",
  "pitchMedian",
  "pitchP90",
  "pitchSpread",
  "zcrActive",
  "spectralCentroid",
  "highBandRatio",
  "veryHighBandRatio",
  "burstiness",
  "irregularity"
];

export function featuresFromRow(row) {
  const features = {};
  for (const field of replayFeatureFields) features[field] = number(row[field]);
  features.quality = {
    usable: Boolean(row.usable),
    score: number(row.qualityScore),
    issues: Array.isArray(row.qualityIssues) ? row.qualityIssues : []
  };
  return features;
}

export function canReplayRow(row) {
  return Boolean(row?.decoded) && Number.isFinite(Number(row.validCrySec)) && Number.isFinite(Number(row.cryRatio));
}

export function replayRow(row, config = {}) {
  if (!canReplayRow(row)) {
    return {
      ...row,
      replayed: false,
      replayError: row?.error || "missing_feature_snapshot"
    };
  }

  const features = featuresFromRow(row);
  const scoreConfig = normalizeReplayConfig(row, config);
  const analysis = scoreAnalysis(features, scoreConfig);
  const support = getDecisionSupport(features, analysis, scoreConfig);
  const ranking = analysis.ranking || [];

  return {
    ...row,
    replayed: true,
    highAlertScore: round(analysis.highAlertScore),
    highAlertLevel: analysis.highAlertLevel,
    top1: ranking[0]?.key || "",
    top1Score: round(ranking[0]?.score || 0),
    top2: ranking[1]?.key || "",
    top2Score: round(ranking[1]?.score || 0),
    confidenceLevel: support.confidence.level,
    confidenceScore: round(support.confidence.score),
    confidenceMargin: round(support.confidence.margin),
    actionMode: support.actionMode,
    questionId: analysis.question?.id || "",
    decisionEvidence: support.evidence
  };
}

export function replayRows(rows, config = {}) {
  return rows.map((row) => replayRow(row, config));
}

function normalizeReplayConfig(row, config = {}) {
  const { ignoreBabyProfile, ...scoreConfig } = config || {};
  if (ignoreBabyProfile || scoreConfig.babyProfile) return scoreConfig;
  const ageBucket = row?.babyProfile?.ageBucket || row?.ageBucket || "";
  return ageBucket ? { ...scoreConfig, babyProfile: { ageBucket } } : scoreConfig;
}

export function compareReplayCandidates(rows, candidates = replayCandidates, options = {}) {
  const limit = options.limit ?? 20;
  const results = candidates.map((candidate) => {
    const replayedRows = replayRows(rows, candidate.config);
    const insights = analyzeResultRows(replayedRows, { limit });
    return {
      key: candidate.key,
      label: candidate.label,
      config: candidate.config,
      score: candidateScore(insights),
      changes: countReplayChanges(rows, replayedRows),
      insights
    };
  });
  const baseline = results.find((result) => result.key === "current") || results[0] || null;
  for (const result of results) result.delta = baseline ? candidateDelta(result.insights, baseline.insights) : {};
  return {
    totalRows: rows.length,
    replayableRows: rows.filter(canReplayRow).length,
    baselineKey: baseline?.key || "",
    results: [...results].sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
  };
}

export function createReplayComparisonMarkdown(comparison) {
  const lines = [];
  lines.push("# 婴语离线复评分候选对比");
  lines.push("");
  lines.push(`- 输入 rows：${comparison.totalRows}`);
  lines.push(`- 可复评分：${comparison.replayableRows}`);
  lines.push(`- 基线：${comparison.baselineKey || "无"}`);
  lines.push("");
  lines.push("说明：这里直接使用 rows.jsonl 里的声学特征快照复算，不重新解码音频。它适合筛选规则候选，不能替代重新跑公开数据和人工抽听。");
  lines.push("");
  lines.push("## 候选概览");
  lines.push("");
  lines.push("| 候选 | 排序分 | Top-1 | Top-2 | Top-2 Δ | Top-2模式覆盖 | 高警觉 | 安全优先 | 高置信错判 | Top-1变化 | 行动变化 | 基本盘 |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const result of comparison.results) {
    const i = result.insights;
    lines.push(
      `| ${cell(result.label)} | ${round(result.score)} | ${percent(i.top1Accuracy)} | ${percent(i.top2Accuracy)} | ${signedPercent(result.delta.top2Accuracy)} | ${percent(i.top2ModeCoverageRate)} | ${i.highAlertCount} | ${i.actionModes.safety || 0} | ${i.highConfidenceTop1MissCount}/${i.highConfidenceEvaluated} | ${result.changes.top1} | ${result.changes.actionMode} | ${cell(i.algorithmGate.verdict)} |`
    );
  }
  lines.push("");
  lines.push("## 候选配置");
  lines.push("");
  for (const result of comparison.results) {
    lines.push(`- ${result.label}：${Object.keys(result.config || {}).length ? cell(JSON.stringify(result.config)) : "默认参数"}`);
  }
  lines.push("");
  lines.push("## 使用建议");
  lines.push("");
  lines.push("- 先看排序靠前且 Top-2 不下降的候选，再生成抽听包复核高置信错判和高警觉样本。");
  lines.push("- 如果候选只提升弱标签 Top-1，但显著增加高警觉或高置信错判，不应直接进产品。");
  lines.push("- Donate-a-Cry 弱标签噪声很高，候选必须结合抽听标注报告判断。");
  lines.push("");
  return `${lines.join("\n").trim()}\n`;
}

function countReplayChanges(rows, replayedRows) {
  const changes = { top1: 0, top2: 0, highAlertLevel: 0, actionMode: 0 };
  for (let index = 0; index < rows.length; index += 1) {
    const before = rows[index];
    const after = replayedRows[index];
    if (!after?.replayed) continue;
    if ((before.top1 || "") !== (after.top1 || "")) changes.top1 += 1;
    if ((before.top2 || "") !== (after.top2 || "")) changes.top2 += 1;
    if ((before.highAlertLevel || "") !== (after.highAlertLevel || "")) changes.highAlertLevel += 1;
    if ((before.actionMode || "") !== (after.actionMode || "")) changes.actionMode += 1;
  }
  return changes;
}

function candidateScore(insights) {
  const highAlertRate = ratio(insights.highAlertCount, insights.usable);
  const safetyRate = ratio(insights.actionModes.safety || 0, insights.usable);
  return round(
    insights.top2Accuracy * 0.42 +
      insights.top1Accuracy * 0.22 +
      insights.top2ModeCoverageRate * 0.16 -
      insights.highConfidenceTop1MissRate * 0.08 -
      highAlertRate * 0.07 -
      safetyRate * 0.05
  );
}

function candidateDelta(insights, baseline) {
  return {
    top1Accuracy: insights.top1Accuracy - baseline.top1Accuracy,
    top2Accuracy: insights.top2Accuracy - baseline.top2Accuracy,
    highAlertCount: insights.highAlertCount - baseline.highAlertCount,
    safetyCount: (insights.actionModes.safety || 0) - (baseline.actionModes.safety || 0)
  };
}

function number(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function ratio(value, total) {
  return total ? value / total : 0;
}

function percent(value) {
  return `${Math.round((Number(value) || 0) * 1000) / 10}%`;
}

function signedPercent(value) {
  const rounded = Math.round((Number(value) || 0) * 1000) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function round(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

function cell(value) {
  if (value === undefined || value === null || value === "") return "-";
  return String(value).replaceAll("|", "\\|");
}
