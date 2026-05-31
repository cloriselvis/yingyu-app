import { analyzeResultRows } from "./result-insights.js";

export function compareDatasets(datasets, options = {}) {
  const limit = options.limit ?? 20;
  const results = datasets.map((dataset) => {
    const rows = Array.isArray(dataset.rows) ? dataset.rows : [];
    const insights = analyzeResultRows(rows, { limit });
    return {
      key: dataset.key || slug(dataset.label || dataset.name || "dataset"),
      label: dataset.label || dataset.name || dataset.key || "Dataset",
      rowsFile: dataset.rowsFile || "",
      notes: dataset.notes || "",
      insights,
      labelRows: labelRows(insights),
      cautions: datasetCautions(insights)
    };
  });

  return {
    createdAt: new Date().toISOString(),
    datasetCount: results.length,
    totalRows: results.reduce((sum, item) => sum + item.insights.total, 0),
    totalEvaluated: results.reduce((sum, item) => sum + item.insights.evaluated, 0),
    results
  };
}

export function createDatasetComparisonMarkdown(comparison) {
  const lines = [];
  lines.push("# Public Audio Benchmark Comparison");
  lines.push("");
  lines.push(`- Generated: ${comparison.createdAt}`);
  lines.push(`- Datasets: ${comparison.datasetCount}`);
  lines.push(`- Total rows: ${comparison.totalRows}`);
  lines.push(`- Total evaluated weak-label rows: ${comparison.totalEvaluated}`);
  lines.push("");
  lines.push(
    "This report compares engineering benchmarks only. Public labels are weak labels and have different definitions, so these numbers are not product accuracy claims."
  );
  lines.push("");
  lines.push("## Dataset Summary");
  lines.push("");
  lines.push(
    "| Dataset | Rows | Decoded | Usable | Evaluated | Reject | Top-1 | Top-2 | Majority Top-2 | Medium/high alert | Safety | Age questions | Gate |"
  );
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const result of comparison.results) {
    const i = result.insights;
    lines.push(
      `| ${cell(result.label)} | ${i.total} | ${i.decoded} | ${i.usable} | ${i.evaluated} | ${percent(i.rejectionRate)} | ${percent(i.top1Accuracy)} | ${percent(i.top2Accuracy)} | ${percent(i.majorityTop2Accuracy)} | ${i.highAlertCount} | ${i.actionModes.safety || 0} | ${i.questions.age_bucket || 0} | ${cell(i.algorithmGate?.verdict)} |`
    );
  }
  lines.push("");
  lines.push("## Label Breakdown");
  lines.push("");
  for (const result of comparison.results) {
    lines.push(`### ${result.label}`);
    lines.push("");
    if (result.rowsFile) lines.push(`Rows: \`${result.rowsFile}\``);
    if (result.notes) lines.push(result.notes);
    lines.push("");
    lines.push("| Label | Evaluated | Top-1 | Top-2 | Most common prediction |");
    lines.push("| --- | ---: | ---: | ---: | --- |");
    for (const row of result.labelRows) {
      lines.push(
        `| ${cell(row.label)} | ${row.count} | ${percent(row.top1Accuracy)} | ${percent(row.top2Accuracy)} | ${cell(row.mostCommonPrediction)} |`
      );
    }
    if (!result.labelRows.length) lines.push("| - | 0 | - | - | - |");
    lines.push("");
  }
  lines.push("## Cautions");
  lines.push("");
  for (const result of comparison.results) {
    lines.push(`### ${result.label}`);
    lines.push("");
    if (result.cautions.length) {
      for (const caution of result.cautions) lines.push(`- ${caution}`);
    } else {
      lines.push("- No automatic caution triggered. Still require human spot checks before changing product rules.");
    }
    lines.push("");
  }
  lines.push("## Recommended Next Checks");
  lines.push("");
  lines.push("- Keep EnesBabyCries as the age/context calibration regression set.");
  lines.push("- Use Mendeley hunger as a small hunger regression set, but treat `uncomfortable` as a broad care-needs bucket until human review confirms subtypes.");
  lines.push("- Keep Donate-a-Cry clean as a larger weak-label stress set; treat its age buckets as coarse and review `tired` plus high-alert misses before tuning.");
  lines.push("- Do not merge datasets into one headline accuracy number; compare per-source label definitions and majority baselines first.");
  lines.push("- Build or import more balanced `tired` and safety/pain datasets before tuning those categories.");
  lines.push("");
  return `${lines.join("\n").trim()}\n`;
}

function labelRows(insights) {
  return Object.entries(insights.byExpected || {})
    .map(([key, stats]) => {
      const predicted = Object.entries(stats.predicted || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      return {
        key,
        label: key,
        count: stats.count,
        top1Accuracy: stats.top1Accuracy,
        top2Accuracy: stats.top2Accuracy,
        mostCommonPrediction: predicted.length ? predicted.map(([label, count]) => `${label} ${count}`).join(", ") : "-"
      };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function datasetCautions(insights) {
  const cautions = [];
  if (insights.evaluated < 100) cautions.push(`Only ${insights.evaluated} evaluated rows; use as smoke/regression data, not a stable accuracy estimate.`);
  if (insights.rejectionRate > 0.3) cautions.push(`High rejection rate (${percent(insights.rejectionRate)}); inspect recording quality and segmentation.`);
  if (insights.top2Accuracy < 0.7) cautions.push(`Top-2 below 70% gate (${percent(insights.top2Accuracy)}); needs review before rule changes.`);
  if (insights.majorityTop2Accuracy > insights.top2Accuracy + 0.2) {
    cautions.push(
      `Majority Top-2 baseline (${percent(insights.majorityTop2Accuracy)}) exceeds model Top-2 by more than 20 points; labels are likely imbalanced or too broad.`
    );
  }
  if ((insights.questions.age_bucket || 0) > 0) {
    cautions.push(`${insights.questions.age_bucket} rows still ask age first; add age context before judging downstream questions.`);
  }
  if (insights.highConfidenceTop1MissCount > 0) {
    cautions.push(`${insights.highConfidenceTop1MissCount} high-confidence Top-1 misses require priority review.`);
  }
  return cautions;
}

function slug(value) {
  return String(value || "dataset")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function percent(value) {
  if (!Number.isFinite(Number(value))) return "-";
  return `${Math.round(Number(value) * 1000) / 10}%`;
}

function cell(value) {
  if (value === undefined || value === null || value === "") return "-";
  return String(value).replaceAll("|", "\\|");
}
