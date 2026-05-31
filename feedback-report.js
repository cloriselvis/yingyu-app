import { audioAttachmentToBlob, normalizeAudioAttachments } from "./audio-attachments.js";
import { analyzeFeedbackExport, parseFeedbackExport } from "./feedback-insights.js";

const labels = {
  hunger: "想吃奶",
  gas: "拍嗝/胀气",
  tired: "困烦/过度刺激",
  discomfort: "一般不适",
  unresolved: "没有缓解",
  unknown: "未知"
};

const state = {
  payload: null,
  insights: null,
  audioAttachments: [],
  audioUrls: new Map(),
  activeTab: "misses"
};

const els = {
  feedbackFile: document.querySelector("#feedbackFile"),
  dropZone: document.querySelector("#dropZone"),
  summaryCards: document.querySelector("#summaryCards"),
  pilotStatus: document.querySelector("#pilotStatus"),
  pilotBox: document.querySelector("#pilotBox"),
  actionStatus: document.querySelector("#actionStatus"),
  unresolvedStatus: document.querySelector("#unresolvedStatus"),
  actionTable: document.querySelector("#actionTable"),
  unresolvedBars: document.querySelector("#unresolvedBars"),
  detailTable: document.querySelector("#detailTable"),
  tabButtons: [...document.querySelectorAll("[data-tab]")]
};

init();

function init() {
  renderEmptyMetrics();
  bindEvents();
}

function bindEvents() {
  els.feedbackFile.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (file) await loadFile(file);
    els.feedbackFile.value = "";
  });

  for (const eventName of ["dragenter", "dragover"]) {
    els.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.dropZone.classList.add("dragover");
    });
  }

  for (const eventName of ["dragleave", "drop"]) {
    els.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.dropZone.classList.remove("dragover");
    });
  }

  els.dropZone.addEventListener("drop", async (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) await loadFile(file);
  });

  els.tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.activeTab = button.dataset.tab;
      els.tabButtons.forEach((item) => item.classList.toggle("active", item === button));
      renderDetailTable();
    });
  });
}

async function loadFile(file) {
  try {
    revokeAudioUrls();
    const payload = parseFeedbackExport(await file.text());
    const validIds = payload.sessions.map((session) => session.id).filter(Boolean);
    state.payload = payload;
    state.audioAttachments = normalizeAudioAttachments(payload.audioAttachments, validIds, { maxBytes: 25 * 1024 * 1024 });
    state.insights = analyzeFeedbackExport({ ...payload, audioAttachments: state.audioAttachments }, { limit: 120 });
    createAudioUrls();
    renderAll(file.name);
  } catch (error) {
    state.payload = null;
    state.insights = null;
    state.audioAttachments = [];
    renderError(error.message);
  }
}

function renderAll(filename) {
  els.dropZone.innerHTML = `<strong>${escapeHtml(filename)}</strong><span>已加载，下面是本地反馈复盘。</span>`;
  renderMetrics();
  renderPilotBox();
  renderActionTable();
  renderUnresolvedBars();
  renderDetailTable();
}

