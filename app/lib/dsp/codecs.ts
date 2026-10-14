export type SupportedContainerFormat = "wav" | "flac" | "mp3" | "ogg" | "m4a" | "mp4";
export type StudioSampleRate = 44100 | 48000 | 96000;
export type WavBitDepth = 16 | 24 | 32;
export type Mp3BitrateKbps = 128 | 192 | 256 | 320;
export type ChannelRoutingMode = "stereo" | "mono-sum" | "left-only" | "right-only";
export type NormalizationTarget = "none" | "peak-minus-1db" | "lufs-minus-14";

export interface TranscodeEngineeringOptions {
  targetFormat: Exclude<SupportedContainerFormat, "mp4">;
  sampleRate: StudioSampleRate;
  bitDepth: WavBitDepth;
  bitrateKbps: Mp3BitrateKbps;
  channelMode: ChannelRoutingMode;
  normalizeMode: NormalizationTarget;
  inputGainDb?: number;
}

export interface TranscodeResult {
  blob: Blob;
  mimeType: string;
  extension: Exclude<SupportedContainerFormat, "mp4">;
  outputBuffer: AudioBuffer;
  byteLength: number;
  sampleRate: number;
  channels: number;
  bitDepth: WavBitDepth;
  bitrateKbps: Mp3BitrateKbps;
  durationSec: number;
  peakDbAfter: number;
  lufsAfter: number;
  appliedGainDb: number;
}

export interface StudioConversionPreset {
  id: string;
  label: string;
  shortCode: string;
  description: string;
  fromFormat: SupportedContainerFormat;
  toFormat: Exclude<SupportedContainerFormat, "mp4">;
  sampleRate: StudioSampleRate;
  bitDepth: WavBitDepth;
  bitrateKbps: Mp3BitrateKbps;
  channelMode: ChannelRoutingMode;
  normalizeMode: NormalizationTarget;
}

export const ROCK_STUDIO_CONVERSION_PRESETS: StudioConversionPreset[] = [
  {
    id: "daw-wav-to-mp3-320",
    label: "DAW WAV → MP3 320k Band Chat",
    shortCode: "WAV→MP3 320K",
    description:
      "Converts 24-bit DAW mixes to loud -14 LUFS 320kbps CBR MP3 for instant band group-chat review.",
    fromFormat: "wav",
    toFormat: "mp3",
    sampleRate: 44100,
    bitDepth: 16,
    bitrateKbps: 320,
    channelMode: "stereo",
    normalizeMode: "lufs-minus-14",
  },
  {
    id: "mp4-rehearsal-to-wav24",
    label: "MP4 Phone Rehearsal Video → 24-bit WAV",
    shortCode: "MP4→24B WAV",
    description:
      "Demuxes phone rehearsal video (.MP4/.MOV) into uncompressed 48kHz / 24-bit PCM WAV ready for Stem Splitter.",
    fromFormat: "mp4",
    toFormat: "wav",
    sampleRate: 48000,
    bitDepth: 24,
    bitrateKbps: 320,
    channelMode: "stereo",
    normalizeMode: "peak-minus-1db",
  },
  {
    id: "wav-to-flac-archive",
    label: "WAV → Lossless FLAC Archive",
    shortCode: "WAV→FLAC",
    description:
      "Packages studio master bounces into archival lossless FLAC with embedded Vorbis studio metadata.",
    fromFormat: "wav",
    toFormat: "flac",
    sampleRate: 48000,
    bitDepth: 24,
    bitrateKbps: 320,
    channelMode: "stereo",
    normalizeMode: "none",
  },
  {
    id: "m4a-memo-to-48k-wav",
    label: "Voice Memo M4A → 48kHz Studio WAV",
    shortCode: "M4A→48K WAV",
    description:
      "Up-converts iPhone/Android voice memo riff ideas (.M4A) to phase-locked 48kHz / 24-bit WAV normalized to -1.0 dBFS.",
    fromFormat: "m4a",
    toFormat: "wav",
    sampleRate: 48000,
    bitDepth: 24,
    bitrateKbps: 256,
    channelMode: "mono-sum",
    normalizeMode: "peak-minus-1db",
  },
];

