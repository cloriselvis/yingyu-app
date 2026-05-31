export const donateReasonMap = {
  hu: { label: "hungry", yingyu: "hunger", comparable: true },
  bu: { label: "needs_burping", yingyu: "gas", comparable: true },
  bp: { label: "belly_pain", yingyu: "gas", comparable: true },
  dc: { label: "discomfort", yingyu: "discomfort", comparable: true },
  ti: { label: "tired", yingyu: "tired", comparable: true },
  lo: { label: "lonely", yingyu: "discomfort", comparable: false },
  ch: { label: "cold_hot", yingyu: "discomfort", comparable: true },
  sc: { label: "scared", yingyu: "discomfort", comparable: false },
  dk: { label: "dont_know", yingyu: "unknown", comparable: false }
};

export const donateAgeMap = {
  "04": "0-4_weeks",
  "48": "4-8_weeks",
  "26": "2-6_months",
  "72": "7_months-2_years",
  "22": "over_2_years"
};

export const donateAgeProfileMap = {
  strict: {
    "48": { ageBucket: "3-8w", ageBucketConfidence: "aligned" }
  },
  coarse: {
    "04": { ageBucket: "0-2w", ageBucketConfidence: "coarse_0-4_weeks" },
    "48": { ageBucket: "3-8w", ageBucketConfidence: "aligned" },
    "26": { ageBucket: "9-16w", ageBucketConfidence: "coarse_2-6_months_partial_scope" }
  }
};

export function parseDonateACryFilename(filename) {
  const base = filename.split(/[\\/]/).pop() || filename;
  const extensionMatch = base.match(/\.([^.]+)$/);
  const extension = extensionMatch ? extensionMatch[1].toLowerCase() : "";
  const stem = extension ? base.slice(0, -(extension.length + 1)) : base;
  const match = stem.match(
    /^([0-9a-fA-F-]{36})-(\d{10,13})-([0-9.]+)-([mf])-([0-9]{2})-([a-z]{2})$/
  );

  if (!match) {
    return {
      ok: false,
      file: base,
      extension,
      error: "filename_does_not_match_donateacry_convention"
    };
  }

  const [, appInstanceId, timestampRaw, appVersion, gender, ageCode, reasonCode] = match;
  const timestampNumber = Number(timestampRaw);
  const timestampMs = timestampRaw.length === 13 ? timestampNumber : timestampNumber * 1000;
  const reason = donateReasonMap[reasonCode] || {
    label: "unknown_reason",
    yingyu: "unknown",
    comparable: false
  };

  return {
    ok: true,
    file: base,
    extension,
    appInstanceId,
    timestampRaw,
    timestampMs,
    recordedAt: Number.isFinite(timestampMs) ? new Date(timestampMs).toISOString() : "",
    appVersion,
    gender,
    ageCode,
    ageLabel: donateAgeMap[ageCode] || "unknown_age",
    reasonCode,
    reasonLabel: reason.label,
    yingyuLabel: reason.yingyu,
    comparable: reason.comparable && reason.yingyu !== "unknown"
  };
}

export function isDonateACryAudioFile(filename) {
  return /\.(wav|caf|3gp|m4a|mp3|aac|ogg|webm)$/i.test(filename);
}

export function isCoreAge(meta) {
  return meta.ageCode === "04" || meta.ageCode === "48";
}

export function donateAgeToBabyProfile(meta, options = {}) {
  const mode = options.mode || "strict";
  const table = donateAgeProfileMap[mode] || donateAgeProfileMap.strict;
  const mapped = table[meta?.ageCode];
  if (!mapped?.ageBucket) return {};
  return {
    ageBucket: mapped.ageBucket,
    ageBucketConfidence: mapped.ageBucketConfidence,
    ageContextMode: mode,
    sourceAgeLabel: meta.ageLabel || donateAgeMap[meta.ageCode] || "unknown_age"
  };
}

export function summarizeRows(rows) {
  const summary = {
    total: rows.length,
    parsed: 0,
    decoded: 0,
    usable: 0,
    rejected: 0,
    comparable: 0,
    evaluated: 0,
    top1Correct: 0,
    top2Correct: 0,
    coreAgeEvaluated: 0,
    coreAgeTop1Correct: 0,
    coreAgeTop2Correct: 0,
    byAge: {},
    byReason: {},
    byTop1: {},
    errors: {}
  };

  for (const row of rows) {
    if (row.parsed) summary.parsed += 1;
    if (row.decoded) summary.decoded += 1;
    if (row.usable) summary.usable += 1;
    if (row.parsed && !row.usable) summary.rejected += 1;
    if (row.comparable) summary.comparable += 1;
    bump(summary.byAge, row.ageLabel || "unknown_age");
    bump(summary.byReason, row.reasonLabel || "unknown_reason");
    bump(summary.byTop1, row.top1 || "none");
    if (row.error) bump(summary.errors, row.error);

    if (!row.comparable || !row.usable || !row.top1) continue;
    summary.evaluated += 1;
    if (row.top1 === row.yingyuLabel) summary.top1Correct += 1;
    if (row.top1 === row.yingyuLabel || row.top2 === row.yingyuLabel) summary.top2Correct += 1;

    if (row.coreAge) {
      summary.coreAgeEvaluated += 1;
      if (row.top1 === row.yingyuLabel) summary.coreAgeTop1Correct += 1;
      if (row.top1 === row.yingyuLabel || row.top2 === row.yingyuLabel) summary.coreAgeTop2Correct += 1;
    }
  }

  summary.rejectionRate = ratio(summary.rejected, summary.parsed);
  summary.top1Accuracy = ratio(summary.top1Correct, summary.evaluated);
  summary.top2Accuracy = ratio(summary.top2Correct, summary.evaluated);
  summary.coreAgeTop1Accuracy = ratio(summary.coreAgeTop1Correct, summary.coreAgeEvaluated);
  summary.coreAgeTop2Accuracy = ratio(summary.coreAgeTop2Correct, summary.coreAgeEvaluated);
  return summary;
}

function bump(target, key) {
  target[key] = (target[key] || 0) + 1;
}

function ratio(value, total) {
  return total ? Math.round((value / total) * 1000) / 1000 : 0;
}
