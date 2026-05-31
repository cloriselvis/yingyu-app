import { parseCsv } from "./enesbabycries-insights.js";

const smokeCauses = ["hunger", "discomfort", "loneliness"];
const comparableLabels = {
  hunger: "hunger",
  discomfort: "discomfort"
};

export function buildEnesBabyCriesSmokePack(datasetCsvText, options = {}) {
  const perGroup = Math.max(1, Number(options.perGroup) || 2);
  const rows = parseCsv(datasetCsvText);
  const selection = selectSmokeSessions(rows, { perGroup });

  return {
    selection,
    extractList: selection.map((item) => item.file).join("\n") + (selection.length ? "\n" : ""),
    labelsCsv: createLabelsCsv(selection),
    labelsNoAgeCsv: createLabelsNoAgeCsv(selection),
    metadataCsv: createMetadataCsv(selection),
    readme: createSmokeReadme(selection)
  };
}

export function selectSmokeSessions(rows, options = {}) {
  const perGroup = Math.max(1, Number(options.perGroup) || 2);
  const seen = new Set();
  const groups = new Map();

  for (const row of rows) {
    const file = row.file_seq_S || row.file;
    const ageMonth = row.age_month || "";
    const enesCause = row.cause_stop_engl || "";
    if (!file || !ageMonth || !smokeCauses.includes(enesCause)) continue;
    const sessionKey = `${ageMonth}:${enesCause}:${file}`;
    if (seen.has(sessionKey)) continue;
    seen.add(sessionKey);

    const key = `${ageMonth}:${enesCause}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({
      file,
      ageMonth,
      ageBucket: ageMonthToBucket(ageMonth),
      enesCause,
      baby: row.baby || "",
      yingyuLabel: comparableLabels[enesCause] || "",
      comparable: Boolean(comparableLabels[enesCause])
    });
  }

  const result = [];
  for (const key of [...groups.keys()].sort(sortAgeCauseKey)) {
    result.push(...groups.get(key).slice(0, perGroup));
  }
  return result;
}

function createLabelsCsv(selection) {
  const rows = ["file,label,reason,ageBucket,ageMonth,enesCause"];
  for (const item of selection) {
    rows.push(
      [item.file, item.yingyuLabel, `enes_${item.enesCause}_${item.ageMonth}m`, item.ageBucket, item.ageMonth, item.enesCause]
        .map(csvCell)
        .join(",")
    );
  }
  return rows.join("\n") + "\n";
}

function createLabelsNoAgeCsv(selection) {
  const rows = ["file,label,reason"];
  for (const item of selection) {
    if (!item.yingyuLabel) continue;
    rows.push([item.file, item.yingyuLabel, `enes_${item.enesCause}_${item.ageMonth}m`].map(csvCell).join(","));
  }
  return rows.join("\n") + "\n";
}

function createMetadataCsv(selection) {
  const rows = ["file,age_month,ageBucket,enesCause,yingyuLabel,comparable,baby"];
  for (const item of selection) {
    rows.push(
      [item.file, item.ageMonth, item.ageBucket, item.enesCause, item.yingyuLabel, item.comparable ? "1" : "0", item.baby]
        .map(csvCell)
        .join(",")
    );
  }
  return rows.join("\n") + "\n";
}

function createSmokeReadme(selection) {
  const lines = [];
  lines.push("# EnesBabyCries Audio Smoke Pack");
  lines.push("");
  lines.push(`Selected ${selection.length} long bout wav files from EnesBabyCries 1A.`);
  lines.push("");
  lines.push("Use the generated `extract-list.txt` with the 1A zip, then benchmark the extracted wav files:");
  lines.push("");
  lines.push("```powershell");
  lines.push("tar.exe -xf D:\\量化\\yingyu-data\\research\\enesbabycries\\audio_EnesBabyCries1A_bouts.zip -C . -T extract-list.txt");
  lines.push("npm run benchmark:wav -- . --out rows.jsonl --labels labels-no-age.csv --max-seconds 20");
  lines.push("npm run benchmark:wav -- . --out rows-age-aware.jsonl --labels labels.csv --max-seconds 20");
  lines.push("npm run report:results -- rows-age-aware.jsonl --out report-age-aware.md");
  lines.push("```");
  lines.push("");
  lines.push(
    "Every label row carries age context. Only `hunger` and `discomfort` are mapped to Yingyu labels; `loneliness` is retained as age-aware observation data, not a direct target label."
  );
  lines.push("");
  return lines.join("\n");
}

function ageMonthToBucket(value) {
  const ageMonth = Number(value);
  if (!Number.isFinite(ageMonth)) return "";
  if (ageMonth <= 0.5) return "0-2w";
  if (ageMonth <= 1.5) return "3-8w";
  if (ageMonth <= 3.5) return "9-16w";
  return "";
}

function sortAgeCauseKey(a, b) {
  const [ageA, causeA] = a.split(":");
  const [ageB, causeB] = b.split(":");
  const ageDelta = Number(ageA) - Number(ageB);
  if (ageDelta) return ageDelta;
  return smokeCauses.indexOf(causeA) - smokeCauses.indexOf(causeB);
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
