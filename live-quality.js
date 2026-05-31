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
  const active = rms >= 0.035;
  tracker.frames += 1;
  tracker.activeFrames += active ? 1 : 0;
  tracker.peakRms = Math.max(tracker.peakRms, rms);
  tracker.lastRms = rms;
  return tracker;
}

export function summarizeLiveQuality(tracker, elapsedSec) {
  const activeRatio = tracker.frames ? tracker.activeFrames / tracker.frames : 0;
  if (elapsedSec < 2) return { level: "recording", text: "先录几秒" };
  if (tracker.peakRms < 0.018) return { level: "weak", text: "声音偏小，靠近一点" };
  if (elapsedSec >= 4 && activeRatio < 0.12) return { level: "weak", text: "哭声还不够" };
  if (elapsedSec < 8) return { level: "recording", text: `继续录 ${Math.ceil(8 - elapsedSec)} 秒` };
  if (elapsedSec <= 15) return { level: "good", text: "可以停止" };
  return { level: "good", text: "已足够，建议停止" };
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
