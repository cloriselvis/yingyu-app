import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { buildEnesBabyCriesSmokePack } from "../enesbabycries-smoke.js";

const execFileAsync = promisify(execFile);

test("buildEnesBabyCriesSmokePack selects balanced long bouts and labels comparable causes", () => {
  const pack = buildEnesBabyCriesSmokePack(sampleRows(), { perGroup: 1 });

  assert.equal(pack.selection.length, 6);
  assert.match(pack.extractList, /a_hunger\.wav/);
  assert.match(pack.extractList, /c_lonely\.wav/);
  assert.match(pack.labelsCsv, /a_hunger\.wav,hunger,enes_hunger_0.5m/);
  assert.match(pack.labelsCsv, /b_discomfort\.wav,discomfort,enes_discomfort_0.5m/);
  assert.doesNotMatch(pack.labelsCsv, /c_lonely\.wav/);
  assert.match(pack.metadataCsv, /c_lonely\.wav,0.5,loneliness,,0,b1/);
  assert.match(pack.readme, /--max-seconds 20/);
});

test("prepare-enesbabycries-smoke CLI writes extraction list and labels", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yingyu-enes-smoke-"));
  const enes = join(dir, "enes");
  const out = join(dir, "smoke");
  await mkdir(join(enes, "data"), { recursive: true });
  await writeFile(join(enes, "data", "dataset_44605_short.csv"), sampleRows(), "utf8");

  await execFileAsync(process.execPath, ["scripts/prepare-enesbabycries-smoke.mjs", enes, "--out", out, "--per-group", "1"], {
    cwd: new URL("..", import.meta.url)
  });

  assert.match(await readFile(join(out, "extract-list.txt"), "utf8"), /a_hunger\.wav/);
  assert.match(await readFile(join(out, "labels.csv"), "utf8"), /file,label,reason/);
  assert.match(await readFile(join(out, "metadata.csv"), "utf8"), /file,age_month,enesCause/);
});

function sampleRows() {
  return [
    "file,file_seq_S,baby,age_month,cause_stop_engl",
    "a1.wav,a_hunger.wav,b1,0.5,hunger",
    "a2.wav,a_hunger.wav,b1,0.5,hunger",
    "b1.wav,b_discomfort.wav,b1,0.5,discomfort",
    "c1.wav,c_lonely.wav,b1,0.5,loneliness",
    "d1.wav,d_hunger.wav,b2,1.5,hunger",
    "e1.wav,e_discomfort.wav,b2,1.5,discomfort",
    "f1.wav,f_lonely.wav,b2,1.5,loneliness",
    "g1.wav,g_pain.wav,b3,1.5,pain"
  ].join("\n");
}
