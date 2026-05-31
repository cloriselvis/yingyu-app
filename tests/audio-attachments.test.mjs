import assert from "node:assert/strict";
import test from "node:test";
import * as audioArchive from "../audio-attachments.js";

test("buildAudioMeta creates stable metadata and filename", () => {
  const blob = new Blob(["abc"], { type: "audio/webm;codecs=opus" });
  const meta = audioArchive.buildAudioMeta({
    sessionId: "yy_1",
    blob,
    createdAt: 123,
    sourceName: "recording.webm"
  });

  assert.equal(meta.schema, audioArchive.audioAttachmentSchema);
  assert.equal(meta.sessionId, "yy_1");
  assert.equal(meta.size, 3);
  assert.equal(meta.filename, "yy_1.webm");
});

test("blobToAudioAttachment and audioAttachmentToBlob round trip bytes", async () => {
  const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/wav" });
  const attachment = await audioArchive.blobToAudioAttachment({
    sessionId: "s1",
    blob,
    createdAt: 456,
    sourceName: "cry.wav"
  });
  const restored = audioArchive.audioAttachmentToBlob(attachment);

  assert.equal(attachment.filename, "s1.wav");
  assert.equal(restored.type, "audio/wav");
  assert.deepEqual(new Uint8Array(await restored.arrayBuffer()), new Uint8Array([1, 2, 3, 4]));
});

test("normalizeAudioAttachments filters unknown sessions and oversized payloads", async () => {
  const valid = await audioArchive.blobToAudioAttachment({
    sessionId: "s1",
    blob: new Blob(["abc"], { type: "audio/mp4" })
  });
  const invalidSession = { ...valid, sessionId: "other" };
  const oversized = { ...valid, sessionId: "s2", size: 99 };

  const normalized = audioArchive.normalizeAudioAttachments([invalidSession, valid, oversized], ["s1", "s2"], {
    maxBytes: 10
  });

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].sessionId, "s1");
  assert.equal(normalized[0].filename, "s1.m4a");
});

test("arrayBufferToBase64 and base64ToBytes round trip", () => {
  const bytes = new Uint8Array([5, 6, 7]);
  const base64 = audioArchive.arrayBufferToBase64(bytes.buffer);
  const restored = audioArchive.base64ToBytes(base64);

  assert.deepEqual(restored, bytes);
});