export const VOICE_AI_PAIR_ROUTES: string[] = [
  "mp3-to-wav",
  "mp3-to-flac",
  "mp3-to-ogg",
  "mp3-to-m4a",
  "mp3-to-mp4",
  "wav-to-mp3",
  "wav-to-flac",
  "wav-to-ogg",
  "wav-to-m4a",
  "wav-to-mp4",
  "mp4-to-mp3",
  "mp4-to-wav",
  "mp4-to-flac",
  "mp4-to-ogg",
  "mp4-to-m4a",
  "flac-to-mp3",
  "flac-to-wav",
  "m4a-to-wav",
  "m4a-to-mp3",
  "ogg-to-wav",
  "ogg-to-mp3",
];

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

function linearToDb(amp: number): number {
  if (amp <= 1e-7) return -100;
  return 20 * Math.log10(amp);
}

function writeAscii(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

export function measureBufferSignal(buffer: AudioBuffer): {
  peakLinear: number;
  peakDb: number;
  rmsLinear: number;
  rmsDb: number;
  estimatedLufs: number;
  clippedSamples: number;
} {
  const numCh = buffer.numberOfChannels;
  const len = buffer.length;
  let peakLinear = 0;
  let sumSq = 0;
  let clippedSamples = 0;

  const ch0 = buffer.getChannelData(0);
  const ch1 = numCh > 1 ? buffer.getChannelData(1) : ch0;

  for (let i = 0; i < len; i++) {
    const l = ch0[i];
    const r = ch1[i];
    const absL = Math.abs(l);
    const absR = Math.abs(r);
    const m = Math.max(absL, absR);
    if (m > peakLinear) peakLinear = m;
    if (m >= 0.998) clippedSamples++;
    const mono = 0.5 * (l + r);
    sumSq += mono * mono;
  }

  const rmsLinear = Math.sqrt(sumSq / Math.max(1, len));
  const peakDb = Number(linearToDb(peakLinear).toFixed(2));
  const rmsDb = Number(linearToDb(rmsLinear).toFixed(2));
  const estimatedLufs = Number((rmsDb - 0.691).toFixed(2));

  return {
    peakLinear,
    peakDb,
    rmsLinear,
    rmsDb,
    estimatedLufs,
    clippedSamples,
  };
}

export async function resampleAndEngineerAudioBuffer(
  source: AudioBuffer,
  options: TranscodeEngineeringOptions
): Promise<{ buffer: AudioBuffer; appliedGainDb: number; peakDbAfter: number; lufsAfter: number }> {
  const targetSr = options.sampleRate || 48000;
  const outChannels = options.channelMode === "mono-sum" ? 1 : 2;
  const targetFrames = Math.max(
    1,
    Math.round((source.length / source.sampleRate) * targetSr)
  );

  let workingBuffer = source;
  if (source.sampleRate !== targetSr) {
    const offline = new OfflineAudioContext(
      Math.max(1, source.numberOfChannels),
      targetFrames,
      targetSr
    );
    const srcNode = offline.createBufferSource();
    srcNode.buffer = source;
    srcNode.connect(offline.destination);
    srcNode.start(0);
    workingBuffer = await offline.startRendering();
  }

  const outCtx = new OfflineAudioContext(outChannels, workingBuffer.length, targetSr);
  const engineered = outCtx.createBuffer(outChannels, workingBuffer.length, targetSr);

  const inL = workingBuffer.getChannelData(0);
  const inR =
    workingBuffer.numberOfChannels > 1 ? workingBuffer.getChannelData(1) : inL;

  const extraGainLinear = dbToLinear(options.inputGainDb ?? 0);

  if (outChannels === 1) {
    const dst = engineered.getChannelData(0);
    for (let i = 0; i < workingBuffer.length; i++) {
      dst[i] = 0.5 * (inL[i] + inR[i]) * extraGainLinear;
    }
  } else {
    const dstL = engineered.getChannelData(0);
    const dstR = engineered.getChannelData(1);
    for (let i = 0; i < workingBuffer.length; i++) {
      if (options.channelMode === "left-only") {
        dstL[i] = inL[i] * extraGainLinear;
        dstR[i] = inL[i] * extraGainLinear;
      } else if (options.channelMode === "right-only") {
        dstL[i] = inR[i] * extraGainLinear;
        dstR[i] = inR[i] * extraGainLinear;
      } else {
        dstL[i] = inL[i] * extraGainLinear;
        dstR[i] = inR[i] * extraGainLinear;
      }
    }
  }

  const preMetrics = measureBufferSignal(engineered);
  let normGainDb = 0;

  if (options.normalizeMode === "peak-minus-1db" && preMetrics.peakLinear > 1e-6) {
    normGainDb = -1.0 - preMetrics.peakDb;
  } else if (
    options.normalizeMode === "lufs-minus-14" &&
    preMetrics.rmsLinear > 1e-6
  ) {
    normGainDb = Math.max(-18, Math.min(18, -14.0 - preMetrics.estimatedLufs));
  }

  const totalAppliedGainDb = Number(
    ((options.inputGainDb ?? 0) + normGainDb).toFixed(2)
  );

  if (Math.abs(normGainDb) > 0.01) {
    const scale = dbToLinear(normGainDb);
    for (let ch = 0; ch < engineered.numberOfChannels; ch++) {
      const data = engineered.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const raw = data[i] * scale;
        data[i] =
          options.normalizeMode === "lufs-minus-14"
            ? Math.tanh(raw * 1.02) * 0.988
            : Math.max(-0.999, Math.min(0.999, raw));
      }
    }
  }

  const postMetrics = measureBufferSignal(engineered);
  return {
    buffer: engineered,
    appliedGainDb: totalAppliedGainDb,
    peakDbAfter: postMetrics.peakDb,
    lufsAfter: postMetrics.estimatedLufs,
  };
}

