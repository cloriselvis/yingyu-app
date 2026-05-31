import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { analyzeSamples } from "../audio-core.js";
import { decodeWav } from "../wav-io.js";

const execFileAsync = promisify(execFile);
const sampleRate = 16000;

test("decodeWav reads 16-bit PCM and keeps analyzable samples", async () => {
  const samples = synthCry();
  const wav = encodeWav16(samples, sampleRate);
  const decoded = decodeWav(wav);
  const features = analyzeSamples(decoded.samples, decoded.sampleRate);

  assert.equal(decoded.sampleRate, sampleRate);
  assert.equal(decoded.channelCount, 1);
  assert.equal(decoded.bitsPerSample, 16);
  assert.ok(Math.abs(decoded.durationSec - 6) < 0.01);
  assert.equal(features.quality.usable, true);
});

test("analyze-wav CLI returns JSON analysis for a wav file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yingyu-wav-"));
  const wavPath = join(dir, "cry.wav");
  await writeFile(wavPath, encodeWav16(synthCry(), sampleRate));

  const { stdout } = await execFileAsync(process.execPath, ["scripts/analyze-wav.mjs", wavPath], {
    cwd: new URL("..", import.meta.url)
  });
  const result = JSON.parse(stdout);

  assert.equal(result.file, "cry.wav");
  assert.equal(result.sampleRate, sampleRate);
  assert.equal(result.quality.usable, true);
  assert.ok(result.ranking.length >= 2);
  assert.ok(result.decisionSupport.confidence.level);
  assert.ok(["top1", "top2", "safety"].includes(result.decisionSupport.actionMode));
  assert.equal(result.features.featureSetVersion, 1);
  assert.ok(Number.isFinite(result.features.snrDb));
  assert.ok("spectralCentroid" in result.features);
});

test("benchmark-folder CLI writes one JSONL row per wav", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yingyu-bench-"));
  const nested = join(dir, "set-a");
  const out = join(dir, "results.jsonl");
  const labels = join(dir, "labels.json");
  await mkdir(nested);
  await writeFile(join(nested, "cry.wav"), encodeWav16(synthCry(), sampleRate));
  await writeFile(labels, JSON.stringify({ "set-a/cry.wav": "hunger" }), "utf8");

  await execFileAsync(process.execPath, ["scripts/benchmark-folder.mjs", dir, "--out", out, "--labels", labels], {
    cwd: new URL("..", import.meta.url)
  });
  const lines = (await readFile(out, "utf8")).trim().split("\n");
  const row = JSON.parse(lines[0]);

  assert.equal(lines.length, 1);
  assert.equal(row.file, "set-a/cry.wav");
  assert.equal(row.parsed, true);
  assert.equal(row.decoded, true);
  assert.equal(row.usable, true);
  assert.equal(row.comparable, true);
  assert.equal(row.yingyuLabel, "hunger");
  assert.ok(row.top1);
  assert.ok(row.confidenceLevel);
  assert.ok(["top1", "top2", "safety"].includes(row.actionMode));
  assert.ok(Array.isArray(row.decisionEvidence));
  assert.equal(row.featureSetVersion, 1);
  assert.ok(Number.isFinite(row.snrDb));
  assert.ok(Number.isFinite(row.episodeCount));
  assert.ok("veryHighBandRatio" in row);
});

function synthCry() {
  const samples = new Float32Array(sampleRate * 6);
  let phase = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const t = i / sampleRate;
    const cycle = 1.05;
    const inEpisode = (t % cycle) < 0.56;
    const pos = (t % cycle) / 0.56;
    const envelope = inEpisode ? Math.min(1, pos * 8, (1 - pos) * 8 + 0.2) : 0;
    phase += (2 * Math.PI * 520) / sampleRate;
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
