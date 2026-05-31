import { reviewFeatureFields } from "./review-pack.js";

export const reviewJudgementLabels = {
  weak_label_ok: "弱标签更像对",
  model_top1_ok: "模型 Top-1 更像对",
  model_top2_ok: "模型 Top-2 可接受",
  quality_bad: "音频质量不合格",
  safety_reasonable: "高警觉合理",
  safety_too_sensitive: "高警觉过敏",
  not_baby_cry: "不是婴儿哭声",
  unclear: "听不出来"
};

export function parseReviewAnnotationsPayload(payload) {
  const data = typeof payload === "string" ? JSON.parse(stripBom(payload)) : payload;
  if (Array.isArray(data)) return data.map(normalizeAnnotation).filter(Boolean);
  if (Array.isArray(data?.annotations)) return data.annotations.map(normalizeAnnotation).filter(Boolean);
  if (data?.annotations && typeof data.annotations === "object") return Object.values(data.annotations).map(normalizeAnnotation).filter(Boolean);
  if (data && typeof data === "object") return Object.values(data).map(normalizeAnnotation).filter(Boolean);
  return [];
}

export function stripBom(text) {
  return String(text || "").replace(/^\uFEFF/, "");
}

export function analyzeReviewAnnotations(pack, annotationsPayload, options = {}) {
  const annotations = parseReviewAnnotationsPayload(annotationsPayload);
  const items = Array.isArray(pack?.items) ? pack.items : [];
  const lookup = buildItemLookup(items);
  const totalItems = Number(pack?.selectedCount || items.length || 0);
  const records = annotations.map((annotation, index) => {
    const item = lookup.get(annotation.key) || lookup.get(annotation.reviewFile) || lookup.get(annotation.file) || null;
    return {
      ...annotation,
      item,
      bucket: annotation.bucket || item?.bucket || "unknown",
      bucketLabel: item?.bucketLabel || annotation.bucket || "未知分组",
      judgementLabel: reviewJudgementLabels[annotation.judgement] || annotation.judgement || "仅备注",
      index
    };
  });

  const summary = {
    totalItems,
    annotationCount: records.length,
    matchedCount: records.filter((record) => record.item).length,
    unmatchedCount: records.filter((record) => !record.item).length,
    records,
    coverageRate: totalItems ? records.length / totalItems : 0,
    judgementCounts: {},
    byBucket: buildBucketTotals(pack, items),
    priorities: {
      confirmedModelMisses: [],
      weakLabelLikelyNoisy: [],
      top2Acceptable: [],
      safetyReasonable: [],
      safetyTooSensitive: [],
      qualityGateConfirmed: [],
      qualityGateMaybeTooStrict: [],
      unusableSamples: [],
      unclear: []
    },
    recommendations: []
  };

  for (const record of records) {
    bump(summary.judgementCounts, record.judgement || "note_only");
    const bucket = (summary.byBucket[record.bucket] ||= { total: 0, annotated: 0, judgements: {} });
    bucket.annotated += 1;
    bump(bucket.judgements, record.judgement || "note_only");

    if (["high-confidence-misses", "top2-misses"].includes(record.bucket) && record.judgement === "weak_label_ok") {
      summary.priorities.confirmedModelMisses.push(record);
    }
    if (["high-confidence-misses", "top2-misses"].includes(record.bucket) && record.judgement === "model_top1_ok") {
      summary.priorities.weakLabelLikelyNoisy.push(record);
    }
    if (record.judgement === "model_top2_ok") summary.priorities.top2Acceptable.push(record);
    if (record.bucket === "high-alert" && record.judgement === "safety_reasonable") summary.priorities.safetyReasonable.push(record);
    if (record.bucket === "high-alert" && record.judgement === "safety_too_sensitive") summary.priorities.safetyTooSensitive.push(record);
    if (record.bucket === "rejected" && record.judgement === "quality_bad") summary.priorities.qualityGateConfirmed.push(record);
    if (record.bucket === "rejected" && ["weak_label_ok", "model_top1_ok", "model_top2_ok", "safety_reasonable"].includes(record.judgement)) {
      summary.priorities.qualityGateMaybeTooStrict.push(record);
    }
    if (["quality_bad", "not_baby_cry"].includes(record.judgement)) summary.priorities.unusableSamples.push(record);
    if (["unclear", "note_only"].includes(record.judgement || "note_only")) summary.priorities.unclear.push(record);
  }

  summary.featureDiagnostics = buildFeatureDiagnostics(summary);
  summary.recommendations = buildRecommendations(summary, options);
  return summary;
}

