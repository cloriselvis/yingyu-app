const folderLabels = {
  "af085a96-8c3a-4ede-8ea5-40c759ed3d14": { label: "tired", sourceLabel: "tired" },
  "ea2e554d-21b2-424a-aa81-701689891184": { label: "hunger", sourceLabel: "hungry" },
  "a7057a4c-040c-42d2-93f0-b1be92ff4af2": { label: "discomfort", sourceLabel: "uncomfortable" }
};

export function buildMendeleyInfantCryManifest(metadata) {
  const files = Array.isArray(metadata?.files) ? metadata.files : [];
  return files.map((file) => {
    const labels = inferMendeleyLabel(file);
    const baseName = sanitizeFilename(stripAudioExtension(file.filename || file.id || "sample"));
    const wavFile = `${labels.label || "unknown"}/${baseName}.wav`;
    return {
      source: "mendeley_infant_cry_sound",
      datasetId: metadata?.id || "hbppd883sd",
      datasetVersion: metadata?.version || 1,
      doi: metadata?.doi?.id || "",
      license: metadata?.data_licence?.short_name || "",
      fileId: file.id || "",
      filename: file.filename || "",
      folderId: file.folder_id || "",
      label: labels.label,
      sourceLabel: labels.sourceLabel,
      reasonLabel: `mendeley_${labels.sourceLabel || "unknown"}`,
      contentType: file.content_details?.content_type || "",
      size: Number(file.size || file.content_details?.size || 0),
      sha256: file.content_details?.sha256_hash || "",
      downloadUrl: file.content_details?.download_url || "",
      rawFile: `${labels.label || "unknown"}/${sanitizeFilename(file.filename || file.id || "sample")}`,
      wavFile
    };
  });
}

export function createMendeleyLabelsCsv(manifest) {
  const rows = ["file,label,reason"];
  for (const item of manifest) {
    if (!item.label || item.label === "unknown") continue;
    rows.push([item.wavFile, item.label, item.reasonLabel].map(csvCell).join(","));
  }
  return `${rows.join("\n")}\n`;
}

export function createMendeleyManifestJsonl(manifest) {
  return manifest.map((item) => JSON.stringify(item)).join("\n") + (manifest.length ? "\n" : "");
}

export function summarizeMendeleyManifest(manifest) {
  const labels = {};
  const contentTypes = {};
  let totalBytes = 0;
  for (const item of manifest) {
    labels[item.label || "unknown"] = (labels[item.label || "unknown"] || 0) + 1;
    contentTypes[item.contentType || "unknown"] = (contentTypes[item.contentType || "unknown"] || 0) + 1;
    totalBytes += Number(item.size || 0);
  }
  return {
    total: manifest.length,
    labels,
    contentTypes,
    totalBytes
  };
}

function inferMendeleyLabel(file) {
  const byFolder = folderLabels[file?.folder_id];
  if (byFolder) return byFolder;

  const name = String(file?.filename || "").toLowerCase();
  if (name.startsWith("hung_") || name.includes("lapar") || name.includes("susu") || name.includes("puting")) {
    return { label: "hunger", sourceLabel: "hungry" };
  }
  if (name.startsWith("uncom_") || name.includes("gendong") || name.includes("popok")) {
    return { label: "discomfort", sourceLabel: "uncomfortable" };
  }
  if (name.includes("tidur")) return { label: "tired", sourceLabel: "tired" };
  return { label: "unknown", sourceLabel: "unknown" };
}

function stripAudioExtension(filename) {
  return String(filename || "sample").replace(/\.(wav|m4a|3gp|mp3|aac|caf)$/i, "");
}

function sanitizeFilename(value) {
  return String(value || "sample")
    .normalize("NFKD")
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/[^\w.\-()[\]_]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 140);
}

function csvCell(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
