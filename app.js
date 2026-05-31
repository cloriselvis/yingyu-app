import * as core from "./audio-core.js";
import * as audioArchive from "./audio-attachments.js";
import * as audioStore from "./audio-store.js";
import * as feedbackStore from "./feedback-store.js";
import * as liveQuality from "./live-quality.js";
import { COPY, formatCopy } from "./copy.js";

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

const labels = COPY.labels;
const ageBucketLabels = COPY.ageBucketLabels;
const featureLabels = COPY.featureLabels;

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
  hydrateStaticCopy();
  els.babyName.value = localStorage.getItem("yingyu:lastBaby") || COPY.ui.defaultBabyName;
  els.keepAudio.checked = localStorage.getItem("yingyu:keepAudio") === "1";
  setStage("capture");
  drawIdleWave();
  renderEmptyFeatures();
  renderRecentFeedback();
  renderEnvironmentHint();
  bindEvents();
}

function hydrateStaticCopy() {
  document.title = COPY.brand;
  const targets = {
    brand: COPY.brand,
    subtitle: COPY.subtitle,
    babyNameLabel: COPY.ui.babyNameLabel,
    releaseTitle: COPY.ui.release.title,
    releaseShort: COPY.ui.release.short,
    releaseLink: COPY.ui.release.link,
    captureReady: COPY.ui.capture.ready,
    captureWaitingCry: COPY.ui.capture.waitingCry,
    recordButton: COPY.ui.capture.recordButton,
    secondarySummary: COPY.ui.capture.secondarySummary,
    uploadAudio: COPY.ui.capture.uploadAudio,
    keepAudio: COPY.ui.capture.keepAudio,
    contextTitle: COPY.ui.context.title,
    contextPending: COPY.ui.context.pending,
    contextContinue: COPY.ui.context.continue,
    contextSkip: COPY.ui.context.skip,
    analysisTitle: COPY.ui.result.analysisTitle,
    actionTitle: COPY.ui.result.actionTitle,
    detailTitle: COPY.ui.result.detailTitle,
    notAnalyzed: COPY.ui.result.notAnalyzed,
    waitingResult: COPY.ui.result.waitingResult,
    resultEmpty: COPY.ui.result.empty,
    waitingActionPlan: COPY.ui.result.waitingActionPlan,
    feedbackReport: COPY.ui.detail.feedbackReport,
    importBaby: COPY.ui.detail.importBaby,
    exportBaby: COPY.ui.detail.exportBaby,
    resetBaby: COPY.ui.detail.resetBaby,
    recentTitle: COPY.ui.detail.recentTitle,
    recentNone: COPY.ui.detail.none,
    recentEmpty: COPY.ui.detail.recentEmpty
  };
  for (const [key, value] of Object.entries(targets)) setText(`[data-copy='${key}']`, value);
  els.recordBtn.setAttribute("aria-label", COPY.ui.capture.recordButton);
  els.stopBtn.setAttribute("aria-label", COPY.ui.capture.stopButton);
  els.stopBtn.setAttribute("title", COPY.ui.capture.stopButton);
}

function setText(selector, text) {
  const target = document.querySelector(selector);
  if (target) target.textContent = text;
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
      const updated = scoreFeatures(state.current.features);
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
    localStorage.removeItem(babyProfileKey());
    state.feedbackSaved = false;
    state.currentAttempts = [];
    state.pendingFeedbackAction = null;
    renderRecentFeedback();
    if (state.current) {
      const updated = scoreFeatures(state.current.features);
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
      renderError(COPY.ui.capture.microphoneBlocked);
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
    els.recordState.textContent = COPY.ui.capture.recording;
    els.liveQuality.textContent = COPY.ui.capture.liveHint;
    drawLiveWave();
  } catch (error) {
    renderError(COPY.ui.capture.microphoneError);
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
    els.recordState.textContent = COPY.ui.capture.analyzing;
    els.liveQuality.textContent = COPY.ui.capture.processing;
    els.analysisStatus.textContent = COPY.ui.capture.analyzing;

    const audioContext = await getAudioContext();
    const arrayBuffer = await blob.arrayBuffer();
    const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const samples = extractMono(decoded);
    analyzeSamplesDirect(samples, decoded.sampleRate, sourceName, {
      blob,
      mimeType: blob.type || "",
      errorMessage: COPY.ui.capture.invalidAudio
    });
  } catch (error) {
    renderError(COPY.ui.capture.decodeError);
  }
}

