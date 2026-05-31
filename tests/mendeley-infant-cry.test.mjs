import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import {
  buildMendeleyInfantCryManifest,
  createMendeleyLabelsCsv,
  summarizeMendeleyManifest
} from "../mendeley-infant-cry.js";

const execFileAsync = promisify(execFile);

test("buildMendeleyInfantCryManifest maps public folder ids to Yingyu labels", () => {
  const manifest = buildMendeleyInfantCryManifest(sampleMetadata());
  const summary = summarizeMendeleyManifest(manifest);
  const labelsCsv = createMendeleyLabelsCsv(manifest);

  assert.equal(manifest.length, 3);
  assert.deepEqual(summary.labels, { tired: 1, hunger: 1, discomfort: 1 });
  assert.equal(manifest[0].label, "tired");
  assert.equal(manifest[1].label, "hunger");
  assert.equal(manifest[2].label, "discomfort");
  assert.match(labelsCsv, /tired\/Bangun_Tidur.wav,tired,mendeley_tired/);
  assert.match(labelsCsv, /hunger\/hung_yasin_lapar_11.wav,hunger,mendeley_hungry/);
  assert.match(labelsCsv, /discomfort\/uncom_natan11.wav,discomfort,mendeley_uncomfortable/);
});

test("prepare-mendeley CLI writes manifest, labels, and summary", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yingyu-mendeley-"));
  const metadata = join(dir, "metadata.json");
  const out = join(dir, "prepared");
  await mkdir(out, { recursive: true });
  await writeFile(metadata, JSON.stringify(sampleMetadata()), "utf8");

  await execFileAsync(process.execPath, ["scripts/prepare-mendeley-infant-cry.mjs", metadata, "--out", out], {
    cwd: new URL("..", import.meta.url)
  });

  const labels = await readFile(join(out, "labels.csv"), "utf8");
  const summary = JSON.parse(await readFile(join(out, "summary.json"), "utf8"));
  assert.match(await readFile(join(out, "manifest.jsonl"), "utf8"), /mendeley_infant_cry_sound/);
  assert.match(labels, /file,label,reason/);
  assert.equal(summary.total, 3);
});

function sampleMetadata() {
  return {
    id: "hbppd883sd",
    version: 1,
    doi: { id: "10.17632/hbppd883sd.1" },
    data_licence: { short_name: "CC BY 4.0" },
    files: [
      file("Bangun Tidur.wav", "af085a96-8c3a-4ede-8ea5-40c759ed3d14", "audio/wav"),
      file("hung_yasin_lapar_11.wav", "ea2e554d-21b2-424a-aa81-701689891184", "audio/wav"),
      file("uncom_natan11.wav", "a7057a4c-040c-42d2-93f0-b1be92ff4af2", "audio/wav")
    ]
  };
}

function file(filename, folderId, contentType) {
  return {
    id: filename,
    filename,
    folder_id: folderId,
    size: 123,
    content_details: {
      content_type: contentType,
      sha256_hash: "abc",
      download_url: "https://example.test/file"
    }
  };
}
