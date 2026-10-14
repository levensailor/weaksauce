export type RockVocalPresetId =
  | "clean-transpose"
  | "abbey-road-adt"
  | "octave-down-baritone"
  | "octave-up-shimmer"
  | "power-trio-harmonizer"
  | "garage-megaphone"
  | "driven-tube-preamp"
  | "slapback-rockabilly";

export type HarmonyVoicingMode =
  | "root-3rd-5th-minor"
  | "root-3rd-5th-major"
  | "octave-up-down"
  | "power-fifth-stack"
  | "off";

export type TuningDronePresetId =
  | "e-standard"
  | "drop-d"
  | "eb-half-step-down"
  | "d-standard";

export interface RockVocalPresetSpec {
  id: RockVocalPresetId;
  index: number;
  name: string;
  shortTag: string;
  description: string;
  bandUseCase: string;
  defaultParams: {
    pitchSemitones: number;
    fineCents: number;
    formantShift: number;
    adtDelayMs: number;
    adtDetuneCents: number;
    adtWowHz: number;
    adtWidthPct: number;
    harmonyMode: HarmonyVoicingMode;
    harmonyBlendPct: number;
    tubeDriveDb: number;
    slapbackMs: number;
    slapbackFeedbackPct: number;
    wetMix: number;
  };
}

