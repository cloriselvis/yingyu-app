import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { donateAgeToBabyProfile, parseDonateACryFilename, summarizeRows } from "../donateacry.js";

const execFileAsync = promisify(execFile);
const sampleRate = 16000;

test("parseDonateACryFilename parses iOS and Android conventions", () => {
  const ios = parseDonateACryFilename("0D1AD73E-4C5E-45F3-85C4-9A3CB71E8856-1430742197-1.0-m-04-hu.caf");
  const android = parseDonateACryFilename("0c8f14a9-6999-485b-97a2-913c1cbf099c-1431028888092-1.7-m-26-sc.3gp");

  assert.equal(ios.ok, true);
  assert.equal(ios.timestampMs, 1430742197000);
  assert.equal(ios.ageLabel, "0-4_weeks");
  assert.equal(ios.reasonLabel, "hungry");
  assert.equal(ios.yingyuLabel, "hunger");
  assert.equal(ios.comparable, true);

  assert.equal(android.ok, true);
  assert.equal(android.timestampMs, 1431028888092);
  assert.equal(android.ageLabel, "2-6_months");
  assert.equal(android.reasonLabel, "scared");
  assert.equal(android.yingyuLabel, "discomfort");
  assert.equal(android.comparable, false);
});

test("donateAgeToBabyProfile keeps strict and coarse age mappings separate", () => {
  const newborn = parseDonateACryFilename("0D1AD73E-4C5E-45F3-85C4-9A3CB71E8856-1430742197-1.0-m-04-hu.wav");
  const fourToEightWeeks = parseDonateACryFilename("0c8f14a9-6999-485b-97a2-913c1cbf099c-1431028888092-1.7-m-48-bu.wav");
  const twoToSixMonths = parseDonateACryFilename("0c8f14a9-6999-485b-97a2-913c1cbf099c-1431028888092-1.7-m-26-bu.wav");

  assert.deepEqual(donateAgeToBabyProfile(newborn, { mode: "strict" }), {});
  assert.equal(donateAgeToBabyProfile(fourToEightWeeks, { mode: "strict" }).ageBucket, "3-8w");
  assert.equal(donateAgeToBabyProfile(newborn, { mode: "coarse" }).ageBucket, "0-2w");
  assert.equal(donateAgeToBabyProfile(twoToSixMonths, { mode: "coarse" }).ageBucket, "9-16w");
});

test("summarizeRows reports weak-label top-1 and top-2 metrics", () => {
  const summary = summarizeRows([
    {
      parsed: true,
      decoded: true,
      usable: true,
      comparable: true,
      coreAge: true,
      ageLabel: "0-4_weeks",
      reasonLabel: "hungry",
      yingyuLabel: "hunger",
      top1: "hunger",
      top2: "gas"
    },
    {
      parsed: true,
      decoded: true,
      usable: true,
      comparable: true,
      coreAge: true,
      ageLabel: "4-8_weeks",
      reasonLabel: "needs_burping",
      yingyuLabel: "gas",
      top1: "hunger",
      top2: "gas"
    },
    {
      parsed: true,
      decoded: true,
      usable: false,
      comparable: true,
      ageLabel: "2-6_months",
      reasonLabel: "tired",
      yingyuLabel: "tired",
      top1: ""
    }
  ]);

  assert.equal(summary.total, 3);
  assert.equal(summary.evaluated, 2);
  assert.equal(summary.top1Accuracy, 0.5);
  assert.equal(summary.top2Accuracy, 1);
  assert.equal(summary.coreAgeTop2Accuracy, 1);
  assert.equal(summary.rejectionRate, 0.333);
});