export function createReviewAnnotationMarkdown(summary, options = {}) {
  const limit = options.limit ?? 20;
  const lines = [];
  lines.push("# 哭了么抽听标注汇总");
  lines.push("");
  lines.push(`- 抽听样本：${summary.totalItems}`);
  lines.push(`- 已标注：${summary.annotationCount}（${percent(summary.coverageRate)}）`);
  lines.push(`- 已匹配 manifest：${summary.matchedCount}`);
  if (summary.unmatchedCount) lines.push(`- 未匹配 manifest：${summary.unmatchedCount}`);
  lines.push("");
  lines.push("## 结论");
  lines.push("");
  for (const recommendation of summary.recommendations) lines.push(`- ${recommendation}`);
  if (!summary.recommendations.length) lines.push("- 暂无足够标注形成结论，继续抽听。");
  lines.push("");
  lines.push("## 人工判定分布");
  lines.push("");
  lines.push("| 判定 | 数量 |");
  lines.push("| --- | ---: |");
  for (const [key, value] of sortedEntries(summary.judgementCounts)) {
    lines.push(`| ${cell(reviewJudgementLabels[key] || key)} | ${value} |`);
  }
  if (!Object.keys(summary.judgementCounts).length) lines.push("| 暂无 | 0 |");
  lines.push("");
  lines.push("## 分组进度");
  lines.push("");
  lines.push("| 分组 | 样本 | 已标注 | 主要判定 |");
  lines.push("| --- | ---: | ---: | --- |");
  for (const [bucket, stats] of Object.entries(summary.byBucket)) {
    lines.push(`| ${cell(bucketLabel(bucket))} | ${stats.total || 0} | ${stats.annotated || 0} | ${cell(topJudgements(stats.judgements))} |`);
  }
  lines.push("");
  lines.push("## 关键特征均值");
  lines.push("");
  lines.push(formatFeatureDiagnostics(summary.featureDiagnostics));
  lines.push("");
  addSection(lines, "确认模型错判，优先调参", summary.priorities.confirmedModelMisses, limit);
  addSection(lines, "弱标签可能噪声，不要按它硬调", summary.priorities.weakLabelLikelyNoisy, limit);
  addSection(lines, "Top-2 可接受，产品路径先保留", summary.priorities.top2Acceptable, limit);
  addSection(lines, "高警觉过敏，检查安全阈值", summary.priorities.safetyTooSensitive, limit);
  addSection(lines, "高警觉合理，保留安全优先", summary.priorities.safetyReasonable, limit);
  addSection(lines, "质量门控确认正确", summary.priorities.qualityGateConfirmed, limit);
  addSection(lines, "质量门控可能过严", summary.priorities.qualityGateMaybeTooStrict, limit);
  addSection(lines, "不可用样本，训练/评估应排除", summary.priorities.unusableSamples, limit);
  return `${lines.join("\n").trim()}\n`;
}

function buildItemLookup(items) {
  const lookup = new Map();
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    for (const key of [item.reviewFile, item.file, `${item.reviewFile || item.file || "sample"}#${index}`]) {
      if (key) lookup.set(key, item);
    }
  }
  return lookup;
}

function buildBucketTotals(pack, items) {
  const buckets = {};
  for (const [key, value] of Object.entries(pack?.buckets || {})) {
    buckets[key] = { total: Number(value || 0), annotated: 0, judgements: {} };
  }
  for (const item of items) {
    if (!item.bucket) continue;
    buckets[item.bucket] ||= { total: 0, annotated: 0, judgements: {} };
    if (!pack?.buckets) buckets[item.bucket].total += 1;
  }
  return buckets;
}

function buildRecommendations(summary, options) {
  const minAnnotations = options.minAnnotations ?? 30;
  const items = [];
  if (summary.annotationCount < minAnnotations) {
    items.push(`已标注 ${summary.annotationCount} 条，少于建议的 ${minAnnotations} 条；先继续抽听，不用急着调规则。`);
  }
  if (summary.priorities.confirmedModelMisses.length) {
    items.push(`有 ${summary.priorities.confirmedModelMisses.length} 条失败样本被人工确认弱标签更可信，应优先回看声学特征和打分权重。`);
  }
  if (summary.priorities.weakLabelLikelyNoisy.length) {
    items.push(`有 ${summary.priorities.weakLabelLikelyNoisy.length} 条失败样本更像弱标签噪声，评估准确率时应单独剔除或降权。`);
  }
  if (summary.priorities.top2Acceptable.length) {
    items.push(`有 ${summary.priorities.top2Acceptable.length} 条样本 Top-2 可接受，说明先给组合排查路径比强行单判更稳。`);
  }
  if (summary.priorities.safetyTooSensitive.length > summary.priorities.safetyReasonable.length) {
    items.push("高警觉过敏多于合理触发，下一轮应检查尖锐度、持续性和爆发度阈值。");
  } else if (summary.priorities.safetyReasonable.length) {
    items.push("已有人工确认的高警觉合理样本，安全优先路径应继续保留。");
  }
  if (summary.priorities.qualityGateMaybeTooStrict.length) {
    items.push(`有 ${summary.priorities.qualityGateMaybeTooStrict.length} 条拒判样本人工认为仍有判断价值，质量门控可能偏严。`);
  }
  if (summary.priorities.qualityGateConfirmed.length) {
    items.push(`有 ${summary.priorities.qualityGateConfirmed.length} 条拒判被确认质量不合格，当前重录提示有保留价值。`);
  }
  return items;
}

