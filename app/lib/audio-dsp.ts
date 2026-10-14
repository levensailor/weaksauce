import { DspRecipeType } from "@/app/lib/tool-catalog";
import {
  runAudioEnhancerDsp,
  runEchoRemoverDsp,
  runReverbRemoverDsp,
} from "@/app/lib/dsp/cleanup-dsp";
import {
  ROCK_VOCAL_PRESETS,
  RockVocalPresetId,
  renderVocalPitchLabDsp,
} from "@/app/lib/dsp/vocal-bpm-dsp";

export interface DemoStemOption {
  id: string;
  label: string;
  subLabel: string;
  bpm: number;
  keyLabel: string;
}

export const DEMO_STEMS: DemoStemOption[] = [
  {
    id: "trio-mix",
    label: "3-PIECE GARAGE ROCK MIX",
    subLabel: "Drums + SVT Bass + Panned Crunch Guitar + Lead Vocal (128 BPM / E Min)",
    bpm: 128,
    keyLabel: "E Minor (9A)",
  },
  {
    id: "raw-vocal-hum",
    label: "UNTREATED VOCAL + 60HZ AMP HUM",
    subLabel: "Dry Singer Mic + 60Hz Single-Coil Buzz + Slapback Room Echo (118 BPM / A Min)",
    bpm: 118,
    keyLabel: "A Minor (8A)",
  },
  {
    id: "drop-d-riff",
    label: "DROP-D HEAVY RIFF + DRUM GROOVE",
    subLabel: "Tight Kick/Snare Transients + Drop-D Guitar Chug (140 BPM / D Min)",
    bpm: 140,
    keyLabel: "D Minor (7A)",
  },
];