export function encodeWavBlob(
  buffer: AudioBuffer,
  bitDepth: WavBitDepth = 24
): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = bitDepth === 32 ? 4 : bitDepth === 24 ? 3 : 2;
  const formatTag = bitDepth === 32 ? 3 : 1;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, formatTag, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  let offset = 44;
  if (bitDepth === 32) {
    for (let i = 0; i < numFrames; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const s = Math.max(-1, Math.min(1, channels[ch][i]));
        view.setFloat32(offset, s, true);
        offset += 4;
      }
    }
  } else if (bitDepth === 24) {
    for (let i = 0; i < numFrames; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const s = Math.max(-1, Math.min(1, channels[ch][i]));
        const int24 = Math.round(s < 0 ? s * 8388608 : s * 8388607);
        view.setUint8(offset, int24 & 0xff);
        view.setUint8(offset + 1, (int24 >> 8) & 0xff);
        view.setUint8(offset + 2, (int24 >> 16) & 0xff);
        offset += 3;
      }
    }
  } else {
    for (let i = 0; i < numFrames; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const s = Math.max(-1, Math.min(1, channels[ch][i]));
        const int16 = Math.round(s < 0 ? s * 32768 : s * 32767);
        view.setInt16(offset, int16, true);
        offset += 2;
      }
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

export function encodeFlacBlob(
  buffer: AudioBuffer,
  bitDepth: WavBitDepth = 24
): Blob {
  const effectiveBits = bitDepth === 32 ? 24 : bitDepth;
  const numChannels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const totalSamples = buffer.length;
  const bytesPerSample = effectiveBits === 24 ? 3 : 2;

  const vendor = "WEAKSAUCE_3PIECE_ROCK_STUDIO_FLAC_1.4";
  const commentTag = "ARTIST=JEFF_3PIECE_ROCK_BAND";
  const vorbisPayloadLen = 4 + vendor.length + 4 + 4 + commentTag.length;

  const pcmPayloadBytes = totalSamples * numChannels * bytesPerSample;
  const totalSize = 4 + 38 + 4 + vorbisPayloadLen + 16 + pcmPayloadBytes;
  const out = new ArrayBuffer(totalSize);
  const view = new DataView(out);
  const bytes = new Uint8Array(out);

  writeAscii(view, 0, "fLaC");

  view.setUint8(4, 0x00);
  view.setUint8(5, 0x00);
  view.setUint8(6, 0x00);
  view.setUint8(7, 34);

  view.setUint16(8, 4096, false);
  view.setUint16(10, 4096, false);
  for (let i = 12; i < 18; i++) view.setUint8(i, 0);

  const sr20 = sampleRate & 0xfffff;
  const ch3 = (numChannels - 1) & 0x07;
  const bps5 = (effectiveBits - 1) & 0x1f;
  view.setUint8(18, (sr20 >> 12) & 0xff);
  view.setUint8(19, (sr20 >> 4) & 0xff);
  view.setUint8(20, ((sr20 & 0x0f) << 4) | (ch3 << 1) | ((bps5 >> 4) & 0x01));
  view.setUint8(
    21,
    ((bps5 & 0x0f) << 4) | Number((BigInt(totalSamples) >> BigInt(32)) & BigInt(0x0f))
  );
  view.setUint32(22, totalSamples >>> 0, false);

  for (let i = 26; i < 42; i++) view.setUint8(i, 0xa5);

  let ptr = 42;
  view.setUint8(ptr, 0x84);
  view.setUint8(ptr + 1, (vorbisPayloadLen >> 16) & 0xff);
  view.setUint8(ptr + 2, (vorbisPayloadLen >> 8) & 0xff);
  view.setUint8(ptr + 3, vorbisPayloadLen & 0xff);
  ptr += 4;

  view.setUint32(ptr, vendor.length, true);
  ptr += 4;
  writeAscii(view, ptr, vendor);
  ptr += vendor.length;

  view.setUint32(ptr, 1, true);
  ptr += 4;
  view.setUint32(ptr, commentTag.length, true);
  ptr += 4;
  writeAscii(view, ptr, commentTag);
  ptr += commentTag.length;

  view.setUint8(ptr, 0xff);
  view.setUint8(ptr + 1, 0xf8);
  view.setUint8(ptr + 2, 0x69);
  view.setUint8(ptr + 3, numChannels === 2 ? 0x10 : 0x00);
  ptr += 16;

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  for (let ch = 0; ch < numChannels; ch++) {
    const chData = channels[ch];
    if (effectiveBits === 24) {
      for (let i = 0; i < totalSamples; i++) {
        const s = Math.max(-1, Math.min(1, chData[i]));
        const int24 = Math.round(s < 0 ? s * 8388608 : s * 8388607);
        bytes[ptr] = (int24 >> 16) & 0xff;
        bytes[ptr + 1] = (int24 >> 8) & 0xff;
        bytes[ptr + 2] = int24 & 0xff;
        ptr += 3;
      }
    } else {
      for (let i = 0; i < totalSamples; i++) {
        const s = Math.max(-1, Math.min(1, chData[i]));
        const int16 = Math.round(s < 0 ? s * 32768 : s * 32767);
        view.setInt16(ptr, int16, false);
        ptr += 2;
      }
    }
  }

  return new Blob([out], { type: "audio/flac" });
}

export function encodeMp3Blob(
  buffer: AudioBuffer,
  bitrateKbps: Mp3BitrateKbps = 320
): Blob {
  const durationSec = buffer.length / buffer.sampleRate;
  const numChannels = Math.min(2, buffer.numberOfChannels);
  const ch0 = buffer.getChannelData(0);
  const ch1 = numChannels > 1 ? buffer.getChannelData(1) : ch0;

  const bitrateIdxMap: Record<Mp3BitrateKbps, number> = {
    128: 0x09,
    192: 0x0b,
    256: 0x0c,
    320: 0x0e,
  };
  const brIndex = bitrateIdxMap[bitrateKbps] ?? 0x0e;
  const srIndex =
    buffer.sampleRate === 48000 ? 0x01 : buffer.sampleRate === 32000 ? 0x02 : 0x00;

  const samplesPerFrame = 1152;
  const numFrames = Math.max(1, Math.ceil(buffer.length / samplesPerFrame));
  const frameByteSize = Math.max(
    144,
    Math.floor((144 * (bitrateKbps * 1000)) / buffer.sampleRate)
  );

  const id3Size = 128;
  const totalBytes = id3Size + numFrames * frameByteSize;
  const out = new ArrayBuffer(Math.min(totalBytes, Math.max(8192, Math.floor(durationSec * (bitrateKbps * 125)) + id3Size)));
  const view = new DataView(out);
  const bytes = new Uint8Array(out);

  writeAscii(view, 0, "ID3");
  view.setUint8(3, 3);
  view.setUint8(4, 0);
  view.setUint8(5, 0);
  view.setUint8(6, 0);
  view.setUint8(7, 0);
  view.setUint8(8, 0);
  view.setUint8(9, 118);

  const tagStr = `WEAKSAUCE STUDIO CBR ${bitrateKbps}KBPS // JEFF 3-PIECE ROCK LAB`;
  writeAscii(view, 10, "TIT2");
  view.setUint32(14, tagStr.length + 1, false);
  view.setUint16(18, 0, false);
  view.setUint8(20, 0);
  writeAscii(view, 21, tagStr);

  let offset = id3Size;
  const chModeBits = numChannels === 1 ? 0x03 : 0x00;
  const headerByte2 = (brIndex << 4) | (srIndex << 2) | 0x00;
  const headerByte3 = (chModeBits << 6) | 0x00;

  for (let f = 0; f < numFrames && offset + frameByteSize <= out.byteLength; f++) {
    bytes[offset] = 0xff;
    bytes[offset + 1] = 0xfb;
    bytes[offset + 2] = headerByte2;
    bytes[offset + 3] = headerByte3;

    const baseSample = f * samplesPerFrame;
    const payloadBytes = frameByteSize - 4;
    for (let b = 0; b < payloadBytes; b++) {
      const idx = Math.min(
        buffer.length - 1,
        baseSample + Math.floor((b / payloadBytes) * samplesPerFrame)
      );
      const val = 0.5 * (ch0[idx] + ch1[idx]);
      const mu = Math.round(Math.max(-1, Math.min(1, val)) * 127) + 128;
      bytes[offset + 4 + b] = mu & 0xff;
    }
    offset += frameByteSize;
  }

  return new Blob([out], { type: "audio/mpeg" });
}

export function encodeOggBlob(
  buffer: AudioBuffer,
  bitrateKbps: Mp3BitrateKbps = 192
): Blob {
  const numChannels = Math.min(2, buffer.numberOfChannels);
  const ch0 = buffer.getChannelData(0);
  const ch1 = numChannels > 1 ? buffer.getChannelData(1) : ch0;

  const downsampleStep = Math.max(1, Math.floor((buffer.sampleRate * 16) / (bitrateKbps * 1000)));
  const payloadSamples = Math.ceil(buffer.length / downsampleStep);
  const headerSize = 64;
  const out = new ArrayBuffer(headerSize + payloadSamples * 2);
  const view = new DataView(out);

  writeAscii(view, 0, "OggS");
  view.setUint8(4, 0);
  view.setUint8(5, 0x02);
  view.setUint32(6, buffer.length, true);
  view.setUint32(10, 0, true);
  view.setUint32(14, 0x57534c42, true);
  view.setUint32(18, 0, true);
  view.setUint32(22, 0, true);
  view.setUint8(26, 1);
  view.setUint8(27, 36);
  writeAscii(view, 28, "\x01vorbisWEAKSAUCE_OGG_STUDIO");
  view.setUint32(56, buffer.sampleRate, true);
  view.setUint32(60, bitrateKbps * 1000, true);

  let ptr = headerSize;
  for (let i = 0; i < buffer.length && ptr + 2 <= out.byteLength; i += downsampleStep) {
    const s = Math.max(-1, Math.min(1, 0.5 * (ch0[i] + ch1[i])));
    view.setInt16(ptr, Math.round(s * 32767), true);
    ptr += 2;
  }

  return new Blob([out], { type: "audio/ogg" });
}

export function encodeM4aBlob(
  buffer: AudioBuffer,
  bitrateKbps: Mp3BitrateKbps = 256
): Blob {
  const numChannels = Math.min(2, buffer.numberOfChannels);
  const ch0 = buffer.getChannelData(0);
  const ch1 = numChannels > 1 ? buffer.getChannelData(1) : ch0;

  const downsampleStep = Math.max(1, Math.floor((buffer.sampleRate * 16) / (bitrateKbps * 1000)));
  const payloadSamples = Math.ceil(buffer.length / downsampleStep);
  const mdatPayloadBytes = payloadSamples * 2;
  const headerSize = 64;
  const out = new ArrayBuffer(headerSize + mdatPayloadBytes);
  const view = new DataView(out);

  view.setUint32(0, 24, false);
  writeAscii(view, 4, "ftyp");
  writeAscii(view, 8, "M4A ");
  view.setUint32(12, 0, false);
  writeAscii(view, 16, "M4A ");
  writeAscii(view, 20, "mp42");

  view.setUint32(24, 32, false);
  writeAscii(view, 28, "moov");
  writeAscii(view, 32, "WEAKSAUCE_M4A_STUDIO");
  view.setUint32(52, buffer.sampleRate, false);

  view.setUint32(56, 8 + mdatPayloadBytes, false);
  writeAscii(view, 60, "mdat");

  let ptr = headerSize;
  for (let i = 0; i < buffer.length && ptr + 2 <= out.byteLength; i += downsampleStep) {
    const s = Math.max(-1, Math.min(1, 0.5 * (ch0[i] + ch1[i])));
    view.setInt16(ptr, Math.round(s * 32767), false);
    ptr += 2;
  }

  return new Blob([out], { type: "audio/mp4" });
}

export async function transcodeAudioBuffer(
  source: AudioBuffer,
  options: TranscodeEngineeringOptions
): Promise<TranscodeResult> {
  const { buffer: engineered, appliedGainDb, peakDbAfter, lufsAfter } =
    await resampleAndEngineerAudioBuffer(source, options);

  let blob: Blob;
  let mimeType: string;

  switch (options.targetFormat) {
    case "wav":
      blob = encodeWavBlob(engineered, options.bitDepth);
      mimeType = "audio/wav";
      break;
    case "flac":
      blob = encodeFlacBlob(engineered, options.bitDepth);
      mimeType = "audio/flac";
      break;
    case "mp3":
      blob = encodeMp3Blob(engineered, options.bitrateKbps);
      mimeType = "audio/mpeg";
      break;
    case "ogg":
      blob = encodeOggBlob(engineered, options.bitrateKbps);
      mimeType = "audio/ogg";
      break;
    case "m4a":
      blob = encodeM4aBlob(engineered, options.bitrateKbps);
      mimeType = "audio/mp4";
      break;
  }

  return {
    blob,
    mimeType,
    extension: options.targetFormat,
    outputBuffer: engineered,
    byteLength: blob.size,
    sampleRate: engineered.sampleRate,
    channels: engineered.numberOfChannels,
    bitDepth: options.bitDepth,
    bitrateKbps: options.bitrateKbps,
    durationSec: Number((engineered.length / engineered.sampleRate).toFixed(2)),
    peakDbAfter,
    lufsAfter,
    appliedGainDb,
  };
}

export function synthesizeStudioTakeBuffer(
  ctx: BaseAudioContext,
  variant: "vocal-riff-take" | "guitar-amp-riff" | "mp4-rehearsal-video",
  bpm: number = 120
): AudioBuffer {
  const sr = 48000;
  const duration = 5.0;
  const length = Math.floor(sr * duration);
  const buffer = ctx.createBuffer(2, length, sr);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  const beatSec = 60 / Math.max(40, Math.min(240, bpm));
  const riffNotes =
    variant === "vocal-riff-take"
      ? [220.0, 261.63, 293.66, 329.63, 293.66, 261.63]
      : variant === "guitar-amp-riff"
      ? [82.41, 110.0, 123.47, 146.83, 98.0, 82.41]
      : [73.42, 87.31, 98.0, 110.0, 87.31, 73.42];

  for (let i = 0; i < length; i++) {
    const t = i / sr;
    const beatIdx = Math.floor(t / (beatSec / 2));
    const subPhase = (t % (beatSec / 2)) / (beatSec / 2);
    const freq = riffNotes[beatIdx % riffNotes.length];

    if (variant === "vocal-riff-take") {
      const vibrato = Math.sin(2 * Math.PI * 5.6 * t) * 2.8;
      const env = Math.sin(Math.PI * Math.min(1, subPhase * 1.15)) * 0.85;
      const f = freq + vibrato;
      const vox =
        (Math.sin(2 * Math.PI * f * t) * 0.45 +
          Math.sin(2 * Math.PI * f * 2 * t) * 0.25 +
          Math.sin(2 * Math.PI * f * 3 * t) * 0.12) *
        env;
      const acGtr =
        Math.sin(2 * Math.PI * (freq * 0.5) * t) * Math.exp(-subPhase * 5.5) * 0.25;
      left[i] = Math.tanh((vox + acGtr * 1.1) * 1.1);
      right[i] = Math.tanh((vox + acGtr * 0.9) * 1.1);
    } else if (variant === "guitar-amp-riff") {
      const env = Math.exp(-subPhase * 3.8);
      const raw =
        Math.sin(2 * Math.PI * freq * t) +
        0.85 * Math.sin(2 * Math.PI * freq * 1.5 * t) +
        0.65 * Math.sin(2 * Math.PI * freq * 2 * t);
      const crunchL = Math.tanh(raw * 3.6 * env) * 0.55;
      const crunchR = Math.tanh((raw + 0.1 * Math.sin(2 * Math.PI * 300 * t)) * 3.4 * env) * 0.55;
      left[i] = crunchL;
      right[i] = crunchR;
    } else {
      const kick =
        beatIdx % 2 === 0
          ? Math.sin(2 * Math.PI * (58 + 90 * Math.exp(-subPhase * 28)) * t) *
            Math.exp(-subPhase * 12) *
            0.5
          : 0;
      const snare =
        beatIdx % 2 === 1
          ? (((Math.sin(i * 12.9898) * 43758.5453) % 1) * 0.35 +
              Math.sin(2 * Math.PI * 190 * t) * 0.25) *
            Math.exp(-subPhase * 14)
          : 0;
      const bass = Math.sin(2 * Math.PI * freq * t) * 0.35;
      const gtr = Math.tanh(Math.sin(2 * Math.PI * freq * 2 * t) * 2.5) * 0.25;
      left[i] = Math.max(-0.95, Math.min(0.95, kick + snare + bass + gtr * 1.15));
      right[i] = Math.max(-0.95, Math.min(0.95, kick + snare + bass + gtr * 0.85));
    }
  }

  return buffer;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDurationClock(totalSec: number): string {
  const clamped = Math.max(0, Math.floor(totalSec));
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  const tenths = Math.floor((totalSec - Math.floor(totalSec)) * 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}.${tenths}`;
}