function buildFeatureDiagnostics(summary) {
  return [
    featureGroup("全部已标注", allMatchedRecords(summary), "all"),
    featureGroup("确认模型错判", summary.priorities.confirmedModelMisses, "confirmedModelMisses"),
    featureGroup("弱标签可能噪声", summary.priorities.weakLabelLikelyNoisy, "weakLabelLikelyNoisy"),
    featureGroup("Top-2 可接受", summary.priorities.top2Acceptable, "top2Acceptable"),
    featureGroup("高警觉过敏", summary.priorities.safetyTooSensitive, "safetyTooSensitive"),
    featureGroup("质量门控可能过严", summary.priorities.qualityGateMaybeTooStrict, "qualityGateMaybeTooStrict")
  ].filter((group) => group.count > 0);
}

function allMatchedRecords(summary) {
  return (summary.records || []).filter((record) => record.item);
}

function featureGroup(labelText, records, key) {
  const matched = records.filter((record) => record.item);
  const values = {};
  for (const field of reviewFeatureFields) {
    const numbers = matched.map((record) => Number(record.item[field])).filter(Number.isFinite);
    if (numbers.length) values[field] = round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length);
  }
  return { key, label: labelText, count: matched.length, values };
}

function formatFeatureDiagnostics(groups) {
  if (!groups?.length) return "暂无可汇总的特征。";
  const columns = [
    ["label", "样本组"],
    ["count", "n"],
    ["validCrySec", "有效哭声"],
    ["cryRatio", "哭声占比"],
    ["snrDb", "SNR"],
    ["pitchP90", "P90 音高"],
    ["highBandRatio", "高频"],
    ["veryHighBandRatio", "很高频"],
    ["burstiness", "爆发"],
    ["irregularity", "不稳定"]
  ];
  const lines = [`| ${columns.map((column) => column[1]).join(" | ")} |`, `| ${columns.map(() => "---").join(" | ")} |`];
  for (const group of groups) {
    lines.push(
      `| ${columns
        .map(([key]) => {
          if (key === "label") return cell(group.label);
          if (key === "count") return group.count;
          return cell(formatFeatureValue(key, group.values[key]));
        })
        .join(" | ")} |`
    );
  }
  return lines.join("\n");
}

function formatFeatureValue(key, value) {
  if (!Number.isFinite(Number(value))) return "";
  if (key === "validCrySec") return `${value}s`;
  if (key === "snrDb") return `${value}dB`;
  if (key === "pitchP90" || key === "pitchMedian") return `${Math.round(value)}Hz`;
  if (["cryRatio", "highBandRatio", "veryHighBandRatio", "burstiness", "irregularity"].includes(key)) return percent(value);
  return String(value);
}

function addSection(lines, title, records, limit) {
  lines.push(`## ${title}`);
  lines.push("");
  if (!records.length) {
    lines.push("- 暂无");
    lines.push("");
    return;
  }
  lines.push("| 分组 | 文件 | 弱标签 | Top-1 | Top-2 | 人工判定 | 备注 |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const record of records.slice(0, limit)) {
    const item = record.item || {};
    lines.push(
      `| ${cell(record.bucketLabel)} | ${cell(record.reviewFile || record.file)} | ${cell(label(item.expected))} | ${cell(label(item.top1))} | ${cell(label(item.top2))} | ${cell(record.judgementLabel)} | ${cell(record.note)} |`
    );
  }
  lines.push("");
}

function normalizeAnnotation(value) {
  if (!value || typeof value !== "object") return null;
  const judgement = String(value.judgement || "").trim();
  const note = String(value.note || "").trim();
  if (!judgement && !note) return null;
  return {
    key: String(value.key || "").trim(),
    bucket: String(value.bucket || "").trim(),
    file: String(value.file || "").trim(),
    reviewFile: String(value.reviewFile || "").trim(),
    judgement,
    note,
    updatedAt: String(value.updatedAt || "").trim()
  };
}

function topJudgements(judgements) {
  return sortedEntries(judgements)
    .slice(0, 3)
    .map(([key, value]) => `${reviewJudgementLabels[key] || key} ${value}`)
    .join("、");
}

function sortedEntries(value) {
  return Object.entries(value || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function bump(target, key) {
  target[key] = (target[key] || 0) + 1;
}

function percent(value) {
  if (!Number.isFinite(Number(value))) return "-";
  return `${Math.round(Number(value) * 1000) / 10}%`;
}

function round(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

function cell(value) {
  if (value === undefined || value === null || value === "") return "-";
  return String(value).replaceAll("|", "\\|");
}

function bucketLabel(key) {
  const labels = {
    "high-confidence-misses": "高置信错判",
    "top2-misses": "Top-2 未覆盖",
    "high-alert": "中/高警觉",
    rejected: "质量拒判",
    "top2-close-covered": "Top-2 接近且覆盖",
    "decode-errors": "解码错误",
    unknown: "未知分组"
  };
  return labels[key] || key;
}

function label(key) {
  const labels = {
    hunger: "想吃奶",
    gas: "拍嗝/胀气",
    tired: "困烦/过度刺激",
    discomfort: "一般不适"
  };
  return labels[key] || key || "-";
}
