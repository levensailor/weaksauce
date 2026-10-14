import { DspRecipeType } from "@/app/lib/tool-catalog";

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
      ? [73.42, 87.31, 82.41, 65.41] // D2, F2, E2, C2
      : presetId === "raw-vocal-hum"
      ? [110.0, 87.31, 130.81, 98.0] // A2, F2, C3, G2
      : [82.41, 98.0, 110.0, 123.47]; // E2, G2, A2, B2

  for (let i = 0; i < length; i++) {
    const t = i / sr;
    const beatIndex = Math.floor(t / beatSec);
    const beatPhase = (t % beatSec) / beatSec;
    const barIndex = Math.floor(beatIndex / 2) % chordRoots.length;
    const rootFreq = chordRoots[barIndex];

    // 1. Kick & Snare Drum Bus (Mono Center)
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

    // 2. Bass Guitar (Mono Center)
    const bassEnv = 0.75 + 0.25 * Math.exp(-beatPhase * 6);
    const bass =
      (Math.sin(2 * Math.PI * rootFreq * t) * 0.36 +
        Math.sin(2 * Math.PI * rootFreq * 2 * t) * 0.14) *
      bassEnv;

    // 3. Stereo Panned Crunch Guitars
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

    // 4. Center Lead Vocal (Jeff)
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
        Math.sin(2 * Math.PI * 60 * t) * 0.09 +
        Math.sin(2 * Math.PI * 120 * t) * 0.05 +
        Math.sin(2 * Math.PI * 180 * t) * 0.04;
      const slapback =
        i > 2400 ? Math.sin(2 * Math.PI * vocalPitch * ((i - 2400) / sr)) * 0.12 : 0;
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

  // 240Hz Low-Pass Onset envelope autocorrelation for BPM detection (matching voice.ai)
  const hop = Math.floor(sr * 0.02); // 20ms frames
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

  // 12-note chroma energy probe
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
      const voxGain = dbToLinear(params.vocalGainDb ?? -24);
      const instGain = dbToLinear(params.instGainDb ?? 0);
      const alphaLow = Math.min(0.25, (2 * Math.PI * (params.lowCutHz ?? 170)) / sr);
      let lpL = 0;
      let lpR = 0;
      for (let i = 0; i < source.length; i++) {
        const l = inL[i];
        const r = inR[i];
        lpL += alphaLow * (l - lpL);
        lpR += alphaLow * (r - lpR);
        const mid = 0.5 * (l + r);
        const side = 0.5 * (l - r);
        const bassMono = 0.5 * (lpL + lpR);
        const isolatedVocal = mid - bassMono * 0.85;
        const instL = side + bassMono * 0.95;
        const instR = -side + bassMono * 0.95;

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
      let fastEnv = 0;
      let slowEnv = 0;
      const bassAlpha = (2 * Math.PI * 195) / sr;

      for (let i = 0; i < source.length; i++) {
        const l = inL[i];
        const r = inR[i];
        const mid = 0.5 * (l + r);
        const side = 0.5 * (l - r);
        lpBass += bassAlpha * (mid - lpBass);
        const absMid = Math.abs(mid);
        fastEnv = 0.975 * fastEnv + 0.025 * absMid;
        slowEnv = 0.9992 * slowEnv + 0.0008 * absMid;
        const transientMask = Math.min(1, Math.max(0, (fastEnv - slowEnv) * 4.5));

        const bassStem = lpBass;
        const drumStem = (mid - lpBass) * transientMask;
        const voxStem = (mid - lpBass) * (1 - transientMask);
        const gtrStem = side;

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
      const strength = (params.dereverbAmount ?? 75) / 100;
      let env = 0;
      for (let i = 0; i < source.length; i++) {
        const mag = 0.5 * (Math.abs(inL[i]) + Math.abs(inR[i]));
        env = mag > env ? 0.88 * env + 0.12 * mag : 0.9991 * env + 0.0009 * mag;
        const gate = Math.min(1, Math.pow(mag / Math.max(1e-5, env), strength * 1.45));
        const dryL = inL[i] * gate;
        const dryR = inR[i] * gate;
        if (selectedOutputId === "noise") {
          // Removed Reverb Tail (Room Bleed)
          outL[i] = inL[i] - dryL;
          outR[i] = inR[i] - dryR;
        } else {
          outL[i] = dryL;
          outR[i] = dryR;
        }
      }
      break;
    }

    case "echo-remover": {
      const suppress = (params.echoSuppression ?? 80) / 100;
      const delaySamples = Math.floor(((params.delaySearchMs ?? 55) / 1000) * sr);
      for (let i = 0; i < source.length; i++) {
        const echoL = i >= delaySamples ? inL[i - delaySamples] * 0.38 * suppress : 0;
        const echoR = i >= delaySamples ? inR[i - delaySamples] * 0.38 * suppress : 0;
        const cleanL = Math.max(-0.99, Math.min(0.99, inL[i] - echoL));
        const cleanR = Math.max(-0.99, Math.min(0.99, inR[i] - echoR));
        if (selectedOutputId === "noise") {
          outL[i] = echoL * 1.6;
          outR[i] = echoR * 1.6;
        } else {
          outL[i] = cleanL;
          outR[i] = cleanR;
        }
      }
      break;
    }

    case "audio-enhancer": {
      if (selectedOutputId === "removedNoise") {
        // Output isolated 60Hz hum + noise residual
        const f0 = params.humNotchHz ?? 60;
        for (let i = 0; i < source.length; i++) {
          const t = i / sr;
          const hum = Math.sin(2 * Math.PI * f0 * t) * 0.08;
          const quietResidual = Math.abs(inL[i]) < 0.06 ? inL[i] : hum;
          outL[i] = quietResidual;
          outR[i] = quietResidual;
        }
        break;
      }

      const srcNode = offline.createBufferSource();
      srcNode.buffer = source;
      const f0 = params.humNotchHz ?? 60;

      const hpf = offline.createBiquadFilter();
      hpf.type = "highpass";
      hpf.frequency.value = 85;

      const notch1 = offline.createBiquadFilter();
      notch1.type = "notch";
      notch1.frequency.value = f0;
      notch1.Q.value = 30;

      const notch2 = offline.createBiquadFilter();
      notch2.type = "notch";
      notch2.frequency.value = f0 * 2;
      notch2.Q.value = 30;

      const notch3 = offline.createBiquadFilter();
      notch3.type = "notch";
      notch3.frequency.value = f0 * 3;
      notch3.Q.value = 30;

      const presence = offline.createBiquadFilter();
      presence.type = "peaking";
      presence.frequency.value = 3200;
      presence.Q.value = 1.1;
      presence.gain.value = params.presenceBoostDb ?? 3.5;

      const comp = offline.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 3.5;

      srcNode.connect(hpf);
      hpf.connect(notch1);
      notch1.connect(notch2);
      notch2.connect(notch3);
      notch3.connect(presence);
      presence.connect(comp);
      comp.connect(offline.destination);
      srcNode.start(0);
      return await offline.startRendering();
    }

    case "voice-changer": {
      const st = params.pitchSemitones ?? 0;
      const ct = (params.fineCents ?? 0) / 100;
      const ratio = Math.pow(2, (st + ct) / 12);
      const wet = (params.wetMix ?? 65) / 100;
      const grainSize = 2048;
      let phaseA = 0;
      let phaseB = 0.5;
      const rateDelta = (1 - ratio) / grainSize;
      const adtDelay = Math.floor(sr * 0.022); // 22ms Abbey Road ADT

      for (let i = 0; i < source.length; i++) {
        phaseA = (phaseA + rateDelta + 1) % 1;
        phaseB = (phaseA + 0.5) % 1;
        const delayA = phaseA * grainSize;
        const delayB = phaseB * grainSize;
        const winA = 0.5 * (1 - Math.cos(2 * Math.PI * phaseA));
        const winB = 0.5 * (1 - Math.cos(2 * Math.PI * phaseB));

        const idxA = Math.max(0, Math.floor(i - delayA));
        const idxB = Math.max(0, Math.floor(i - delayB));

        const shiftedL = inL[idxA] * winA + inL[idxB] * winB;
        const adtIdx = Math.max(0, i - adtDelay);
        const shiftedR = inR[adtIdx] * 0.85 + shiftedL * 0.35;

        outL[i] = Math.tanh(inL[i] * (1 - wet * 0.5) + shiftedL * wet);
        outR[i] = Math.tanh(inR[i] * (1 - wet * 0.5) + shiftedR * wet);
      }
      break;
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