function renderMetrics() {
  const i = state.insights;
  const cards = [
    ["宝宝", i.babyId || "未命名"],
    ["session", i.total],
    ["有效反馈", i.withResolvedFeedback],
    ["未缓解", i.unresolved],
    ["失败尝试", i.failedAttempts],
    ["Top-1", percent(i.top1MatchRate)],
    ["Top-2", percent(i.top2MatchRate)],
    ["音频", i.audioAttachmentCount]
  ];
  els.summaryCards.innerHTML = cards
    .map(([name, value]) => `<div class="metric-card"><span>${name}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
}

function renderEmptyMetrics() {
  els.summaryCards.innerHTML = ["宝宝", "session", "有效反馈", "未缓解", "失败尝试", "Top-1", "Top-2", "音频"]
    .map((name) => `<div class="metric-card"><span>${name}</span><strong>-</strong></div>`)
    .join("");
}

function renderPilotBox() {
  const pilot = state.insights.pilot;
  els.pilotStatus.textContent = pilot.verdict;
  els.pilotBox.className = `pilot-box ${pilot.status}`;
  els.pilotBox.innerHTML = `
    <div class="pilot-metrics">
      <div><span>首步有效</span><strong>${percent(pilot.firstStepEffectiveRate)}</strong></div>
      <div><span>推荐覆盖</span><strong>${percent(pilot.recommendedCoverageRate)}</strong></div>
      <div><span>平均尝试</span><strong>${numberText(pilot.avgAttemptsToOutcome)} 步</strong></div>
      <div><span>未缓解率</span><strong>${percent(pilot.unresolvedRate)}</strong></div>
    </div>
    <table>
      <thead><tr><th>检查项</th><th>通过线</th><th>当前</th><th>状态</th></tr></thead>
      <tbody>
        ${pilot.checks
          .map(
            (check) => `
              <tr>
                <td>${escapeHtml(check.name)}</td>
                <td>${escapeHtml(check.target)}</td>
                <td>${escapeHtml(check.value)}</td>
                <td><span class="status-pill ${statusClass(check.status)}">${escapeHtml(check.status)}</span></td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderActionTable() {
  const entries = Object.entries(state.insights.byAction || {}).sort((a, b) => b[1].count - a[1].count);
  els.actionStatus.textContent = entries.length ? `${entries.length} 类` : "无";
  if (!entries.length) {
    els.actionTable.className = "report-table empty-state";
    els.actionTable.textContent = "还没有有效反馈。";
    return;
  }

  els.actionTable.className = "report-table";
  els.actionTable.innerHTML = `
    <table>
      <thead>
        <tr><th>有效处理</th><th>次数</th><th>Top-1</th><th>Top-2</th><th>初判分布</th><th>缓解情况</th></tr>
      </thead>
      <tbody>
        ${entries
          .map(
            ([action, stats]) => `
              <tr>
                <td>${label(action)}</td>
                <td>${stats.count}</td>
                <td>${percent(stats.top1MatchRate)}</td>
                <td>${percent(stats.top2MatchRate)}</td>
                <td>${formatCounts(stats.predictedTop1)}</td>
                <td>${formatCounts(stats.relief)}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderUnresolvedBars() {
  const entries = Object.entries(state.insights.attemptedNoRelief || {}).sort((a, b) => b[1] - a[1]);
  els.unresolvedStatus.textContent = entries.length ? `${entries.length} 项` : "无";
  if (!entries.length) {
    els.unresolvedBars.className = "bar-list empty-state";
    els.unresolvedBars.textContent = "暂无未缓解尝试。";
    return;
  }

  const max = Math.max(...entries.map((entry) => entry[1]), 1);
  els.unresolvedBars.className = "bar-list";
  els.unresolvedBars.innerHTML = entries
    .map(
      ([name, value]) => `
        <div class="bar-item">
          <span class="bar-name">${label(name)}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.round((value / max) * 100)}%"></div></div>
          <span class="bar-value">${value}</span>
        </div>
      `
    )
    .join("");
}

function renderDetailTable() {
  if (!state.insights) {
    els.detailTable.className = "report-table empty-state";
    els.detailTable.textContent = "上传宝宝 JSON 后显示。";
    return;
  }

  const renderers = {
    misses: renderMisses,
    highAlert: renderHighAlert,
    questions: renderQuestions,
    audio: renderAudio,
    notes: renderNotes
  };
  renderers[state.activeTab]?.();
}

function renderMisses() {
  const rows = state.insights.misses || [];
  if (!rows.length) return renderEmptyDetail("暂无需要复盘的错判。");

  els.detailTable.className = "report-table";
  els.detailTable.innerHTML = `
    <table>
      <thead><tr><th>Session</th><th>有效处理</th><th>Top-1</th><th>Top-2</th><th>分数</th><th>质量</th><th>高警觉</th><th>音频</th><th>追问</th></tr></thead>
      <tbody>
        ${rows
          .map(
            (row) => `
              <tr>
                <td class="file-cell">${escapeHtml(row.id || "-")}</td>
                <td>${label(row.expected)}</td>
                <td>${label(row.top1)}</td>
                <td>${label(row.top2)}</td>
                <td>${percent(row.top1Score)}</td>
                <td>${percent(row.qualityScore)}</td>
                <td>${escapeHtml(row.highAlertLevel)}</td>
                <td>${audioCell(row.id)}</td>
                <td>${row.question ? `${escapeHtml(row.question)}:${escapeHtml(row.answer)}` : "-"}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderHighAlert() {
  const rows = state.insights.highAlert || [];
  if (!rows.length) return renderEmptyDetail("暂无中/高警觉样本。");

  els.detailTable.className = "report-table";
  els.detailTable.innerHTML = `
    <table>
      <thead><tr><th>Session</th><th>等级</th><th>分数</th><th>Top-1</th><th>反馈</th><th>是否缓解</th><th>音频</th><th>追问</th></tr></thead>
      <tbody>
        ${rows
          .map(
            (row) => `
              <tr>
                <td class="file-cell">${escapeHtml(row.id || "-")}</td>
                <td>${escapeHtml(row.level)}</td>
                <td>${percent(row.score)}</td>
                <td>${label(row.top1)}</td>
                <td>${label(row.action)}</td>
                <td>${row.resolved ? "是" : "否"}</td>
                <td>${audioCell(row.id)}</td>
                <td>${row.question ? `${escapeHtml(row.question)}:${escapeHtml(row.answer)}` : "-"}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderQuestions() {
  const entries = Object.entries(state.insights.questionAnswers || {}).sort((a, b) => b[1].count - a[1].count);
  if (!entries.length) return renderEmptyDetail("暂无追问答案记录。");

  els.detailTable.className = "report-table";
  els.detailTable.innerHTML = `
    <table>
      <thead><tr><th>追问:答案</th><th>次数</th><th>有效</th><th>未缓解</th><th>反馈分布</th></tr></thead>
      <tbody>
        ${entries
          .map(
            ([key, stats]) => `
              <tr>
                <td class="file-cell">${escapeHtml(key)}</td>
                <td>${stats.count}</td>
                <td>${stats.resolved}</td>
                <td>${stats.unresolved}</td>
                <td>${formatCounts(stats.actions)}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderAudio() {
  if (!state.audioAttachments.length) return renderEmptyDetail("这个 JSON 没有音频附件。");

  els.detailTable.className = "report-table";
  els.detailTable.innerHTML = `
    <table>
      <thead><tr><th>Session</th><th>文件</th><th>大小</th><th>播放</th></tr></thead>
      <tbody>
        ${state.audioAttachments
          .map(
            (item) => `
              <tr>
                <td class="file-cell">${escapeHtml(item.sessionId)}</td>
                <td>${escapeHtml(item.filename || "-")}</td>
                <td>${formatBytes(item.size)}</td>
                <td>${audioCell(item.sessionId)}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderNotes() {
  const notes = state.insights.calibrationNotes || [];
  if (!notes.length) return renderEmptyDetail("暂无足够反馈形成建议。");

  els.detailTable.className = "note-list";
  els.detailTable.innerHTML = notes.map((note) => `<p>${escapeHtml(note)}</p>`).join("");
}

function renderEmptyDetail(message) {
  els.detailTable.className = "report-table empty-state";
  els.detailTable.textContent = message;
}

function renderError(message) {
  revokeAudioUrls();
  els.dropZone.innerHTML = `<strong>文件解析失败</strong><span>${escapeHtml(message)}</span>`;
  renderEmptyMetrics();
  els.pilotStatus.textContent = "等待数据";
  els.pilotBox.className = "pilot-box empty-state";
  els.pilotBox.textContent = "上传宝宝 JSON 后显示。";
  els.actionStatus.textContent = "等待数据";
  els.unresolvedStatus.textContent = "等待数据";
  els.actionTable.className = "report-table empty-state";
  els.actionTable.textContent = "上传宝宝 JSON 后显示。";
  els.unresolvedBars.className = "bar-list empty-state";
  els.unresolvedBars.textContent = "上传宝宝 JSON 后显示。";
  renderEmptyDetail("上传宝宝 JSON 后显示。");
}

function createAudioUrls() {
  for (const item of state.audioAttachments) {
    state.audioUrls.set(item.sessionId, URL.createObjectURL(audioAttachmentToBlob(item)));
  }
}

function revokeAudioUrls() {
  for (const url of state.audioUrls.values()) URL.revokeObjectURL(url);
  state.audioUrls.clear();
}

function audioCell(sessionId) {
  const url = state.audioUrls.get(sessionId);
  if (!url) return "-";
  return `<audio class="mini-audio" src="${url}" controls preload="none"></audio>`;
}

function formatCounts(counts) {
  return Object.entries(counts || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([key, value]) => `${label(key)} ${value}`)
    .join("，") || "-";
}

function label(key) {
  return labels[key] || key || "-";
}

function percent(value) {
  return `${Math.round((Number(value) || 0) * 1000) / 10}%`;
}

function numberText(value) {
  return String(Math.round((Number(value) || 0) * 10) / 10);
}

function statusClass(status) {
  if (status === "达标") return "pass";
  if (status === "继续收集") return "collect";
  return "fail";
}

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes >= 1024 * 1024) return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
  if (bytes >= 1024) return `${Math.round((bytes / 1024) * 10) / 10} KB`;
  return `${bytes} B`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
