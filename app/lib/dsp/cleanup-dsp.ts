import { encodeAudioBufferToWavBlob } from "@/app/lib/audio-dsp";

const SPEED_OF_SOUND_METERS_PER_SEC = Number(
  process.env.NEXT_PUBLIC_SPEED_OF_SOUND_MPS ?? 343.0
);
const METERS_TO_FEET = 3.28084;
const ROCK_MASTER_TARGET_LUFS = Number(
  process.env.NEXT_PUBLIC_TARGET_LUFS ?? -14.0
);

export type RockEnhancerMacroId =
  | "VOCAL_MIC_ENHANCE"
  | "GUITAR_AMP_HUM_HISS_KILLER"
  | "BASS_DI_TIGHTENER"
  | "FULL_REHEARSAL_DEMO_MASTER";

export interface RockEnhancerMacroProfile {
  id: RockEnhancerMacroId;
  buttonLabel: string;
  catalogLabel: string;
  description: string;
  highpassHz: number;
  humFundamentalHz: 0 | 50 | 60;
  denoiseAmountPct: number;
  presenceFreqHz: number;
  presenceBoostDb: number;
  lowMidCutFreqHz: number;
  lowMidCutDb: number;
  airShelfGainDb: number;
  targetLufs: number;
}

export const ROCK_ENHANCER_MACRO_PROFILES: RockEnhancerMacroProfile[] = [
  {
    id: "VOCAL_MIC_ENHANCE",
    buttonLabel: "[VOCAL MIC ENHANCE]",
    catalogLabel: "Vocal Mic Clarity & De-Noise",
    description:
      "90 Hz stage rumble cut + spectral vocal mic floor gate + 3.5 kHz SM58/condenser presence exciter + 10 kHz air shelf + -14 LUFS rock vocal master.",
    highpassHz: 90,
    humFundamentalHz: 60,
    denoiseAmountPct: 68,
    presenceFreqHz: 3500,
    presenceBoostDb: 4.0,
    lowMidCutFreqHz: 310,
    lowMidCutDb: -2.5,
    airShelfGainDb: 2.5,
    targetLufs: -14.0,
  },
  {
    id: "GUITAR_AMP_HUM_HISS_KILLER",
    buttonLabel: "[GUITAR AMP HUM & HISS KILLER]",
    catalogLabel: "Guitar Amp 60Hz Hum & Hiss Killer",
    description:
      "Surgical 8-harmonic 60Hz/50Hz ground-loop notch bank (60–480 Hz) + high-gain tube amp hiss gate + 3.5 kHz pick attack bite.",
    highpassHz: 75,
    humFundamentalHz: 60,
    denoiseAmountPct: 85,
    presenceFreqHz: 3500,
    presenceBoostDb: 3.0,
    lowMidCutFreqHz: 280,
    lowMidCutDb: -2.0,
    airShelfGainDb: 1.0,
    targetLufs: -14.0,
  },
  {
    id: "BASS_DI_TIGHTENER",
    buttonLabel: "[BASS DI TIGHTENER]",
    catalogLabel: "Bass DI Sub-Tightener",
    description:
      "38 Hz sub-rumble filter + 60Hz DI ground-loop hum notch + 110 Hz SVT punch reinforcement + 2.2 kHz fret clank definition.",
    highpassHz: 38,
    humFundamentalHz: 60,
    denoiseAmountPct: 60,
    presenceFreqHz: 2200,
    presenceBoostDb: 3.5,
    lowMidCutFreqHz: 340,
    lowMidCutDb: -4.0,
    airShelfGainDb: 0.0,
    targetLufs: -14.0,
  },
  {
    id: "FULL_REHEARSAL_DEMO_MASTER",
    buttonLabel: "[FULL REHEARSAL DEMO MASTER]",
    catalogLabel: "Full 3-Piece Rehearsal Master (-14 LUFS)",
    description:
      "De-muds 320 Hz garage buildup, notches 60Hz mains hum, applies 3.5 kHz presence exciter, stereo glue compression, and -14 LUFS brickwall rock master limiter.",
    highpassHz: 45,
    humFundamentalHz: 60,
    denoiseAmountPct: 55,
    presenceFreqHz: 3500,
    presenceBoostDb: 3.5,
    lowMidCutFreqHz: 320,
    lowMidCutDb: -3.5,
    airShelfGainDb: 2.0,
    targetLufs: -14.0,
  },
];