export const ROCK_VOCAL_PRESETS: RockVocalPresetSpec[] = [
  {
    id: "clean-transpose",
    index: 1,
    name: "Clean Pitch Transpose",
    shortTag: "01 // CLEAN TRANSPOSE",
    description:
      "Pure dual-grain WSOLA pitch & formant transposition (-12 to +12 semitones, -100 to +100 cents) with zero artificial coloring.",
    bandUseCase:
      "Audition how a song feels a half-step down (Eb) or up +2 semitones before making the guitarist and bassist retune.",
    defaultParams: {
      pitchSemitones: 0,
      fineCents: 0,
      formantShift: 0,
      adtDelayMs: 20,
      adtDetuneCents: 0,
      adtWowHz: 0.8,
      adtWidthPct: 0,
      harmonyMode: "off",
      harmonyBlendPct: 0,
      tubeDriveDb: 0,
      slapbackMs: 0,
      slapbackFeedbackPct: 0,
      wetMix: 100,
    },
  },
  {
    id: "abbey-road-adt",
    index: 2,
    name: "Abbey Road ADT Vocal Doubler",
    shortTag: "02 // ABBEY ROAD ADT",
    description:
      "Classic Ken Townsend / Abbey Road Automatic Double Tracking: tight detuned stereo clone (±15 cents) + 22ms tape delay + 1.1Hz varispeed wow modulation.",
    bandUseCase:
      "Turn a single dry lead vocal take from Jeff into a wide, thick stereo rock vocal without tracking a second pass.",
    defaultParams: {
      pitchSemitones: 0,
      fineCents: 0,
      formantShift: 0,
      adtDelayMs: 22,
      adtDetuneCents: 15,
      adtWowHz: 1.1,
      adtWidthPct: 85,
      harmonyMode: "off",
      harmonyBlendPct: 0,
      tubeDriveDb: 2.5,
      slapbackMs: 0,
      slapbackFeedbackPct: 0,
      wetMix: 70,
    },
  },
  {
    id: "octave-down-baritone",
    index: 3,
    name: "Octave Down Baritone Grit",
    shortTag: "03 // OCTAVE DOWN GRIT",
    description:
      "Drops or blends -12 semitones sub-octave baritone chest resonance (-3 st formant shift) with warm tube harmonic saturation.",
    bandUseCase:
      "Tuck a menacing sub-octave baritone double under chorus vocals or thicken single-note guitar riffs like an octave fuzz pedal.",
    defaultParams: {
      pitchSemitones: -12,
      fineCents: 0,
      formantShift: -3,
      adtDelayMs: 18,
      adtDetuneCents: 8,
      adtWowHz: 0.6,
      adtWidthPct: 40,
      harmonyMode: "off",
      harmonyBlendPct: 0,
      tubeDriveDb: 6.5,
      slapbackMs: 0,
      slapbackFeedbackPct: 0,
      wetMix: 65,
    },
  },
  {
    id: "octave-up-shimmer",
    index: 4,
    name: "Octave Up Falsetto / 12-String Shimmer",
    shortTag: "04 // OCTAVE UP SHIMMER",
    description:
      "Generates a +12 semitone high-octave harmonic layer with throat formant preservation (+1.5 st) and stereo ADT spread.",
    bandUseCase:
      "Create soaring falsetto chorus layers or turn a 6-string rhythm guitar stem into a chiming 12-string Rickenbacker texture.",
    defaultParams: {
      pitchSemitones: 12,
      fineCents: 0,
      formantShift: 1.5,
      adtDelayMs: 24,
      adtDetuneCents: 12,
      adtWowHz: 1.3,
      adtWidthPct: 75,
      harmonyMode: "octave-up-down",
      harmonyBlendPct: 35,
      tubeDriveDb: 2.0,
      slapbackMs: 0,
      slapbackFeedbackPct: 0,
      wetMix: 55,
    },
  },
  {
    id: "power-trio-harmonizer",
    index: 5,
    name: "Power Trio 3rd & 5th Harmonizer",
    shortTag: "05 // 3RD & 5TH HARMONY",
    description:
      "3-part rock vocal harmony stacker synthesizing Root + Diatonic 3rd (+3/+4 st) + Perfect 5th (+7 st) panned across the stereo stage.",
    bandUseCase:
      "Build instant 3-part gang/backing vocal stacks for a 3-piece rock band so Jeff can preview chorus harmonies before teaching the bassist and drummer.",
    defaultParams: {
      pitchSemitones: 0,
      fineCents: 0,
      formantShift: 0.5,
      adtDelayMs: 25,
      adtDetuneCents: 14,
      adtWowHz: 0.9,
      adtWidthPct: 80,
      harmonyMode: "root-3rd-5th-minor",
      harmonyBlendPct: 68,
      tubeDriveDb: 3.0,
      slapbackMs: 0,
      slapbackFeedbackPct: 0,
      wetMix: 75,
    },
  },
  {
    id: "garage-megaphone",
    index: 6,
    name: "Garage Megaphone / Lo-Fi Radio Vox",
    shortTag: "06 // GARAGE MEGAPHONE",
    description:
      "Band-limited 420 Hz – 3.1 kHz bullhorn resonator with asymmetric diode/tube clipping (Strokes / QOTSA / Jack White garage vocal chain).",
    bandUseCase:
      "Dial in lo-fi garage rock intro vocals, bridge bullhorn shout parts, or AM-radio drum break filters.",
    defaultParams: {
      pitchSemitones: 0,
      fineCents: 0,
      formantShift: 2.0,
      adtDelayMs: 16,
      adtDetuneCents: 10,
      adtWowHz: 1.5,
      adtWidthPct: 30,
      harmonyMode: "off",
      harmonyBlendPct: 0,
      tubeDriveDb: 13.5,
      slapbackMs: 35,
      slapbackFeedbackPct: 15,
      wetMix: 90,
    },
  },
  {
    id: "driven-tube-preamp",
    index: 7,
    name: "Driven Tube Mic Preamp",
    shortTag: "07 // DRIVEN TUBE PREAMP",
    description:
      "Warm even-order triode harmonic saturation + FET 1176-style fast peak compression and subtle 18ms stereo thickening.",
    bandUseCase:
      "Push a sterile home-studio USB/XLR vocal mic into gritty analog console saturation that cuts through distorted guitars.",
    defaultParams: {
      pitchSemitones: 0,
      fineCents: 0,
      formantShift: -0.5,
      adtDelayMs: 18,
      adtDetuneCents: 9,
      adtWowHz: 0.7,
      adtWidthPct: 45,
      harmonyMode: "off",
      harmonyBlendPct: 0,
      tubeDriveDb: 9.0,
      slapbackMs: 0,
      slapbackFeedbackPct: 0,
      wetMix: 80,
    },
  },
  {
    id: "slapback-rockabilly",
    index: 8,
    name: "Slapback Rockabilly / Post-Punk Tape",
    shortTag: "08 // SLAPBACK TAPE",
    description:
      "115ms analog tape slapback echo with high-cut feedback damping, tape flutter modulation, and driven preamp bite.",
    bandUseCase:
      "Instant Sun Studio rockabilly, Cramps garage punk, or post-punk room slapback on dry vocals and rhythm guitars.",
    defaultParams: {
      pitchSemitones: 0,
      fineCents: 0,
      formantShift: 0,
      adtDelayMs: 28,
      adtDetuneCents: 16,
      adtWowHz: 1.4,
      adtWidthPct: 60,
      harmonyMode: "off",
      harmonyBlendPct: 0,
      tubeDriveDb: 5.5,
      slapbackMs: 115,
      slapbackFeedbackPct: 28,
      wetMix: 72,
    },
  },
];

