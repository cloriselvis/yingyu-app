import * as core from "./audio-core.js";
import * as audioArchive from "./audio-attachments.js";
import * as audioStore from "./audio-store.js";
import * as feedbackStore from "./feedback-store.js";
import * as liveQuality from "./live-quality.js";

const els = {
  babyName: document.querySelector("#babyName"),
  recordBtn: document.querySelector("#recordBtn"),
  stopBtn: document.querySelector("#stopBtn"),
  audioFile: document.querySelector("#audioFile"),
  keepAudio: document.querySelector("#keepAudio"),
  environmentHint: document.querySelector("#environmentHint"),
  waveform: document.querySelector("#waveform"),
  recordState: document.querySelector("#recordState"),
  timer: document.querySelector("#timer"),
  liveQuality: document.querySelector("#liveQuality"),
  analysisStatus: document.querySelector("#analysisStatus"),
  actionStatus: document.querySelector("#actionStatus"),
  contextPanel: document.querySelector("#contextPanel"),
  contextStatus: document.querySelector("#contextStatus"),
  contextQuestions: document.querySelector("#contextQuestions"),
  contextContinue: document.querySelector("#contextContinue"),
  contextSkip: document.querySelector("#contextSkip"),
  resultGrid: document.querySelector("#resultGrid"),
  summary: document.querySelector("#summary"),
  ranking: document.querySelector("#ranking"),
  questionBox: document.querySelector("#questionBox"),
  actionPlan: document.querySelector("#actionPlan"),
  feedbackBox: document.querySelector("#feedbackBox"),
  detailPanel: document.querySelector("#detailPanel"),
  features: document.querySelector("#features"),
  recentFeedback: document.querySelector("#recentFeedback"),
  recentStatus: document.querySelector("#recentStatus"),
  importBaby: document.querySelector("#importBaby"),
  exportBaby: document.querySelector("#exportBaby"),
  resetBaby: document.querySelector("#resetBaby")
};

const labels = {
  hunger: "想吃奶",
  gas: "拍嗝/胀气",
  tired: "困烦/过度刺激",
  discomfort: "一般不适"
};

const featureLabels = {
  durationSec: "录音时长",
  validCrySec: "有效哭声",
  cryRatio: "哭声占比",
  snrDb: "信噪估计",
  pitchMedian: "中位音高",
  pitchP90: "高位音高",
  highBandRatio: "尖锐度",
  burstiness: "爆发度",
  episodeCount: "哭声段数",
  irregularity: "不稳定度"
};

const state = {
  audioContext: null,
  stream: null,
  recorder: null,
  chunks: [],
  startedAt: 0,
  timerId: null,
  autoStopId: null,
  analyser: null,
  liveSource: null,
  animationId: null,
  liveQualityTracker: null,
  current: null,
  adjustedByQuestion: false,
  questionAnswer: null,
  pendingContextQuestions: [],
  contextAnswers: [],
  currentAttempts: [],
  pendingFeedbackAction: null,
  feedbackSaved: false,
  currentBlob: null,
  currentMimeType: "",
  currentSourceName: ""
};

init();

function init() {
  els.babyName.value = localStorage.getItem("yingyu:lastBaby") || "宝宝";
  els.keepAudio.checked = localStorage.getItem("yingyu:keepAudio") === "1";
  setStage("capture");
  drawIdleWave();
  renderEmptyFeatures();
  renderRecentFeedback();
  renderEnvironmentHint();
  bindEvents();
}

function bindEvents() {
  els.recordBtn.addEventListener("click", startRecording);
  els.stopBtn.addEventListener("click", stopRecording);

  els.audioFile.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await analyzeBlob(file, file.name);
    els.audioFile.value = "";
  });

  els.babyName.addEventListener("change", () => {
    localStorage.setItem("yingyu:lastBaby", cleanBabyId());
    state.feedbackSaved = false;
    state.currentAttempts = [];
    state.pendingFeedbackAction = null;
    renderRecentFeedback();
    if (state.current) {
      const updated = core.scoreAnalysis(state.current.features, { history: loadHistory() });
      state.current = { ...state.current, ...updated };
      renderAnalysis(state.current);
    }
  });

  els.keepAudio.addEventListener("change", () => {
    localStorage.setItem("yingyu:keepAudio", els.keepAudio.checked ? "1" : "0");
  });

  els.contextContinue.addEventListener("click", () => finishContextQuestions(true));
  els.contextSkip.addEventListener("click", () => finishContextQuestions(false));

  els.resetBaby.addEventListener("click", async () => {
    const sessionIds = loadSessions().map((session) => session.id).filter(Boolean);
    await audioStore.deleteSessionAudios(sessionIds).catch(() => {});
    localStorage.removeItem(historyKey());
    localStorage.removeItem(sessionsKey());
    state.feedbackSaved = false;
    state.currentAttempts = [];
    state.pendingFeedbackAction = null;
    renderRecentFeedback();
    if (state.current) {
      const updated = core.scoreAnalysis(state.current.features, { history: loadHistory() });
      state.current = { ...state.current, ...updated };
      renderAnalysis(state.current);
    }
  });

  els.importBaby.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await importBabyData(file);
    els.importBaby.value = "";
  });

  els.exportBaby.addEventListener("click", exportBabyData);
}

