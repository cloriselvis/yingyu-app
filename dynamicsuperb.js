export const dynamicSuperbLabelMap = {
  hungry: { yingyu: "hunger", comparable: true },
  "needs burping": { yingyu: "gas", comparable: true },
  "belly pain": { yingyu: "gas", comparable: true },
  discomfort: { yingyu: "discomfort", comparable: true },
  "cold/hot": { yingyu: "discomfort", comparable: true },
  tired: { yingyu: "tired", comparable: true },
  lonely: { yingyu: "discomfort", comparable: false },
  scared: { yingyu: "discomfort", comparable: false },
  "don't know": { yingyu: "unknown", comparable: false }
};

export function normalizeDynamicSuperbLabel(label) {
  const normalized = String(label || "")
    .trim()
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", "/")
    .replace(/\s+/g, " ");
  if (normalized === "cold hot") return "cold/hot";
  if (normalized === "dont know") return "don't know";
  return normalized;
}

export function mapDynamicSuperbLabel(label) {
  const sourceLabel = normalizeDynamicSuperbLabel(label);
  const mapped = dynamicSuperbLabelMap[sourceLabel] || { yingyu: "unknown", comparable: false };
  return {
    sourceLabel,
    yingyuLabel: mapped.yingyu,
    comparable: mapped.comparable && mapped.yingyu !== "unknown",
    reasonLabel: `dynamicsuperb_${slug(sourceLabel)}`
  };
}

export function createDynamicSuperbRows(sourceRows) {
  return sourceRows.map((row) => {
    const fileId = safeFileId(row.fileId || row.file || row.file_id);
    const mapped = mapDynamicSuperbLabel(row.sourceLabel || row.label);
    return {
      file: `${fileId}.wav`,
      sourceFile: row.sourceFile || `${fileId}.caf`,
      sourceLabel: mapped.sourceLabel,
      label: mapped.comparable ? mapped.yingyuLabel : "",
      reason: mapped.reasonLabel,
      comparable: mapped.comparable,
      instruction: row.instruction || ""
    };
  });
}

export function createDynamicSuperbLabelsCsv(rows) {
  const header = ["file", "label", "reason", "sourceLabel", "comparable"];
  const lines = [header.join(",")];
  for (const row of rows) lines.push(header.map((key) => csvCell(row[key])).join(","));
  return `${lines.join("\n")}\n`;
}

export function summarizeDynamicSuperbRows(rows) {
  const summary = {
    total: rows.length,
    comparable: 0,
    bySourceLabel: {},
    byYingyuLabel: {}
  };
  for (const row of rows) {
    bump(summary.bySourceLabel, row.sourceLabel || "unknown");
    bump(summary.byYingyuLabel, row.label || "observation_only");
    if (row.comparable) summary.comparable += 1;
  }
  return summary;
}

function safeFileId(value) {
  const safe = String(value || "audio")
    .trim()
    .replace(/[^A-Za-z0-9_.-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safe || "audio";
}

function slug(value) {
  return String(value || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function csvCell(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function bump(target, key) {
  target[key] = (target[key] || 0) + 1;
}