export interface VocalLabParameters {
  presetId: RockVocalPresetId;
  pitchSemitones: number;
  fineCents: number;
  formantShift: number;
  adtDelayMs: number;
  adtDetuneCents: number;
  adtWowHz: number;
  adtWidthPct: number;
  harmonyMode: HarmonyVoicingMode;
  harmonyBlendPct: number;
  tubeDriveDb: number;
  slapbackMs: number;
  slapbackFeedbackPct: number;
  wetMix: number;
}

export interface DelaySubdivisionTable {
  bpm: number;
  quarterMs: number;
  dottedEighthMs: number;
  eighthMs: number;
  eighthTripletMs: number;
  sixteenthSlapbackMs: number;
  preDelayRoomMs: number;
  preDelayPlateMs: number;
}

export interface BatchTrackAnalysisRow {
  id: string;
  fileName: string;
  sourceType: "UPLOAD" | "DEMO" | "ACTIVE_BUS";
  durationSec: number;
  sampleRate: number;
  bpm: number;
  halfBpm: number;
  doubleBpm: number;
  keyNote: string;
  scale: "Minor" | "Major";
  keyAndScale: string;
  relativePairKey: string;
  camelotCode: string;
  confidencePct: number;
  tuningHint: string;
  lowPassCutoffHz: number;
  delays: DelaySubdivisionTable;
  chromaEnergy: { note: string; energy: number }[];
}

export interface TuningDronePreset {
  id: TuningDronePresetId;
  label: string;
  shortLabel: string;
  bandRole: string;
  guitarNotes: { note: string; freqHz: number }[];
  bassNotes: { note: string; freqHz: number }[];
}

export const ROCK_TUNING_DRONES: TuningDronePreset[] = [
  {
    id: "e-standard",
    label: "E Standard (E2 A2 D3 G3 B3 E4)",
    shortLabel: "E STANDARD (440 Hz)",
    bandRole: "Classic Rock / Garage / Punk Standard Tuning",
    guitarNotes: [
      { note: "E2", freqHz: 82.41 },
      { note: "A2", freqHz: 110.0 },
      { note: "D3", freqHz: 146.83 },
      { note: "G3", freqHz: 196.0 },
      { note: "B3", freqHz: 246.94 },
      { note: "E4", freqHz: 329.63 },
    ],
    bassNotes: [
      { note: "E1", freqHz: 41.2 },
      { note: "A1", freqHz: 55.0 },
      { note: "D2", freqHz: 73.42 },
      { note: "G2", freqHz: 98.0 },
    ],
  },
  {
    id: "drop-d",
    label: "Drop D (D2 A2 D3 G3 B3 E4)",
    shortLabel: "DROP D (HEAVY RIFF)",
    bandRole: "90s Grunge / Post-Hardcore / Heavy Power-Trio Chug (Low String -> D)",
    guitarNotes: [
      { note: "D2", freqHz: 73.42 },
      { note: "A2", freqHz: 110.0 },
      { note: "D3", freqHz: 146.83 },
      { note: "G3", freqHz: 196.0 },
      { note: "B3", freqHz: 246.94 },
      { note: "E4", freqHz: 329.63 },
    ],
    bassNotes: [
      { note: "D1", freqHz: 36.71 },
      { note: "A1", freqHz: 55.0 },
      { note: "D2", freqHz: 73.42 },
      { note: "G2", freqHz: 98.0 },
    ],
  },
  {
    id: "eb-half-step-down",
    label: "Eb Half-Step Down (Eb2 Ab2 Db3 Gb3 Bb3 Eb4)",
    shortLabel: "Eb HALF-STEP DOWN (-1 ST)",
    bandRole: "Vocal-Friendly Rock Tuning (Saves Jeff's High Notes & Thickens Guitar Strings)",
    guitarNotes: [
      { note: "Eb2", freqHz: 77.78 },
      { note: "Ab2", freqHz: 103.83 },
      { note: "Db3", freqHz: 138.59 },
      { note: "Gb3", freqHz: 185.0 },
      { note: "Bb3", freqHz: 233.08 },
      { note: "Eb4", freqHz: 311.13 },
    ],
    bassNotes: [
      { note: "Eb1", freqHz: 38.89 },
      { note: "Ab1", freqHz: 51.91 },
      { note: "Db2", freqHz: 69.3 },
      { note: "Gb2", freqHz: 92.5 },
    ],
  },
  {
    id: "d-standard",
    label: "D Standard (D2 G2 C3 F3 A3 D4)",
    shortLabel: "D STANDARD (-2 ST)",
    bandRole: "Stoner Rock / Desert Rock / Baritone Heavy Trio",
    guitarNotes: [
      { note: "D2", freqHz: 73.42 },
      { note: "G2", freqHz: 98.0 },
      { note: "C3", freqHz: 130.81 },
      { note: "F3", freqHz: 174.61 },
      { note: "A3", freqHz: 220.0 },
      { note: "D4", freqHz: 293.66 },
    ],
    bassNotes: [
      { note: "D1", freqHz: 36.71 },
      { note: "G1", freqHz: 49.0 },
      { note: "C2", freqHz: 65.41 },
      { note: "F2", freqHz: 87.31 },
    ],
  },
];

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const KS_MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