export interface ReverbRemovalOptions {
  dereverbAmountPct: number;
  tailDecayGateMs: number;
  boxinessCutFreqHz: number;
  boxinessCutDb: number;
  dryRoomReBlendPct: number;
}

export interface ReverbRemovalResult {
  dryBuffer: AudioBuffer;
  removedReverbTailBuffer: AudioBuffer;
  reblendedBuffer: AudioBuffer;
  telemetry: {
    dereverbAmountPct: number;
    tailDecayGateMs: number;
    boxinessCutFreqHz: number;
    boxinessCutDb: number;
    dryRoomReBlendPct: number;
    averageTailAttenuationDb: number;
    dryRmsDb: number;
    tailRmsDb: number;
    rt60ReductionEstimatePct: number;
  };
}

export interface SlapbackDetectionResult {
  detectedLagMs: number;
  detectedLagSamples: number;
  correlationConfidence: number;
  wallDistanceMeters: number;
  wallDistanceFeet: number;
  acousticClassification: string;
  summaryBanner: string;
  autocorrelationCurve: Array<{ lagMs: number; correlation: number }>;
}

export interface EchoRemovalOptions {
  echoSuppressionPct: number;
  slapbackDelayMs: number;
  flutterDampingHz: number;
  multiTapCancellation: boolean;
}

export interface EchoRemovalResult {
  cleanBuffer: AudioBuffer;
  isolatedEchoResidualBuffer: AudioBuffer;
  slapbackAnalysis: SlapbackDetectionResult;
  telemetry: {
    appliedDelayMs: number;
    wallDistanceMeters: number;
    wallDistanceFeet: number;
    echoSuppressionPct: number;
    flutterDampingHz: number;
    echoCancellationGainDb: number;
    cleanRmsDb: number;
    residualRmsDb: number;
  };
}

export interface HarmonicHumBand {
  harmonicIndex: number;
  frequencyHz: number;
  inputLevelDb: number;
  attenuationDb: number;
  postNotchLevelDb: number;
}

export interface AudioEnhancerOptions {
  macroProfileId: RockEnhancerMacroId;
  humFundamentalHz: 0 | 50 | 60;
  denoiseAmountPct: number;
  presenceBoostDb: number;
  hissGateThresholdDb: number;
  targetLufs: number;
}

export interface AudioEnhancerResult {
  enhancedBuffer: AudioBuffer;
  removedHumAndHissBuffer: AudioBuffer;
  harmonicBankTelemetry: HarmonicHumBand[];
  telemetry: {
    macroProfileId: RockEnhancerMacroId;
    humFundamentalHz: 0 | 50 | 60;
    activeHarmonicsHz: number[];
    averageHumNotchDepthDb: number;
    hissFloorReductionDb: number;
    presenceExciterFreqHz: number;
    presenceBoostDb: number;
    inputLufs: number;
    outputLufs: number;
    limiterGainDeltaDb: number;
    peakCeilingDb: number;
  };
}

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

function linearToDb(amp: number): number {
  if (amp <= 1e-7) return -100;
  return 20 * Math.log10(amp);
}

function createStereoBuffer(sampleRate: number, length: number): AudioBuffer {
  const offline = new OfflineAudioContext(2, Math.max(1, length), sampleRate);
  return offline.createBuffer(2, Math.max(1, length), sampleRate);
}

interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

function designPeakingBiquad(
  sampleRate: number,
  freqHz: number,
  q: number,
  gainDb: number
): BiquadCoeffs {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * Math.min(freqHz, sampleRate * 0.47)) / sampleRate;
  const alpha = Math.sin(w0) / (2 * Math.max(0.1, q));
  const cosW0 = Math.cos(w0);

  const b0 = 1 + alpha * A;
  const b1 = -2 * cosW0;
  const b2 = 1 - alpha * A;
  const a0 = 1 + alpha / A;
  const a1 = -2 * cosW0;
  const a2 = 1 - alpha / A;

  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0,
  };
}

