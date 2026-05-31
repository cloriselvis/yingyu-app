export const reviewBuckets = [
  {
    key: "high-confidence-misses",
    label: "高置信错判",
    predicate: (row) => comparable(row) && row.confidenceLevel === "high" && row.top1 !== row.yingyuLabel,
    score: (row) => Number(row.confidenceScore || 0)
  },
  {
    key: "top2-misses",
    label: "Top-2 未覆盖",
    predicate: (row) => comparable(row) && row.top1 !== row.yingyuLabel && row.top2 !== row.yingyuLabel,
    score: (row) => margin(row)
  },
  {
    key: "high-alert",
    label: "中/高警觉",
    predicate: (row) => ["medium", "high"].includes(row.highAlertLevel),
    score: (row) => Number(row.highAlertScore || 0)
  },
  {
    key: "rejected",
    label: "质量拒判",
    predicate: (row) => row.parsed && row.decoded !== false && !row.usable && !row.error,
    score: (row) => -Number(row.qualityScore || 0)
  },
  {
    key: "top2-close-covered",
    label: "Top-2 接近且覆盖",
    predicate: (row) => comparable(row) && row.actionMode === "top2" && (row.top1 === row.yingyuLabel || row.top2 === row.yingyuLabel),
    score: (row) => -Math.abs(margin(row))
  },
  {
    key: "decode-errors",
    label: "解码错误",
    predicate: (row) => Boolean(row.error),
    score: () => 1
  }
];

export const reviewFeatureFields = [
  "featureSetVersion",
  "durationSec",
  "validCrySec",
  "cryRatio",
  "snrDb",
  "episodeCount",
  "longestEpisodeSec",
  "pitchMedian",
  "pitchP90",
  "pitchSpread",
  "spectralCentroid",
  "highBandRatio",
  "veryHighBandRatio",
  "burstiness",
  "irregularity"
];

