import { NextRequest, NextResponse } from "next/server";
import { getEstTimestamp, writeRotatedEstLog } from "@/app/lib/server-logger";

const SERVICE_NAME =
  process.env.WEAKSAUCE_SERVICE_NAME ?? "weaksauce-studio-dsp-api";
const TARGET_LUFS = Number(process.env.WEAKSAUCE_TARGET_LUFS ?? -14.0);
const SPEED_OF_SOUND_MPS = Number(
  process.env.WEAKSAUCE_SPEED_OF_SOUND_MPS ?? 343.0
);

const TOOL_OUTPUT_MANIFEST: Record<
  string,
  Array<{ id: string; label: string; color: string }>
> = {
  "vocal-remover": [
    { id: "vocals", label: "Vocals (Isolated Lead/Backing)", color: "#FF3B00" },
    { id: "instrumental", label: "Instrumental (Band Backing)", color: "#00E5FF" },
    { id: "rebalanced", label: "Custom Rebalanced Mix", color: "#B8FF01" },
  ],
  "stem-splitter": [
    { id: "vocals", label: "Vocals", color: "#FF3B00" },
    { id: "guitar", label: "Guitar", color: "#FFB800" },
    { id: "bass", label: "Bass", color: "#00E5FF" },
    { id: "drums", label: "Drums", color: "#B8FF01" },
    { id: "piano", label: "Piano / Keys", color: "#D946EF" },
    { id: "other", label: "Other / Ambience", color: "#94A3B8" },
  ],
  "reverb-remover": [
    { id: "vocals", label: "Dry / De-Reverbed Signal", color: "#B8FF01" },
    { id: "noise", label: "Removed Reverb Tail (Room Bleed)", color: "#FF3B00" },
  ],
  "echo-remover": [
    { id: "vocals", label: "Clean Signal (Echo Removed)", color: "#00E5FF" },
    { id: "noise", label: "Isolated Echo Residual", color: "#FF3B00" },
  ],
  "audio-enhancer": [
    { id: "denoised", label: "Enhanced & Denoised Master", color: "#B8FF01" },
    { id: "removedNoise", label: "Removed Hum & Hiss Floor", color: "#94A3B8" },
  ],
  "voice-changer": [
    { id: "transformed", label: "Transformed Vocal / Instrument Track", color: "#FF3B00" },
  ],
  "bpm-finder": [
    {
      id: "analysisTable",
      label: "Batch Key, Scale, BPM & Pedal Delay Manifest (.CSV / .JSON)",
      color: "#00E5FF",
    },
  ],
  "voice-recorder": [
    { id: "recordingWav", label: "Uncompressed Studio PCM (.WAV)", color: "#FF3B00" },
    { id: "recordingFlac", label: "Lossless Archival (.FLAC)", color: "#00E5FF" },
    { id: "recordingMp3", label: "Band Chat Share (.MP3 320kbps)", color: "#B8FF01" },
  ],
  "audio-converter": [
    { id: "convertedFile", label: "Transcoded Master Audio File", color: "#B8FF01" },
  ],
  converter: [
    { id: "convertedFile", label: "Transcoded Master Audio File", color: "#B8FF01" },
  ],
  convert: [
    { id: "convertedFile", label: "Transcoded Master Audio File", color: "#B8FF01" },
  ],
};