test("evaluate-donateacry CLI scores wav files and writes summary", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yingyu-donate-"));
  const outRows = join(dir, "rows.jsonl");
  const outSummary = join(dir, "summary.json");
  const set = join(dir, "clips");
  await mkdir(set);

  const hungerName = "0D1AD73E-4C5E-45F3-85C4-9A3CB71E8856-1430742197-1.0-m-04-hu.wav";
  const gasName = "0c8f14a9-6999-485b-97a2-913c1cbf099c-1431028888092-1.7-m-48-bu.wav";
  await writeFile(join(set, hungerName), encodeWav16(synthCry(520), sampleRate));
  await writeFile(join(set, gasName), encodeWav16(synthCry(680), sampleRate));

  await execFileAsync(
    process.execPath,
    ["scripts/evaluate-donateacry.mjs", set, "--out", outRows, "--summary", outSummary],
    { cwd: new URL("..", import.meta.url) }
  );

  const rows = (await readFile(outRows, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  const summary = JSON.parse(await readFile(outSummary, "utf8"));

  assert.equal(rows.length, 2);
  assert.equal(summary.parsed, 2);
  assert.equal(summary.decoded, 2);
  assert.equal(summary.comparable, 2);
  assert.equal(summary.coreAgeEvaluated, 2);
  assert.equal(rows[0].ageContextMode, "none");
  assert.equal(rows[0].ageBucket, undefined);
  assert.ok("top1Accuracy" in summary);
  assert.equal(rows[0].featureSetVersion, 1);
  assert.ok(Number.isFinite(rows[0].snrDb));
  assert.ok("spectralCentroid" in rows[0]);
});

test("evaluate-donateacry CLI can pass coarse Donate-a-Cry age context", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yingyu-donate-age-"));
  const outRows = join(dir, "rows.jsonl");
  const outSummary = join(dir, "summary.json");
  const set = join(dir, "clips");
  await mkdir(set);

  const hungerName = "0D1AD73E-4C5E-45F3-85C4-9A3CB71E8856-1430742197-1.0-m-04-hu.wav";
  const gasName = "0c8f14a9-6999-485b-97a2-913c1cbf099c-1431028888092-1.7-m-48-bu.wav";
  await writeFile(join(set, hungerName), encodeWav16(synthCry(520), sampleRate));
  await writeFile(join(set, gasName), encodeWav16(synthCry(680), sampleRate));

  await execFileAsync(
    process.execPath,
    ["scripts/evaluate-donateacry.mjs", set, "--age-context", "coarse", "--out", outRows, "--summary", outSummary],
    { cwd: new URL("..", import.meta.url) }
  );

  const rows = (await readFile(outRows, "utf8")).trim().split("\n").map((line) => JSON.parse(line));

  const hunger = rows.find((row) => row.fileName === hungerName);
  const gas = rows.find((row) => row.fileName === gasName);
  assert.equal(hunger.ageContextMode, "coarse");
  assert.equal(hunger.ageBucket, "0-2w");
  assert.equal(hunger.sourceAgeLabel, "0-4_weeks");
  assert.equal(hunger.babyProfile.ageBucket, "0-2w");
  assert.equal(gas.ageBucket, "3-8w");
});

test("prepare-donateacry preserves nested paths to avoid output collisions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yingyu-prepare-"));
  const source = join(dir, "source");
  const out = join(dir, "out");
  const fileName = "0D1AD73E-4C5E-45F3-85C4-9A3CB71E8856-1430742197-1.0-m-04-hu.wav";
  await mkdir(join(source, "a"), { recursive: true });
  await mkdir(join(source, "b"), { recursive: true });
  await writeFile(join(source, "a", fileName), encodeWav16(synthCry(520), sampleRate));
  await writeFile(join(source, "b", fileName), encodeWav16(synthCry(520), sampleRate));

  await execFileAsync(
    process.execPath,
    ["scripts/prepare-donateacry.mjs", source, "--out", out, "--convert-wav"],
    { cwd: new URL("..", import.meta.url) }
  );

  const rows = (await readFile(join(out, "manifest.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

  assert.equal(rows.length, 2);
  assert.equal(rows[0].convertedWav, `a/${fileName}`);
  assert.equal(rows[1].convertedWav, `b/${fileName}`);
  assert.ok(await readFile(join(out, "a", fileName)));
  assert.ok(await readFile(join(out, "b", fileName)));
});

function synthCry(frequency) {
  const samples = new Float32Array(sampleRate * 6);
  let phase = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const t = i / sampleRate;
    const cycle = 1.05;
    const inEpisode = (t % cycle) < 0.56;
    const pos = (t % cycle) / 0.56;
    const envelope = inEpisode ? Math.min(1, pos * 8, (1 - pos) * 8 + 0.2) : 0;
    phase += (2 * Math.PI * frequency) / sampleRate;
    samples[i] = envelope * 0.16 * (Math.sin(phase) + 0.12 * Math.sin(phase * 2.02));
  }
  return samples;
}

function encodeWav16(samples, rate) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
  }
  return buffer;
}
