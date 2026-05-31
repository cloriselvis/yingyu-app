export function analyzePositiveCryRows(rows, options = {}) {
  const limit = options.limit ?? 20;
  const analyzed = Array.isArray(rows) ? rows : [];
  const decodedRows = analyzed.filter((row) => row.decoded);
  const usableRows = decodedRows.filter((row) => row.usable);
  const rejectedRows = decodedRows.filter((row) => !row.usable);
  const highAlertRows = usableRows.filter((row) => ["medium", "high"].includes(row.highAlertLevel));
  const safetyRows = usableRows.filter((row) => row.actionMode === "safety");

  const report = {
    total: analyzed.length,
    decoded: decodedRows.length,
    usable: usableRows.length,
    rejected: rejectedRows.length,
    usableRate: ratio(usableRows.length, decodedRows.length),
    rejectionRate: ratio(rejectedRows.length, decodedRows.length),
    mediumHighAlert: highAlertRows.length,
    mediumHighAlertRate: ratio(highAlertRows.length, usableRows.length),
    safety: safetyRows.length,
    safetyRate: ratio(safetyRows.length, usableRows.length),
    avgQualityScore: average(usableRows.map((row) => Number(row.qualityScore))),
    avgValidCrySec: average(usableRows.map((row) => Number(row.validCrySec))),
    avgCryRatio: average(usableRows.map((row) => Number(row.cryRatio))),
    top1: counts(usableRows.map((row) => row.top1 || "none")),
    questions: counts(usableRows.map((row) => row.questionId || "none")),
    qualityIssues: issueCounts(decodedRows),
    gate: null,
    highAlertSamples: sortAndLimit(highAlertRows, "highAlertScore", limit),
    rejectedSamples: sortAndLimit(rejectedRows, "qualityScore", limit, "asc")
  };
  report.gate = buildGate(report);
  return report;
}

export function createPositiveCryQualityMarkdown(report) {
  const lines = [];
  lines.push("# Positive Cry Quality Report");
  lines.push("");
  lines.push("This report is for cry-positive datasets that do not have reliable reason labels. It evaluates decoding, quality gating, and routing behavior only.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Rows: ${report.total}`);
  lines.push(`- Decoded: ${report.decoded}`);
  lines.push(`- Usable: ${report.usable} (${percent(report.usableRate)})`);
  lines.push(`- Rejected: ${report.rejected} (${percent(report.rejectionRate)})`);
  lines.push(`- Medium/high alert: ${report.mediumHighAlert} (${percent(report.mediumHighAlertRate)})`);
  lines.push(`- Safety action mode: ${report.safety} (${percent(report.safetyRate)})`);
  lines.push(`- Avg quality score: ${round(report.avgQualityScore)}`);
  lines.push(`- Avg valid cry seconds: ${round(report.avgValidCrySec)}`);
  lines.push(`- Avg cry ratio: ${percent(report.avgCryRatio)}`);
  lines.push(`- Gate: ${report.gate.verdict}`);
  lines.push("");
  lines.push("## Gate");
  lines.push("");
  lines.push("| Check | Target | Current | Status |");
  lines.push("| --- | --- | --- | --- |");
  for (const check of report.gate.checks) {
    lines.push(`| ${cell(check.name)} | ${cell(check.target)} | ${cell(check.value)} | ${cell(check.status)} |`);
  }
  lines.push("");
  lines.push("## Top-1 Distribution");
  lines.push("");
  lines.push(countTable(report.top1, "Top-1"));
  lines.push("");
  lines.push("## First Question Distribution");
  lines.push("");
  lines.push(countTable(report.questions, "Question"));
  lines.push("");
  lines.push("## Quality Issues");
  lines.push("");
  lines.push(countTable(report.qualityIssues, "Issue"));
  lines.push("");
  lines.push("## Medium/High Alert Samples");
  lines.push("");
  lines.push(sampleTable(report.highAlertSamples));
  lines.push("");
  if (report.rejectedSamples.length) {
    lines.push("## Rejected Samples");
    lines.push("");
    lines.push(sampleTable(report.rejectedSamples));
    lines.push("");
  }
  lines.push("## Readout");
  lines.push("");
  lines.push("- Use this report to tune cry detection and quality gates, not reason-label accuracy.");
  lines.push("- Review medium/high alert samples before lowering alert sensitivity; some real cries are sharp or irregular by nature.");
  lines.push("- If true cry-positive recordings are rejected, inspect `validCrySec`, `cryRatio`, and `snrDb` before changing need-ranking rules.");
  lines.push("");
  return `${lines.join("\n").trim()}\n`;
}

function buildGate(report) {
  const checks = [
    {
      name: "decoded rows",
      target: "100%",
      value: percent(ratio(report.decoded, report.total)),
      status: report.total && report.decoded === report.total ? "pass" : "fail"
    },
    {
      name: "positive cry usable rate",
      target: ">= 80%",
      value: percent(report.usableRate),
      status: report.usableRate >= 0.8 ? "pass" : "review"
    },
    {
      name: "quality rejection rate",
      target: "<= 20%",
      value: percent(report.rejectionRate),
      status: report.rejectionRate <= 0.2 ? "pass" : "review"
    },
    {
      name: "safety action rate",
      target: "review if > 30%",
      value: percent(report.safetyRate),
      status: report.safetyRate > 0.3 ? "review" : "pass"
    },
    {
      name: "medium/high alert review set",
      target: "sample required",
      value: `${report.mediumHighAlert} clips`,
      status: report.mediumHighAlert ? "review" : "pass"
    }
  ];
  const hasFail = checks.some((check) => check.status === "fail");
  const hasReview = checks.some((check) => check.status === "review");
  return {
    status: hasFail ? "fail" : hasReview ? "review" : "pass",
    verdict: hasFail ? "failed positive-cry gate" : hasReview ? "passed quality gate, review alert samples" : "passed positive-cry gate",
    checks
  };
}

function sampleTable(rows) {
  if (!rows.length) return "No samples.";
  const columns = ["file", "qualityScore", "validCrySec", "cryRatio", "snrDb", "highAlertLevel", "highAlertScore", "top1", "top2", "questionId"];
  const lines = [`| ${columns.join(" | ")} |`, `| ${columns.map(() => "---").join(" | ")} |`];
  for (const row of rows) lines.push(`| ${columns.map((column) => cell(formatValue(row[column]))).join(" | ")} |`);
  return lines.join("\n");
}

function countTable(values, label) {
  const entries = Object.entries(values || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!entries.length) return "No rows.";
  const lines = [`| ${label} | Count |`, "| --- | ---: |"];
  for (const [key, count] of entries) lines.push(`| ${cell(key)} | ${count} |`);
  return lines.join("\n");
}

function issueCounts(rows) {
  const all = [];
  for (const row of rows) {
    if (Array.isArray(row.qualityIssues)) all.push(...row.qualityIssues);
  }
  return counts(all);
}

function counts(values) {
  const result = {};
  for (const value of values) {
    const key = value || "none";
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function sortAndLimit(rows, key, limit, direction = "desc") {
  return [...rows]
    .sort((a, b) => {
      const av = Number(a[key] || 0);
      const bv = Number(b[key] || 0);
      return direction === "asc" ? av - bv : bv - av;
    })
    .slice(0, limit);
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
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

function formatValue(value) {
  if (typeof value === "number") return round(value);
  return value;
}

function cell(value) {
  if (value === undefined || value === null || value === "") return "-";
  return String(value).replaceAll("|", "\\|");
}
