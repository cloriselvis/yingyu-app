import { DEFAULT_AGE_CALIBRATION_STRENGTH } from "./audio-core.js";
import { canReplayRow, replayRows } from "./offline-replay.js";
import { analyzeResultRows } from "./result-insights.js";

export const ageCalibrationCandidates = [
  {
    key: "no_age",
    label: "No age context",
    strength: null,
    config: { ignoreBabyProfile: true }
  },
  {
    key: "age_025",
    label: "Age calibration 25%",
    strength: 0.25,
    config: { ageCalibrationStrength: 0.25 }
  },
  {
    key: "age_050",
    label: "Current age calibration (50%)",
    strength: 0.5,
    current: true,
    config: {}
  },
  {
    key: "age_075",
    label: "Age calibration 75%",
    strength: 0.75,
    config: { ageCalibrationStrength: 0.75 }
  },
  {
    key: "age_100",
    label: "Age calibration 100%",
    strength: 1,
    config: { ageCalibrationStrength: 1 }
  },
  {
    key: "age_125",
    label: "Age calibration 125%",
    strength: 1.25,
    config: { ageCalibrationStrength: 1.25 }
  },
  {
    key: "age_150",
    label: "Age calibration 150%",
    strength: 1.5,
    config: { ageCalibrationStrength: 1.5 }
  }
];

export function compareAgeCalibration(rows, candidates = ageCalibrationCandidates, options = {}) {
  const limit = options.limit ?? 20;
  const results = candidates.map((candidate) => {
    const replayedRows = replayRows(rows, candidate.config);
    const insights = analyzeResultRows(replayedRows, { limit });
    return {
      key: candidate.key,
      label: candidate.label,
      strength: candidate.strength,
      current: Boolean(candidate.current),
      config: candidate.config,
      score: candidateScore(insights),
      insights
    };
  });
  const noAge = results.find((result) => result.key === "no_age") || null;
  const current =
    results.find((result) => result.current) ||
    results.find((result) => result.strength === DEFAULT_AGE_CALIBRATION_STRENGTH) ||
    results[0] ||
    null;
  for (const result of results) {
    result.deltaNoAge = noAge ? resultDelta(result.insights, noAge.insights) : {};
    result.deltaCurrent = current ? resultDelta(result.insights, current.insights) : {};
  }

  return {
    totalRows: rows.length,
    replayableRows: rows.filter(canReplayRow).length,
    ageRows: rows.filter((row) => row?.ageBucket || row?.babyProfile?.ageBucket).length,
    comparableRows: rows.filter((row) => row?.comparable).length,
    baselineKey: noAge?.key || "",
    currentKey: current?.key || "",
    bestKey: [...results].sort((a, b) => b.score - a.score || b.insights.top2Accuracy - a.insights.top2Accuracy)[0]?.key || "",
    results
  };
}

export function createAgeCalibrationMarkdown(comparison) {
  const lines = [];
  lines.push("# Age Calibration Sweep");
  lines.push("");
  lines.push(`- Rows: ${comparison.totalRows}`);
  lines.push(`- Decoded/replayable rows: ${comparison.replayableRows}`);
  lines.push(`- Rows with age context: ${comparison.ageRows}`);
  lines.push(`- Comparable weak-label rows: ${comparison.comparableRows}`);
  lines.push(`- Baseline: ${comparison.baselineKey || "-"}`);
  lines.push(`- Current default: ${comparison.currentKey || "-"}`);
  lines.push(`- Best score in this sweep: ${comparison.bestKey || "-"}`);
  lines.push("");
  lines.push(
    "This is an offline replay over stored acoustic feature snapshots. It is useful for choosing candidates, but any candidate still needs a fresh audio benchmark and human spot check."
  );
  lines.push("");
  lines.push("## Candidates");
  lines.push("");
  lines.push(
    "| Candidate | Strength | Score | Top-1 | Top-2 | vs no age | vs current | Top-2 mode | Safety | Medium/high alert | Age questions | High-confidence miss |"
  );
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const result of [...comparison.results].sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))) {
    const i = result.insights;
    lines.push(
      `| ${cell(result.label)} | ${result.strength ?? "off"} | ${round(result.score)} | ${percent(i.top1Accuracy)} | ${percent(i.top2Accuracy)} | ${signedPercent(result.deltaNoAge.top2Accuracy)} | ${signedPercent(result.deltaCurrent.top2Accuracy)} | ${percent(i.top2ModeCoverageRate)} | ${i.actionModes.safety || 0} | ${i.highAlertCount} | ${i.questions.age_bucket || 0} | ${i.highConfidenceTop1MissCount}/${i.highConfidenceEvaluated} |`
    );
  }
  lines.push("");
  lines.push("## Readout");
  lines.push("");
  lines.push(...readoutLines(comparison));
  lines.push("");
  return `${lines.join("\n").trim()}\n`;
}

function readoutLines(comparison) {
  const noAge = comparison.results.find((result) => result.key === comparison.baselineKey);
  const current = comparison.results.find((result) => result.key === comparison.currentKey);
  const best = comparison.results.find((result) => result.key === comparison.bestKey);
  const lines = [];
  if (noAge && current) {
    lines.push(
      `- Current age calibration changes Top-1 by ${signedPercent(current.deltaNoAge.top1Accuracy)} and Top-2 by ${signedPercent(current.deltaNoAge.top2Accuracy)} versus no-age replay.`
    );
    lines.push(
      `- Current age calibration changes the first follow-up question from ${noAge.insights.questions.age_bucket || 0} age questions to ${current.insights.questions.age_bucket || 0}.`
    );
  }
  if (best) {
    lines.push(`- Highest sweep score: ${best.label}. Treat it as a candidate, not a product accuracy claim.`);
  }
  lines.push("- Prefer candidates that improve or preserve Top-2 without increasing safety actions, medium/high alerts, or high-confidence misses.");
  return lines;
}

function candidateScore(insights) {
  const highAlertRate = ratio(insights.highAlertCount, insights.usable);
  const safetyRate = ratio(insights.actionModes.safety || 0, insights.usable);
  const ageQuestionRate = ratio(insights.questions.age_bucket || 0, insights.usable);
  return round(
    insights.top2Accuracy * 0.4 +
      insights.top1Accuracy * 0.2 +
      insights.top2ModeCoverageRate * 0.14 -
      insights.highConfidenceTop1MissRate * 0.1 -
      highAlertRate * 0.07 -
      safetyRate * 0.06 -
      ageQuestionRate * 0.03
  );
}

function resultDelta(insights, baseline) {
  return {
    top1Accuracy: insights.top1Accuracy - baseline.top1Accuracy,
    top2Accuracy: insights.top2Accuracy - baseline.top2Accuracy,
    highAlertCount: insights.highAlertCount - baseline.highAlertCount,
    safetyCount: (insights.actionModes.safety || 0) - (baseline.actionModes.safety || 0),
    ageQuestionCount: (insights.questions.age_bucket || 0) - (baseline.questions.age_bucket || 0)
  };
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