async function getAudioContext() {
  if (!state.audioContext) {
    state.audioContext = new AudioContext();
  }
  if (state.audioContext.state === "suspended") {
    await state.audioContext.resume();
  }
  return state.audioContext;
}

async function startRecording() {
  try {
    setStage("capture");
    state.pendingContextQuestions = [];
    state.contextAnswers = [];
    state.adjustedByQuestion = false;
    state.questionAnswer = null;
    if (!canUseMicrophone()) {
      renderError("当前地址不能直接录音。手机测试请用 HTTPS 链接；现在可以先上传音频。");
      return;
    }
    const audioContext = await getAudioContext();
    state.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });

    state.chunks = [];
    const options = getRecorderOptions();
    state.recorder = new MediaRecorder(state.stream, options);
    state.recorder.addEventListener("dataavailable", (event) => {
      if (event.data?.size) state.chunks.push(event.data);
    });
    state.recorder.addEventListener("stop", () => {
      const blob = new Blob(state.chunks, { type: state.recorder.mimeType || "audio/webm" });
      cleanupRecording();
      analyzeBlob(blob, "recording.webm");
    });

    state.liveSource = audioContext.createMediaStreamSource(state.stream);
    state.analyser = audioContext.createAnalyser();
    state.analyser.fftSize = 2048;
    state.liveSource.connect(state.analyser);

    state.startedAt = Date.now();
    state.liveQualityTracker = liveQuality.createLiveQualityTracker();
    state.recorder.start(250);
    state.timerId = window.setInterval(updateTimer, 200);
    state.autoStopId = window.setTimeout(stopRecording, 15000);

    els.recordBtn.classList.add("recording");
    els.recordBtn.disabled = true;
    els.stopBtn.disabled = false;
    els.recordState.textContent = "正在录音";
    els.liveQuality.textContent = "建议 8-15 秒";
    drawLiveWave();
  } catch (error) {
    renderError("无法使用麦克风。请检查浏览器权限，或上传一段音频。");
    cleanupRecording();
  }
}

function getRecorderOptions() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus"
  ];
  const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type));
  return mimeType ? { mimeType } : {};
}

function stopRecording() {
  if (state.recorder && state.recorder.state !== "inactive") {
    state.recorder.stop();
  }
}

function cleanupRecording() {
  window.clearInterval(state.timerId);
  window.clearTimeout(state.autoStopId);
  cancelAnimationFrame(state.animationId);
  state.timerId = null;
  state.autoStopId = null;
  state.liveQualityTracker = null;

  if (state.liveSource) {
    state.liveSource.disconnect();
    state.liveSource = null;
  }
  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
    state.stream = null;
  }

  els.recordBtn.classList.remove("recording");
  els.recordBtn.disabled = false;
  els.stopBtn.disabled = true;
  updateTimer(0);
}

async function analyzeBlob(blob, sourceName) {
  try {
    els.recordState.textContent = "正在分析";
    els.liveQuality.textContent = "处理中";
    els.analysisStatus.textContent = "分析中";

    const audioContext = await getAudioContext();
    const arrayBuffer = await blob.arrayBuffer();
    const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const samples = extractMono(decoded);
    analyzeSamplesDirect(samples, decoded.sampleRate, sourceName, {
      blob,
      mimeType: blob.type || "",
      errorMessage: "这段音频无法分析，请换一段更清楚的哭声。"
    });
  } catch (error) {
    renderError("这段音频无法解码，请换一段 wav、mp3、m4a 或 webm 音频。");
  }
}

function analyzeSamplesDirect(samples, sampleRate, sourceName, options = {}) {
  try {
    els.recordState.textContent = "正在分析";
    els.liveQuality.textContent = "处理中";
    els.analysisStatus.textContent = "分析中";

    const features = core.analyzeSamples(samples, sampleRate);
    const scored = core.scoreAnalysis(features, { history: loadHistory() });

    state.current = {
      id: feedbackStore.createSessionId(),
      sourceName,
      features,
      ...scored
    };
    state.adjustedByQuestion = false;
    state.questionAnswer = null;
    state.pendingContextQuestions = [];
    state.contextAnswers = [];
    state.currentAttempts = [];
    state.pendingFeedbackAction = null;
    state.feedbackSaved = false;
    state.currentBlob = options.blob || null;
    state.currentMimeType = options.mimeType || "";
    state.currentSourceName = sourceName;
    drawAnalyzedWave(samples);
    if (state.current.quality.usable && state.current.contextQuestions?.length) {
      renderContextStage(state.current);
    } else {
      setStage("result");
      renderAnalysis(state.current);
    }
  } catch (error) {
    renderError(options.errorMessage || "测试样本分析失败，可以重新加载页面后再试。");
  }
}