function analyzeSamplesDirect(samples, sampleRate, sourceName, options = {}) {
  try {
    els.recordState.textContent = COPY.ui.capture.analyzing;
    els.liveQuality.textContent = COPY.ui.capture.processing;
    els.analysisStatus.textContent = COPY.ui.capture.analyzing;

    const features = core.analyzeSamples(samples, sampleRate);
    const scored = scoreFeatures(features);

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
    renderError(options.errorMessage || COPY.ui.capture.sampleError);
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
  els.recordState.textContent = COPY.ui.context.pending;
  els.liveQuality.textContent = COPY.ui.capture.contextNeeded;
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
    const babyProfile = saveProfileFromContextAnswers(answers) || state.current.babyProfile || loadBabyProfile();
    const updated = core.applyContextAnswersToAnalysis(state.current, answers);
    state.current = {
      ...state.current,
      ...updated,
      babyProfile
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
    els.analysisStatus.textContent = COPY.ui.capture.needsRerecord;
    els.actionStatus.textContent = COPY.ui.capture.needsRerecord;
    els.summary.className = "summary medium";
    els.summary.innerHTML = `
      <strong>${COPY.ui.result.qualityUnsuitable}</strong><br>
      ${quality.issues.map((issue) => `<span>${issue}</span>`).join("、")}
    `;
    els.ranking.innerHTML = "";
    els.questionBox.classList.add("hidden");
    els.actionPlan.innerHTML = `<ol>${guidance.map((item) => `<li>${item}</li>`).join("")}</ol>`;
    els.feedbackBox.innerHTML = "";
    els.liveQuality.textContent = COPY.ui.capture.needsRerecord;
    els.recordState.textContent = COPY.ui.capture.done;
    return;
  }

  const top = ranking[0];
  const second = ranking[1];
  const support = core.getDecisionSupport(features, analysis);
  const levelText = COPY.ui.result.highAlertLevels[highAlertLevel] || COPY.ui.result.highAlertLevels.low;
  const opening =
    highAlertLevel === "high"
      ? COPY.ui.result.openingHigh
      : highAlertLevel === "medium"
        ? COPY.ui.result.openingMedium
        : COPY.ui.result.openingLow;
  els.analysisStatus.textContent = COPY.ui.result.analyzed;
  els.actionStatus.textContent =
    support.actionMode === "top2" && second ? `${labels[top.key]} / ${labels[second.key]}` : top ? labels[top.key] : COPY.ui.result.uncertain;
  els.liveQuality.textContent = `${COPY.ui.capture.qualityPrefix} ${Math.round(quality.score * 100)}%`;
  els.recordState.textContent = COPY.ui.capture.done;
  els.summary.className = `summary ${highAlertLevel}`;
  els.summary.innerHTML = `
    <p class="summary-lead">${opening}</p>
    <strong>${support.actionMode === "top2" ? COPY.ui.result.close : COPY.ui.result.likely}：</strong>${labels[top.key]} ${Math.round(top.score * 100)}%<br>
    <strong>${COPY.ui.result.second}：</strong>${labels[second.key]} ${Math.round(second.score * 100)}%<br>
    <strong>${COPY.ui.result.confidence}：</strong>${support.confidence.label}（${COPY.ui.result.margin} ${Math.round(support.confidence.margin * 100)} ${COPY.ui.result.percentagePointUnit}）<br>
    <strong>${COPY.ui.result.highAlert}：</strong>${levelText}（${Math.round(highAlertScore * 100)}%）
    <br><strong>${COPY.ui.result.evidence}：</strong>${support.evidence.join("；")}
    ${quality.score < 0.58 ? `<br><strong>${COPY.ui.result.qualityHint}：</strong>${core.getQualityGuidance(quality)[0]}` : ""}
    ${analysis.personalEvidence ? `<br><strong>${COPY.ui.result.personalized}：</strong>${COPY.ui.result.personalEvidence}` : ""}
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
      note: COPY.actionFlow.safetyNote,
      steps: COPY.actionFlow.safetySteps.map((step) => ({ ...step }))
    };
  }

  if (support.actionMode === "top2" && top && second) {
    return {
      mode: "top2",
      note: formatCopy(COPY.actionFlow.top2Note, { first: labels[top], second: labels[second] }),
      steps: uniqueCategories([top, second, "discomfort"]).map(categoryToStep)
    };
  }

  return {
    mode: "top1",
    note: top ? formatCopy(COPY.actionFlow.top1Note, { first: labels[top] }) : COPY.actionFlow.fallbackNote,
    steps: uniqueCategories([top, second, "discomfort"]).map(categoryToStep)
  };
}

function categoryToStep(category) {
  return { ...(COPY.actionFlow.steps[category] || COPY.actionFlow.steps.discomfort) };
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
        <button type="button" data-step-effective="${step.category}">${COPY.ui.feedback.effective}</button>
        <button type="button" data-step-unresolved="${step.category}">${attempted ? COPY.ui.feedback.unresolvedMarked : COPY.ui.feedback.unresolved}</button>
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
  els.liveQuality.textContent = `${COPY.ui.feedback.attemptPrefix}：${feedbackStore.feedbackActions[category]}`;
  renderActionPlan(state.current);
  renderFeedbackAction();
}

function uniqueCategories(categories) {
  return [...new Set(categories.filter((category) => feedbackStore.feedbackActions[category] && category !== "unresolved"))].slice(0, 3);
}

function renderFeatures(features) {
  const values = {
    durationSec: `${features.durationSec.toFixed(1)} ${COPY.ui.result.secondsUnit}`,
    validCrySec: `${features.validCrySec.toFixed(1)} ${COPY.ui.result.secondsUnit}`,
    cryRatio: `${Math.round(features.cryRatio * 100)}%`,
    snrDb: `${features.snrDb.toFixed(1)} dB`,
    pitchMedian: features.pitchMedian ? `${Math.round(features.pitchMedian)} Hz` : COPY.ui.result.insufficient,
    pitchP90: features.pitchP90 ? `${Math.round(features.pitchP90)} Hz` : COPY.ui.result.insufficient,
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
    .map(([key, label]) => `<div class="feature"><span>${label}</span><strong>${key.includes("Sec") ? `0.0 ${COPY.ui.result.secondsUnit}` : "-"}</strong></div>`)
    .join("");
}

function setStage(stage) {
  els.contextPanel.classList.toggle("hidden", stage !== "context");
  els.resultGrid.classList.toggle("hidden", stage !== "result");
  els.detailPanel.classList.toggle("hidden", stage !== "result");
}

function renderRecentFeedback() {
  const items = feedbackStore.summarizeRecentSessions(loadSessions(), 5);
  els.recentStatus.textContent = items.length ? `${items.length} ${COPY.ui.result.itemUnit}` : COPY.ui.detail.none;
  if (!items.length) {
    els.recentFeedback.className = "recent-list empty-state";
    els.recentFeedback.textContent = COPY.ui.detail.recentEmpty;
    return;
  }

  els.recentFeedback.className = "recent-list";
  els.recentFeedback.innerHTML = items.map(renderRecentItem).join("");
}

function renderRecentItem(item) {
  const predicted = item.top2 ? `${labels[item.top1] || item.top1} / ${labels[item.top2] || item.top2}` : labels[item.top1] || COPY.ui.detail.unknown;
  const result = item.resolved ? item.reliefLabel : COPY.ui.feedback.unresolved;
  const flags = [item.partial ? COPY.ui.detail.partial : "", item.recurred ? COPY.ui.detail.recurred : "", item.hasAudio ? COPY.ui.detail.audio : ""]
    .filter(Boolean)
    .join(" · ");
  return `
    <div class="recent-item">
      <div>
        <strong>${escapeHtml(predicted)}</strong>
        <span>${formatTime(item.ts)} ${COPY.ui.result.firstPrediction}</span>
      </div>
      <div>
        <strong>${escapeHtml(item.actionLabel)}</strong>
        <span>${escapeHtml(result)}${flags ? ` · ${escapeHtml(flags)}` : ""}</span>
      </div>
      <div class="recent-pill">${escapeHtml(item.highAlertLevel === "high" ? COPY.ui.detail.highAlert : item.highAlertLevel === "medium" ? COPY.ui.detail.mediumAlert : COPY.ui.detail.lowAlert)}</div>
    </div>
  `;
}

function renderError(message) {
  setStage("result");
  els.analysisStatus.textContent = COPY.ui.result.error;
  els.actionStatus.textContent = COPY.ui.result.waiting;
  els.summary.className = "summary medium";
  els.summary.textContent = message;
  els.ranking.innerHTML = "";
  els.questionBox.classList.add("hidden");
  els.actionPlan.textContent = COPY.ui.result.retryAction;
  els.feedbackBox.classList.add("hidden");
  els.recordState.textContent = COPY.ui.capture.ready;
  els.liveQuality.textContent = COPY.ui.capture.waitingCry;
}

function renderEnvironmentHint() {
  if (canUseMicrophone()) {
    els.environmentHint.classList.add("hidden");
    els.environmentHint.textContent = "";
    return;
  }

  els.environmentHint.classList.remove("hidden");
  els.environmentHint.textContent = COPY.ui.capture.environmentHint;
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
      <p>${COPY.ui.feedback.saved}</p>
      <p class="feedback-note">${COPY.ui.feedback.dataNote}</p>
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
    ? `<p class="feedback-note">${COPY.ui.feedback.attemptPrefix}：${state.currentAttempts.map((item) => feedbackStore.feedbackActions[item.actionCategory]).join("、")}。</p>`
    : "";

  els.feedbackBox.innerHTML = `
    <p>${COPY.ui.feedback.prompt}</p>
    ${attemptNote}
    <div class="feedback-actions">
      ${categories
        .map((category) => `<button type="button" data-action="${category}">${feedbackStore.feedbackActions[category]}</button>`)
        .join("")}
    </div>
    <p class="feedback-note">${COPY.ui.feedback.localNote}</p>
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
    <p>${formatCopy(COPY.ui.feedback.selected, { action: feedbackStore.feedbackActions[actionCategory] })}</p>
    <div class="feedback-actions compact">
      ${reliefKeys
        .map((key) => `<button type="button" data-relief="${key}">${feedbackStore.reliefOptions[key].label}</button>`)
        .join("")}
    </div>
    <button type="button" class="text-btn" data-back="true">${COPY.ui.feedback.back}</button>
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
      babyProfile: state.current.babyProfile || loadBabyProfile(),
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

    const updated = scoreFeatures(state.current.features);
    state.current = {
      ...state.current,
      ...updated,
      question: state.adjustedByQuestion ? null : updated.question
    };
    window.setTimeout(() => renderAnalysis(state.current), 450);
  } catch (error) {
    els.feedbackBox.innerHTML = `
      <p>${COPY.ui.feedback.saveFailed}</p>
      <p class="feedback-note">${COPY.ui.feedback.storageFull}</p>
    `;
  }
}