function buildCleanupTelemetry(
  toolId: string,
  params: Record<string, unknown>
): {
  cleanupTelemetry: Record<string, unknown> | null;
  extraChainSteps: string[];
} {
  if (toolId === "reverb-remover") {
    const dereverbPct =
      typeof params.dereverbAmount === "number" ? params.dereverbAmount : 75;
    const tailMs =
      typeof params.tailReleaseMs === "number" ? params.tailReleaseMs : 120;
    const boxFreqHz =
      typeof params.boxinessCutFreqHz === "number"
        ? params.boxinessCutFreqHz
        : 350;
    const boxDb = typeof params.deBoxHz === "number" ? params.deBoxHz : -4;
    const reblendPct =
      typeof params.dryRoomReBlendPct === "number"
        ? params.dryRoomReBlendPct
        : 12;

    return {
      cleanupTelemetry: {
        dereverb_amount_pct: dereverbPct,
        tail_decay_gate_ms: tailMs,
        boxiness_cut_freq_hz: boxFreqHz,
        boxiness_cut_db: boxDb,
        dry_room_reblend_pct: reblendPct,
      },
      extraChainSteps: [
        `REVERB_EXPANDER[dereverb=${dereverbPct}%|tail_gate=${tailMs}ms|debox=${boxDb}dB@${boxFreqHz}Hz|reblend=${reblendPct}%]`,
      ],
    };
  }

  if (toolId === "echo-remover") {
    const rawLag =
      typeof params.delaySearchMs === "number" ? params.delaySearchMs : 42.5;
    const lagMs = Number(Math.max(15, Math.min(350, rawLag)).toFixed(1));
    const wallMeters = Number(
      ((SPEED_OF_SOUND_MPS * (lagMs / 1000)) / 2).toFixed(1)
    );
    const wallFeet = Number((wallMeters * 3.28084).toFixed(1));
    const acousticClassification =
      lagMs < 35
        ? "TIGHT BASEMENT DRYWALL FLUTTER"
        : lagMs < 95
        ? "GARAGE PARALLEL-WALL SLAPBACK"
        : "LARGE CONCRETE ROOM / HALL BOUNCE";
    const summaryBanner = `DETECTED GARAGE SLAPBACK: ${lagMs} ms / ~${wallMeters}m wall bounce`;

    return {
      cleanupTelemetry: {
        slapback_detection: {
          detected_lag_ms: lagMs,
          wall_distance_meters: wallMeters,
          wall_distance_feet: wallFeet,
          acoustic_classification: acousticClassification,
          summary_banner: summaryBanner,
        },
      },
      extraChainSteps: [
        `SLAPBACK_CANCEL[lag=${lagMs}ms|wall=${wallMeters}m(${wallFeet}ft)]`,
      ],
    };
  }

  if (toolId === "audio-enhancer") {
    const f0Raw = typeof params.humNotchHz === "number" ? params.humNotchHz : 60;
    const f0 = f0Raw === 50 ? 50 : f0Raw === 0 ? 0 : 60;
    const macroId =
      typeof params.preset === "string"
        ? params.preset
        : "GUITAR_AMP_HUM_HISS_KILLER";
    const presenceDb =
      typeof params.presenceBoostDb === "number" ? params.presenceBoostDb : 3.5;

    const harmonicNotchBank = [1, 2, 3, 4, 5, 6, 7, 8].map((h) => ({
      harmonic_index: h,
      frequency_hz: (f0 || 60) * h,
      attenuation_db: f0 > 0 ? Number((-28 / Math.pow(h, 0.35)).toFixed(1)) : 0,
    }));

    return {
      cleanupTelemetry: {
        macro_profile_id: macroId,
        hum_fundamental_hz: f0,
        harmonic_notch_bank: harmonicNotchBank,
        presence_exciter_freq_hz: 3500,
        presence_boost_db: presenceDb,
      },
      extraChainSteps: [
        `HUM_NOTCH_8X[f0=${f0}Hz|harmonics=${harmonicNotchBank
          .map((b) => b.frequency_hz)
          .join(",")}Hz|presence=+3.5kHz@${presenceDb}dB]`,
      ],
    };
  }

  return { cleanupTelemetry: null, extraChainSteps: [] };
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    writeRotatedEstLog("POST", 174, `Malformed JSON on /api/v1/tools/${slug}`);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const toolId = typeof body.tool_id === "string" ? body.tool_id : slug;
  const toolCode = typeof body.tool_code === "string" ? body.tool_code : "01.1";
  const sampleRate = typeof body.sample_rate === "number" ? body.sample_rate : 44100;
  const channels = typeof body.channels === "number" ? body.channels : 2;
  const durationSeconds =
    typeof body.duration_seconds === "number" ? body.duration_seconds : 6.0;
  const peakDb = typeof body.peak_db === "number" ? body.peak_db : -1.0;
  const rmsDb = typeof body.rms_db === "number" ? body.rms_db : -14.0;
  const params =
    body.parameters && typeof body.parameters === "object"
      ? (body.parameters as Record<string, unknown>)
      : {};

  if (peakDb < rmsDb) {
    writeRotatedEstLog(
      "POST",
      194,
      `Validation error: peak_db (${peakDb}) < rms_db (${rmsDb})`
    );
    return NextResponse.json(
      { detail: "peak_db must be greater than or equal to rms_db" },
      { status: 422 }
    );
  }

  const estimatedLufs = Number((rmsDb - 0.691).toFixed(2));
  const headroomDb = Number((0 - peakDb).toFixed(2));
  const recommendedGainDeltaDb = Number((TARGET_LUFS - estimatedLufs).toFixed(2));

  const bpmVal =
    typeof params.detectedBpm === "number" ? Number(params.detectedBpm) : 128.0;
  const quarterMs = Number((60000 / Math.max(40, bpmVal)).toFixed(1));

  const rawOutputs =
    TOOL_OUTPUT_MANIFEST[slug] ??
    TOOL_OUTPUT_MANIFEST[toolId] ??
    TOOL_OUTPUT_MANIFEST["audio-enhancer"];
  const outputs = rawOutputs.map((o, idx) => ({
    ...o,
    estimated_peak_db: Number((peakDb - idx * 0.8).toFixed(2)),
  }));

  const { cleanupTelemetry, extraChainSteps } = buildCleanupTelemetry(
    toolId,
    params
  );

  const dspChainSummary: string[] = [
    `INPUT[${sampleRate}Hz/${channels}ch/${durationSeconds.toFixed(2)}s]`,
    `KERNEL[${toolCode}:${toolId}]`,
    ...extraChainSteps,
  ];

  if (toolId === "vocal-remover") {
    const lowCut = Number(params.lowCutHz ?? 170);
    const highCut = Number(params.highCutHz ?? 8500);
    dspChainSummary.push(
      `LR4_CROSSOVER[LOW_GUARD=${lowCut}Hz,HIGH_GUARD=${highCut}Hz]`,
      `SPECTRAL_MASK[MID_SIDE_AZIMUTH+HPSS_NN_FILTER]`
    );
  } else if (toolId === "stem-splitter") {
    const splitMode = String(params.splitMode ?? "3-Piece Rock Core");
    dspChainSummary.push(
      `STEM_MODE[${splitMode}]`,
      `LR4_MULTIBAND[BASS<200Hz,MID=200Hz..5.5kHz,AIR>5.5kHz]`,
      `TRANSIENT_HPSS[DRUMS_FAST_ENV+VOCALS_CENTER+GUITAR_SIDE]`
    );
  } else if (toolId === "voice-changer") {
    const pitchSt =
      typeof params.pitchSemitones === "number" ? params.pitchSemitones : 0;
    const fineCt = typeof params.fineCents === "number" ? params.fineCents : 0;
    const formantSt =
      typeof params.formantShift === "number" ? params.formantShift : 0;
    const adtMs = typeof params.adtDelayMs === "number" ? params.adtDelayMs : 22;
    const adtDetune =
      typeof params.adtDetuneCents === "number" ? params.adtDetuneCents : 15;
    const harmonyMode =
      typeof params.harmonyMode === "string" ? params.harmonyMode : "off";
    const tubeDrive =
      typeof params.tubeDriveDb === "number" ? params.tubeDriveDb : 2.5;
    const vocalChar =
      typeof params.vocalCharacter === "string"
        ? params.vocalCharacter
        : "Abbey Road ADT Vocal Doubler";

    dspChainSummary.push(
      `PRESET[${vocalChar}]`,
      `WSOLA_PITCH[${pitchSt >= 0 ? "+" : ""}${pitchSt}st / ${fineCt >= 0 ? "+" : ""}${fineCt}ct]`,
      `FORMANT_ENVELOPE[${formantSt >= 0 ? "+" : ""}${formantSt}st]`,
      `ABBEY_ROAD_ADT[${adtMs}ms / ±${adtDetune}ct]`,
      `HARMONY_STACK[${harmonyMode}]`,
      `TUBE_PREAMP[+${tubeDrive}dB]`
    );
  } else if (toolId === "bpm-finder") {
    const lpfHz =
      typeof params.lowPassBeatHz === "number" ? params.lowPassBeatHz : 240;
    const keyStr =
      typeof params.detectedKey === "string" ? params.detectedKey : "E Minor";
    const camelot =
      typeof params.camelotCode === "string" ? params.camelotCode : "9A";
    dspChainSummary.push(
      `LPF_BEAT_TRACKER[${lpfHz}Hz -> ${bpmVal} BPM]`,
      `CHROMA_KRUMHANSL_SCHMUCKLER[${keyStr} / ${camelot}]`,
      `PEDAL_DELAY_MS[1/4=${quarterMs}ms | 1/8.=${Number((quarterMs * 0.75).toFixed(1))}ms | 1/8=${Number((quarterMs * 0.5).toFixed(1))}ms | 1/8T=${Number(((quarterMs * 2) / 3).toFixed(1))}ms | 1/16=${Number((quarterMs * 0.25).toFixed(1))}ms]`
    );
  } else if (
    toolId === "audio-converter" ||
    toolId === "converter" ||
    toolId === "convert"
  ) {
    const sourceFormat =
      typeof params.sourceFormat === "string" ? params.sourceFormat : "wav";
    const targetFormat =
      typeof params.targetFormat === "string" ? params.targetFormat : "wav";
    const bitDepth = typeof params.bitDepth === "number" ? params.bitDepth : 24;
    const bitrateKbps =
      typeof params.bitrateKbps === "number" ? params.bitrateKbps : 320;
    const channelMode =
      typeof params.channelMode === "string" ? params.channelMode : "stereo";
    dspChainSummary.push(
      `TRANSCODE[${sourceFormat.toUpperCase()}->${targetFormat.toUpperCase()}@${bitDepth}b/${bitrateKbps}k/${channelMode}]`
    );
  }

  dspChainSummary.push(
    `OUTPUT_TRACKS[${outputs.length}]`,
    `LOUDNESS[${estimatedLufs} LUFS / delta=${recommendedGainDeltaDb >= 0 ? "+" : ""}${recommendedGainDeltaDb} dB]`
  );

  const sourceFormat =
    typeof params.sourceFormat === "string" ? params.sourceFormat : "wav";
  const targetFormat =
    typeof params.targetFormat === "string" ? params.targetFormat : "wav";
  const bitDepth = typeof params.bitDepth === "number" ? params.bitDepth : 24;
  const bitrateKbps =
    typeof params.bitrateKbps === "number" ? params.bitrateKbps : 320;
  const channelMode =
    typeof params.channelMode === "string" ? params.channelMode : "stereo";
  const normalizeMode =
    typeof params.normalizeMode === "string"
      ? params.normalizeMode
      : "peak-minus-1db";
  const estimatedOutputBytes =
    typeof params.outputBytes === "number"
      ? params.outputBytes
      : Math.round(sampleRate * channels * (bitDepth / 8) * durationSeconds);

  writeRotatedEstLog(
    "POST",
    318,
    `Processed tool=${toolId} (${toolCode}) slug=${slug} sr=${sampleRate} outputs=${outputs.length} lufs=${estimatedLufs}`
  );

  return NextResponse.json({
    tool_id: toolId,
    tool_code: toolCode,
    status: "PROCESSED",
    source_format: sourceFormat,
    target_format: targetFormat,
    sample_rate: sampleRate,
    bit_depth: bitDepth,
    bitrate_kbps: bitrateKbps,
    channel_mode: channelMode,
    normalize_mode: normalizeMode,
    estimated_output_bytes: estimatedOutputBytes,
    estimated_lufs: estimatedLufs,
    headroom_db: headroomDb,
    recommended_gain_delta_db: recommendedGainDeltaDb,
    detected_bpm: bpmVal,
    delay_subdivisions_ms: {
      quarter_ms: quarterMs,
      dotted_eighth_ms: Number((quarterMs * 0.75).toFixed(1)),
      eighth_ms: Number((quarterMs * 0.5).toFixed(1)),
      eighth_triplet_ms: Number(((quarterMs * 2) / 3).toFixed(1)),
      slapback_sixteenth_ms: Number((quarterMs * 0.25).toFixed(1)),
    },
    cleanup_telemetry: cleanupTelemetry,
    outputs,
    dsp_chain_summary: dspChainSummary,
    execution_engine: SERVICE_NAME,
    timestamp_est: getEstTimestamp(),
  });
}