function extractMono(audioBuffer) {
  const maxLength = Math.min(audioBuffer.length, Math.floor(audioBuffer.sampleRate * 20));
  const channelCount = audioBuffer.numberOfChannels;
  const samples = new Float32Array(maxLength);
  for (let channel = 0; channel < channelCount; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let i = 0; i < maxLength; i += 1) {
      samples[i] += data[i] / channelCount;
    }
  }

  let mean = 0;
  for (const sample of samples) mean += sample;
  mean /= samples.length || 1;
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] -= mean;
  }
  return samples;
}

function applyQuestionAnswer(option) {
  if (!state.current || state.adjustedByQuestion) return;
  const question = state.current.question;
  state.questionAnswer = question
    ? {
        questionId: question.id,
        questionText: question.text,
        optionLabel: option.label,
        answeredAt: Date.now()
      }
    : null;
  state.current = {
    ...state.current,
    ...core.applyQuestionAnswerToAnalysis(state.current, option)
  };
  state.adjustedByQuestion = true;
  renderAnalysis(state.current);
}

function renderContextStage(analysis) {
  state.pendingContextQuestions = (analysis.contextQuestions || [analysis.question].filter(Boolean)).slice(0, 3);
  state.contextAnswers = Array.from({ length: state.pendingContextQuestions.length }, () => null);

  if (!state.pendingContextQuestions.length) {
    finishContextQuestions(false);
    return;
  }

  setStage("context");
  els.recordState.textContent = "等待确认";
  els.liveQuality.textContent = "补充信息";
  renderContextQuestions();
}

function renderContextQuestions() {
  els.contextQuestions.innerHTML = state.pendingContextQuestions
    .map(
      (question, questionIndex) => `
        <article class="context-question">
          <strong>${escapeHtml(question.text)}</strong>
          <div class="context-options">
            ${question.options
              .map((option, optionIndex) => {
                const selected = state.contextAnswers[questionIndex]?.optionIndex === optionIndex;
                return `<button type="button" class="${selected ? "selected" : ""}" data-question-index="${questionIndex}" data-option-index="${optionIndex}">${escapeHtml(option.label)}</button>`;
              })
              .join("")}
          </div>
        </article>
      `
    )
    .join("");

  els.contextQuestions.querySelectorAll("[data-question-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const questionIndex = Number(button.dataset.questionIndex);
      const optionIndex = Number(button.dataset.optionIndex);
      const question = state.pendingContextQuestions[questionIndex];
      const option = question?.options?.[optionIndex];
      if (!question || !option) return;
      state.contextAnswers[questionIndex] = {
        questionId: question.id,
        questionText: question.text,
        optionIndex,
        optionLabel: option.label,
        option,
        answeredAt: Date.now()
      };
      renderContextQuestions();
    });
  });

  const answeredCount = state.contextAnswers.filter(Boolean).length;
  els.contextStatus.textContent = `${answeredCount}/${state.pendingContextQuestions.length}`;
  els.contextContinue.disabled = answeredCount < state.pendingContextQuestions.length;
}

function finishContextQuestions(useAnswers) {
  if (!state.current) return;
  const answers = useAnswers ? state.contextAnswers.filter(Boolean) : [];
  if (answers.length) {
    const updated = core.applyContextAnswersToAnalysis(state.current, answers);
    state.current = {
      ...state.current,
      ...updated
    };
    state.questionAnswer = {
      questionId: "context_bundle",
      questionText: answers.map((answer) => answer.questionText).join(" / "),
      optionLabel: answers.map((answer) => answer.optionLabel).join(" / "),
      answeredAt: Date.now()
    };
    state.adjustedByQuestion = true;
  } else {
    state.current = {
      ...state.current,
      question: null,
      contextQuestions: []
    };
    state.questionAnswer = null;
    state.adjustedByQuestion = false;
  }

  setStage("result");
  renderAnalysis(state.current);
}