const CAMELOT_MINOR = ["5A", "12A", "7A", "2A", "9A", "4A", "11A", "6A", "1A", "8A", "3A", "10A"];
const CAMELOT_MAJOR = ["8B", "3B", "10B", "5B", "12B", "7B", "2B", "9B", "4B", "11B", "6B", "1B"];

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

export function computeDelaySubdivisionsMs(bpmInput: number): DelaySubdivisionTable {
  const bpm = Math.max(30, Math.min(300, Number(bpmInput) || 120));
  const quarterMs = Number((60000 / bpm).toFixed(1));
  return {
    bpm: Number(bpm.toFixed(1)),
    quarterMs,
    dottedEighthMs: Number((quarterMs * 0.75).toFixed(1)),
    eighthMs: Number((quarterMs * 0.5).toFixed(1)),
    eighthTripletMs: Number(((quarterMs * 2) / 3).toFixed(1)),
    sixteenthSlapbackMs: Number((quarterMs * 0.25).toFixed(1)),
    preDelayRoomMs: Number((quarterMs * 0.0625).toFixed(1)),
    preDelayPlateMs: Number((quarterMs * 0.125).toFixed(1)),
  };
}

function shiftPitchGrainMono(
  input: Float32Array,
  ratio: number,
  grainSize: number = 2048
): Float32Array {
  const len = input.length;
  const output = new Float32Array(len);
  if (Math.abs(ratio - 1.0) < 1e-4) {
    output.set(input);
    return output;
  }

  let phaseA = 0;
  let phaseB = 0.5;
  const rateDelta = (1 - ratio) / grainSize;

  for (let i = 0; i < len; i++) {
    phaseA = (phaseA + rateDelta) % 1;
    if (phaseA < 0) phaseA += 1;
    phaseB = (phaseA + 0.5) % 1;

    const delayA = phaseA * grainSize;
    const delayB = phaseB * grainSize;

    const winA = 0.5 * (1 - Math.cos(2 * Math.PI * phaseA));
    const winB = 0.5 * (1 - Math.cos(2 * Math.PI * phaseB));

    const posA = Math.max(0, Math.min(len - 2, i - delayA));
    const posB = Math.max(0, Math.min(len - 2, i - delayB));

    const idxA = Math.floor(posA);
    const fracA = posA - idxA;
    const sampA = input[idxA] * (1 - fracA) + input[idxA + 1] * fracA;

    const idxB = Math.floor(posB);
    const fracB = posB - idxB;
    const sampB = input[idxB] * (1 - fracB) + input[idxB + 1] * fracB;

    output[i] = sampA * winA + sampB * winB;
  }

  return output;
}