function renderFeedbackSaved(session) {
  const relief = session.feedback.resolved ? session.feedback.reliefLabel : COPY.ui.feedback.noRelief;
  const audioText = session.audio ? COPY.ui.feedback.audioSaved : "";
  const attemptText = session.attempts?.length ? formatCopy(COPY.ui.feedback.attemptSaved, { count: session.attempts.length }) : "";
  els.feedbackBox.innerHTML = `
    <p>${COPY.ui.feedback.savedPrefix}：${session.feedback.actionLabel}，${relief}${attemptText}${audioText}。</p>
    <p class="feedback-note">${COPY.ui.feedback.savedNote}</p>
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
    babyProfile: loadBabyProfile(),
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
  els.liveQuality.textContent = formatCopy(COPY.ui.importExport.exported, { count: payload.counts.sessions });
}

async function importBabyData(file) {
  try {
    const payload = JSON.parse(await file.text());
    const imported = feedbackStore.normalizeImportedPayload(payload);
    if (imported.babyId) {
      els.babyName.value = imported.babyId;
      localStorage.setItem("yingyu:lastBaby", imported.babyId);
    }
    if (imported.babyProfile?.ageBucket) {
      saveBabyProfile(imported.babyProfile);
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
      const updated = scoreFeatures(state.current.features);
      state.current = { ...state.current, ...updated };
      renderAnalysis(state.current);
    }
    els.liveQuality.textContent = formatCopy(COPY.ui.importExport.imported, { count: imported.counts.sessions });
  } catch (error) {
    els.liveQuality.textContent = COPY.ui.importExport.importFailed;
    els.analysisStatus.textContent = COPY.ui.importExport.importFailed;
    els.summary.className = "summary medium";
    els.summary.textContent = error?.message || COPY.ui.importExport.importUnknown;
  }
}

function buildExportName(babyId) {
  const safeBabyId = babyId.replace(/[\\/:*?"<>|\s]+/g, "_") || "baby";
  return `yingyu-${safeBabyId}-${new Date().toISOString().slice(0, 10)}.json`;
}

function formatTime(ts) {
  if (!ts) return COPY.ui.detail.unknownTime;
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return COPY.ui.detail.unknownTime;
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
  return (els.babyName.value || COPY.ui.defaultBabyName).trim() || COPY.ui.defaultBabyName;
}

function scoreFeatures(features) {
  return core.scoreAnalysis(features, {
    history: loadHistory(),
    babyProfile: loadBabyProfile()
  });
}

function saveProfileFromContextAnswers(answers) {
  const profilePatch = {};
  for (const answer of answers) {
    Object.assign(profilePatch, answer?.option?.profilePatch || {});
  }
  if (!Object.keys(profilePatch).length) return null;
  return saveBabyProfile({
    ...loadBabyProfile(),
    ...profilePatch,
    updatedAt: Date.now()
  });
}

function loadBabyProfile() {
  try {
    return normalizeBabyProfile(JSON.parse(localStorage.getItem(babyProfileKey()) || "{}"));
  } catch {
    return {};
  }
}

function saveBabyProfile(profile) {
  const normalized = normalizeBabyProfile(profile);
  if (!normalized.ageBucket) {
    localStorage.removeItem(babyProfileKey());
    return {};
  }
  localStorage.setItem(babyProfileKey(), JSON.stringify(normalized));
  return normalized;
}

function normalizeBabyProfile(profile = {}) {
  const ageBucket = ageBucketLabels[profile.ageBucket] ? profile.ageBucket : "";
  if (!ageBucket) return {};
  return {
    ageBucket,
    ageLabel: ageBucketLabels[ageBucket],
    updatedAt: Number(profile.updatedAt) || Date.now()
  };
}

function historyKey() {
  return `yingyu:v0:${cleanBabyId()}:history`;
}

function sessionsKey() {
  return `yingyu:v0:${cleanBabyId()}:sessions`;
}

function babyProfileKey() {
  return `yingyu:v0:${cleanBabyId()}:profile`;
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

