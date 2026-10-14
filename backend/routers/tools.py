import os
from datetime import datetime
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException

from backend.models.schemas import (
    DelaySubdivisionsMs,
    HealthResponse,
    ToolOutputTrack,
    ToolProcessRequest,
    ToolProcessResponse,
)
from backend.utils.logger import LOG_TIMEZONE_NAME, get_logger

load_dotenv()

router = APIRouter()
logger = get_logger()

SERVICE_NAME = os.getenv("WEAKSAUCE_SERVICE_NAME", "weaksauce-fastapi-dsp")
ARCH_LABEL = os.getenv(
    "WEAKSAUCE_ARCH_LABEL",
    "Dual-Layer WebAudio/WASM + Python FastAPI Studio DSP",
)
PERSONA_PROFILE = os.getenv(
    "WEAKSAUCE_PERSONA_PROFILE",
    "Jeff // 3-Piece Home Recording Rock Band (Guitar, Bass, Drums, Vocals)",
)
TARGET_LUFS = float(os.getenv("WEAKSAUCE_TARGET_LUFS", "-14.0"))

TOOL_OUTPUT_MAP: dict[str, list[tuple[str, str, str]]] = {
    "vocal-remover": [
        ("vocals", "Vocals (Isolated Lead/Backing)", "#FF3B00"),
        ("instrumental", "Instrumental (Band Backing)", "#00E5FF"),
        ("rebalanced", "Custom Rebalanced Mix", "#B8FF01"),
    ],
    "stem-splitter": [
        ("vocals", "Vocals", "#FF3B00"),
        ("guitar", "Guitar", "#FFB800"),
        ("bass", "Bass", "#00E5FF"),
        ("drums", "Drums", "#B8FF01"),
        ("piano", "Piano / Keys", "#D946EF"),
        ("other", "Other / Ambience", "#94A3B8"),
    ],
    "reverb-remover": [
        ("vocals", "Dry / De-Reverbed Signal", "#B8FF01"),
        ("noise", "Removed Reverb Tail (Room Bleed)", "#FF3B00"),
    ],
    "echo-remover": [
        ("vocals", "Clean Signal (Echo Removed)", "#00E5FF"),
        ("noise", "Isolated Echo Residual", "#FF3B00"),
    ],
    "audio-enhancer": [
        ("denoised", "Enhanced & Denoised Master", "#B8FF01"),
        ("removedNoise", "Removed Hum & Hiss Floor", "#94A3B8"),
    ],
    "voice-changer": [
        ("transformed", "Transformed Vocal / Instrument Track", "#FF3B00"),
    ],
    "bpm-finder": [
        ("analysisTable", "Batch Key, Scale, BPM & Pedal Delay Manifest (.CSV / .JSON)", "#00E5FF"),
    ],
    "voice-recorder": [
        ("recordingWav", "Uncompressed Studio PCM (.WAV)", "#FF3B00"),
        ("recordingFlac", "Lossless Archival (.FLAC)", "#00E5FF"),
        ("recordingMp3", "Band Chat Share (.MP3 320kbps)", "#B8FF01"),
    ],
    "audio-converter": [
        ("convertedFile", "Transcoded Master Audio File", "#B8FF01"),
    ],
}


def current_est_string() -> str:
    return datetime.now(ZoneInfo(LOG_TIMEZONE_NAME)).strftime("%Y-%m-%d %H:%M:%S %Z")


@router.get("/api/v1/health", response_model=HealthResponse)
def get_health() -> HealthResponse:
    ts = current_est_string()
    logger.info("Health check served for service=%s at %s", SERVICE_NAME, ts)
    return HealthResponse(
        service=SERVICE_NAME,
        status="READY",
        architecture=ARCH_LABEL,
        persona_profile=PERSONA_PROFILE,
        toolset_count=4,
        tool_count=8,
        timestamp_est=ts,
    )


@router.post("/api/v1/tools/{tool_slug}", response_model=ToolProcessResponse)
def process_tool(tool_slug: str, payload: ToolProcessRequest) -> ToolProcessResponse:
    logger.info(
        "Processing tool_slug=%s code=%s sr=%d ch=%d dur=%.2fs peak=%.2fdB rms=%.2fdB",
        tool_slug,
        payload.tool_code,
        payload.sample_rate,
        payload.channels,
        payload.duration_seconds,
        payload.peak_db,
        payload.rms_db,
    )
    if payload.peak_db < payload.rms_db:
        logger.warning(
            "Invalid signal envelope on %s: peak_db=%.2f < rms_db=%.2f",
            tool_slug,
            payload.peak_db,
            payload.rms_db,
        )
        raise HTTPException(
            status_code=422,
            detail="peak_db must be greater than or equal to rms_db",
        )

    estimated_lufs = round(payload.rms_db - 0.691, 2)
    headroom_db = round(0.0 - payload.peak_db, 2)
    recommended_gain_delta_db = round(TARGET_LUFS - estimated_lufs, 2)

    raw_outputs = TOOL_OUTPUT_MAP.get(payload.tool_id, TOOL_OUTPUT_MAP["audio-enhancer"])
    outputs = [
        ToolOutputTrack(
            id=item_id,
            label=label,
            color=color,
            estimated_peak_db=round(payload.peak_db - idx * 0.8, 2),
        )
        for idx, (item_id, label, color) in enumerate(raw_outputs)
    ]

    bpm_val = float(payload.parameters.get("detectedBpm", 128.0))
    quarter_ms = round(60000.0 / max(40.0, bpm_val), 1)
    delay_subdivisions = DelaySubdivisionsMs(
        quarter_ms=quarter_ms,
        dotted_eighth_ms=round(quarter_ms * 0.75, 1),
        eighth_ms=round(quarter_ms * 0.5, 1),
        slapback_sixteenth_ms=round(quarter_ms * 0.25, 1),
    )

    dsp_chain_summary = [
        f"INPUT[{payload.sample_rate}Hz/{payload.channels}ch/{payload.duration_seconds:.2f}s]",
        f"KERNEL[{payload.tool_code}:{payload.tool_id}]",
        f"OUTPUT_TRACKS[{len(outputs)}]",
        f"LOUDNESS[{estimated_lufs} LUFS / delta={recommended_gain_delta_db:+.2f} dB]",
    ]
    ts = current_est_string()
    logger.info(
        "Completed tool_slug=%s outputs=%d lufs=%.2f",
        tool_slug,
        len(outputs),
        estimated_lufs,
    )
    return ToolProcessResponse(
        tool_id=payload.tool_id,
        tool_code=payload.tool_code,
        status="PROCESSED",
        estimated_lufs=estimated_lufs,
        headroom_db=headroom_db,
        recommended_gain_delta_db=recommended_gain_delta_db,
        detected_bpm=bpm_val,
        delay_subdivisions_ms=delay_subdivisions,
        outputs=outputs,
        dsp_chain_summary=dsp_chain_summary,
        execution_engine=SERVICE_NAME,
        timestamp_est=ts,
    )