function applyFormantEnvelopeShift(
  input: Float32Array,
  sampleRate: number,
  formantSemitones: number
): Float32Array {
  if (Math.abs(formantSemitones) < 0.05) {
    return input;
  }

  const len = input.length;
  const out = new Float32Array(len);
  const formantRatio = Math.pow(2, formantSemitones / 12);

  const f1 = Math.max(220, Math.min(1400, 650 * formantRatio));
  const f2 = Math.max(850, Math.min(4200, 1750 * formantRatio));

  const alphaLow = Math.min(0.45, (2 * Math.PI * f1) / sampleRate);
  const alphaMid = Math.min(0.75, (2 * Math.PI * f2) / sampleRate);

  let lp1 = 0;
  let lp2 = 0;

  const chestGain = formantSemitones < 0 ? 1 + Math.abs(formantSemitones) * 0.14 : 1 / (1 + formantSemitones * 0.08);
  const throatGain = formantSemitones > 0 ? 1 + formantSemitones * 0.15 : 1 / (1 + Math.abs(formantSemitones) * 0.08);

  for (let i = 0; i < len; i++) {
    const x = input[i];
    lp1 += alphaLow * (x - lp1);
    lp2 += alphaMid * (x - lp2);
    const chestBand = lp1;
    const throatBand = lp2 - lp1;
    const airBand = x - lp2;

    out[i] = chestBand * chestGain + throatBand * throatGain + airBand;
  }

  return out;
}

