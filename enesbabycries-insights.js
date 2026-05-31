const featureSpecs = [
  { key: "duration_segment_P", label: "segmentSec" },
  { key: "pitch_median_S", label: "pitchHz" },
  { key: "entropyVoiced_median_S", label: "entropy" },
  { key: "HNRVoiced_median_S", label: "hnr" },
  { key: "specCentroidVoiced_median_S", label: "spectralCentroid" },
  { key: "voiced_S", label: "voiced" },
  { key: "jitter_P", label: "jitter" },
  { key: "shimmer_P", label: "shimmer" }
];

const coreCauses = ["hunger", "discomfort", "loneliness"];

export function parseCsv(text, delimiter = ",") {
  const rawRows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(cleanCell(field));
      field = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cleanCell(field));
      if (row.some((cell) => cell !== "")) rawRows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(cleanCell(field));
  if (row.some((cell) => cell !== "")) rawRows.push(row);
  if (!rawRows.length) return [];

  const headers = rawRows[0].map((header) => cleanCell(header).replace(/^\uFEFF/, ""));
  return rawRows.slice(1).map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cleanCell(cells[index] ?? "")]))
  );
}

export function analyzeEnesBabyCriesRows(rows, options = {}) {
  const usableRows = rows.filter((row) => row && typeof row === "object");
  const byAge = groupBy(usableRows, (row) => row.age_month || "unknown");
  const byCause = groupBy(usableRows, (row) => row.cause_stop_engl || "unknown");
  const coreRows = usableRows.filter((row) => coreCauses.includes(row.cause_stop_engl));

  const insights = {
    total: usableRows.length,
    babyCount: new Set(usableRows.map((row) => row.baby).filter(Boolean)).size,
    sessionCount: new Set(usableRows.map((row) => row.file_seq_S || row.file).filter(Boolean)).size,
    coreCauseTotal: coreRows.length,
    ages: Object.entries(byAge)
      .map(([age, ageRows]) => summarizeAge(age, ageRows))
      .sort((a, b) => Number(a.ageMonth) - Number(b.ageMonth)),
    causes: Object.entries(byCause)
      .map(([cause, causeRows]) => ({ cause, count: causeRows.length, percent: ratio(causeRows.length, usableRows.length) }))
      .sort((a, b) => b.count - a.count || a.cause.localeCompare(b.cause)),
    featuresByAge: {},
    featuresByCause: {},
    ageEffects: summarizeAgeEffects(options.ageEffects || []),
    ageRf: summarizeRfMatrix(options.ageRfMatrix || []),
    causeRf: summarizeRfMatrix(options.causeRfMatrix || [])
  };

  for (const ageSummary of insights.ages) {
    insights.featuresByAge[ageSummary.ageMonth] = summarizeFeatures(byAge[ageSummary.ageMonth] || []);
  }

  for (const cause of Object.keys(byCause)) {
    insights.featuresByCause[cause] = summarizeFeatures(byCause[cause]);
  }

  return insights;
}