function renderAnalysis(analysis) {
  const { features, quality, ranking, highAlertLevel, highAlertScore } = analysis;
  renderFeatures(features);
  els.feedbackBox.classList.toggle("hidden", !quality.usable);

  if (!quality.usable) {
    const guidance = core.getQualityGuidance(quality);
    els.analysisStatus.textContent = "需要重录";
    els.actionStatus.textContent = "先重录";
    els.summary.className = "summary medium";
    els.summary.innerHTML = `
      <strong>这段录音不适合判断。</strong><br>
      ${quality.issues.map((issue) => `<span>${issue}</span>`).join("、")}
    `;
    els.ranking.innerHTML = "";
    els.questionBox.classList.add("hidden");
    els.actionPlan.innerHTML = `<ol>${guidance.map((item) => `<li>${item}</li>`).join("")}</ol>`;
    els.feedbackBox.innerHTML = "";
    els.liveQuality.textContent = "需要重录";
    els.recordState.textContent = "分析完成";
    return;
  }

  const top = ranking[0];
  const second = ranking[1];
  const support = core.getDecisionSupport(features, analysis);
  const levelText = highAlertLevel === "high" ? "高" : highAlertLevel === "medium" ? "中" : "低";
  els.analysisStatus.textContent = "已分析";
  els.actionStatus.textContent =
    support.actionMode === "top2" && second ? `${labels[top.key]} / ${labels[second.key]}` : top ? labels[top.key] : "不确定";
  els.liveQuality.textContent = `质量 ${Math.round(quality.score * 100)}%`;
  els.recordState.textContent = "分析完成";
  els.summary.className = `summary ${highAlertLevel}`;
  els.summary.innerHTML = `
    <strong>${support.actionMode === "top2" ? "初判接近" : "最可能"}：</strong>${labels[top.key]} ${Math.round(top.score * 100)}%<br>
    <strong>次可能：</strong>${labels[second.key]} ${Math.round(second.score * 100)}%<br>
    <strong>置信度：</strong>${support.confidence.label}（差距 ${Math.round(support.confidence.margin * 100)} 个百分点）<br>
    <strong>高警觉风险：</strong>${levelText}（${Math.round(highAlertScore * 100)}%）
    <br><strong>依据：</strong>${support.evidence.join("；")}
    ${quality.score < 0.58 ? `<br><strong>质量提示：</strong>${core.getQualityGuidance(quality)[0]}` : ""}
    ${analysis.personalEvidence ? "<br><strong>个体化：</strong>已参考当前宝宝的历史反馈" : ""}
  `;
  renderRanking(ranking);
  renderQuestion(analysis.question);
  renderActionPlan(analysis);
  renderFeedbackAction();
}

function renderRanking(ranking) {
  els.ranking.innerHTML = ranking
    .map(
      (item) => `
        <div class="rank-row">
          <strong>${labels[item.key]}</strong>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.round(item.score * 100)}%"></div></div>
          <span>${Math.round(item.score * 100)}%</span>
        </div>
      `
    )
    .join("");
}

function renderQuestion(question) {
  if (!question) {
    els.questionBox.classList.add("hidden");
    els.questionBox.innerHTML = "";
    return;
  }

  els.questionBox.classList.remove("hidden");
  els.questionBox.innerHTML = `
    <strong>${question.text}</strong>
    <div class="question-options">
      ${question.options.map((option, index) => `<button type="button" data-option="${index}">${option.label}</button>`).join("")}
    </div>
  `;
  els.questionBox.querySelectorAll("[data-option]").forEach((button) => {
    button.addEventListener("click", () => applyQuestionAnswer(question.options[Number(button.dataset.option)]));
  });
}

function renderActionPlan(analysis) {
  const flow = buildActionFlow(analysis);
  els.actionPlan.innerHTML = `
    <div class="action-flow ${flow.mode}">
      <p class="flow-note">${flow.note}</p>
      ${flow.steps.map((step, index) => renderActionStep(step, index)).join("")}
    </div>
  `;
  bindActionStepButtons();
}

function buildActionFlow(analysis) {
  const top = analysis.ranking[0]?.key || "";
  const second = analysis.ranking[1]?.key || "";
  const support = core.getDecisionSupport(analysis.features, analysis);

  if (analysis.highAlertLevel === "high") {
    return {
      mode: "safety",
      note: "先按安全优先处理，别只当普通哭闹。",
      steps: [
        {
          category: "discomfort",
          title: "先排除危险信号",
          time: "立即",
          body: "测体温，检查是否摔碰、刚接种后异常、呼吸/肤色/精神状态异常。",
          next: "有异常或持续尖锐哭，尽快联系医生。"
        },
        {
          category: "discomfort",
          title: "做身体和衣物检查",
          time: "1-2 分钟",
          body: "看尿布、冷热、衣物勒痕、头发缠绕手脚、皮肤红肿。",
          next: "没有发现异常，再进入安抚和常规需求排查。"
        }
      ]
    };
  }

  if (support.actionMode === "top2" && top && second) {
    return {
      mode: "top2",
      note: `${labels[top]} 和 ${labels[second]} 很接近，先做低成本、可快速验证的两步。`,
      steps: uniqueCategories([top, second, "discomfort"]).map(categoryToStep)
    };
  }

  return {
    mode: "top1",
    note: top ? `先验证最可能的“${labels[top]}”，没缓解再切换第二项。` : "先做低成本安抚和身体检查。",
    steps: uniqueCategories([top, second, "discomfort"]).map(categoryToStep)
  };
}

