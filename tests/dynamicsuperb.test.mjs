import assert from "node:assert/strict";
import test from "node:test";
import {
  createDynamicSuperbLabelsCsv,
  createDynamicSuperbRows,
  mapDynamicSuperbLabel,
  normalizeDynamicSuperbLabel,
  summarizeDynamicSuperbRows
} from "../dynamicsuperb.js";

test("mapDynamicSuperbLabel maps source labels to Yingyu weak labels", () => {
  assert.deepEqual(mapDynamicSuperbLabel("hungry"), {
    sourceLabel: "hungry",
    yingyuLabel: "hunger",
    comparable: true,
    reasonLabel: "dynamicsuperb_hungry"
  });
  assert.equal(mapDynamicSuperbLabel("needs burping").yingyuLabel, "gas");
  assert.equal(mapDynamicSuperbLabel("belly pain").yingyuLabel, "gas");
  assert.equal(mapDynamicSuperbLabel("cold/hot").yingyuLabel, "discomfort");
  assert.equal(mapDynamicSuperbLabel("lonely").comparable, false);
  assert.equal(mapDynamicSuperbLabel("don't know").yingyuLabel, "unknown");
});

test("normalizeDynamicSuperbLabel accepts label spelling variants", () => {
  assert.equal(normalizeDynamicSuperbLabel(" Cold-Hot "), "cold/hot");
  assert.equal(normalizeDynamicSuperbLabel("dont know"), "don't know");
});

test("createDynamicSuperbRows builds benchmark labels and observation-only rows", () => {
  const rows = createDynamicSuperbRows([
    { fileId: "audio 1", sourceLabel: "hungry", instruction: "classify" },
    { fileId: "audio/2", sourceLabel: "lonely", instruction: "classify" }
  ]);
  const summary = summarizeDynamicSuperbRows(rows);
  const csv = createDynamicSuperbLabelsCsv(rows);

  assert.equal(rows[0].file, "audio_1.wav");
  assert.equal(rows[0].label, "hunger");
  assert.equal(rows[1].label, "");
  assert.equal(rows[1].comparable, false);
  assert.equal(summary.total, 2);
  assert.equal(summary.comparable, 1);
  assert.match(csv, /file,label,reason,sourceLabel,comparable/);
  assert.match(csv, /audio_1.wav,hunger,dynamicsuperb_hungry,hungry,true/);
});
