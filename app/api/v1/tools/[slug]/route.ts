import { NextRequest, NextResponse } from "next/server";
import { getEstTimestamp, writeRotatedEstLog } from "@/app/lib/server-logger";

const SERVICE_NAME =
  process.env.WEAKSAUCE_SERVICE_NAME ?? "weaksauce-studio-dsp-api";
const TARGET_LUFS = Number(process.env.WEAKSAUCE_TARGET_LUFS ?? -14.0);

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
};

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    writeRotatedEstLog("POST", 64, `Malformed JSON on /api/v1/tools/${slug}`);
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
    writeRotatedEstLog("POST", 82, `Validation error: peak_db (${peakDb}) < rms_db (${rmsDb})`);
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
    TOOL_OUTPUT_MANIFEST[toolId] ?? TOOL_OUTPUT_MANIFEST["audio-enhancer"];
  const outputs = rawOutputs.map((o, idx) => ({
    ...o,
    estimated_peak_db: Number((peakDb - idx * 0.8).toFixed(2)),
  }));

  writeRotatedEstLog(
    "POST",
    106,
    `Processed tool=${toolId} (${toolCode}) sr=${sampleRate} outputs=${outputs.length} lufs=${estimatedLufs}`
  );

  return NextResponse.json({
    tool_id: toolId,
    tool_code: toolCode,
    status: "PROCESSED",
    estimated_lufs: estimatedLufs,
    headroom_db: headroomDb,
    recommended_gain_delta_db: recommendedGainDeltaDb,
    detected_bpm: bpmVal,
    delay_subdivisions_ms: {
      quarter_ms: quarterMs,
      dotted_eighth_ms: Number((quarterMs * 0.75).toFixed(1)),
      eighth_ms: Number((quarterMs * 0.5).toFixed(1)),
      slapback_sixteenth_ms: Number((quarterMs * 0.25).toFixed(1)),
    },
    outputs,
    dsp_chain_summary: [
      `INPUT[${sampleRate}Hz/${channels}ch/${durationSeconds.toFixed(2)}s]`,
      `KERNEL[${toolCode}:${toolId}]`,
      `OUTPUT_TRACKS[${outputs.length}]`,
      `LOUDNESS[${estimatedLufs} LUFS / delta=${recommendedGainDeltaDb >= 0 ? "+" : ""}${recommendedGainDeltaDb} dB]`,
    ],
    execution_engine: SERVICE_NAME,
    timestamp_est: getEstTimestamp(),
  });
}
