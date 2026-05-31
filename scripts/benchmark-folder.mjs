import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { analyzeSamples, featureSnapshot, getDecisionSupport, scoreAnalysis } from "../audio-core.js";
import { decodeWav } from "../wav-io.js";

const root = process.argv[2];
const outArgIndex = process.argv.indexOf("--out");
const labelsArgIndex = process.argv.indexOf("--labels");
const outFile = outArgIndex >= 0 ? process.argv[outArgIndex + 1] : "";
const labelsFile = labelsArgIndex >= 0 ? process.argv[labelsArgIndex + 1] : "";

if (!root) {
  console.error("Usage: node scripts/benchmark-folder.mjs <folder> [--out results.jsonl] [--labels labels.json|labels.csv]");
  process.exit(1);
}

const labelMap = labelsFile ? await loadLabels(labelsFile) : new Map();
const rows = [];
for await (const file of walk(root)) {
  if (!file.toLowerCase().endsWith(".wav")) continue;
  const relativeFile = toPosixPath(relative(root, file));
  const labelInfo = labelMap.get(normalizePath(relativeFile)) || null;
  try {
    const decoded = decodeWav(await readFile(file));
    const features = analyzeSamples(decoded.samples, decoded.sampleRate);
    const analysis = scoreAnalysis(features);
    const support = getDecisionSupport(features, analysis);
    rows.push({
      file: relativeFile,
      parsed: true,
      decoded: true,
      comparable: Boolean(labelInfo),
      yingyuLabel: labelInfo?.yingyuLabel || "",
      reasonLabel: labelInfo?.reasonLabel || "",
      sampleRate: decoded.sampleRate,
      usable: features.quality.usable,
      qualityScore: round(features.quality.score),
      qualityIssues: features.quality.issues,
      highAlertScore: round(analysis.highAlertScore),
      highAlertLevel: analysis.highAlertLevel,
      top1: analysis.ranking[0]?.key || "",
      top1Score: round(analysis.ranking[0]?.score || 0),
      top2: analysis.ranking[1]?.key || "",
      top2Score: round(analysis.ranking[1]?.score || 0),
      confidenceLevel: support.confidence.level,
      confidenceScore: round(support.confidence.score),
      confidenceMargin: round(support.confidence.margin),
      actionMode: support.actionMode,
      questionId: analysis.question?.id || "",
      decisionEvidence: support.evidence,
      ...featureSnapshot(features)
    });
  } catch (error) {
    rows.push({
      file: relativeFile,
      parsed: true,
      decoded: false,
      usable: false,
      comparable: Boolean(labelInfo),
      yingyuLabel: labelInfo?.yingyuLabel || "",
      reasonLabel: labelInfo?.reasonLabel || "",
      error: error.message
    });
  }
}

const output = rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : "");
if (outFile) {
  await writeFile(outFile, output, "utf8");
} else {
  process.stdout.write(output);
}

console.error(`Analyzed ${rows.length} wav files.`);

async function loadLabels(file) {
  const text = await readFile(file, "utf8");
  if (/\.csv$/i.test(file)) return parseCsvLabels(text);
  return parseJsonLabels(JSON.parse(text));
}

function parseJsonLabels(value) {
  const map = new Map();
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!item?.file) continue;
      const labelInfo = normalizeLabel(item.yingyuLabel || item.label || item.category, item.reasonLabel || "self_label");
      if (labelInfo) map.set(normalizePath(item.file), labelInfo);
    }
    return map;
  }

  for (const [file, label] of Object.entries(value || {})) {
    const labelInfo =
      typeof label === "string"
        ? normalizeLabel(label, "self_label")
        : normalizeLabel(label?.yingyuLabel || label?.label || label?.category, label?.reasonLabel || "self_label");
    if (labelInfo) map.set(normalizePath(file), labelInfo);
  }
  return map;
}

function parseCsvLabels(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return new Map();
  const header = splitCsvLine(lines[0]).map((item) => item.trim());
  const fileIndex = header.findIndex((item) => item === "file" || item === "path");
  const labelIndex = header.findIndex((item) => ["yingyuLabel", "label", "category"].includes(item));
  const reasonIndex = header.findIndex((item) => item === "reasonLabel" || item === "reason");
  const map = new Map();
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const labelInfo = normalizeLabel(cells[labelIndex], cells[reasonIndex] || "self_label");
    if (fileIndex >= 0 && labelInfo) map.set(normalizePath(cells[fileIndex]), labelInfo);
  }
  return map;
}

function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function normalizeLabel(label, reasonLabel) {
  const key = String(label || "").trim();
  if (!["hunger", "gas", "tired", "discomfort"].includes(key)) return null;
  return {
    yingyuLabel: key,
    reasonLabel: String(reasonLabel || "self_label").trim() || "self_label"
  };
}

function normalizePath(path) {
  return toPosixPath(path).toLowerCase();
}

function toPosixPath(path) {
  return String(path || "").replaceAll("\\", "/");
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
    } else {
      yield path;
    }
  }
}

function round(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}