export function buildReviewPack(rows, options = {}) {
  const limit = options.limit ?? 20;
  const selected = [];
  const seen = new Set();

  for (const bucket of reviewBuckets) {
    const matches = rows
      .filter(bucket.predicate)
      .map((row) => ({ row, bucket }))
      .sort((a, b) => bucket.score(b.row) - bucket.score(a.row))
      .slice(0, limit);

    for (const item of matches) {
      const key = item.row.file || `${item.bucket.key}:${selected.length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      selected.push(toReviewItem(item.row, item.bucket));
    }
  }

  return {
    createdAt: new Date().toISOString(),
    totalRows: rows.length,
    selectedCount: selected.length,
    buckets: Object.fromEntries(reviewBuckets.map((bucket) => [bucket.key, selected.filter((item) => item.bucket === bucket.key).length])),
    items: selected
  };
}

export function createReviewMarkdown(pack) {
  const lines = [];
  lines.push("# 哭了么离线抽听包");
  lines.push("");
  lines.push(`- 生成时间：${pack.createdAt}`);
  lines.push(`- 输入 rows：${pack.totalRows}`);
  lines.push(`- 抽听样本：${pack.selectedCount}`);
  lines.push("");
  lines.push("## 分组");
  lines.push("");
  for (const bucket of reviewBuckets) {
    lines.push(`- ${bucket.label}：${pack.buckets[bucket.key] || 0}`);
  }
  lines.push("");
  lines.push("## 抽听清单");
  lines.push("");
  lines.push("| 分组 | 文件 | 弱标签 | 来源标签 | 月龄 | Top-1 | Top-2 | 置信度 | 高警觉 | 质量 | 备注 |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | ---: | --- | ---: | --- |");
  for (const item of pack.items) {
    lines.push(
      `| ${cell(item.bucketLabel)} | ${cell(item.reviewFile || item.file)} | ${label(item.expected)} | ${cell(item.reasonLabel)} | ${cell(ageText(item))} | ${label(item.top1)} | ${label(item.top2)} | ${percent(item.confidenceScore)} | ${cell(item.highAlertLevel)} | ${percent(item.qualityScore)} | ${cell(item.note)} |`
    );
  }
  if (!pack.items.length) lines.push("| 暂无 | - | - | - | - | - | - | - | - | - | - |");
  lines.push("");
  return `${lines.join("\n").trim()}\n`;
}

export function createReviewCsv(pack) {
  const header = [
    "bucket",
    "bucketLabel",
    "file",
    "reviewFile",
    "expected",
    "reasonLabel",
    "ageBucket",
    "ageLabel",
    "comparable",
    "top1",
    "top1Score",
    "top2",
    "top2Score",
    "confidenceLevel",
    "confidenceScore",
    "actionMode",
    "highAlertLevel",
    "highAlertScore",
    "qualityScore",
    "qualityIssues",
    ...reviewFeatureFields,
    "note"
  ];
  const rows = pack.items.map((item) => header.map((key) => csvCell(Array.isArray(item[key]) ? item[key].join("、") : item[key])).join(","));
  return `${header.join(",")}\n${rows.join("\n")}${rows.length ? "\n" : ""}`;
}

export function createReviewHtml(pack) {
  const bucketButtons = [
    { key: "all", label: "全部", count: pack.items.length },
    ...reviewBuckets.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      count: pack.buckets[bucket.key] || 0
    }))
  ]
    .map(
      (bucket, index) =>
        `<button class="bucket-button${index === 0 ? " active" : ""}" type="button" data-filter="${attr(bucket.key)}"><span>${htmlEscape(bucket.label)}</span><strong>${bucket.count}</strong></button>`
    )
    .join("\n");

  const cards = pack.items.length ? pack.items.map((item, index) => createReviewCard(item, index)).join("\n") : `<p class="empty">没有需要抽听的样本。</p>`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>哭了么离线抽听包</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --text: #17202a;
      --muted: #5f6b7a;
      --line: #d9dee7;
      --accent: #12715b;
      --accent-soft: #e3f3ee;
      --warn: #9a5b00;
      --danger: #a83232;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-size: 15px;
      line-height: 1.5;
    }

    button,
    select,
    textarea {
      font: inherit;
    }

    .page {
      width: min(1120px, 100%);
      margin: 0 auto;
      padding: 20px 14px 40px;
    }

    .hero {
      display: grid;
      gap: 14px;
      margin-bottom: 16px;
    }

    h1 {
      margin: 0;
      font-size: 26px;
      line-height: 1.2;
    }

    .subhead {
      margin: 0;
      color: var(--muted);
    }

    .summary {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .metric,
    .review-card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
    }

    .metric {
      padding: 12px;
    }

    .metric span {
      display: block;
      color: var(--muted);
      font-size: 13px;
    }

    .metric strong {
      display: block;
      margin-top: 2px;
      font-size: 22px;
      line-height: 1.2;
    }

    .toolbar {
      position: sticky;
      top: 0;
      z-index: 2;
      margin: 0 -14px 14px;
      padding: 10px 14px;
      background: rgba(246, 247, 249, 0.94);
      border-top: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
      backdrop-filter: blur(10px);
    }

    .toolbar-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
    }

    .filters {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 2px;
    }

    .bucket-button,
    .export-button,
    .clear-button {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      color: var(--text);
      cursor: pointer;
      min-height: 38px;
    }

    .bucket-button {
      display: inline-flex;
      gap: 8px;
      align-items: center;
      white-space: nowrap;
      padding: 7px 10px;
    }

    .bucket-button strong {
      color: var(--muted);
      font-size: 13px;
    }

    .bucket-button.active {
      border-color: var(--accent);
      background: var(--accent-soft);
      color: var(--accent);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    .export-button {
      padding: 7px 11px;
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
    }

    .clear-button {
      padding: 7px 11px;
    }

    .pending-toggle {
      display: inline-flex;
      gap: 7px;
      align-items: center;
      color: var(--muted);
      white-space: nowrap;
    }

    .progress {
      margin-top: 8px;
      color: var(--muted);
      font-size: 13px;
    }

    .list {
      display: grid;
      gap: 12px;
    }

    .review-card {
      padding: 13px;
    }

    .review-card[hidden] {
      display: none;
    }

    .card-head {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 10px;
    }

    .title-row {
      min-width: 0;
    }

    .title-row h2 {
      margin: 0;
      font-size: 17px;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }

    .badges {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 7px;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      border-radius: 999px;
      padding: 2px 8px;
      background: #eef1f5;
      color: var(--muted);
      font-size: 12px;
    }

    .badge.warn {
      background: #fff3d8;
      color: var(--warn);
    }

    .badge.danger {
      background: #ffe4e4;
      color: var(--danger);
    }

    .index {
      flex: 0 0 auto;
      color: var(--muted);
      font-weight: 700;
    }

    audio {
      display: block;
      width: 100%;
      margin: 8px 0 10px;
    }

    .missing {
      margin: 8px 0 10px;
      padding: 8px 10px;
      border-radius: 8px;
      background: #fff3d8;
      color: var(--warn);
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .field {
      min-width: 0;
      padding: 8px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fbfcfd;
    }

    .field span {
      display: block;
      color: var(--muted);
      font-size: 12px;
    }

    .field strong {
      display: block;
      margin-top: 2px;
      overflow-wrap: anywhere;
    }

    .evidence {
      margin: 10px 0 0;
      padding: 9px 10px;
      border-left: 3px solid var(--accent);
      background: #f1f8f5;
      color: #28463e;
    }

    .annotation {
      display: grid;
      gap: 8px;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--line);
    }

    label {
      display: grid;
      gap: 5px;
      color: var(--muted);
      font-size: 13px;
    }

    select,
    textarea {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      color: var(--text);
      padding: 8px 9px;
    }

    textarea {
      min-height: 72px;
      resize: vertical;
    }

    .empty {
      margin: 20px 0;
      color: var(--muted);
      text-align: center;
    }

    @media (min-width: 760px) {
      .page {
        padding: 28px 20px 52px;
      }

      .hero {
        grid-template-columns: minmax(0, 1.2fr) minmax(360px, 0.8fr);
        align-items: end;
      }

      .summary {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      .toolbar {
        margin-left: -20px;
        margin-right: -20px;
        padding-left: 20px;
        padding-right: 20px;
      }

      .grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      .annotation {
        grid-template-columns: minmax(220px, 0.6fr) minmax(0, 1fr);
      }
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="hero">
      <div>
        <h1>哭了么离线抽听包</h1>
        <p class="subhead">先听公开数据和自采音频，标出弱标签、模型判断和音频质量谁更可信。</p>
      </div>
      <div class="summary" aria-label="抽听包概览">
        <div class="metric"><span>输入 rows</span><strong>${pack.totalRows}</strong></div>
        <div class="metric"><span>抽听样本</span><strong>${pack.selectedCount}</strong></div>
        <div class="metric"><span>已复制音频</span><strong>${pack.copiedAudio ?? "-"}</strong></div>
        <div class="metric"><span>缺失音频</span><strong>${pack.missingAudio ?? "-"}</strong></div>
      </div>
    </section>

    <section class="toolbar" aria-label="抽听工具栏">
      <div class="toolbar-row">
        <div class="filters" role="list" aria-label="分组筛选">
          ${bucketButtons}
        </div>
        <div class="actions">
          <label class="pending-toggle"><input type="checkbox" id="pending-only"> 只看未标注</label>
          <button class="export-button" type="button" id="export-json">导出标注 JSON</button>
          <button class="export-button" type="button" id="export-csv">导出标注 CSV</button>
          <button class="clear-button" type="button" id="clear-annotations">清空标注</button>
        </div>
      </div>
      <div class="progress" id="progress"></div>
    </section>

    <section class="list" id="review-list">
      ${cards}
    </section>
  </main>

  <script type="application/json" id="pack-data">${jsonForScript(pack)}</script>
  <script>
${reviewClientScript()}
  </script>
</body>
</html>
`;
}

export function reviewCopyName(item, index) {
  const ext = extension(item.file) || ".wav";
  const base = sanitizeFilename(item.file.replace(/[\\/]/g, "__").replace(/\.[^.]+$/, ""));
  return `${String(index + 1).padStart(3, "0")}__${base}${ext}`;
}

function toReviewItem(row, bucket) {
  const note = buildNote(row, bucket);
  const item = {
    bucket: bucket.key,
    bucketLabel: bucket.label,
    file: row.file || "",
    reviewFile: "",
    missingAudio: false,
    expected: row.yingyuLabel || "",
    reasonLabel: row.reasonLabel || "",
    ageBucket: row.ageBucket || row.babyProfile?.ageBucket || "",
    ageLabel: row.ageLabel || "",
    comparable: Boolean(row.comparable),
    top1: row.top1 || "",
    top1Score: round(row.top1Score),
    top2: row.top2 || "",
    top2Score: round(row.top2Score),
    confidenceLevel: row.confidenceLevel || "",
    confidenceScore: round(row.confidenceScore),
    confidenceMargin: round(row.confidenceMargin ?? margin(row)),
    actionMode: row.actionMode || "",
    highAlertLevel: row.highAlertLevel || "",
    highAlertScore: round(row.highAlertScore),
    qualityScore: round(row.qualityScore),
    qualityIssues: row.qualityIssues || [],
    questionId: row.questionId || "",
    decisionEvidence: row.decisionEvidence || [],
    note
  };
  for (const field of reviewFeatureFields) item[field] = featureValue(row[field]);
  return item;
}

function buildNote(row, bucket) {
  if (bucket.key === "high-confidence-misses") return "优先抽听：模型很确定但 Top-1 错。";
  if (bucket.key === "top2-misses") return "优先抽听：前两项都没有覆盖弱标签。";
  if (bucket.key === "high-alert") return "确认高警觉是否过度触发或漏解释。";
  if (bucket.key === "rejected") return `确认质量门控：${(row.qualityIssues || []).join("、") || "未记录原因"}`;
  if (bucket.key === "top2-close-covered") return "确认低信心 Top-2 策略是否合理。";
  if (bucket.key === "decode-errors") return row.error || "解码错误";
  return "";
}

function comparable(row) {
  return row.comparable && row.usable && row.top1 && row.yingyuLabel;
}

function margin(row) {
  return Number(row.top1Score || 0) - Number(row.top2Score || 0);
}

function extension(file) {
  const match = String(file || "").match(/(\.[^.\\/]+)$/);
  return match ? match[1] : "";
}

function sanitizeFilename(value) {
  return String(value || "sample")
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 140);
}

function csvCell(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function createReviewCard(item, index) {
  const key = itemKey(item, index);
  const audioPath = relativeUrl(item.reviewFile || item.file);
  const highAlertClass = item.highAlertLevel === "high" ? "danger" : item.highAlertLevel === "medium" ? "warn" : "";
  const qualityClass = Number(item.qualityScore || 0) < 0.45 ? "warn" : "";
  const evidence = item.decisionEvidence?.length ? `<div class="evidence">${htmlEscape(item.decisionEvidence.join(" "))}</div>` : "";
  const audio = item.missingAudio
    ? `<div class="missing">音频未复制成功：${htmlEscape(item.file)}</div>`
    : `<audio controls preload="none" src="${attr(audioPath)}"></audio>`;

  return `<article class="review-card" data-bucket="${attr(item.bucket)}" data-key="${attr(key)}" data-file="${attr(item.file)}" data-review-file="${attr(item.reviewFile)}">
  <div class="card-head">
    <div class="title-row">
      <h2>${htmlEscape(item.bucketLabel)} · ${htmlEscape(item.reviewFile || item.file || "未命名音频")}</h2>
      <div class="badges">
        <span class="badge">弱标签 ${htmlEscape(label(item.expected))}</span>
        <span class="badge">来源 ${htmlEscape(item.reasonLabel || "-")}</span>
        <span class="badge">月龄 ${htmlEscape(ageText(item))}</span>
        <span class="badge">${item.comparable ? "可比较" : "观察样本"}</span>
        <span class="badge">Top-1 ${htmlEscape(label(item.top1))}</span>
        <span class="badge">Top-2 ${htmlEscape(label(item.top2))}</span>
        <span class="badge ${attr(highAlertClass)}">高警觉 ${htmlEscape(item.highAlertLevel || "-")}</span>
        <span class="badge ${attr(qualityClass)}">质量 ${htmlEscape(percent(item.qualityScore))}</span>
      </div>
    </div>
    <div class="index">#${String(index + 1).padStart(3, "0")}</div>
  </div>
  ${audio}
  <div class="grid">
    <div class="field"><span>置信度</span><strong>${htmlEscape(item.confidenceLevel || "-")} · ${htmlEscape(percent(item.confidenceScore))}</strong></div>
    <div class="field"><span>行动模式</span><strong>${htmlEscape(item.actionMode || "-")}</strong></div>
    <div class="field"><span>Top-1 分数</span><strong>${htmlEscape(percent(item.top1Score))}</strong></div>
    <div class="field"><span>Top-2 分数</span><strong>${htmlEscape(percent(item.top2Score))}</strong></div>
    <div class="field"><span>质量问题</span><strong>${htmlEscape((item.qualityIssues || []).join("、") || "-")}</strong></div>
    <div class="field"><span>追问 ID</span><strong>${htmlEscape(item.questionId || "-")}</strong></div>
    <div class="field"><span>原始弱标签</span><strong>${htmlEscape(item.reasonLabel || "-")}</strong></div>
    <div class="field"><span>月龄档案</span><strong>${htmlEscape(ageText(item))}</strong></div>
    <div class="field"><span>备注</span><strong>${htmlEscape(item.note || "-")}</strong></div>
    <div class="field"><span>有效哭声/占比</span><strong>${htmlEscape(featurePair(item.validCrySec, "s", item.cryRatio, ""))}</strong></div>
    <div class="field"><span>音高 P50/P90</span><strong>${htmlEscape(featurePair(item.pitchMedian, "Hz", item.pitchP90, "Hz"))}</strong></div>
    <div class="field"><span>高频/很高频</span><strong>${htmlEscape(featurePair(item.highBandRatio, "", item.veryHighBandRatio, ""))}</strong></div>
    <div class="field"><span>爆发/不稳定</span><strong>${htmlEscape(featurePair(item.burstiness, "", item.irregularity, ""))}</strong></div>
  </div>
  ${evidence}
  <div class="annotation">
    <label>人工判定
      <select data-field="judgement">
        <option value="">待判断</option>
        <option value="weak_label_ok">弱标签更像对</option>
        <option value="model_top1_ok">模型 Top-1 更像对</option>
        <option value="model_top2_ok">模型 Top-2 可接受</option>
        <option value="quality_bad">音频质量不合格</option>
        <option value="safety_reasonable">高警觉合理</option>
        <option value="safety_too_sensitive">高警觉过敏</option>
        <option value="not_baby_cry">不是婴儿哭声</option>
        <option value="unclear">听不出来</option>
      </select>
    </label>
    <label>复核备注
      <textarea data-field="note" placeholder="例如：弱标签像 hungry，但声音更像困烦；背景里有成人说话；高警觉触发合理。"></textarea>
    </label>
  </div>
</article>`;
}

function reviewClientScript() {
  return `const pack = JSON.parse(document.getElementById("pack-data").textContent);
const storageKey = "yingyu-review:" + pack.createdAt + ":" + pack.totalRows + ":" + pack.selectedCount;
let annotations = loadAnnotations();
let currentFilter = "all";
let pendingOnly = false;
let saveTimer = 0;

document.querySelectorAll(".review-card").forEach(function(card) {
  const key = card.dataset.key;
  const saved = annotations[key] || {};
  const select = card.querySelector('[data-field="judgement"]');
  const note = card.querySelector('[data-field="note"]');
  select.value = saved.judgement || "";
  note.value = saved.note || "";
  select.addEventListener("change", function() { saveCard(card); });
  note.addEventListener("input", function() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(function() { saveCard(card); }, 220);
  });
});

document.querySelectorAll(".bucket-button").forEach(function(button) {
  button.addEventListener("click", function() {
    currentFilter = button.dataset.filter;
    document.querySelectorAll(".bucket-button").forEach(function(item) { item.classList.toggle("active", item === button); });
    applyFilters();
  });
});

document.getElementById("pending-only").addEventListener("change", function(event) {
  pendingOnly = event.target.checked;
  applyFilters();
});

document.getElementById("export-json").addEventListener("click", function() {
  download("yingyu-review-annotations.json", JSON.stringify(exportPayload(), null, 2), "application/json");
});

document.getElementById("export-csv").addEventListener("click", function() {
  download("yingyu-review-annotations.csv", annotationsCsv(), "text/csv;charset=utf-8");
});

document.getElementById("clear-annotations").addEventListener("click", function() {
  if (!window.confirm("清空本页所有人工标注？")) return;
  annotations = {};
  localStorage.removeItem(storageKey);
  document.querySelectorAll('[data-field="judgement"]').forEach(function(select) { select.value = ""; });
  document.querySelectorAll('[data-field="note"]').forEach(function(note) { note.value = ""; });
  updateProgress();
  applyFilters();
});

updateProgress();
applyFilters();

function saveCard(card) {
  const key = card.dataset.key;
  const judgement = card.querySelector('[data-field="judgement"]').value;
  const note = card.querySelector('[data-field="note"]').value.trim();
  if (!judgement && !note) {
    delete annotations[key];
  } else {
    annotations[key] = {
      key: key,
      bucket: card.dataset.bucket,
      file: card.dataset.file,
      reviewFile: card.dataset.reviewFile,
      judgement: judgement,
      note: note,
      updatedAt: new Date().toISOString()
    };
  }
  localStorage.setItem(storageKey, JSON.stringify(annotations));
  updateProgress();
  applyFilters();
}

function loadAnnotations() {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "{}");
  } catch {
    return {};
  }
}

function applyFilters() {
  document.querySelectorAll(".review-card").forEach(function(card) {
    const byBucket = currentFilter === "all" || card.dataset.bucket === currentFilter;
    const byPending = !pendingOnly || !annotations[card.dataset.key];
    card.hidden = !(byBucket && byPending);
  });
}

function updateProgress() {
  const reviewed = Object.keys(annotations).length;
  const total = pack.items.length;
  document.getElementById("progress").textContent = "已标注 " + reviewed + " / " + total + "，自动保存在本机浏览器 localStorage。";
}

function exportPayload() {
  return {
    exportedAt: new Date().toISOString(),
    storageKey: storageKey,
    pack: {
      createdAt: pack.createdAt,
      totalRows: pack.totalRows,
      selectedCount: pack.selectedCount,
      copiedAudio: pack.copiedAudio,
      missingAudio: pack.missingAudio,
      buckets: pack.buckets
    },
    annotations: Object.values(annotations)
  };
}

function annotationsCsv() {
  const header = ["key", "bucket", "file", "reviewFile", "judgement", "note", "updatedAt"];
  const rows = Object.values(annotations).map(function(row) {
    return header.map(function(key) { return csvCell(row[key]); }).join(",");
  });
  return header.join(",") + "\\n" + rows.join("\\n") + (rows.length ? "\\n" : "");
}

function csvCell(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\\n\\r]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}

function download(filename, content, type) {
  const blob = new Blob([content], { type: type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}`;
}

function itemKey(item, index) {
  return `${item.reviewFile || item.file || "sample"}#${index}`;
}

function relativeUrl(file) {
  return String(file || "")
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function featureValue(value) {
  return Number.isFinite(Number(value)) ? round(value) : "";
}

function featurePair(left, leftUnit, right, rightUnit) {
  const first = formatFeature(left, leftUnit);
  const second = formatFeature(right, rightUnit);
  if (first === "-" && second === "-") return "-";
  return `${first} / ${second}`;
}

function formatFeature(value, unit) {
  if (!Number.isFinite(Number(value))) return "-";
  if (unit === "Hz") return `${Math.round(Number(value))}Hz`;
  if (unit === "s") return `${round(value)}s`;
  return percent(value);
}

function jsonForScript(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
}

function htmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function attr(value) {
  return htmlEscape(value);
}

function cell(value) {
  if (value === undefined || value === null || value === "") return "-";
  return String(value).replaceAll("|", "\\|");
}

function percent(value) {
  if (!Number.isFinite(Number(value))) return "-";
  return `${Math.round(Number(value) * 1000) / 10}%`;
}

function label(key) {
  const labels = {
    hunger: "想吃奶",
    gas: "拍嗝/胀气",
    tired: "困烦/过度刺激",
    discomfort: "一般不适"
  };
  return labels[key] || key || "-";
}

function ageText(item) {
  const labels = {
    "0-2w": "0-2 weeks",
    "3-8w": "3-8 weeks",
    "9-16w": "9-16 weeks",
    preterm_or_uncertain: "preterm/uncertain"
  };
  return item.ageLabel || labels[item.ageBucket] || item.ageBucket || "-";
}

function round(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}