function categoryToStep(category) {
  const steps = {
    hunger: {
      category: "hunger",
      title: "试喂奶",
      time: "3-5 分钟",
      body: "按需试喂，观察吸吮后哭声是否明显减弱。",
      next: "没有缓解就先抱直拍嗝，不继续硬喂。"
    },
    gas: {
      category: "gas",
      title: "拍嗝/排气",
      time: "3-5 分钟",
      body: "抱直拍嗝，或轻柔做排气动作；刚喂完先保持竖抱。",
      next: "没有缓解再回到吃奶、尿布冷热或困烦排查。"
    },
    tired: {
      category: "tired",
      title: "降低刺激并抱哄",
      time: "5-10 分钟",
      body: "降低灯光和声音，停止逗弄，抱哄或包裹安抚。",
      next: "越哭越尖锐就停止强哄，回到体温和身体检查。"
    },
    discomfort: {
      category: "discomfort",
      title: "尿布/冷热/衣物检查",
      time: "1-3 分钟",
      body: "检查尿布、冷热、衣物勒痕、头发缠绕手脚和姿势不适。",
      next: "发现异常先处理；没有异常再试喂奶或拍嗝。"
    }
  };
  return steps[category] || steps.discomfort;
}

function renderActionStep(step, index) {
  const attempted = state.currentAttempts.some((item) => item.actionCategory === step.category);
  return `
    <article class="action-step ${attempted ? "attempted" : ""}">
      <div class="step-head">
        <span class="step-index">${index + 1}</span>
        <strong>${step.title}</strong>
        <span class="step-time">${step.time}</span>
      </div>
      <p>${step.body}</p>
      <small>${step.next}</small>
      <div class="step-actions">
        <button type="button" data-step-effective="${step.category}">这步有效</button>
        <button type="button" data-step-unresolved="${step.category}">${attempted ? "已记下没缓解" : "这步没缓解"}</button>
      </div>
    </article>
  `;
}

function bindActionStepButtons() {
  els.actionPlan.querySelectorAll("[data-step-effective]").forEach((button) => {
    button.addEventListener("click", () => {
      state.pendingFeedbackAction = button.dataset.stepEffective;
      renderReliefOptions(state.pendingFeedbackAction);
    });
  });

  els.actionPlan.querySelectorAll("[data-step-unresolved]").forEach((button) => {
    button.addEventListener("click", () => recordUnresolvedAttempt(button.dataset.stepUnresolved));
  });
}

function recordUnresolvedAttempt(category) {
  if (!feedbackStore.feedbackActions[category] || state.feedbackSaved) return;
  const already = state.currentAttempts.some((item) => item.actionCategory === category && item.result === "unresolved");
  if (!already) {
    state.currentAttempts = [
      ...state.currentAttempts,
      {
        actionCategory: category,
        result: "unresolved",
        ts: Date.now()
      }
    ];
  }
  els.liveQuality.textContent = `已记下：${feedbackStore.feedbackActions[category]}没缓解`;
  renderActionPlan(state.current);
  renderFeedbackAction();
}

function uniqueCategories(categories) {
  return [...new Set(categories.filter((category) => feedbackStore.feedbackActions[category] && category !== "unresolved"))].slice(0, 3);
}

function renderFeatures(features) {
  const values = {
    durationSec: `${features.durationSec.toFixed(1)} 秒`,
    validCrySec: `${features.validCrySec.toFixed(1)} 秒`,
    cryRatio: `${Math.round(features.cryRatio * 100)}%`,
    snrDb: `${features.snrDb.toFixed(1)} dB`,
    pitchMedian: features.pitchMedian ? `${Math.round(features.pitchMedian)} Hz` : "不足",
    pitchP90: features.pitchP90 ? `${Math.round(features.pitchP90)} Hz` : "不足",
    highBandRatio: `${Math.round(features.highBandRatio * 100)}%`,
    burstiness: `${Math.round(features.burstiness * 100)}%`,
    episodeCount: `${features.episodeCount}`,
    irregularity: `${Math.round(features.irregularity * 100)}%`
  };

  els.features.innerHTML = Object.entries(values)
    .map(([key, value]) => `<div class="feature"><span>${featureLabels[key]}</span><strong>${value}</strong></div>`)
    .join("");
}

function renderEmptyFeatures() {
  els.features.innerHTML = Object.entries(featureLabels)
    .map(([key, label]) => `<div class="feature"><span>${label}</span><strong>${key.includes("Sec") ? "0.0 秒" : "-"}</strong></div>`)
    .join("");
}

