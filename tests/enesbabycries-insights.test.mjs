import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import {
  analyzeEnesBabyCriesRows,
  createEnesBabyCriesMarkdown,
  parseCsv
} from "../enesbabycries-insights.js";

const execFileAsync = promisify(execFile);

test("parseCsv handles quoted fields and returns object rows", () => {
  const rows = parseCsv('"a","b"\n"1","two, three"\n');

  assert.deepEqual(rows, [{ a: "1", b: "two, three" }]);
});

test("analyzeEnesBabyCriesRows summarizes age, cause, features, and RF matrices", () => {
  const insights = analyzeEnesBabyCriesRows(parseCsv(sampleDataset()), {
    ageEffects: parseCsv(sampleAgeEffects()),
    ageRfMatrix: parseCsv(sampleAgeRf()),
    causeRfMatrix: parseCsv(sampleCauseRf())
  });

  assert.equal(insights.total, 6);
  assert.equal(insights.babyCount, 3);
  assert.equal(insights.ages.length, 3);
  assert.equal(insights.ages[0].ageMonth, "0.5");
  assert.equal(insights.ages[0].causeCounts.hunger, 2);
  assert.equal(insights.causes[0].cause, "hunger");
  assert.equal(Math.round(insights.featuresByAge["0.5"].pitchHz.mean), 443);
  assert.ok(insights.ageRf.lift > 1.5);
  assert.ok(insights.causeRf.lift < 1.3);
  assert.equal(insights.ageEffects.significant[0].predictor, "entropyVoiced_median_S");
});

test("createEnesBabyCriesMarkdown renders product implications", () => {
  const report = createEnesBabyCriesMarkdown(
    analyzeEnesBabyCriesRows(parseCsv(sampleDataset()), {
      ageEffects: parseCsv(sampleAgeEffects()),
      ageRfMatrix: parseCsv(sampleAgeRf()),
      causeRfMatrix: parseCsv(sampleCauseRf())
    })
  );

  assert.match(report, /EnesBabyCries 数据报告/);
  assert.match(report, /月龄分层/);
  assert.match(report, /年龄 RF 矩阵/);
  assert.match(report, /原因分类要谨慎/);
});

test("report-enesbabycries CLI writes markdown report from folder layout", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yingyu-enes-"));
  await mkdir(join(dir, "data"), { recursive: true });
  await mkdir(join(dir, "source-data-for-figures"), { recursive: true });
  await writeFile(join(dir, "data", "dataset_44605_short.csv"), sampleDataset(), "utf8");
  await writeFile(join(dir, "source-data-for-figures", "fig1a_ac~age.csv"), sampleAgeEffects(), "utf8");
  await writeFile(join(dir, "source-data-for-figures", "fig2b_RF-matrix.csv"), sampleAgeRf(), "utf8");
  await writeFile(join(dir, "source-data-for-figures", "fig3b_RF-matrix.csv"), sampleCauseRf(), "utf8");
  const outFile = join(dir, "report.md");

  await execFileAsync(process.execPath, ["scripts/report-enesbabycries.mjs", dir, "--out", outFile], {
    cwd: new URL("..", import.meta.url)
  });

  const report = await readFile(outFile, "utf8");
  assert.match(report, /分段样本：6/);
  assert.match(report, /loneliness 不能直接等价/);
});

function sampleDataset() {
  return [
    "file,file_seq_S,baby,age_month,cause_stop_engl,duration_segment_P,pitch_median_S,entropyVoiced_median_S,HNRVoiced_median_S,specCentroidVoiced_median_S,voiced_S,jitter_P,shimmer_P",
    "a.wav,s1,b1,0.5,hunger,0.70,440,0.34,4.1,1300,0.52,0.11,0.20",
    "b.wav,s2,b1,0.5,hunger,0.80,445,0.35,4.0,1290,0.54,0.10,0.22",
    "c.wav,s3,b2,1.5,discomfort,0.85,438,0.32,4.3,1220,0.57,0.09,0.18",
    "d.wav,s4,b2,1.5,loneliness,0.82,450,0.30,4.5,1200,0.58,0.08,0.17",
    "e.wav,s5,b3,2.5,loneliness,0.90,462,0.29,4.8,1160,0.61,0.07,0.15",
    "f.wav,s6,b3,2.5,DK,0.88,455,0.31,4.7,1180,0.60,0.07,0.15"
  ].join("\n");
}

function sampleAgeEffects() {
  return [
    "predictor,fit,lwr,upr,pp,panel",
    "entropyVoiced_median_S,-1.25,-1.64,-0.87,0,Change",
    "pitch_median_S,0.32,0.13,0.52,0.999,Change",
    "jitter_P,-0.15,-0.47,0.14,0.148,Change"
  ].join("\n");
}

function sampleAgeRf() {
  return ['"0.5","1.5","2.5"', "5.2,3.6,2.5", "4.0,5.4,3.3", "2.4,3.8,5.7"].join("\n");
}

function sampleCauseRf() {
  return ['"hunger","discomfort","loneliness"', "1.2,1.0,0.9", "1.1,1.2,1.1", "0.9,1.1,1.0"].join("\n");
}