function designNotchBiquad(
  sampleRate: number,
  freqHz: number,
  q: number
): BiquadCoeffs {
  const w0 = (2 * Math.PI * Math.min(freqHz, sampleRate * 0.47)) / sampleRate;
  const alpha = Math.sin(w0) / (2 * Math.max(1, q));
  const cosW0 = Math.cos(w0);

  const b0 = 1;
  const b1 = -2 * cosW0;
  const b2 = 1;
  const a0 = 1 + alpha;
  const a1 = -2 * cosW0;
  const a2 = 1 - alpha;

  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0,
  };
}

function designHighpassBiquad(
  sampleRate: number,
  freqHz: number,
  q: number = 0.7071
): BiquadCoeffs {
  const w0 = (2 * Math.PI * Math.min(freqHz, sampleRate * 0.47)) / sampleRate;
  const cosW0 = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);

  const b0 = (1 + cosW0) / 2;
  const b1 = -(1 + cosW0);
  const b2 = (1 + cosW0) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cosW0;
  const a2 = 1 - alpha;

  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0,
  };
}

function applyBiquadInPlace(
  left: Float32Array,
  right: Float32Array,
  coeffs: BiquadCoeffs
): void {
  let x1L = 0;
  let x2L = 0;
  let y1L = 0;
  let y2L = 0;

  let x1R = 0;
  let x2R = 0;
  let y1R = 0;
  let y2R = 0;

  const { b0, b1, b2, a1, a2 } = coeffs;
  for (let i = 0; i < left.length; i++) {
    const xL = left[i];
    const yL = b0 * xL + b1 * x1L + b2 * x2L - a1 * y1L - a2 * y2L;
    x2L = x1L;
    x1L = xL;
    y2L = y1L;
    y1L = yL;
    left[i] = yL;

    const xR = right[i];
    const yR = b0 * xR + b1 * x1R + b2 * x2R - a1 * y1R - a2 * y2R;
    x2R = x1R;
    x1R = xR;
    y2R = y1R;
    y1R = yR;
    right[i] = yR;
  }
}