function setStage(stage) {
  els.contextPanel.classList.toggle("hidden", stage !== "context");
  els.resultGrid.classList.toggle("hidden", stage !== "result");
  els.detailPanel.classList.toggle("hidden", stage !== "result");
}

function renderRecentFeedback() {
  const items = feedbackStore.summarizeRecentSessions(loadSessions(), 5);
  els.recentStatus.textContent = items.length ? `${items.length} 条` : "暂无";
  if (!items.length) {
    els.recentFeedback.className = "recent-list empty-state";
    els.recentFeedback.textContent = "当前宝宝保存反馈后会显示在这里。";
    return;
  }

  els.recentFeedback.className = "recent-list";
  els.recentFeedback.innerHTML = items.map(renderRecentItem).join("");
}

function renderRecentItem(item) {
  const predicted = item.top2 ? `${labels[item.top1] || item.top1} / ${labels[item.top2] || item.top2}` : labels[item.top1] || "未知";
  const result = item.resolved ? item.reliefLabel : "未缓解";
  const flags = [item.partial ? "部分" : "", item.recurred ? "复哭" : "", item.hasAudio ? "音频" : ""].filter(Boolean).join(" · ");
  return `
    <div class="recent-item">
      <div>
        <strong>${escapeHtml(predicted)}</strong>
        <span>${formatTime(item.ts)} 初判</span>
      </div>
      <div>
        <strong>${escapeHtml(item.actionLabel)}</strong>
        <span>${escapeHtml(result)}${flags ? ` · ${escapeHtml(flags)}` : ""}</span>
      </div>
      <div class="recent-pill">${escapeHtml(item.highAlertLevel === "high" ? "高警觉" : item.highAlertLevel === "medium" ? "中警觉" : "低警觉")}</div>
    </div>
  `;
}

function renderError(message) {
  setStage("result");
  els.analysisStatus.textContent = "出错";
  els.actionStatus.textContent = "等待";
  els.summary.className = "summary medium";
  els.summary.textContent = message;
  els.ranking.innerHTML = "";
  els.questionBox.classList.add("hidden");
  els.actionPlan.textContent = "可以重新录音，或上传另一段音频。";
  els.feedbackBox.classList.add("hidden");
  els.recordState.textContent = "准备录音";
  els.liveQuality.textContent = "等待哭声";
}

function renderEnvironmentHint() {
  if (canUseMicrophone()) {
    els.environmentHint.classList.add("hidden");
    els.environmentHint.textContent = "";
    return;
  }

  els.environmentHint.classList.remove("hidden");
  els.environmentHint.textContent = "当前地址不是安全上下文，手机浏览器可能禁止直接录音。可以先上传音频；发给别人测试时建议部署成 HTTPS 链接。";
}

function renderFeedbackAction() {
  if (!state.current?.quality?.usable) {
    els.feedbackBox.classList.add("hidden");
    els.feedbackBox.innerHTML = "";
    return;
  }

  els.feedbackBox.classList.remove("hidden");
  if (state.feedbackSaved) {
    els.feedbackBox.innerHTML = `
      <p>已记录这次处理结果，并用于当前宝宝后续校准。</p>
      <p class="feedback-note">当前宝宝数据可在“信号”面板导出。</p>
    `;
    return;
  }

  if (state.pendingFeedbackAction) {
    renderReliefOptions(state.pendingFeedbackAction);
    return;
  }

  const ranked = state.current.ranking.map((item) => item.key).filter((key) => feedbackStore.feedbackActions[key]);
  const categories = [...new Set([...ranked, "hunger", "gas", "tired", "discomfort", "unresolved"])];
  const attemptNote = state.currentAttempts.length
    ? `<p class="feedback-note">已记下没缓解：${state.currentAttempts.map((item) => feedbackStore.feedbackActions[item.actionCategory]).join("、")}。</p>`
    : "";

  els.feedbackBox.innerHTML = `
    <p>处理后点一下：这次哪一步最有效？</p>
    ${attemptNote}
    <div class="feedback-actions">
      ${categories
        .map((category) => `<button type="button" data-action="${category}">${feedbackStore.feedbackActions[category]}</button>`)
        .join("")}
    </div>
    <p class="feedback-note">只在本机保存，用来逐步校准当前宝宝。</p>
  `;

  els.feedbackBox.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const actionCategory = button.dataset.action;
      if (actionCategory === "unresolved") {
        saveFeedback({ actionCategory, reliefKey: "unresolved" });
        return;
      }
      state.pendingFeedbackAction = actionCategory;
      renderReliefOptions(actionCategory);
    });
  });
}

