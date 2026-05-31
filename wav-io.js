export function decodeWav(buffer) {
  const view = buffer instanceof DataView ? buffer : new DataView(toArrayBuffer(buffer));
  const riff = readAscii(view, 0, 4);
  const wave = readAscii(view, 8, 4);
  if (riff !== "RIFF" || wave !== "WAVE") {
    throw new Error("Only RIFF/WAVE files are supported.");
  }

  let offset = 12;
  let format = null;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= view.byteLength) {
    const chunkId = readAscii(view, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;

    if (chunkId === "fmt ") {
      format = {
        audioFormat: view.getUint16(chunkStart, true),
        channelCount: view.getUint16(chunkStart + 2, true),
        sampleRate: view.getUint32(chunkStart + 4, true),
        byteRate: view.getUint32(chunkStart + 8, true),
        blockAlign: view.getUint16(chunkStart + 12, true),
        bitsPerSample: view.getUint16(chunkStart + 14, true)
      };
      if (format.audioFormat === 65534) {
        Object.assign(format, parseExtensibleFormat(view, chunkStart, chunkSize));
      }
    }

    if (chunkId === "data") {
      dataOffset = chunkStart;
      dataSize = chunkSize;
    }

    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (!format) throw new Error("WAV fmt chunk was not found.");
  if (dataOffset < 0) throw new Error("WAV data chunk was not found.");
  if (![1, 3].includes(format.audioFormat)) {
    throw new Error(`Unsupported WAV format ${format.audioFormat}; expected PCM or IEEE float.`);
  }
  if (![8, 16, 24, 32].includes(format.bitsPerSample)) {
    throw new Error(`Unsupported bit depth ${format.bitsPerSample}.`);
  }

  const bytesPerSample = format.bitsPerSample / 8;
  const frameCount = Math.floor(dataSize / format.blockAlign);
  const samples = new Float32Array(frameCount);

  for (let frame = 0; frame < frameCount; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < format.channelCount; channel += 1) {
      const sampleOffset = dataOffset + frame * format.blockAlign + channel * bytesPerSample;
      sum += readSample(view, sampleOffset, format.audioFormat, format.bitsPerSample);
    }
    samples[frame] = sum / format.channelCount;
  }

  removeDcOffset(samples);
  return {
    samples,
    sampleRate: format.sampleRate,
    channelCount: format.channelCount,
    bitsPerSample: format.bitsPerSample,
    durationSec: samples.length / format.sampleRate
  };
}

function readSample(view, offset, audioFormat, bitsPerSample) {
  if (audioFormat === 3) {
    if (bitsPerSample !== 32) {
      throw new Error("Only 32-bit IEEE float WAV is supported.");
    }
    return clamp(view.getFloat32(offset, true), -1, 1);
  }

  if (bitsPerSample === 8) {
    return (view.getUint8(offset) - 128) / 128;
  }

  if (bitsPerSample === 16) {
    return view.getInt16(offset, true) / 32768;
  }

  if (bitsPerSample === 24) {
    const b0 = view.getUint8(offset);
    const b1 = view.getUint8(offset + 1);
    const b2 = view.getUint8(offset + 2);
    let value = b0 | (b1 << 8) | (b2 << 16);
    if (value & 0x800000) value |= 0xff000000;
    return value / 8388608;
  }

  return view.getInt32(offset, true) / 2147483648;
}

function parseExtensibleFormat(view, chunkStart, chunkSize) {
  if (chunkSize < 40 || chunkStart + 40 > view.byteLength) {
    throw new Error("Invalid WAV extensible fmt chunk.");
  }

  const validBitsPerSample = view.getUint16(chunkStart + 18, true);
  const subFormatTag = view.getUint32(chunkStart + 24, true);
  const subFormatTail = readGuidTail(view, chunkStart + 28);
  const pcmGuidTail = "00001000800000aa00389b71";
  if (subFormatTail !== pcmGuidTail || ![1, 3].includes(subFormatTag)) {
    throw new Error(`Unsupported WAV extensible subformat ${subFormatTag}.`);
  }

  return {
    audioFormat: subFormatTag,
    validBitsPerSample: validBitsPerSample || view.getUint16(chunkStart + 14, true)
  };
}

function readGuidTail(view, offset) {
  let value = "";
  for (let i = 0; i < 12; i += 1) {
    value += view.getUint8(offset + i).toString(16).padStart(2, "0");
  }
  return value;
}

function removeDcOffset(samples) {
  let mean = 0;
  for (const sample of samples) mean += sample;
  mean /= samples.length || 1;
  for (let i = 0; i < samples.length; i += 1) samples[i] -= mean;
}

function readAscii(view, offset, length) {
  let value = "";
  for (let i = 0; i < length; i += 1) value += String.fromCharCode(view.getUint8(offset + i));
  return value;
}

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