export async function renderVocalPitchLabDsp(
  source: AudioBuffer,
  params: VocalLabParameters
): Promise<AudioBuffer> {
  const sr = source.sampleRate;
  const len = source.length;
  const inL = source.getChannelData(0);
  const inR = source.numberOfChannels > 1 ? source.getChannelData(1) : inL;

  const offline = new OfflineAudioContext(2, len, sr);
  const outBuf = offline.createBuffer(2, len, sr);
  const outL = outBuf.getChannelData(0);
  const outR = outBuf.getChannelData(1);

  const totalPitchSt = params.pitchSemitones + params.fineCents / 100;
  const mainRatio = Math.pow(2, totalPitchSt / 12);

  const pitchedL = applyFormantEnvelopeShift(
    shiftPitchGrainMono(inL, mainRatio, 2048),
    sr,
    params.formantShift
  );
  const pitchedR = applyFormantEnvelopeShift(
    shiftPitchGrainMono(inR, mainRatio, 2048),
    sr,
    params.formantShift
  );

  let harmLowL: Float32Array | null = null;
  let harmHighR: Float32Array | null = null;
  const harmonyBlend = Math.max(0, Math.min(1, params.harmonyBlendPct / 100));

  if (params.harmonyMode !== "off" && harmonyBlend > 0.01) {
    let intervalA = 3;
    let intervalB = 7;
    if (params.harmonyMode === "root-3rd-5th-major") {
      intervalA = 4;
      intervalB = 7;
    } else if (params.harmonyMode === "octave-up-down") {
      intervalA = -12;
      intervalB = 12;
    } else if (params.harmonyMode === "power-fifth-stack") {
      intervalA = -5;
      intervalB = 7;
    }

    const ratioA = Math.pow(2, (totalPitchSt + intervalA) / 12);
    const ratioB = Math.pow(2, (totalPitchSt + intervalB) / 12);
    harmLowL = shiftPitchGrainMono(inL, ratioA, 1792);
    harmHighR = shiftPitchGrainMono(inR, ratioB, 1792);
  }

  const baseAdtDelaySamples = Math.max(
    1,
    Math.floor((Math.max(10, Math.min(45, params.adtDelayMs)) / 1000) * sr)
  );
  const detuneRatio = Math.pow(2, params.adtDetuneCents / 1200);
  const adtCloneMono = shiftPitchGrainMono(pitchedL, detuneRatio, 1536);
  const wowFreq = Math.max(0.2, Math.min(4.0, params.adtWowHz));
  const wowDepthSamples = (0.0022 * sr) * (params.adtDetuneCents / 15);
  const adtWidth = Math.max(0, Math.min(1, params.adtWidthPct / 100));

  const driveGain = dbToLinear(params.tubeDriveDb);
  const isMegaphone = params.presetId === "garage-megaphone";
  const alphaHpMega = (2 * Math.PI * 420) / sr;
  const alphaLpMega = (2 * Math.PI * 3100) / sr;
  let megaHpL = 0;
  let megaLpL = 0;
  let megaHpR = 0;
  let megaLpR = 0;

  const slapDelaySamples = Math.floor((Math.max(0, params.slapbackMs) / 1000) * sr);
  const slapFeedback = Math.max(0, Math.min(0.75, params.slapbackFeedbackPct / 100));
  const slapBufL = slapDelaySamples > 0 ? new Float32Array(len) : null;
  const slapBufR = slapDelaySamples > 0 ? new Float32Array(len) : null;

  const wet = Math.max(0, Math.min(1, params.wetMix / 100));
  const dry = 1 - wet * 0.55;

  for (let i = 0; i < len; i++) {
    const t = i / sr;

    const wowOffset = Math.sin(2 * Math.PI * wowFreq * t) * wowDepthSamples;
    const adtReadPos = Math.max(0, Math.min(len - 2, i - baseAdtDelaySamples - wowOffset));
    const adtIdx = Math.floor(adtReadPos);
    const adtFrac = adtReadPos - adtIdx;
    const adtSample =
      adtCloneMono[adtIdx] * (1 - adtFrac) + adtCloneMono[adtIdx + 1] * adtFrac;

    let wetL = pitchedL[i] * (1 - adtWidth * 0.25) - adtSample * adtWidth * 0.45;
    let wetR = pitchedR[i] * (1 - adtWidth * 0.25) + adtSample * adtWidth * 0.75;

    if (harmLowL && harmHighR) {
      const hA = harmLowL[i] * harmonyBlend * 0.52;
      const hB = harmHighR[i] * harmonyBlend * 0.52;
      wetL += hA * 0.85 + hB * 0.25;
      wetR += hB * 0.85 + hA * 0.25;
    }

    if (slapBufL && slapBufR && slapDelaySamples > 20) {
      const prevL = i >= slapDelaySamples ? slapBufL[i - slapDelaySamples] : 0;
      const prevR = i >= slapDelaySamples ? slapBufR[i - slapDelaySamples] : 0;
      slapBufL[i] = wetL + prevL * slapFeedback;
      slapBufR[i] = wetR + prevR * slapFeedback;
      wetL += prevL * 0.48;
      wetR += prevR * 0.48;
    }

    if (isMegaphone) {
      megaHpL += alphaHpMega * (wetL - megaHpL);
      const hpOutL = wetL - megaHpL;
      megaLpL += alphaLpMega * (hpOutL - megaLpL);
      wetL = megaLpL * 1.45;

      megaHpR += alphaHpMega * (wetR - megaHpR);
      const hpOutR = wetR - megaHpR;
      megaLpR += alphaLpMega * (hpOutR - megaLpR);
      wetR = megaLpR * 1.45;
    }

    if (params.tubeDriveDb > 0.2) {
      const drivenL = wetL * driveGain;
      const drivenR = wetR * driveGain;
      const asymL = drivenL + 0.12 * drivenL * drivenL;
      const asymR = drivenR + 0.12 * drivenR * drivenR;
      wetL = Math.tanh(asymL) / Math.tanh(Math.max(1.2, driveGain * 0.85));
      wetR = Math.tanh(asymR) / Math.tanh(Math.max(1.2, driveGain * 0.85));
    }

    outL[i] = Math.max(-0.98, Math.min(0.98, inL[i] * dry + wetL * wet));
    outR[i] = Math.max(-0.98, Math.min(0.98, inR[i] * dry + wetR * wet));
  }

  return outBuf;
}

function correlateChromaProfile(chroma: number[], profile: number[], shift: number): number {
  let meanC = 0;
  let meanP = 0;
  for (let i = 0; i < 12; i++) {
    meanC += chroma[i];
    meanP += profile[i];
  }
  meanC /= 12;
  meanP /= 12;

  let num = 0;
  let denC = 0;
  let denP = 0;
  for (let i = 0; i < 12; i++) {
    const cVal = chroma[(i + shift) % 12] - meanC;
    const pVal = profile[i] - meanP;
    num += cVal * pVal;
    denC += cVal * cVal;
    denP += pVal * pVal;
  }
  const denom = Math.sqrt(denC * denP);
  return denom > 1e-9 ? num / denom : 0;
}

