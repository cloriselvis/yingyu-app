import { COPY, formatCopy } from "./copy.js";

export function createLiveQualityTracker() {
  return {
    frames: 0,
    activeFrames: 0,
    peakRms: 0,
    lastRms: 0
  };
}

export function updateLiveQualityTracker(tracker, byteTimeData) {
  const rms = byteTimeDomainRms(byteTimeData);
  const active = rms >= 0.012;
  tracker.frames += 1;
  tracker.activeFrames += active ? 1 : 0;
  tracker.peakRms = Math.max(tracker.peakRms, rms);
  tracker.lastRms = rms;
  return tracker;
}

export function summarizeLiveQuality(tracker, elapsedSec) {
  const activeRatio = tracker.frames ? tracker.activeFrames / tracker.frames : 0;
  if (elapsedSec < 2) return { level: "recording", text: COPY.ui.liveQuality.start };
  if (tracker.peakRms < 0.007) return { level: "weak", text: COPY.ui.liveQuality.weak };
  if (elapsedSec >= 4 && activeRatio < 0.08) return { level: "weak", text: COPY.ui.liveQuality.notEnoughCry };
  if (elapsedSec < 8) {
    return {
      level: "recording",
      text: formatCopy(COPY.ui.liveQuality.keepRecording, { seconds: Math.ceil(8 - elapsedSec) })
    };
  }
  if (elapsedSec <= 15) return { level: "good", text: COPY.ui.liveQuality.good };
  return { level: "good", text: COPY.ui.liveQuality.enough };
}

export function byteTimeDomainRms(byteTimeData) {
  if (!byteTimeData?.length) return 0;
  let sum = 0;
  for (const value of byteTimeData) {
    const centered = (value - 128) / 128;
    sum += centered * centered;
  }
  return Math.sqrt(sum / byteTimeData.length);
}