export function createEnesBabyCriesMarkdown(insights) {
  const lines = [];
  lines.push("# EnesBabyCries 数据报告");
  lines.push("");
  lines.push("## 总览");
  lines.push("");
  lines.push(`- 分段样本：${insights.total}`);
  lines.push(`- 宝宝数：${insights.babyCount}`);
  lines.push(`- 录音 session：${insights.sessionCount}`);
  lines.push(`- 三个主要原因样本：${insights.coreCauseTotal}（hunger / discomfort / loneliness）`);
  lines.push("");
  lines.push("## 月龄分层");
  lines.push("");
  lines.push("| 月龄 | 样本 | hunger | discomfort | loneliness | pitchHz | segmentSec | entropy | voiced |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const age of insights.ages) {
    const features = insights.featuresByAge[age.ageMonth] || {};
    lines.push(
      `| ${age.ageMonth} | ${age.count} | ${countCell(age.causeCounts.hunger)} | ${countCell(age.causeCounts.discomfort)} | ${countCell(age.causeCounts.loneliness)} | ${num(features.pitchHz?.mean, 1)} | ${num(features.segmentSec?.mean, 3)} | ${num(features.entropy?.mean, 3)} | ${num(features.voiced?.mean, 3)} |`
    );
  }
  lines.push("");
  lines.push("## 原因分布");
  lines.push("");
  lines.push("| 原因 | 样本 | 占比 |");
  lines.push("| --- | ---: | ---: |");
  for (const cause of insights.causes) {
    lines.push(`| ${cause.cause} | ${cause.count} | ${percent(cause.percent)} |`);
  }
  lines.push("");
  lines.push("## 论文图表源数据复核");
  lines.push("");
  lines.push(
    `- 年龄 RF 矩阵：对角均值 ${num(insights.ageRf.diagonalMean, 2)}，非对角均值 ${num(insights.ageRf.offDiagonalMean, 2)}，对角/非对角 ${num(insights.ageRf.lift, 2)}。`
  );
  lines.push(
    `- 原因 RF 矩阵：对角均值 ${num(insights.causeRf.diagonalMean, 2)}，非对角均值 ${num(insights.causeRf.offDiagonalMean, 2)}，对角/非对角 ${num(insights.causeRf.lift, 2)}。`
  );
  lines.push("");
  lines.push("## 显著月龄声学变化");
  lines.push("");
  lines.push("| 特征 | 方向 | fit | 95% 区间 |");
  lines.push("| --- | --- | ---: | --- |");
  for (const effect of insights.ageEffects.significant.slice(0, 12)) {
    lines.push(`| ${effect.predictor} | ${effect.direction} | ${num(effect.fit, 3)} | ${num(effect.lwr, 3)} 到 ${num(effect.upr, 3)} |`);
  }
  if (!insights.ageEffects.significant.length) lines.push("| 暂无 | - | - | - |");
  lines.push("");
  lines.push("## 产品含义");
  lines.push("");
  lines.push("- 月龄是必须保留的校准变量：同一套音高、时长、频谱阈值不能无差别套到 0-4 月。");
  lines.push("- 原因分类要谨慎：公开图表源数据里，年龄矩阵的对角优势明显强于原因矩阵，说明月龄/个体信息比离散原因更稳定。");
  lines.push("- 当前产品的方向应继续保持：先听哭声，录完后少量追问月龄、喂奶、清醒时长、胀气和安全异常，再给 Top-2 和处理路径。");
  lines.push("- loneliness 不能直接等价成我们的 tired/gas/discomfort，只能作为“需要接触/安抚”相关参考，不能用于直接准确率承诺。");
  lines.push("");
  return lines.join("\n");
}

function summarizeAge(ageMonth, rows) {
  return {
    ageMonth,
    count: rows.length,
    causeCounts: countBy(rows, (row) => row.cause_stop_engl || "unknown")
  };
}

function summarizeFeatures(rows) {
  const summary = {};
  for (const spec of featureSpecs) {
    const values = rows.map((row) => Number(row[spec.key])).filter(Number.isFinite);
    summary[spec.label] = {
      n: values.length,
      mean: average(values),
      median: percentile(values, 0.5)
    };
  }
  return summary;
}

function summarizeAgeEffects(rows) {
  const effects = rows
    .map((row) => ({
      predictor: row.predictor || "",
      fit: Number(row.fit),
      lwr: Number(row.lwr),
      upr: Number(row.upr),
      pp: Number(row.pp)
    }))
    .filter((row) => row.predictor && [row.fit, row.lwr, row.upr].every(Number.isFinite));
  const significant = effects
    .filter((row) => (row.lwr > 0 && row.upr > 0) || (row.lwr < 0 && row.upr < 0))
    .map((row) => ({ ...row, direction: row.fit > 0 ? "升高" : "降低" }))
    .sort((a, b) => Math.abs(b.fit) - Math.abs(a.fit));
  return { total: effects.length, significant };
}

function summarizeRfMatrix(rows) {
  if (!rows.length) return { size: 0, diagonalMean: 0, offDiagonalMean: 0, lift: 0 };
  const headers = Object.keys(rows[0]);
  const diagonal = [];
  const offDiagonal = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    for (let colIndex = 0; colIndex < headers.length; colIndex += 1) {
      const value = Number(rows[rowIndex][headers[colIndex]]);
      if (!Number.isFinite(value)) continue;
      if (rowIndex === colIndex) diagonal.push(value);
      else offDiagonal.push(value);
    }
  }
  const diagonalMean = average(diagonal);
  const offDiagonalMean = average(offDiagonal);
  return {
    size: Math.min(rows.length, headers.length),
    diagonalMean,
    offDiagonalMean,
    lift: offDiagonalMean ? diagonalMean / offDiagonalMean : 0
  };
}

function groupBy(rows, keyFn) {
  const result = {};
  for (const row of rows) {
    const key = keyFn(row);
    (result[key] ||= []).push(row);
  }
  return result;
}

function countBy(rows, keyFn) {
  const result = {};
  for (const row of rows) {
    const key = keyFn(row);
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function cleanCell(value) {
  return String(value ?? "").trim();
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
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

function ratio(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

function countCell(value) {
  return value || 0;
}

function percent(value) {
  return `${Math.round((Number(value) || 0) * 1000) / 10}%`;
}

function num(value, digits) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "-";
}
