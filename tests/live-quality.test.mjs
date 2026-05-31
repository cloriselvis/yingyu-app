import assert from "node:assert/strict";
import test from "node:test";
import {
  byteTimeDomainRms,
  createLiveQualityTracker,
  summarizeLiveQuality,
  updateLiveQualityTracker
} from "../live-quality.js";

test("byteTimeDomainRms is near zero for silence", () => {
  assert.equal(byteTimeDomainRms(new Uint8Array([128, 128, 128, 128])), 0);
});

test("live quality asks user to keep recording before enough time", () => {
  const tracker = createLiveQualityTracker();
  updateLiveQualityTracker(tracker, loudFrame());

  assert.equal(summarizeLiveQuality(tracker, 1.5).text, "先录几秒");
  assert.equal(summarizeLiveQuality(tracker, 4).text, "继续录 4 秒");
});

test("live quality avoids low-volume warnings during usable recording", () => {
  const tracker = createLiveQualityTracker();
  for (let i = 0; i < 12; i += 1) updateLiveQualityTracker(tracker, new Uint8Array([127, 128, 129, 128]));

  assert.equal(summarizeLiveQuality(tracker, 5).text, "继续录 3 秒");
});

test("live quality waits for cry only when input is effectively silent", () => {
  const tracker = createLiveQualityTracker();
  for (let i = 0; i < 12; i += 1) updateLiveQualityTracker(tracker, new Uint8Array([128, 128, 128, 128]));

  assert.equal(summarizeLiveQuality(tracker, 5).text, "等待哭声");
});

test("live quality accepts softer mobile microphone frames as active", () => {
  const tracker = createLiveQualityTracker();
  for (let i = 0; i < 12; i += 1) updateLiveQualityTracker(tracker, softFrame());

  assert.equal(summarizeLiveQuality(tracker, 4).level, "recording");
});

test("live quality stays neutral when crying activity is sparse", () => {
  const tracker = createLiveQualityTracker();
  updateLiveQualityTracker(tracker, loudFrame());
  for (let i = 0; i < 15; i += 1) updateLiveQualityTracker(tracker, new Uint8Array([128, 128, 128, 128]));

  assert.equal(summarizeLiveQuality(tracker, 5).text, "继续录 3 秒");
});

test("live quality says recording can stop after enough active audio", () => {
  const tracker = createLiveQualityTracker();
  for (let i = 0; i < 20; i += 1) updateLiveQualityTracker(tracker, loudFrame());

  assert.equal(summarizeLiveQuality(tracker, 9).text, "可以停止");
  assert.equal(summarizeLiveQuality(tracker, 16).text, "已足够，建议停止");
});

function loudFrame() {
  return new Uint8Array([80, 176, 82, 174, 84, 172, 86, 170]);
}

function softFrame() {
  return new Uint8Array([124, 132, 125, 131, 126, 130, 125, 131]);
}