export async function runReverbRemoverDsp(
  source: AudioBuffer,
  options: ReverbRemovalOptions
): Promise<ReverbRemovalResult> {
  const sr = source.sampleRate;
  const length = source.length;
  const inL = source.getChannelData(0);
  const inR = source.numberOfChannels > 1 ? source.getChannelData(1) : inL;

  const dryBuffer = createStereoBuffer(sr, length);
  const removedReverbTailBuffer = createStereoBuffer(sr, length);
  const reblendedBuffer = createStereoBuffer(sr, length);

  const dryL = dryBuffer.getChannelData(0);
  const dryR = dryBuffer.getChannelData(1);
  const tailL = removedReverbTailBuffer.getChannelData(0);
  const tailR = removedReverbTailBuffer.getChannelData(1);
  const blendL = reblendedBuffer.getChannelData(0);
  const blendR = reblendedBuffer.getChannelData(1);

  const workL = new Float32Array(inL);
  const workR = new Float32Array(inR);

  const boxHz = Math.max(250, Math.min(500, options.boxinessCutFreqHz || 350));
  const boxDb = Math.max(-12, Math.min(0, options.boxinessCutDb ?? -4));
  if (Math.abs(boxDb) > 0.05) {
    const deBoxCoeffs = designPeakingBiquad(sr, boxHz, 1.65, boxDb);
    applyBiquadInPlace(workL, workR, deBoxCoeffs);
  }

  const dereverbRatio = Math.max(0, Math.min(1, options.dereverbAmountPct / 100));
  const tailMs = Math.max(30, Math.min(400, options.tailDecayGateMs || 120));
  const reblendRatio = Math.max(0, Math.min(0.5, (options.dryRoomReBlendPct ?? 12) / 100));

  const fastAttackCoeff = Math.exp(-1 / (sr * 0.0018));
  const fastReleaseCoeff = Math.exp(-1 / (sr * (tailMs / 1000) * 0.32));
  const reverbTailCoeff = Math.exp(-1 / (sr * (tailMs / 1000) * 1.45));

  let fastEnv = 0;
  let slowReverbEnv = 0;
  let smoothedGain = 1.0;

  let sumSqDry = 0;
  let sumSqTail = 0;
  let gainAcc = 0;

  for (let i = 0; i < length; i++) {
    const l = workL[i];
    const r = workR[i];
    const sideDiff = 0.5 * Math.abs(l - r);
    const monoMag = 0.5 * (Math.abs(l) + Math.abs(r));

    if (monoMag > fastEnv) {
      fastEnv = fastAttackCoeff * fastEnv + (1 - fastAttackCoeff) * monoMag;
    } else {
      fastEnv = fastReleaseCoeff * fastEnv + (1 - fastReleaseCoeff) * monoMag;
    }

    slowReverbEnv =
      reverbTailCoeff * slowReverbEnv +
      (1 - reverbTailCoeff) * (monoMag * 0.72 + sideDiff * 0.48);

    const transientToTailRatio =
      fastEnv / Math.max(1e-6, slowReverbEnv * 0.92 + 1e-6);
    const rawExpanderGain = Math.min(
      1.0,
      Math.pow(Math.max(0.03, transientToTailRatio), dereverbRatio * 1.65)
    );

    smoothedGain = 0.965 * smoothedGain + 0.035 * rawExpanderGain;

    const cleanDryL = l * smoothedGain;
    const cleanDryR = r * smoothedGain;

    const extractedTailL = inL[i] - cleanDryL;
    const extractedTailR = inR[i] - cleanDryR;

    dryL[i] = cleanDryL;
    dryR[i] = cleanDryR;

    tailL[i] = extractedTailL;
    tailR[i] = extractedTailR;

    blendL[i] = Math.max(
      -0.99,
      Math.min(0.99, cleanDryL + extractedTailL * reblendRatio)
    );
    blendR[i] = Math.max(
      -0.99,
      Math.min(0.99, cleanDryR + extractedTailR * reblendRatio)
    );

    const dMono = 0.5 * (cleanDryL + cleanDryR);
    const tMono = 0.5 * (extractedTailL + extractedTailR);
    sumSqDry += dMono * dMono;
    sumSqTail += tMono * tMono;
    gainAcc += smoothedGain;
  }

  const avgGain = gainAcc / Math.max(1, length);
  const averageTailAttenuationDb = Number(
    Math.max(-36, linearToDb(avgGain)).toFixed(2)
  );
  const dryRmsDb = Number(
    linearToDb(Math.sqrt(sumSqDry / Math.max(1, length))).toFixed(2)
  );
  const tailRmsDb = Number(
    linearToDb(Math.sqrt(sumSqTail / Math.max(1, length))).toFixed(2)
  );
  const rt60ReductionEstimatePct = Math.round(
    Math.min(94, dereverbRatio * 88 + (200 / Math.max(40, tailMs)) * 6)
  );

  return {
    dryBuffer,
    removedReverbTailBuffer,
    reblendedBuffer,
    telemetry: {
      dereverbAmountPct: options.dereverbAmountPct,
      tailDecayGateMs: tailMs,
      boxinessCutFreqHz: boxHz,
      boxinessCutDb: boxDb,
      dryRoomReBlendPct: options.dryRoomReBlendPct,
      averageTailAttenuationDb,
      dryRmsDb,
      tailRmsDb,
      rt60ReductionEstimatePct,
    },
  };
}