function renderReliefOptions(actionCategory) {
  const reliefKeys = ["fast", "slow", "partial", "recurred", "unresolved"];
  els.feedbackBox.innerHTML = `
    <p>已选：${feedbackStore.feedbackActions[actionCategory]}。多久缓解？</p>
    <div class="feedback-actions compact">
      ${reliefKeys
        .map((key) => `<button type="button" data-relief="${key}">${feedbackStore.reliefOptions[key].label}</button>`)
        .join("")}
    </div>
    <button type="button" class="text-btn" data-back="true">重选有效动作</button>
  `;

  els.feedbackBox.querySelectorAll("[data-relief]").forEach((button) => {
    button.addEventListener("click", () => {
      const reliefKey = button.dataset.relief;
      saveFeedback({ actionCategory, reliefKey });
    });
  });

  els.feedbackBox.querySelector("[data-back]").addEventListener("click", () => {
    state.pendingFeedbackAction = null;
    renderFeedbackAction();
  });
}

async function saveFeedback(feedback) {
  if (!state.current) return;

  try {
    let audio = null;
    try {
      audio = await saveCurrentAudioIfEnabled();
    } catch {
      audio = null;
    }
    const session = feedbackStore.buildSessionRecord({
      id: state.current.id,
      ts: Date.now(),
      babyId: cleanBabyId(),
      sourceName: state.current.sourceName,
      features: state.current.features,
      analysis: state.current,
      questionAnswer: state.questionAnswer,
      attempts: state.currentAttempts,
      feedback,
      vector: core.featureVector(state.current.features),
      audio
    });

    const sessions = feedbackStore.appendBounded(loadSessions(), session, 300);
    localStorage.setItem(sessionsKey(), JSON.stringify(sessions));

    const history = feedbackStore.appendManyBounded(loadHistory(), feedbackStore.buildCalibrationItems(session), 120);
    localStorage.setItem(historyKey(), JSON.stringify(history));

    state.feedbackSaved = true;
    state.currentAttempts = [];
    state.pendingFeedbackAction = null;
    renderRecentFeedback();
    renderFeedbackSaved(session);

    const updated = core.scoreAnalysis(state.current.features, { history: loadHistory() });
    state.current = {
      ...state.current,
      ...updated,
      question: state.adjustedByQuestion ? null : updated.question
    };
    window.setTimeout(() => renderAnalysis(state.current), 450);
  } catch (error) {
    els.feedbackBox.innerHTML = `
      <p>这次反馈没有保存成功。</p>
      <p class="feedback-note">可能是浏览器本地存储已满，可以先导出或清空当前宝宝反馈。</p>
    `;
  }
}

function renderFeedbackSaved(session) {
  const relief = session.feedback.resolved ? session.feedback.reliefLabel : "没有缓解";
  const audioText = session.audio ? "，已保留音频" : "";
  const attemptText = session.attempts?.length ? `；也记下 ${session.attempts.length} 个未缓解尝试` : "";
  els.feedbackBox.innerHTML = `
    <p>已记录：${session.feedback.actionLabel}，${relief}${attemptText}${audioText}。</p>
    <p class="feedback-note">这条记录会影响当前宝宝后续相似哭声的排序。</p>
  `;
}

async function saveCurrentAudioIfEnabled() {
  if (!els.keepAudio.checked || !state.currentBlob || !state.current) return null;
  const audio = audioArchive.buildAudioMeta({
    sessionId: state.current.id,
    blob: state.currentBlob,
    mimeType: state.currentMimeType,
    sourceName: state.currentSourceName
  });
  await audioStore.putSessionAudio({
    ...audio,
    babyId: cleanBabyId(),
    blob: state.currentBlob
  });
  return audio;
}

async function exportBabyData() {
  const babyId = cleanBabyId();
  const sessions = loadSessions();
  const history = loadHistory();
  const audioRecords = await audioStore.getSessionAudios(sessions.map((session) => session.id).filter(Boolean)).catch(() => []);
  const audioAttachments = await Promise.all(
    audioRecords.filter((record) => record.blob).map((record) =>
      audioArchive.blobToAudioAttachment({
        sessionId: record.sessionId,
        blob: record.blob,
        mimeType: record.mimeType,
        createdAt: record.createdAt,
        sourceName: record.sourceName
      })
    )
  );
  const payload = feedbackStore.exportPayload({
    babyId,
    sessions,
    history,
    audioAttachments
  });
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildExportName(babyId);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  els.liveQuality.textContent = `已导出 ${payload.counts.sessions} 条`;
}

