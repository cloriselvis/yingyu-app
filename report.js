import { analyzeResultRows, parseJsonl } from "./result-insights.js";

const labels = {
  hunger: "想吃奶",
  gas: "拍嗝/胀气",
  tired: "困烦/过度刺激",
  discomfort: "一般不适",
  high: "高",
  medium: "中",
  low: "低",
  top1: "单一初判",
  top2: "Top-2 模式",
  safety: "安全优先",
  unknown: "未知"
};

const tabs = {
  highAlert: ["file", "highAlertLevel", "highAlertScore", "actionMode", "top1", "top2", "pitchP90", "highBandRatio", "burstiness", "reasonLabel"],
  lowConfidenceTop2: ["file", "yingyuLabel", "top1", "top2", "confidenceLevel", "confidenceScore", "margin", "top2Covered", "pitchP90", "irregularity", "questionId"],
  highConfidenceMisses: ["file", "yingyuLabel", "top1", "top2", "confidenceScore", "margin", "pitchP90", "highBandRatio", "burstiness", "irregularity", "decisionEvidence"],
  safetyMode: ["file", "highAlertLevel", "highAlertScore", "top1", "top2", "confidenceLevel", "decisionEvidence"],
  rejected: ["file", "qualityScore", "qualityIssues", "validCrySec", "cryRatio", "snrDb", "reasonLabel", "ageLabel"],
  top1Misses: ["file", "yingyuLabel", "top1", "top1Score", "top2", "top2Score", "confidenceLevel", "actionMode", "margin", "pitchP90", "irregularity"],
  top2Misses: ["file", "yingyuLabel", "top1", "top2", "confidenceLevel", "actionMode", "highAlertLevel", "qualityScore", "pitchP90", "highBandRatio", "irregularity"],
  closeCalls: ["file", "yingyuLabel", "top1", "top1Score", "top2", "top2Score", "margin", "pitchP90", "irregularity"],
  errors: ["file", "error"]
};

const state = {
  insights: null,
  activeTab: "highAlert"
};

const els = {
  rowsFile: document.querySelector("#rowsFile"),
  dropZone: document.querySelector("#dropZone"),
  summaryCards: document.querySelector("#summaryCards"),
  gateStatus: document.querySelector("#gateStatus"),
  gateBox: document.querySelector("#gateBox"),
  classStatus: document.querySelector("#classStatus"),
  qualityStatus: document.querySelector("#qualityStatus"),
  classTable: document.querySelector("#classTable"),
  qualityBars: document.querySelector("#qualityBars"),
  sampleTable: document.querySelector("#sampleTable"),
  tabButtons: [...document.querySelectorAll("[data-tab]")]
};

init();

function init() {
  renderEmptyMetrics();
  bindEvents();
}

function bindEvents() {
  els.rowsFile.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (file) await loadFile(file);
    els.rowsFile.value = "";
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
      renderSampleTable();
    });
  });
}

async function loadFile(file) {
  try {
    const rows = parseJsonl(await file.text());
    state.insights = analyzeResultRows(rows, { limit: 80 });
    renderAll(file.name);
  } catch (error) {
    state.insights = null;
    renderError(error.message);
  }
}

function renderAll(filename) {
  els.dropZone.innerHTML = `<strong>${escapeHtml(filename)}</strong><span>已加载，下面是本地分析结果。</span>`;
  renderMetrics();
  renderGateBox();
  renderClassTable();
  renderQualityBars();
  renderSampleTable();
}

function renderMetrics() {
  const i = state.insights;
  const cards = [
    ["总样本", i.total],
    ["可分析", i.usable],
    ["拒判率", percent(i.rejectionRate)],
    ["Top-1", percent(i.top1Accuracy)],
    ["Top-2", percent(i.top2Accuracy)],
    ["多数类基线", percent(i.majorityTop1Accuracy)],
    ["低信心", i.confidenceLevels.low || 0],
    ["Top-2模式", i.actionModes.top2 || 0],
    ["高信心错判", i.highConfidenceMisses.length],
    ["高警觉", i.highAlertCount || i.highAlert.length]
  ];
  els.summaryCards.innerHTML = cards
    .map(([name, value]) => `<div class="metric-card"><span>${name}</span><strong>${value}</strong></div>`)
    .join("");
}