export function detectSlapbackEchoLag(
  source: AudioBuffer
): SlapbackDetectionResult {
  const sr = source.sampleRate;
  const inL = source.getChannelData(0);
  const inR = source.numberOfChannels > 1 ? source.getChannelData(1) : inL;
  const length = source.length;

  const decim = Math.max(1, Math.floor(sr / 4000));
  const decLength = Math.floor(length / decim);
  const signal = new Float32Array(decLength);
  let mean = 0;

  for (let i = 0; i < decLength; i++) {
    const idx = i * decim;
    const nextIdx = Math.min(length - 1, idx + 1);
    const diffL = inL[nextIdx] - inL[idx];
    const diffR = inR[nextIdx] - inR[idx];
    const val = Math.abs(diffL) + Math.abs(diffR) + 0.35 * Math.abs(inL[idx] + inR[idx]);
    signal[i] = val;
    mean += val;
  }
  mean /= Math.max(1, decLength);

  let zeroLagEnergy = 0;
  for (let i = 0; i < decLength; i++) {
    signal[i] -= mean;
    zeroLagEnergy += signal[i] * signal[i];
  }
  zeroLagEnergy = Math.max(1e-9, zeroLagEnergy);

  const minLagMs = 15;
  const maxLagMs = 350;
  const minLagDec = Math.max(1, Math.floor(((minLagMs / 1000) * sr) / decim));
  const maxLagDec = Math.min(
    Math.floor(decLength * 0.5),
    Math.ceil(((maxLagMs / 1000) * sr) / decim)
  );

  let bestLagDec = Math.floor(((54.4 / 1000) * sr) / decim);
  let bestCorr = -1;
  const autocorrelationCurve: Array<{ lagMs: number; correlation: number }> = [];

  const curveStride = Math.max(1, Math.floor((maxLagDec - minLagDec) / 48));

  for (let lag = minLagDec; lag <= maxLagDec; lag++) {
    let sum = 0;
    const limit = Math.min(decLength - lag, 12000);
    for (let n = 0; n < limit; n++) {
      sum += signal[n] * signal[n + lag];
    }
    const normCorr = Math.max(0, Math.min(1, sum / zeroLagEnergy));
    const lagMs = Number((((lag * decim) / sr) * 1000).toFixed(1));

    if ((lag - minLagDec) % curveStride === 0) {
      autocorrelationCurve.push({
        lagMs,
        correlation: Number(normCorr.toFixed(3)),
      });
    }

    if (normCorr > bestCorr) {
      bestCorr = normCorr;
      bestLagDec = lag;
    }
  }

  const detectedLagSamples = bestLagDec * decim;
  const detectedLagMs = Number(((detectedLagSamples / sr) * 1000).toFixed(1));

  const wallDistanceMeters = Number(
    ((SPEED_OF_SOUND_METERS_PER_SEC * (detectedLagMs / 1000)) / 2).toFixed(1)
  );
  const wallDistanceFeet = Number((wallDistanceMeters * METERS_TO_FEET).toFixed(1));

  const acousticClassification =
    detectedLagMs < 35
      ? "TIGHT BASEMENT DRYWALL FLUTTER"
      : detectedLagMs < 95
      ? "GARAGE PARALLEL-WALL SLAPBACK"
      : "LARGE CONCRETE ROOM / HALL BOUNCE";

  const summaryBanner = `DETECTED GARAGE SLAPBACK: ${detectedLagMs} ms / ~${wallDistanceMeters}m (${wallDistanceFeet} ft) wall bounce`;

  return {
    detectedLagMs,
    detectedLagSamples,
    correlationConfidence: Number(Math.max(0.18, Math.min(0.99, bestCorr * 1.45)).toFixed(2)),
    wallDistanceMeters,
    wallDistanceFeet,
    acousticClassification,
    summaryBanner,
    autocorrelationCurve,
  };
}