async function importBabyData(file) {
  try {
    const payload = JSON.parse(await file.text());
    const imported = feedbackStore.normalizeImportedPayload(payload);
    if (imported.babyId) {
      els.babyName.value = imported.babyId;
      localStorage.setItem("yingyu:lastBaby", imported.babyId);
    }

    const merged = feedbackStore.mergeImportedData({
      currentSessions: loadSessions(),
      currentHistory: loadHistory(),
      importedSessions: imported.sessions,
      importedHistory: imported.history
    });
    localStorage.setItem(sessionsKey(), JSON.stringify(merged.sessions));
    localStorage.setItem(historyKey(), JSON.stringify(merged.history));

    const audioAttachments = audioArchive.normalizeAudioAttachments(
      payload.audioAttachments,
      imported.sessions.map((session) => session.id)
    );
    for (const attachment of audioAttachments) {
      await audioStore
        .putSessionAudio({
          ...attachment,
          babyId: imported.babyId,
          blob: audioArchive.audioAttachmentToBlob(attachment)
        })
        .catch(() => {});
    }

    state.feedbackSaved = false;
    state.currentAttempts = [];
    state.pendingFeedbackAction = null;
    renderRecentFeedback();
    if (state.current) {
      const updated = core.scoreAnalysis(state.current.features, { history: loadHistory() });
      state.current = { ...state.current, ...updated };
      renderAnalysis(state.current);
    }
    els.liveQuality.textContent = `已导入 ${imported.counts.sessions} 条`;
  } catch (error) {
    els.liveQuality.textContent = "导入失败";
    els.analysisStatus.textContent = "导入失败";
    els.summary.className = "summary medium";
    els.summary.textContent = error?.message || "导入文件无法识别。";
  }
}

function buildExportName(babyId) {
  const safeBabyId = babyId.replace(/[\\/:*?"<>|\s]+/g, "_") || "baby";
  return `yingyu-${safeBabyId}-${new Date().toISOString().slice(0, 10)}.json`;
}

function formatTime(ts) {
  if (!ts) return "未知时间";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "未知时间";
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanBabyId() {
  return (els.babyName.value || "宝宝").trim() || "宝宝";
}

function historyKey() {
  return `yingyu:v0:${cleanBabyId()}:history`;
}

function sessionsKey() {
  return `yingyu:v0:${cleanBabyId()}:sessions`;
}

function loadHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(historyKey()) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function loadSessions() {
  try {
    const value = JSON.parse(localStorage.getItem(sessionsKey()) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function updateTimer(forceSeconds) {
  const elapsed = typeof forceSeconds === "number" ? forceSeconds : Math.floor((Date.now() - state.startedAt) / 1000);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  els.timer.textContent = `${mm}:${ss}`;
}

function drawLiveWave() {
  const canvas = els.waveform;
  const ctx = canvas.getContext("2d");
  const data = new Uint8Array(state.analyser.frequencyBinCount);

  const draw = () => {
    state.animationId = requestAnimationFrame(draw);
    state.analyser.getByteTimeDomainData(data);
    if (state.liveQualityTracker) {
      liveQuality.updateLiveQualityTracker(state.liveQualityTracker, data);
      const elapsedSec = (Date.now() - state.startedAt) / 1000;
      els.liveQuality.textContent = liveQuality.summarizeLiveQuality(state.liveQualityTracker, elapsedSec).text;
    }
    drawWaveform(ctx, canvas, data, true);
  };
  draw();
}

function drawIdleWave() {
  const canvas = els.waveform;
  const ctx = canvas.getContext("2d");
  const data = new Uint8Array(256);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = 128 + Math.round(Math.sin(i / 12) * 12 + Math.sin(i / 27) * 9);
  }
  drawWaveform(ctx, canvas, data, false);
}

function drawAnalyzedWave(samples) {
  const canvas = els.waveform;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const data = new Uint8Array(width);
  const step = Math.max(1, Math.floor(samples.length / width));
  for (let x = 0; x < width; x += 1) {
    let peak = 0;
    const start = x * step;
    for (let i = 0; i < step && start + i < samples.length; i += 1) {
      peak = Math.max(peak, Math.abs(samples[start + i]));
    }
    data[x] = 128 + Math.round(core.clamp(peak * 180, 0, 110));
  }
  drawWaveform(ctx, canvas, data, false);
}

function canUseMicrophone() {
  return Boolean(navigator.mediaDevices?.getUserMedia && window.isSecureContext);
}

function drawWaveform(ctx, canvas, data, live) {
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "rgba(4, 121, 107, 0.12)");
  gradient.addColorStop(1, "rgba(43, 108, 176, 0.1)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(23, 33, 31, 0.08)";
  ctx.lineWidth = 1;
  for (let y = 34; y < height; y += 38) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.lineWidth = live ? 3 : 2;
  ctx.strokeStyle = live ? "#04796b" : "#2b6cb0";
  const slice = width / data.length;
  for (let i = 0; i < data.length; i += 1) {
    const x = i * slice;
    const y = data[i] / 255 * height;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