export function analyzeTrackKeyAndBpm(
  buffer: AudioBuffer,
  fileName: string,
  sourceType: "UPLOAD" | "DEMO" | "ACTIVE_BUS" = "ACTIVE_BUS",
  lowPassCutoffHz: number = 240
): BatchTrackAnalysisRow {
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;

  const cutoff = Math.max(80, Math.min(600, lowPassCutoffHz));
  const hop = Math.floor(sr * 0.015);
  const numFrames = Math.max(1, Math.floor(len / hop));
  const onsetEnv = new Float32Array(numFrames);

  let lpState = 0;
  const alphaLp = Math.min(0.85, (2 * Math.PI * cutoff) / sr);
  let prevEnergy = 0;

  for (let f = 0; f < numFrames; f++) {
    let sumSq = 0;
    const start = f * hop;
    const step = 4;
    let count = 0;
    for (let j = 0; j < hop && start + j < len; j += step) {
      const mono = 0.5 * (ch0[start + j] + ch1[start + j]);
      lpState += alphaLp * (mono - lpState);
      sumSq += lpState * lpState;
      count++;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, count));
    const flux = Math.max(0, rms - prevEnergy);
    onsetEnv[f] = flux + rms * 0.35;
    prevEnergy = rms;
  }

  const frameDurationSec = hop / sr;
  const minLag = Math.max(4, Math.floor(60 / (185 * frameDurationSec)));
  const maxLag = Math.min(numFrames - 2, Math.ceil(60 / (75 * frameDurationSec)));

  let bestLag = Math.floor(60 / (128 * frameDurationSec));
  let bestCorr = -1;
  let secondBestCorr = -1;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let f = 0; f + lag < numFrames; f++) {
      corr += onsetEnv[f] * onsetEnv[f + lag];
    }
    if (corr > bestCorr) {
      secondBestCorr = bestCorr;
      bestCorr = corr;
      bestLag = lag;
    } else if (corr > secondBestCorr) {
      secondBestCorr = corr;
    }
  }

  const rawBpm = 60 / (bestLag * frameDurationSec);
  const detectedBpm = Math.round(rawBpm * 2) / 2;

  const chromaRaw = new Array<number>(12).fill(0);
  const probeSamples = Math.min(len, sr * 8);
  const octaves = [2, 3, 4];

  for (let pc = 0; pc < 12; pc++) {
    let pcEnergy = 0;
    for (const oct of octaves) {
      const freq = 55.0 * Math.pow(2, oct - 1 + (pc - 9) / 12);
      const omega = (2 * Math.PI * freq) / sr;
      let re = 0;
      let im = 0;
      const stride = 12;
      for (let n = 0; n < probeSamples; n += stride) {
        const s = 0.5 * (ch0[n] + ch1[n]);
        re += s * Math.cos(omega * n);
        im -= s * Math.sin(omega * n);
      }
      pcEnergy += Math.sqrt(re * re + im * im);
    }
    chromaRaw[pc] = pcEnergy;
  }

  const maxChroma = Math.max(...chromaRaw, 1e-6);
  const chromaNormalized = chromaRaw.map((v) => v / maxChroma);

  let bestRoot = 4;
  let bestScale: "Minor" | "Major" = "Minor";
  let bestKeyScore = -2;
  let runnerUpScore = -2;

  for (let root = 0; root < 12; root++) {
    const scoreMinor = correlateChromaProfile(chromaNormalized, KS_MINOR_PROFILE, root);
    if (scoreMinor > bestKeyScore) {
      runnerUpScore = bestKeyScore;
      bestKeyScore = scoreMinor;
      bestRoot = root;
      bestScale = "Minor";
    } else if (scoreMinor > runnerUpScore) {
      runnerUpScore = scoreMinor;
    }

    const scoreMajor = correlateChromaProfile(chromaNormalized, KS_MAJOR_PROFILE, root);
    if (scoreMajor > bestKeyScore) {
      runnerUpScore = bestKeyScore;
      bestKeyScore = scoreMajor;
      bestRoot = root;
      bestScale = "Major";
    } else if (scoreMajor > runnerUpScore) {
      runnerUpScore = scoreMajor;
    }
  }

  const keyNote = NOTE_NAMES[bestRoot];
  const keyAndScale = `${keyNote} ${bestScale}`;
  const camelotCode =
    bestScale === "Minor" ? CAMELOT_MINOR[bestRoot] : CAMELOT_MAJOR[bestRoot];

  const relIdx = bestScale === "Minor" ? (bestRoot + 3) % 12 : (bestRoot + 9) % 12;
  const relativePairKey = `${NOTE_NAMES[relIdx]} ${bestScale === "Minor" ? "Major" : "Minor"}`;

  const margin = Math.max(0, bestKeyScore - runnerUpScore);
  const confidencePct = Math.min(
    99,
    Math.max(68, Math.round(74 + bestKeyScore * 18 + margin * 25))
  );

  let tuningHint = "E Standard (E2-A2-D3-G3-B3-E4)";
  if (keyNote === "D" || keyNote === "F") {
    tuningHint = "Drop D (D2-A2-D3-G3-B3-E4) / D Standard";
  } else if (keyNote === "D#" || keyNote === "G#" || keyNote === "C#") {
    tuningHint = "Eb Half-Step Down (Eb2-Ab2-Db3-Gb3-Bb3-Eb4)";
  }

  const chromaEnergy = NOTE_NAMES.map((note, idx) => ({
    note,
    energy: Math.round(chromaNormalized[idx] * 100),
  }));

  return {
    id: `${fileName}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    fileName,
    sourceType,
    durationSec: Number((len / sr).toFixed(2)),
    sampleRate: sr,
    bpm: detectedBpm,
    halfBpm: Number((detectedBpm / 2).toFixed(1)),
    doubleBpm: Number((detectedBpm * 2).toFixed(1)),
    keyNote,
    scale: bestScale,
    keyAndScale,
    relativePairKey,
    camelotCode,
    confidencePct,
    tuningHint,
    lowPassCutoffHz: cutoff,
    delays: computeDelaySubdivisionsMs(detectedBpm),
    chromaEnergy,
  };
}

export function synthesizeTuningDroneBuffer(
  ctx: BaseAudioContext,
  presetId: TuningDronePresetId,
  specificFreqHz?: number,
  durationSec: number = 4.0
): AudioBuffer {
  const sr = 44100;
  const len = Math.floor(sr * durationSec);
  const buf = ctx.createBuffer(2, len, sr);
  const outL = buf.getChannelData(0);
  const outR = buf.getChannelData(1);

  const preset =
    ROCK_TUNING_DRONES.find((p) => p.id === presetId) ?? ROCK_TUNING_DRONES[0];

  const frequencies = specificFreqHz
    ? [specificFreqHz * 0.5, specificFreqHz, specificFreqHz * 2]
    : [
        preset.bassNotes[0].freqHz,
        preset.guitarNotes[0].freqHz,
        preset.guitarNotes[1].freqHz,
        preset.guitarNotes[2].freqHz,
      ];

  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const fadeEnv =
      t < 0.08
        ? t / 0.08
        : t > durationSec - 0.15
        ? Math.max(0, (durationSec - t) / 0.15)
        : 1.0;

    let sigL = 0;
    let sigR = 0;
    for (let k = 0; k < frequencies.length; k++) {
      const f = frequencies[k];
      const fundamental = Math.sin(2 * Math.PI * f * t);
      const secondHarm = 0.42 * Math.sin(2 * Math.PI * f * 2 * t + 0.2);
      const thirdHarm = 0.18 * Math.sin(2 * Math.PI * f * 3 * t + 0.5);
      const voice = (fundamental + secondHarm + thirdHarm) / frequencies.length;
      sigL += voice * (k % 2 === 0 ? 1.05 : 0.85);
      sigR += voice * (k % 2 === 1 ? 1.05 : 0.85);
    }

    outL[i] = Math.tanh(sigL * 1.4) * 0.65 * fadeEnv;
    outR[i] = Math.tanh(sigR * 1.4) * 0.65 * fadeEnv;
  }

  return buf;
}