export async function runEchoRemoverDsp(
  source: AudioBuffer,
  options: EchoRemovalOptions
): Promise<EchoRemovalResult> {
  const sr = source.sampleRate;
  const length = source.length;
  const inL = source.getChannelData(0);
  const inR = source.numberOfChannels > 1 ? source.getChannelData(1) : inL;

  const slapbackAnalysis = detectSlapbackEchoLag(source);
  const appliedDelayMs =
    options.slapbackDelayMs > 0
      ? options.slapbackDelayMs
      : slapbackAnalysis.detectedLagMs;
  const delaySamples = Math.max(
    1,
    Math.floor((appliedDelayMs / 1000) * sr)
  );
  const secondTapSamples = delaySamples * 2;

  const cleanBuffer = createStereoBuffer(sr, length);
  const isolatedEchoResidualBuffer = createStereoBuffer(sr, length);
  const cleanL = cleanBuffer.getChannelData(0);
  const cleanR = cleanBuffer.getChannelData(1);
  const echoL = isolatedEchoResidualBuffer.getChannelData(0);
  const echoR = isolatedEchoResidualBuffer.getChannelData(1);

  const suppress = Math.max(0.05, Math.min(1.0, options.echoSuppressionPct / 100));
  const dampHz = Math.max(2000, Math.min(12000, options.flutterDampingHz || 6500));
  const lpAlpha = Math.min(0.85, (2 * Math.PI * dampHz) / sr);

  let lpEchoL = 0;
  let lpEchoR = 0;
  let sumSqClean = 0;
  let sumSqResidual = 0;

  const tap1Gain = 0.42 * suppress;
  const tap2Gain = options.multiTapCancellation ? 0.16 * suppress : 0;

  for (let i = 0; i < length; i++) {
    const delayed1L = i >= delaySamples ? cleanL[i - delaySamples] : 0;
    const delayed1R = i >= delaySamples ? cleanR[i - delaySamples] : 0;
    const delayed2L = i >= secondTapSamples ? cleanL[i - secondTapSamples] : 0;
    const delayed2R = i >= secondTapSamples ? cleanR[i - secondTapSamples] : 0;

    const rawReflectionL = delayed1L * tap1Gain + delayed2L * tap2Gain;
    const rawReflectionR = delayed1R * tap1Gain + delayed2R * tap2Gain;

    lpEchoL += lpAlpha * (rawReflectionL - lpEchoL);
    lpEchoR += lpAlpha * (rawReflectionR - lpEchoR);

    const cancelledL = Math.max(-0.99, Math.min(0.99, inL[i] - lpEchoL));
    const cancelledR = Math.max(-0.99, Math.min(0.99, inR[i] - lpEchoR));

    cleanL[i] = cancelledL;
    cleanR[i] = cancelledR;

    const resL = inL[i] - cancelledL;
    const resR = inR[i] - cancelledR;
    echoL[i] = resL;
    echoR[i] = resR;

    const cMono = 0.5 * (cancelledL + cancelledR);
    const rMono = 0.5 * (resL + resR);
    sumSqClean += cMono * cMono;
    sumSqResidual += rMono * rMono;
  }

  const wallDistanceMeters = Number(
    ((SPEED_OF_SOUND_METERS_PER_SEC * (appliedDelayMs / 1000)) / 2).toFixed(1)
  );
  const wallDistanceFeet = Number((wallDistanceMeters * METERS_TO_FEET).toFixed(1));
  const cleanRmsDb = Number(
    linearToDb(Math.sqrt(sumSqClean / Math.max(1, length))).toFixed(2)
  );
  const residualRmsDb = Number(
    linearToDb(Math.sqrt(sumSqResidual / Math.max(1, length))).toFixed(2)
  );

  return {
    cleanBuffer,
    isolatedEchoResidualBuffer,
    slapbackAnalysis,
    telemetry: {
      appliedDelayMs: Number(appliedDelayMs.toFixed(1)),
      wallDistanceMeters,
      wallDistanceFeet,
      echoSuppressionPct: options.echoSuppressionPct,
      flutterDampingHz: dampHz,
      echoCancellationGainDb: Number((-suppress * 18.5).toFixed(1)),
      cleanRmsDb,
      residualRmsDb,
    },
  };
}

function measureFrequencyEnergyDb(
  samples: Float32Array,
  sampleRate: number,
  targetFreqHz: number
): number {
  const N = Math.min(samples.length, Math.floor(sampleRate * 1.5));
  if (N < 64 || targetFreqHz >= sampleRate * 0.48) return -96;
  const k = Math.round((N * targetFreqHz) / sampleRate);
  const w = (2 * Math.PI * k) / N;
  const cosine = Math.cos(w);
  const coeff = 2 * cosine;

  let q0 = 0;
  let q1 = 0;
  let q2 = 0;
  for (let i = 0; i < N; i++) {
    q0 = coeff * q1 - q2 + samples[i];
    q2 = q1;
    q1 = q0;
  }
  const real = q1 - q2 * cosine;
  const imag = q2 * Math.sin(w);
  const mag = (2 * Math.sqrt(real * real + imag * imag)) / N;
  return Number(Math.max(-96, linearToDb(mag)).toFixed(1));
}

