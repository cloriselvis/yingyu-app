import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { analyzeSamples, featureSnapshot, getDecisionSupport, scoreAnalysis } from "../audio-core.js";
import {
  donateAgeToBabyProfile,
  isCoreAge,
  isDonateACryAudioFile,
  parseDonateACryFilename,
  summarizeRows
} from "../donateacry.js";
import { decodeWav } from "../wav-io.js";

const root = process.argv[2];
const outArgIndex = process.argv.indexOf("--out");
const summaryArgIndex = process.argv.indexOf("--summary");
const ageContextArgIndex = process.argv.indexOf("--age-context");
const outFile = outArgIndex >= 0 ? process.argv[outArgIndex + 1] : "";
const summaryFile = summaryArgIndex >= 0 ? process.argv[summaryArgIndex + 1] : "";
const ageContextMode = ageContextArgIndex >= 0 ? process.argv[ageContextArgIndex + 1] : "none";

if (!root) {
  console.error(
    "Usage: node scripts/evaluate-donateacry.mjs <donateacry-folder> [--out rows.jsonl] [--summary summary.json] [--age-context none|strict|coarse]"
  );
  process.exit(1);
}

if (!["none", "strict", "coarse"].includes(ageContextMode)) {
  console.error("--age-context must be one of: none, strict, coarse");
  process.exit(1);
}

const rows = [];
for await (const file of walk(root)) {
  if (!isDonateACryAudioFile(file)) continue;
  const meta = parseDonateACryFilename(file);
  const row = {
    ...meta,
    file: relative(root, file),
    fileName: meta.file,
    parsed: meta.ok
  };

  if (!meta.ok) {
    rows.push(row);
    continue;
  }

  row.coreAge = isCoreAge(meta);
  row.ageContextMode = ageContextMode;
  if (ageContextMode !== "none") {
    const ageProfile = donateAgeToBabyProfile(meta, { mode: ageContextMode });
    if (ageProfile.ageBucket) {
      row.ageBucket = ageProfile.ageBucket;
      row.sourceAgeLabel = ageProfile.sourceAgeLabel;
      row.ageBucketConfidence = ageProfile.ageBucketConfidence;
      row.babyProfile = { ageBucket: ageProfile.ageBucket };
    }
  }

  if (meta.extension !== "wav") {
    row.error = "unsupported_audio_extension_convert_to_wav_first";
    rows.push(row);
    continue;
  }

  try {
    const decoded = decodeWav(await readFile(file));
    const features = analyzeSamples(decoded.samples, decoded.sampleRate);
    const scoreOptions = row.babyProfile?.ageBucket ? { babyProfile: row.babyProfile } : {};
    const analysis = scoreAnalysis(features, scoreOptions);
    const support = getDecisionSupport(features, analysis, scoreOptions);
    row.decoded = true;
    row.sampleRate = decoded.sampleRate;
    row.usable = features.quality.usable;
    row.qualityScore = round(features.quality.score);
    row.qualityIssues = features.quality.issues;
    row.highAlertScore = round(analysis.highAlertScore);
    row.highAlertLevel = analysis.highAlertLevel;
    row.top1 = analysis.ranking[0]?.key || "";
    row.top1Score = round(analysis.ranking[0]?.score || 0);
    row.top2 = analysis.ranking[1]?.key || "";
    row.top2Score = round(analysis.ranking[1]?.score || 0);
    row.confidenceLevel = support.confidence.level;
    row.confidenceScore = round(support.confidence.score);
    row.confidenceMargin = round(support.confidence.margin);
    row.actionMode = support.actionMode;
    row.questionId = analysis.question?.id || "";
    row.decisionEvidence = support.evidence;
    Object.assign(row, featureSnapshot(features));
  } catch (error) {
    row.error = error.message;
  }

  rows.push(row);
}

const summary = summarizeRows(rows);
const rowOutput = rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : "");

if (outFile) {
  await writeFile(outFile, rowOutput, "utf8");
} else {
  process.stdout.write(rowOutput);
}

if (summaryFile) {
  await writeFile(summaryFile, JSON.stringify(summary, null, 2), "utf8");
} else {
  console.error(JSON.stringify(summary, null, 2));
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

function round(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}
