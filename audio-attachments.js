export const audioAttachmentSchema = "yingyu.audio-attachment.v1";

export function buildAudioMeta({ sessionId, blob, mimeType, createdAt = Date.now(), sourceName = "" }) {
  const safeMimeType = normalizeMimeType(mimeType || blob?.type);
  return {
    schema: audioAttachmentSchema,
    sessionId: String(sessionId || ""),
    mimeType: safeMimeType,
    size: Number(blob?.size) || 0,
    createdAt,
    sourceName: typeof sourceName === "string" ? sourceName.slice(0, 160) : "",
    filename: audioFilename(sessionId, safeMimeType)
  };
}

export async function blobToAudioAttachment({ sessionId, blob, mimeType, createdAt, sourceName }) {
  const meta = buildAudioMeta({ sessionId, blob, mimeType, createdAt, sourceName });
  return {
    ...meta,
    base64: arrayBufferToBase64(await blob.arrayBuffer())
  };
}

export function audioAttachmentToBlob(attachment) {
  const bytes = base64ToBytes(attachment?.base64 || "");
  return new Blob([bytes], { type: normalizeMimeType(attachment?.mimeType) });
}

export function normalizeAudioAttachments(attachments, validSessionIds = null, options = {}) {
  const validIds = validSessionIds ? new Set(validSessionIds) : null;
  const maxAttachments = options.maxAttachments ?? 300;
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
  return (Array.isArray(attachments) ? attachments : [])
    .map((attachment) => normalizeAudioAttachment(attachment, validIds, maxBytes))
    .filter(Boolean)
    .slice(-maxAttachments);
}

export function audioFilename(sessionId, mimeType) {
  const safeId = String(sessionId || "session").replace(/[^a-zA-Z0-9_-]+/g, "_");
  return `${safeId}.${extensionForMimeType(mimeType)}`;
}

export function extensionForMimeType(mimeType = "") {
  const type = mimeType.toLowerCase();
  if (type.includes("webm")) return "webm";
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  if (type.includes("mp4") || type.includes("m4a") || type.includes("aac")) return "m4a";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("wav")) return "wav";
  return "bin";
}

export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  if (typeof btoa === "function") return btoa(binary);
  return Buffer.from(binary, "binary").toString("base64");
}

export function base64ToBytes(base64) {
  if (typeof atob === "function") {
    const binary = atob(base64);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }
  return Uint8Array.from(Buffer.from(base64, "base64"));
}

function normalizeAudioAttachment(attachment, validSessionIds, maxBytes) {
  if (!attachment || typeof attachment !== "object" || !attachment.sessionId || !attachment.base64) return null;
  const sessionId = String(attachment.sessionId);
  if (validSessionIds && !validSessionIds.has(sessionId)) return null;
  const mimeType = normalizeMimeType(attachment.mimeType);
  const size = Number(attachment.size) || estimateBase64Bytes(attachment.base64);
  if (!Number.isFinite(size) || size <= 0 || size > maxBytes) return null;
  return {
    schema: audioAttachmentSchema,
    sessionId,
    mimeType,
    size,
    createdAt: Number(attachment.createdAt) || Date.now(),
    sourceName: typeof attachment.sourceName === "string" ? attachment.sourceName.slice(0, 160) : "",
    filename: attachment.filename ? String(attachment.filename).slice(0, 180) : audioFilename(sessionId, mimeType),
    base64: String(attachment.base64)
  };
}

function normalizeMimeType(mimeType) {
  return typeof mimeType === "string" && mimeType ? mimeType.slice(0, 80) : "application/octet-stream";
}

function estimateBase64Bytes(base64) {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}