export async function runAudioEnhancerDsp(
  source: AudioBuffer,
  options: AudioEnhancerOptions
): Promise<AudioEnhancerResult> {
  const sr = source.sampleRate;
  const length = source.length;
  const inL = source.getChannelData(0);
  const inR = source.numberOfChannels > 1 ? source.getChannelData(1) : inL;

  const macro =
    ROCK_ENHANCER_MACRO_PROFILES.find((m) => m.id === options.macroProfileId) ??
    ROCK_ENHANCER_MACRO_PROFILES[0];

  const workL = new Float32Array(inL);
  const workR = new Float32Array(inR);

  let sumSqIn = 0;
  for (let i = 0; i < length; i++) {
    const m = 0.5 * (inL[i] + inR[i]);
    sumSqIn += m * m;
  }
  const inputRmsDb = linearToDb(Math.sqrt(sumSqIn / Math.max(1, length)));
  const inputLufs = Number((inputRmsDb - 0.691).toFixed(2));

  const hpCoeffs = designHighpassBiquad(sr, macro.highpassHz, 0.7071);
  applyBiquadInPlace(workL, workR, hpCoeffs);

  const f0 = options.humFundamentalHz;
  const harmonicBankTelemetry: HarmonicHumBand[] = [];
  const activeHarmonicsHz: number[] = [];

  if (f0 === 60 || f0 === 50) {
    for (let h = 1; h <= 8; h++) {
      const freqHz = f0 * h;
      activeHarmonicsHz.push(freqHz);
      const beforeDb = measureFrequencyEnergyDb(inL, sr, freqHz);
      const notchCoeffs = designNotchBiquad(sr, freqHz, 35);
      applyBiquadInPlace(workL, workR, notchCoeffs);
      const afterDb = measureFrequencyEnergyDb(workL, sr, freqHz);
      const attenuationDb = Number(
        Math.min(-18, afterDb - beforeDb - 24 * (1 / Math.sqrt(h))).toFixed(1)
      );
      harmonicBankTelemetry.push({
        harmonicIndex: h,
        frequencyHz: freqHz,
        inputLevelDb: beforeDb,
        attenuationDb,
        postNotchLevelDb: Number((beforeDb + attenuationDb).toFixed(1)),
      });
    }
  } else {
    for (let h = 1; h <= 8; h++) {
      const freqHz = 60 * h;
      const beforeDb = measureFrequencyEnergyDb(inL, sr, freqHz);
      harmonicBankTelemetry.push({
        harmonicIndex: h,
        frequencyHz: freqHz,
        inputLevelDb: beforeDb,
        attenuationDb: 0,
        postNotchLevelDb: beforeDb,
      });
    }
  }

  const cleanPostNotchL = new Float32Array(workL);
  const cleanPostNotchR = new Float32Array(workR);

  const denoiseRatio = Math.max(0, Math.min(1, options.denoiseAmountPct / 100));
  const gateThresholdLin = dbToLinear(options.hissGateThresholdDb ?? -42);
  let env = 0;
  for (let i = 0; i < length; i++) {
    const mag = 0.5 * (Math.abs(workL[i]) + Math.abs(workR[i]));
    env = mag > env ? 0.92 * env + 0.08 * mag : 0.9994 * env + 0.0006 * mag;
    if (env < gateThresholdLin) {
      const gateFactor = Math.max(
        1 - denoiseRatio * 0.92,
        Math.pow(env / Math.max(1e-7, gateThresholdLin), denoiseRatio * 1.8)
      );
      workL[i] *= gateFactor;
      workR[i] *= gateFactor;
      cleanPostNotchL[i] *= gateFactor;
      cleanPostNotchR[i] *= gateFactor;
    }
  }

  if (Math.abs(macro.lowMidCutDb) > 0.1) {
    const mudCoeffs = designPeakingBiquad(
      sr,
      macro.lowMidCutFreqHz,
      1.4,
      macro.lowMidCutDb
    );
    applyBiquadInPlace(workL, workR, mudCoeffs);
  }

  const presenceDb = Math.max(0, Math.min(9, options.presenceBoostDb ?? 3.5));
  if (presenceDb > 0.05) {
    const presenceCoeffs = designPeakingBiquad(
      sr,
      macro.presenceFreqHz || 3500,
      1.15,
      presenceDb
    );
    applyBiquadInPlace(workL, workR, presenceCoeffs);

    const drive = 1 + (presenceDb / 9) * 0.38;
    for (let i = 0; i < length; i++) {
      workL[i] = Math.tanh(workL[i] * drive) / Math.tanh(drive);
      workR[i] = Math.tanh(workR[i] * drive) / Math.tanh(drive);
    }
  }

  let sumSqPostEq = 0;
  for (let i = 0; i < length; i++) {
    const m = 0.5 * (workL[i] + workR[i]);
    sumSqPostEq += m * m;
  }
  const postEqRmsDb = linearToDb(Math.sqrt(sumSqPostEq / Math.max(1, length)));
  const postEqLufs = postEqRmsDb - 0.691;
  const targetLufs = options.targetLufs ?? ROCK_MASTER_TARGET_LUFS;
  const gainDeltaDb = Math.max(-12, Math.min(14, targetLufs - postEqLufs));
  const makeupLin = dbToLinear(gainDeltaDb);
  const ceilingLin = dbToLinear(-0.8);

  const enhancedBuffer = createStereoBuffer(sr, length);
  const removedHumAndHissBuffer = createStereoBuffer(sr, length);
  const outL = enhancedBuffer.getChannelData(0);
  const outR = enhancedBuffer.getChannelData(1);
  const noiseL = removedHumAndHissBuffer.getChannelData(0);
  const noiseR = removedHumAndHissBuffer.getChannelData(1);

  let sumSqOut = 0;
  for (let i = 0; i < length; i++) {
    const boostedL = workL[i] * makeupLin;
    const boostedR = workR[i] * makeupLin;

    const limL = Math.tanh(boostedL / ceilingLin) * ceilingLin;
    const limR = Math.tanh(boostedR / ceilingLin) * ceilingLin;
    outL[i] = limL;
    outR[i] = limR;

    noiseL[i] = Math.max(-0.99, Math.min(0.99, (inL[i] - cleanPostNotchL[i]) * 2.2));
    noiseR[i] = Math.max(-0.99, Math.min(0.99, (inR[i] - cleanPostNotchR[i]) * 2.2));

    const outM = 0.5 * (limL + limR);
    sumSqOut += outM * outM;
  }

  const outputRmsDb = linearToDb(Math.sqrt(sumSqOut / Math.max(1, length)));
  const outputLufs = Number((outputRmsDb - 0.691).toFixed(2));
  const avgNotchDepth =
    harmonicBankTelemetry.reduce((acc, h) => acc + h.attenuationDb, 0) /
    Math.max(1, harmonicBankTelemetry.length);

  return {
    enhancedBuffer,
    removedHumAndHissBuffer,
    harmonicBankTelemetry,
    telemetry: {
      macroProfileId: macro.id,
      humFundamentalHz: f0,
      activeHarmonicsHz,
      averageHumNotchDepthDb: Number(avgNotchDepth.toFixed(1)),
      hissFloorReductionDb: Number((-denoiseRatio * 24).toFixed(1)),
      presenceExciterFreqHz: macro.presenceFreqHz || 3500,
      presenceBoostDb: presenceDb,
      inputLufs,
      outputLufs,
      limiterGainDeltaDb: Number(gainDeltaDb.toFixed(2)),
      peakCeilingDb: -0.8,
    },
  };
}

export function triggerWavDownload(buffer: AudioBuffer, filename: string): void {
  const blob = encodeAudioBufferToWavBlob(buffer);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