export interface AudioMetrics {
  sampleRate: number;
  channels: number;
  durationSec: number;
  peakDb: number;
  rmsDb: number;
  estimatedLufs: number;
  crestFactorDb: number;
  detectedBpm: number;
  detectedKey: string;
  camelotCode: string;
  phaseCorrelation: number;
  delaySubdivisionsMs: {
    quarterMs: number;
    dottedEighthMs: number;
    eighthMs: number;
    slapbackSixteenthMs: number;
  };
  chromaEnergy: { note: string; energy: number }[];
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const CAMELOT_MINOR = ["5A", "12A", "7A", "2A", "9A", "4A", "11A", "6A", "1A", "8A", "3A", "10A"];

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

function linearToDb(amp: number): number {
  if (amp <= 1e-7) return -100;
  return 20 * Math.log10(amp);
}

export function synthesizeDemoAudioBuffer(
  ctx: BaseAudioContext,
  presetId: string
): AudioBuffer {
  const sr = 44100;
  const duration = 6.0;
  const length = Math.floor(sr * duration);
  const buffer = ctx.createBuffer(2, length, sr);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  const bpm =
    presetId === "drop-d-riff" ? 140 : presetId === "raw-vocal-hum" ? 118 : 128;
  const beatSec = 60 / bpm;

  const chordRoots =
    presetId === "drop-d-riff"
      ? [73.42, 87.31, 82.41, 65.41]
      : presetId === "raw-vocal-hum"
      ? [110.0, 87.31, 130.81, 98.0]
      : [82.41, 98.0, 110.0, 123.47];

  for (let i = 0; i < length; i++) {
    const t = i / sr;
    const beatIndex = Math.floor(t / beatSec);
    const beatPhase = (t % beatSec) / beatSec;
    const barIndex = Math.floor(beatIndex / 2) % chordRoots.length;
    const rootFreq = chordRoots[barIndex];

    let drums = 0;
    const isKickBeat = beatIndex % 2 === 0;
    const isSnareBeat = beatIndex % 2 === 1;
    if (isKickBeat && beatPhase < 0.35) {
      const env = Math.exp(-beatPhase * 16);
      const sweepFreq = 52 + 110 * Math.exp(-beatPhase * 38);
      drums += Math.sin(2 * Math.PI * sweepFreq * (beatPhase * beatSec)) * env * 0.55;
    }
    if (isSnareBeat && beatPhase < 0.4) {
      const env = Math.exp(-beatPhase * 18);
      const noise = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const body = Math.sin(2 * Math.PI * 185 * t) * Math.exp(-beatPhase * 25);
      drums += (noise * 0.38 + body * 0.32) * env;
    }
    const hatPhase = (t % (beatSec / 2)) / (beatSec / 2);
    const hatNoise =
      ((Math.cos(i * 78.233) * 19341.12) % 1) * Math.exp(-hatPhase * 28) * 0.1;
    drums += hatNoise;

    const bassEnv = 0.75 + 0.25 * Math.exp(-beatPhase * 6);
    const bass =
      (Math.sin(2 * Math.PI * rootFreq * t) * 0.36 +
        Math.sin(2 * Math.PI * rootFreq * 2 * t) * 0.14) *
      bassEnv;

    const gtrRawL =
      Math.sin(2 * Math.PI * rootFreq * 2 * t) +
      0.7 * Math.sin(2 * Math.PI * rootFreq * 3 * t) +
      0.4 * Math.sin(2 * Math.PI * rootFreq * 4 * t);
    const gtrRawR =
      Math.sin(2 * Math.PI * (rootFreq * 2 * 1.003) * t + 0.4) +
      0.7 * Math.sin(2 * Math.PI * (rootFreq * 3 * 0.998) * t + 1.1) +
      0.4 * Math.sin(2 * Math.PI * (rootFreq * 4 * 1.002) * t);
    const gtrL = Math.tanh(gtrRawL * 2.4) * 0.24;
    const gtrR = Math.tanh(gtrRawR * 2.4) * 0.24;

    const vibrato = Math.sin(2 * Math.PI * 5.4 * t) * 3.2;
    const vocalPitch = rootFreq * 4 + vibrato;
    const phraseGate = Math.sin(Math.PI * ((t % 1.5) / 1.5)) > 0.15 ? 1.0 : 0.05;
    const vocal =
      (Math.sin(2 * Math.PI * vocalPitch * t) * 0.25 +
        Math.sin(2 * Math.PI * vocalPitch * 2 * t) * 0.16 +
        Math.sin(2 * Math.PI * vocalPitch * 3 * t) * 0.08) *
      phraseGate;

    if (presetId === "raw-vocal-hum") {
      const hum =
        Math.sin(2 * Math.PI * 60 * t) * 0.085 +
        Math.sin(2 * Math.PI * 120 * t) * 0.05 +
        Math.sin(2 * Math.PI * 180 * t) * 0.04 +
        Math.sin(2 * Math.PI * 240 * t) * 0.025 +
        Math.sin(2 * Math.PI * 300 * t) * 0.02 +
        Math.sin(2 * Math.PI * 360 * t) * 0.015 +
        Math.sin(2 * Math.PI * 420 * t) * 0.012 +
        Math.sin(2 * Math.PI * 480 * t) * 0.01;
      const slapLagSamples = Math.floor(0.0425 * sr);
      const slapback =
        i > slapLagSamples
          ? Math.sin(2 * Math.PI * vocalPitch * ((i - slapLagSamples) / sr)) * 0.16
          : 0;
      left[i] = Math.max(-0.98, Math.min(0.98, vocal * 1.35 + gtrL * 0.45 + hum + slapback));
      right[i] = Math.max(-0.98, Math.min(0.98, vocal * 1.35 + gtrR * 0.45 + hum - slapback));
    } else {
      left[i] = Math.max(
        -0.98,
        Math.min(0.98, drums + bass + vocal + gtrL * 1.15 + gtrR * 0.2)
      );
      right[i] = Math.max(
        -0.98,
        Math.min(0.98, drums + bass + vocal + gtrR * 1.15 + gtrL * 0.2)
      );
    }
  }

  return buffer;
}

export function analyzeAudioBuffer(buffer: AudioBuffer): AudioMetrics {
  const sr = buffer.sampleRate;
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  const ch0 = buffer.getChannelData(0);
  const ch1 = channels > 1 ? buffer.getChannelData(1) : ch0;

  let peak = 0;
  let sumSq = 0;
  let corrNum = 0;
  let corrDenL = 0;
  let corrDenR = 0;

  const stride = Math.max(1, Math.floor(length / 60000));
  let sampleCount = 0;

  for (let i = 0; i < length; i += stride) {
    const l = ch0[i];
    const r = ch1[i];
    const absMax = Math.max(Math.abs(l), Math.abs(r));
    if (absMax > peak) peak = absMax;
    const mono = 0.5 * (l + r);
    sumSq += mono * mono;
    corrNum += l * r;
    corrDenL += l * l;
    corrDenR += r * r;
    sampleCount++;
  }

  const rms = Math.sqrt(sumSq / Math.max(1, sampleCount));
  const peakDb = Number(linearToDb(peak).toFixed(2));
  const rmsDb = Number(linearToDb(rms).toFixed(2));
  const estimatedLufs = Number((rmsDb - 0.691).toFixed(2));
  const crestFactorDb = Number(Math.max(0, peakDb - rmsDb).toFixed(2));
  const denom = Math.sqrt(corrDenL * corrDenR);
  const phaseCorrelation = denom > 1e-9 ? Number((corrNum / denom).toFixed(2)) : 1.0;

  const hop = Math.floor(sr * 0.02);
  const numFrames = Math.floor(length / hop);
  const env = new Float32Array(numFrames);
  let lp = 0;
  const alpha240 = (2 * Math.PI * 240) / sr;
  for (let f = 0; f < numFrames; f++) {
    let e = 0;
    const start = f * hop;
    for (let j = 0; j < hop; j += 8) {
      lp += alpha240 * (ch0[start + j] - lp);
      e += lp * lp;
    }
    env[f] = Math.sqrt(e / (hop / 8));
  }

  let bestLag = 24;
  let bestCorr = -1;
  for (let lag = 17; lag <= 40; lag++) {
    let c = 0;
    for (let f = 0; f + lag < numFrames; f++) {
      c += env[f] * env[f + lag];
    }
    if (c > bestCorr) {
      bestCorr = c;
      bestLag = lag;
    }
  }
  const detectedBpm = Math.round((60 / (bestLag * 0.02)) * 2) / 2;
  const quarterMs = Number((60000 / Math.max(40, detectedBpm)).toFixed(1));

  const chromaScores = new Array<number>(12).fill(0);
  const probeWindow = Math.min(length, sr * 3);
  for (let pitchClass = 0; pitchClass < 12; pitchClass++) {
    const freq = 110 * Math.pow(2, (pitchClass - 9) / 12);
    const omega = (2 * Math.PI * freq) / sr;
    let re = 0;
    let im = 0;
    for (let n = 0; n < probeWindow; n += 16) {
      const sample = ch0[n];
      re += sample * Math.cos(omega * n);
      im -= sample * Math.sin(omega * n);
    }
    chromaScores[pitchClass] = Math.sqrt(re * re + im * im);
  }
  const maxChroma = Math.max(...chromaScores, 1e-6);
  let dominantIndex = 0;
  for (let k = 0; k < 12; k++) {
    if (chromaScores[k] > chromaScores[dominantIndex]) {
      dominantIndex = k;
    }
  }

  const chromaEnergy = NOTE_NAMES.map((note, idx) => ({
    note,
    energy: Math.round((chromaScores[idx] / maxChroma) * 100),
  }));

  return {
    sampleRate: sr,
    channels,
    durationSec: Number((length / sr).toFixed(2)),
    peakDb,
    rmsDb,
    estimatedLufs,
    crestFactorDb,
    detectedBpm,
    detectedKey: `${NOTE_NAMES[dominantIndex]} Minor`,
    camelotCode: CAMELOT_MINOR[dominantIndex],
    phaseCorrelation,
    delaySubdivisionsMs: {
      quarterMs,
      dottedEighthMs: Number((quarterMs * 0.75).toFixed(1)),
      eighthMs: Number((quarterMs * 0.5).toFixed(1)),
      slapbackSixteenthMs: Number((quarterMs * 0.25).toFixed(1)),
    },
    chromaEnergy,
  };
}

export async function runToolDspRecipe(
  source: AudioBuffer,
  recipe: DspRecipeType,
  params: Record<string, number>,
  selectedOutputId?: string
): Promise<AudioBuffer> {
  const sr = source.sampleRate;
  const numCh = Math.max(2, source.numberOfChannels);
  const inL = source.getChannelData(0);
  const inR = source.numberOfChannels > 1 ? source.getChannelData(1) : inL;

  const offline = new OfflineAudioContext(numCh, source.length, sr);
  const outBuf = offline.createBuffer(2, source.length, sr);
  const outL = outBuf.getChannelData(0);
  const outR = outBuf.getChannelData(1);

  switch (recipe) {
    case "vocal-remover": {
      const voxGain = dbToLinear(params.vocalGainDb ?? -12);
      const instGain = dbToLinear(params.instGainDb ?? 0);
      const lowCut = Math.max(80, Math.min(300, params.lowCutHz ?? 170));
      const highCut = Math.max(5000, Math.min(14000, params.highCutHz ?? 8500));
      const alphaLow = Math.min(0.45, (2 * Math.PI * lowCut) / sr);
      const alphaHigh = Math.min(0.85, (2 * Math.PI * highCut) / sr);
      let lpLowL = 0;
      let lpLowR = 0;
      let lpHighL = 0;
      let lpHighR = 0;
      let smoothMid = 0;
      let smoothSide = 0;
      for (let i = 0; i < source.length; i++) {
        const l = inL[i];
        const r = inR[i];
        lpLowL += alphaLow * (l - lpLowL);
        lpLowR += alphaLow * (r - lpLowR);
        const midHighL = l - lpLowL;
        const midHighR = r - lpLowR;
        lpHighL += alphaHigh * (midHighL - lpHighL);
        lpHighR += alphaHigh * (midHighR - lpHighR);
        const airL = midHighL - lpHighL;
        const airR = midHighR - lpHighR;
        const mid = 0.5 * (lpHighL + lpHighR);
        const side = 0.5 * (lpHighL - lpHighR);
        smoothMid = 0.992 * smoothMid + 0.008 * Math.abs(mid);
        smoothSide = 0.992 * smoothSide + 0.008 * Math.abs(side);
        const centerMask = smoothMid / (smoothMid + smoothSide * 1.45 + 1e-6);
        const isolatedVocal = mid * centerMask + 0.25 * (airL + airR) * centerMask;
        const instMidRes = mid * (1 - centerMask * 0.92);
        const instL = lpLowL + instMidRes + side + airL * (1 - 0.25 * centerMask);
        const instR = lpLowR + instMidRes - side + airR * (1 - 0.25 * centerMask);

        if (selectedOutputId === "vocals") {
          outL[i] = Math.tanh(isolatedVocal * 1.25);
          outR[i] = Math.tanh(isolatedVocal * 1.25);
        } else if (selectedOutputId === "instrumental") {
          outL[i] = Math.tanh(instL);
          outR[i] = Math.tanh(instR);
        } else {
          outL[i] = Math.tanh(instL * instGain + isolatedVocal * voxGain);
          outR[i] = Math.tanh(instR * instGain + isolatedVocal * voxGain);
        }
      }
      break;
    }

    case "stem-splitter": {
      const gVox = dbToLinear(params.vocalsDb ?? 0);
      const gGtr = dbToLinear(params.guitarDb ?? 1.5);
      const gBass = dbToLinear(params.bassDb ?? 2.0);
      const gDrums = dbToLinear(params.drumsDb ?? 2.0);
      let lpBass = 0;
      let lpWarm = 0;
      let fastEnv = 0;
      let slowEnv = 0;
      const bassAlpha = (2 * Math.PI * 195) / sr;
      const warmAlpha = (2 * Math.PI * 1100) / sr;

      for (let i = 0; i < source.length; i++) {
        const l = inL[i];
        const r = inR[i];
        const mid = 0.5 * (l + r);
        const side = 0.5 * (l - r);
        lpBass += bassAlpha * (mid - lpBass);
        const upperMid = mid - lpBass;
        lpWarm += warmAlpha * (upperMid - lpWarm);
        const absMid = Math.abs(mid);
        fastEnv = 0.975 * fastEnv + 0.025 * absMid;
        slowEnv = 0.9992 * slowEnv + 0.0008 * absMid;
        const transientMask = Math.min(1, Math.max(0, (fastEnv - slowEnv) * 4.5));

        const bassStem = lpBass * (1 - transientMask * 0.65);
        const drumStem = upperMid * transientMask + lpBass * transientMask * 0.65;
        const voxStem = (upperMid - lpWarm * 0.45) * (1 - transientMask);
        const pianoStem = lpWarm * 0.75 * (1 - transientMask);
        const gtrStem = side;
        const otherStem = side * 0.35 + (upperMid - lpWarm) * 0.2;

        if (selectedOutputId === "vocals") {
          outL[i] = Math.tanh(voxStem * 1.3);
          outR[i] = Math.tanh(voxStem * 1.3);
        } else if (selectedOutputId === "guitar") {
          outL[i] = Math.tanh(gtrStem * 1.4);
          outR[i] = Math.tanh(-gtrStem * 1.4);
        } else if (selectedOutputId === "bass") {
          outL[i] = Math.tanh(bassStem * 1.5);
          outR[i] = Math.tanh(bassStem * 1.5);
        } else if (selectedOutputId === "drums") {
          outL[i] = Math.tanh(drumStem * 1.5);
          outR[i] = Math.tanh(drumStem * 1.5);
        } else if (selectedOutputId === "piano") {
          outL[i] = Math.tanh(pianoStem * 1.35);
          outR[i] = Math.tanh(pianoStem * 1.35);
        } else if (selectedOutputId === "other") {
          outL[i] = Math.tanh(otherStem * 1.35);
          outR[i] = Math.tanh(-otherStem * 1.35);
        } else {
          outL[i] = Math.tanh(
            bassStem * gBass + drumStem * gDrums + voxStem * gVox + gtrStem * gGtr
          );
          outR[i] = Math.tanh(
            bassStem * gBass + drumStem * gDrums + voxStem * gVox - gtrStem * gGtr
          );
        }
      }
      break;
    }

    case "reverb-remover": {
      const res = await runReverbRemoverDsp(source, {
        dereverbAmountPct: params.dereverbAmount ?? 75,
        tailDecayGateMs: params.tailReleaseMs ?? 120,
        boxinessCutFreqHz: params.boxinessCutFreqHz ?? 350,
        boxinessCutDb: params.deBoxHz ?? -4,
        dryRoomReBlendPct: params.dryRoomReBlendPct ?? 12,
      });
      if (selectedOutputId === "noise") {
        return res.removedReverbTailBuffer;
      }
      return (params.dryRoomReBlendPct ?? 12) > 0
        ? res.reblendedBuffer
        : res.dryBuffer;
    }

    case "echo-remover": {
      const res = await runEchoRemoverDsp(source, {
        echoSuppressionPct: params.echoSuppression ?? 80,
        slapbackDelayMs: params.delaySearchMs ?? 42.5,
        flutterDampingHz: params.highDampHz ?? 6500,
        multiTapCancellation: true,
      });
      if (selectedOutputId === "noise") {
        return res.isolatedEchoResidualBuffer;
      }
      return res.cleanBuffer;
    }

    case "audio-enhancer": {
      const f0Raw = params.humNotchHz ?? 60;
      const humFundamentalHz: 0 | 50 | 60 =
        f0Raw === 50 ? 50 : f0Raw === 0 ? 0 : 60;
      const res = await runAudioEnhancerDsp(source, {
        macroProfileId: "GUITAR_AMP_HUM_HISS_KILLER",
        humFundamentalHz,
        denoiseAmountPct: params.denoiseAmount ?? 75,
        presenceBoostDb: params.presenceBoostDb ?? 3.5,
        hissGateThresholdDb: -42,
        targetLufs: -14.0,
      });
      if (selectedOutputId === "removedNoise") {
        return res.removedHumAndHissBuffer;
      }
      return res.enhancedBuffer;
    }

    case "voice-changer": {
      const presetIdx = Math.max(
        0,
        Math.min(ROCK_VOCAL_PRESETS.length - 1, Math.round(params.presetIndex ?? 1))
      );
      const presetId: RockVocalPresetId =
        ROCK_VOCAL_PRESETS[presetIdx]?.id ?? "abbey-road-adt";
      return await renderVocalPitchLabDsp(source, {
        presetId,
        pitchSemitones: params.pitchSemitones ?? 0,
        fineCents: params.fineCents ?? 0,
        formantShift: params.formantShift ?? 0,
        adtDelayMs: params.adtDelayMs ?? 22,
        adtDetuneCents: params.adtDetuneCents ?? 15,
        adtWowHz: params.adtWowHz ?? 1.1,
        adtWidthPct: params.adtWidthPct ?? 85,
        harmonyMode:
          (params.harmonyBlendPct ?? 0) > 10 ? "root-3rd-5th-minor" : "off",
        harmonyBlendPct: params.harmonyBlendPct ?? 0,
        tubeDriveDb: params.tubeDriveDb ?? 2.5,
        slapbackMs: params.slapbackMs ?? 0,
        slapbackFeedbackPct: params.slapbackFeedbackPct ?? 0,
        wetMix: params.wetMix ?? 65,
      });
    }

    case "bpm-finder": {
      const droneMix = (params.droneMixPct ?? 0) / 100;
      for (let i = 0; i < source.length; i++) {
        const t = i / sr;
        const drone =
          (Math.sin(2 * Math.PI * 82.41 * t) * 0.4 +
            Math.sin(2 * Math.PI * 164.81 * t) * 0.25) *
          droneMix;
        outL[i] = Math.tanh(inL[i] + drone);
        outR[i] = Math.tanh(inR[i] + drone);
      }
      break;
    }

    case "voice-recorder": {
      const gain = dbToLinear(params.inputGainDb ?? 0);
      for (let i = 0; i < source.length; i++) {
        outL[i] = Math.tanh(inL[i] * gain);
        outR[i] = Math.tanh(inR[i] * gain);
      }
      break;
    }

    case "audio-converter": {
      const monoSum = Math.round(params.monoSum ?? 0) === 1;
      for (let i = 0; i < source.length; i++) {
        if (monoSum) {
          const m = 0.5 * (inL[i] + inR[i]);
          outL[i] = m;
          outR[i] = m;
        } else {
          outL[i] = inL[i];
          outR[i] = inR[i];
        }
      }
      break;
    }
  }

  return outBuf;
}

export function encodeAudioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  function writeAscii(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}