function renderGateBox() {
  const gate = state.insights.algorithmGate;
  els.gateStatus.textContent = gate.verdict;
  els.gateBox.className = `pilot-box ${gate.status}`;
  els.gateBox.innerHTML = `
    <table>
      <thead><tr><th>检查项</th><th>通过线</th><th>当前</th><th>状态</th></tr></thead>
      <tbody>
        ${gate.checks
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

function renderEmptyMetrics() {
  els.summaryCards.innerHTML = ["总样本", "可分析", "拒判率", "Top-1", "Top-2", "多数类基线", "低信心", "Top-2模式", "高信心错判", "高警觉"]
    .map((name) => `<div class="metric-card"><span>${name}</span><strong>-</strong></div>`)
    .join("");
  els.gateStatus.textContent = "等待数据";
  els.gateBox.className = "pilot-box empty-state";
  els.gateBox.textContent = "上传 rows.jsonl 后显示。";
}

function renderClassTable() {
  const entries = Object.entries(state.insights.byExpected || {}).sort((a, b) => b[1].count - a[1].count);
  els.classStatus.textContent = `${entries.length} 类`;
  if (!entries.length) {
    els.classTable.className = "report-table empty-state";
    els.classTable.textContent = "没有可比较类别。";
    return;
  }

  els.classTable.className = "report-table";
  els.classTable.innerHTML = `
    <table>
      <thead>
        <tr><th>弱标签</th><th>样本</th><th>Top-1</th><th>Top-2</th><th>最常预测</th></tr>
      </thead>
      <tbody>
        ${entries
          .map(
            ([key, stats]) => `
              <tr>
                <td>${label(key)}</td>
                <td>${stats.count}</td>
                <td>${percent(stats.top1Accuracy)}</td>
                <td>${percent(stats.top2Accuracy)}</td>
                <td>${formatCounts(stats.predicted)}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderQualityBars() {
  const entries = Object.entries(state.insights.qualityIssues || {}).sort((a, b) => b[1] - a[1]);
  els.qualityStatus.textContent = entries.length ? `${entries.length} 项` : "无";
  if (!entries.length) {
    els.qualityBars.className = "bar-list empty-state";
    els.qualityBars.textContent = "没有质量门控问题记录。";
    return;
  }

  const max = Math.max(...entries.map((entry) => entry[1]), 1);
  els.qualityBars.className = "bar-list";
  els.qualityBars.innerHTML = entries
    .map(
      ([name, value]) => `
        <div class="bar-item">
          <span class="bar-name">${escapeHtml(name)}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.round((value / max) * 100)}%"></div></div>
          <span class="bar-value">${value}</span>
        </div>
      `
    )
    .join("");
}

function renderSampleTable() {
  if (!state.insights) {
    els.sampleTable.className = "report-table empty-state";
    els.sampleTable.textContent = "上传 rows.jsonl 后显示。";
    return;
  }

  const rows = state.insights[state.activeTab] || [];
  const columns = tabs[state.activeTab] || ["file"];
  if (!rows.length) {
    els.sampleTable.className = "report-table empty-state";
    els.sampleTable.textContent = "没有样本。";
    return;
  }

  els.sampleTable.className = "report-table";
  els.sampleTable.innerHTML = `
    <table>
      <thead><tr>${columns.map((column) => `<th>${column}</th>`).join("")}</tr></thead>
      <tbody>
        ${rows
          .map(
            (row) => `
              <tr>
                ${columns.map((column) => `<td class="${column === "file" ? "file-cell" : ""}">${formatCell(row[column], column)}</td>`).join("")}
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderError(message) {
  els.dropZone.innerHTML = `<strong>文件解析失败</strong><span>${escapeHtml(message)}</span>`;
  renderEmptyMetrics();
  els.classStatus.textContent = "等待数据";
  els.gateStatus.textContent = "等待数据";
  els.gateBox.className = "pilot-box empty-state";
  els.gateBox.textContent = "上传 rows.jsonl 后显示。";
  els.qualityStatus.textContent = "等待数据";
  els.classTable.className = "report-table empty-state";
  els.classTable.textContent = "上传 rows.jsonl 后显示。";
  els.qualityBars.className = "bar-list empty-state";
  els.qualityBars.textContent = "上传 rows.jsonl 后显示。";
  renderSampleTable();
}

function formatCell(value, column) {
  if (Array.isArray(value)) return escapeHtml(value.join("、") || "-");
  if (value === undefined || value === null || value === "") return "-";
  if (["top1", "top2", "yingyuLabel"].includes(column)) return label(value);
  if (["confidenceLevel", "actionMode"].includes(column)) return label(value);
  if (column === "top2Covered") return value ? "覆盖" : "未覆盖";
  if (typeof value === "number") return `<span class="score-pill">${round(value)}</span>`;
  return escapeHtml(String(value));
}

function formatCounts(counts) {
  return Object.entries(counts || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([key, value]) => `${label(key)} ${value}`)
    .join("，");
}

function label(key) {
  return labels[key] || key || "-";
}

function percent(value) {
  return `${Math.round((Number(value) || 0) * 1000) / 10}%`;
}

function round(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

function statusClass(status) {
  if (status === "达标") return "pass";
  if (status === "继续收集" || status === "继续抽听") return "collect";
  return "fail";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
