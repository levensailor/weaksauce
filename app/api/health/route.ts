import { NextRequest, NextResponse } from "next/server";
import { getEstTimestamp, writeRotatedEstLog } from "@/app/lib/server-logger";

const APP_SERVICE_NAME =
  process.env.WEAKSAUCE_SERVICE_NAME ?? "weaksauce-audio-workbench";
const TARGET_LUFS = Number(process.env.WEAKSAUCE_TARGET_LUFS ?? -14.0);

export interface AudioTelemetryPayload {
  tool_id: string;
  sample_rate: number;
  channels: number;
  duration_seconds: number;
  peak_db: number;
  rms_db: number;
  parameters?: Record<string, string | number | boolean>;
}

export async function GET() {
  const timestampEst = getEstTimestamp();
  writeRotatedEstLog("GET", 20, `Health check served for ${APP_SERVICE_NAME}`);
  return NextResponse.json({
    service: APP_SERVICE_NAME,
    status: "READY",
    architecture: "Dual-Layer WebAudio/WASM + Python FastAPI Studio DSP",
    persona_profile:
      "Jeff // 3-Piece Home Recording Rock Band (Guitar, Bass, Drums, Vocals)",
    toolset_count: 4,
    tool_count: 8,
    timestamp_est: timestampEst,
  });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    writeRotatedEstLog("POST", 38, "Rejected malformed JSON payload");
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  const data = body as Partial<AudioTelemetryPayload>;
  if (
    typeof data.tool_id !== "string" ||
    data.tool_id.trim().length < 2 ||
    typeof data.sample_rate !== "number" ||
    typeof data.channels !== "number" ||
    typeof data.duration_seconds !== "number" ||
    typeof data.peak_db !== "number" ||
    typeof data.rms_db !== "number"
  ) {
    writeRotatedEstLog("POST", 55, "Rejected payload failing schema check");
    return NextResponse.json(
      {
        error:
          "Expected { tool_id: string, sample_rate: number, channels: number, duration_seconds: number, peak_db: number, rms_db: number }",
      },
      { status: 422 }
    );
  }

  const estimatedLufs = Number((data.rms_db - 0.691).toFixed(2));
  const headroomDb = Number((0 - data.peak_db).toFixed(2));
  const recommendedGainDeltaDb = Number((TARGET_LUFS - estimatedLufs).toFixed(2));

  writeRotatedEstLog(
    "POST",
    71,
    `Processed telemetry for tool_id=${data.tool_id} sr=${data.sample_rate} est_lufs=${estimatedLufs}LUFS`
  );

  return NextResponse.json({
    tool_id: data.tool_id,
    status: "PROCESSED",
    estimated_lufs: estimatedLufs,
    headroom_db: headroomDb,
    recommended_gain_delta_db: recommendedGainDeltaDb,
    dsp_chain_summary: [
      `INPUT_BUS[${data.sample_rate}Hz/${data.channels}ch]`,
      `TOOL_KERNEL[${data.tool_id}]`,
      `K_WEIGHT_LUFS[${estimatedLufs} LUFS]`,
      `CEILING_GUARD[headroom=${headroomDb} dB]`,
    ],
    execution_engine: APP_SERVICE_NAME,
    timestamp_est: getEstTimestamp(),
  });
}
