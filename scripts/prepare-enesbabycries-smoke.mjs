import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildEnesBabyCriesSmokePack } from "../enesbabycries-smoke.js";

const root = process.argv[2];
const outArgIndex = process.argv.indexOf("--out");
const perGroupArgIndex = process.argv.indexOf("--per-group");
const outDir = outArgIndex >= 0 ? process.argv[outArgIndex + 1] : "";
const perGroup = perGroupArgIndex >= 0 ? Number(process.argv[perGroupArgIndex + 1]) : 2;

if (!root || !outDir) {
  console.error("Usage: node scripts/prepare-enesbabycries-smoke.mjs <enesbabycries-folder> --out <smoke-folder> [--per-group 2]");
  process.exit(1);
}

const csvFile = join(root, "data", "dataset_44605_short.csv");
const pack = buildEnesBabyCriesSmokePack(await readFile(csvFile, "utf8"), { perGroup });

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, "extract-list.txt"), pack.extractList, "utf8");
await writeFile(join(outDir, "labels.csv"), pack.labelsCsv, "utf8");
await writeFile(join(outDir, "metadata.csv"), pack.metadataCsv, "utf8");
await writeFile(join(outDir, "README.md"), pack.readme, "utf8");

console.error(`Prepared ${pack.selection.length} EnesBabyCries smoke files in ${outDir}`);
