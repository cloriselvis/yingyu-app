import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { analyzeSamples, featureSnapshot, getDecisionSupport, scoreAnalysis } from "../audio-core.js";
import { decodeWav } from "../wav-io.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/analyze-wav.mjs <file.wav>");
  process.exit(1);
}

const decoded = decodeWav(await readFile(file));
const features = analyzeSamples(decoded.samples, decoded.sampleRate);
const analysis = scoreAnalysis(features);
const decisionSupport = getDecisionSupport(features, analysis);

console.log(
  JSON.stringify(
    {
      file: basename(file),
      sampleRate: decoded.sampleRate,
      durationSec: decoded.durationSec,
      quality: features.quality,
      highAlertScore: analysis.highAlertScore,
      highAlertLevel: analysis.highAlertLevel,
      ranking: analysis.ranking,
      question: analysis.question,
      decisionSupport,
      features: featureSnapshot(features)
    },
    null,
    2
  )
);
