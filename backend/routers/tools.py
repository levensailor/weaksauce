import os
from datetime import datetime
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException

from backend.models.schemas import (
    CleanupSuiteTelemetry,
    DelaySubdivisionsMs,
    HarmonicHumNotchBand,
    HealthResponse,
    SlapbackEchoTelemetry,
    StemSplitterRequest,
    ToolOutputTrack,
    ToolProcessRequest,
    ToolProcessResponse,
    VocalRemoverRequest,
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
SPEED_OF_SOUND_MPS = float(os.getenv("WEAKSAUCE_SPEED_OF_SOUND_MPS", "343.0"))

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
    "converter": [
        ("convertedFile", "Transcoded Master Audio File", "#B8FF01"),
    ],
    "convert": [
        ("convertedFile", "Transcoded Master Audio File", "#B8FF01"),
    ],
}


def current_est_string() -> str:
    return datetime.now(ZoneInfo(LOG_TIMEZONE_NAME)).strftime("%Y-%m-%d %H:%M:%S %Z")


def _validate_envelope(tool_slug: str, peak_db: float, rms_db: float) -> None:
    if peak_db < rms_db:
        logger.warning(
            "Invalid signal envelope on %s: peak_db=%.2f < rms_db=%.2f",
            tool_slug,
            peak_db,
            rms_db,
        )
        raise HTTPException(
            status_code=422,
            detail="peak_db must be greater than or equal to rms_db",
        )


def _compute_delay_subdivisions(bpm_val: float) -> DelaySubdivisionsMs:
    quarter_ms = round(60000.0 / max(40.0, bpm_val), 1)
    return DelaySubdivisionsMs(
        quarter_ms=quarter_ms,
        dotted_eighth_ms=round(quarter_ms * 0.75, 1),
        eighth_ms=round(quarter_ms * 0.5, 1),
        eighth_triplet_ms=round((quarter_ms * 2.0) / 3.0, 1),
        slapback_sixteenth_ms=round(quarter_ms * 0.25, 1),
    )


def build_cleanup_telemetry(
    tool_id: str, params: dict[str, float | int | str | bool]
) -> tuple[CleanupSuiteTelemetry | None, list[str]]:
    extra_steps: list[str] = []

    if tool_id == "reverb-remover":
        dereverb_pct = float(params.get("dereverbAmount", 75.0))
        tail_ms = float(params.get("tailReleaseMs", 120.0))
        box_freq_hz = float(params.get("boxinessCutFreqHz", 350.0))
        box_db = float(params.get("deBoxHz", -4.0))
        reblend_pct = float(params.get("dryRoomReBlendPct", 12.0))
        extra_steps.append(
            f"REVERB_EXPANDER[dereverb={dereverb_pct:.0f}%|tail_gate={tail_ms:.0f}ms|debox={box_db:.1f}dB@{box_freq_hz:.0f}Hz|reblend={reblend_pct:.0f}%]"
        )
        return (
            CleanupSuiteTelemetry(
                dereverb_amount_pct=dereverb_pct,
                tail_decay_gate_ms=tail_ms,
                boxiness_cut_freq_hz=box_freq_hz,
                boxiness_cut_db=box_db,
                dry_room_reblend_pct=reblend_pct,
            ),
            extra_steps,
        )

    if tool_id == "echo-remover":
        lag_ms = float(params.get("delaySearchMs", 42.5))
        lag_ms = max(15.0, min(350.0, lag_ms))
        wall_m = round((SPEED_OF_SOUND_MPS * (lag_ms / 1000.0)) / 2.0, 1)
        wall_ft = round(wall_m * 3.28084, 1)
        acoustic_class = (
            "TIGHT BASEMENT DRYWALL FLUTTER"
            if lag_ms < 35.0
            else "GARAGE PARALLEL-WALL SLAPBACK"
            if lag_ms < 95.0
            else "LARGE CONCRETE ROOM / HALL BOUNCE"
        )
        banner = f"DETECTED GARAGE SLAPBACK: {lag_ms:.1f} ms / ~{wall_m:.1f}m wall bounce"
        extra_steps.append(
            f"SLAPBACK_CANCEL[lag={lag_ms:.1f}ms|wall={wall_m:.1f}m({wall_ft:.1f}ft)]"
        )
        return (
            CleanupSuiteTelemetry(
                slapback_detection=SlapbackEchoTelemetry(
                    detected_lag_ms=round(lag_ms, 1),
                    wall_distance_meters=wall_m,
                    wall_distance_feet=wall_ft,
                    acoustic_classification=acoustic_class,
                    summary_banner=banner,
                )
            ),
            extra_steps,
        )

    if tool_id == "audio-enhancer":
        f0 = int(params.get("humNotchHz", 60))
        if f0 not in (0, 50, 60):
            f0 = 60
        macro_id = str(params.get("preset", "GUITAR_AMP_HUM_HISS_KILLER"))
        presence_db = float(params.get("presenceBoostDb", 3.5))
        notch_bands = [
            HarmonicHumNotchBand(
                harmonic_index=h,
                frequency_hz=(f0 or 60) * h,
                attenuation_db=round(-28.0 / (h**0.35), 1) if f0 > 0 else 0.0,
            )
            for h in range(1, 9)
        ]
        extra_steps.append(
            f"HUM_NOTCH_8X[f0={f0}Hz|harmonics={','.join(str(b.frequency_hz) for b in notch_bands)}Hz|presence=+3.5kHz@{presence_db:.1f}dB]"
        )
        return (
            CleanupSuiteTelemetry(
                macro_profile_id=macro_id,
                hum_fundamental_hz=f0,
                harmonic_notch_bank=notch_bands,
                presence_exciter_freq_hz=3500.0,
                presence_boost_db=presence_db,
            ),
            extra_steps,
        )

    return None, extra_steps


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


@router.post("/api/v1/tools/vocal-remover", response_model=ToolProcessResponse)
def process_vocal_remover(payload: VocalRemoverRequest) -> ToolProcessResponse:
    """Dedicated Tool 01.1 Vocal Remover endpoint (Mid/Side + LR4 Crossover + HPSS/NN-Filter)."""
    _validate_envelope("vocal-remover", payload.peak_db, payload.rms_db)

    low_cut_hz = float(payload.parameters.get("lowCutHz", payload.low_cut_hz))
    high_cut_hz = float(payload.parameters.get("highCutHz", payload.high_cut_hz))
    vocal_level_pct = float(
        payload.parameters.get("vocalLevelPct", payload.vocal_level_pct)
    )
    inst_level_pct = float(
        payload.parameters.get("instrumentalLevelPct", payload.instrumental_level_pct)
    )

    logger.info(
        "Tool 01.1 Vocal Remover: sr=%d dur=%.2fs lowCut=%.0fHz highCut=%.0fHz voxPct=%.0f%% instPct=%.0f%%",
        payload.sample_rate,
        payload.duration_seconds,
        low_cut_hz,
        high_cut_hz,
        vocal_level_pct,
        inst_level_pct,
    )

    estimated_lufs = round(payload.rms_db - 0.691, 2)
    headroom_db = round(0.0 - payload.peak_db, 2)
    recommended_gain_delta_db = round(TARGET_LUFS - estimated_lufs, 2)

    raw_outputs = TOOL_OUTPUT_MAP["vocal-remover"]
    outputs = [
        ToolOutputTrack(
            id=item_id,
            label=label,
            color=color,
            estimated_peak_db=round(payload.peak_db - idx * 0.75, 2),
        )
        for idx, (item_id, label, color) in enumerate(raw_outputs)
    ]

    bpm_val = float(payload.parameters.get("detectedBpm", 128.0))
    dsp_chain_summary = [
        f"INPUT[{payload.sample_rate}Hz/{payload.channels}ch/{payload.duration_seconds:.2f}s]",
        f"LR4_CROSSOVER[LOW_GUARD={low_cut_hz:.0f}Hz,HIGH_GUARD={high_cut_hz:.0f}Hz]",
        "SPECTRAL_MASK[MID_SIDE_AZIMUTH+HPSS_NN_FILTER]",
        f"REHEARSAL_FADER[VOCALS={vocal_level_pct:.0f}%,INSTRUMENTAL={inst_level_pct:.0f}%]",
        f"LOUDNESS[{estimated_lufs} LUFS / delta={recommended_gain_delta_db:+.2f} dB]",
    ]

    ts = current_est_string()
    return ToolProcessResponse(
        tool_id="vocal-remover",
        tool_code="01.1",
        status="PROCESSED",
        estimated_lufs=estimated_lufs,
        headroom_db=headroom_db,
        recommended_gain_delta_db=recommended_gain_delta_db,
        detected_bpm=bpm_val,
        delay_subdivisions_ms=_compute_delay_subdivisions(bpm_val),
        outputs=outputs,
        dsp_chain_summary=dsp_chain_summary,
        execution_engine=SERVICE_NAME,
        timestamp_est=ts,
    )


@router.post("/api/v1/tools/stem-splitter", response_model=ToolProcessResponse)
def process_stem_splitter(payload: StemSplitterRequest) -> ToolProcessResponse:
    """Dedicated Tool 01.2 Stem Splitter endpoint (3-Piece Rock Core 4-Stem + Full 6-Stem Mode)."""
    _validate_envelope("stem-splitter", payload.peak_db, payload.rms_db)

    raw_mode = str(payload.parameters.get("splitMode", payload.split_mode))
    is_six_stem = "6" in raw_mode or raw_mode == "full-6"
    mode_tag = "FULL_6_STEM" if is_six_stem else "ROCK_CORE_4_STEM"

    logger.info(
        "Tool 01.2 Stem Splitter: sr=%d dur=%.2fs mode=%s",
        payload.sample_rate,
        payload.duration_seconds,
        mode_tag,
    )

    estimated_lufs = round(payload.rms_db - 0.691, 2)
    headroom_db = round(0.0 - payload.peak_db, 2)
    recommended_gain_delta_db = round(TARGET_LUFS - estimated_lufs, 2)

    all_stems = TOOL_OUTPUT_MAP["stem-splitter"]
    selected_stems = all_stems if is_six_stem else all_stems[:4]
    outputs = [
        ToolOutputTrack(
            id=item_id,
            label=label,
            color=color,
            estimated_peak_db=round(payload.peak_db - idx * 0.65, 2),
        )
        for idx, (item_id, label, color) in enumerate(selected_stems)
    ]

    bpm_val = float(payload.parameters.get("detectedBpm", 128.0))
    dsp_chain_summary = [
        f"INPUT[{payload.sample_rate}Hz/{payload.channels}ch/{payload.duration_seconds:.2f}s]",
        f"STEM_TOPOLOGY[{mode_tag}:{len(outputs)}_STEMS]",
        "LR4_MULTIBAND[BASS<200Hz,MID=200Hz..5.5kHz,AIR>5.5kHz]",
        "TRANSIENT_HPSS[DRUMS_FAST_ENV+VOCALS_CENTER+GUITAR_SIDE]",
        f"LOUDNESS[{estimated_lufs} LUFS / delta={recommended_gain_delta_db:+.2f} dB]",
    ]

    ts = current_est_string()
    return ToolProcessResponse(
        tool_id="stem-splitter",
        tool_code="01.2",
        status="PROCESSED",
        estimated_lufs=estimated_lufs,
        headroom_db=headroom_db,
        recommended_gain_delta_db=recommended_gain_delta_db,
        detected_bpm=bpm_val,
        delay_subdivisions_ms=_compute_delay_subdivisions(bpm_val),
        outputs=outputs,
        dsp_chain_summary=dsp_chain_summary,
        execution_engine=SERVICE_NAME,
        timestamp_est=ts,
    )


def _execute_tool_pipeline(
    tool_slug: str, payload: ToolProcessRequest
) -> ToolProcessResponse:
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
    _validate_envelope(tool_slug, payload.peak_db, payload.rms_db)

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
    delay_subdivisions = _compute_delay_subdivisions(bpm_val)
    quarter_ms = delay_subdivisions.quarter_ms

    cleanup_telemetry, extra_steps = build_cleanup_telemetry(
        payload.tool_id, payload.parameters
    )

    dsp_chain_summary = [
        f"INPUT[{payload.sample_rate}Hz/{payload.channels}ch/{payload.duration_seconds:.2f}s]",
        f"KERNEL[{payload.tool_code}:{payload.tool_id}]",
        *extra_steps,
    ]

    if payload.tool_id == "voice-changer":
        pitch_st = float(payload.parameters.get("pitchSemitones", 0))
        fine_ct = float(payload.parameters.get("fineCents", 0))
        formant_st = float(payload.parameters.get("formantShift", 0))
        adt_ms = float(payload.parameters.get("adtDelayMs", 22))
        adt_detune = float(payload.parameters.get("adtDetuneCents", 15))
        harmony_mode = str(payload.parameters.get("harmonyMode", "off"))
        tube_drive = float(payload.parameters.get("tubeDriveDb", 2.5))
        vocal_char = str(
            payload.parameters.get("vocalCharacter", "Abbey Road ADT Vocal Doubler")
        )
        dsp_chain_summary.extend(
            [
                f"PRESET[{vocal_char}]",
                f"WSOLA_PITCH[{pitch_st:+.1f}st / {fine_ct:+.0f}ct]",
                f"FORMANT_ENVELOPE[{formant_st:+.1f}st]",
                f"ABBEY_ROAD_ADT[{adt_ms:.0f}ms / ±{adt_detune:.0f}ct]",
                f"HARMONY_STACK[{harmony_mode}]",
                f"TUBE_PREAMP[+{tube_drive:.1f}dB]",
            ]
        )
    elif payload.tool_id == "bpm-finder":
        lpf_hz = float(payload.parameters.get("lowPassBeatHz", 240))
        key_str = str(payload.parameters.get("detectedKey", "E Minor"))
        camelot = str(payload.parameters.get("camelotCode", "9A"))
        dsp_chain_summary.extend(
            [
                f"LPF_BEAT_TRACKER[{lpf_hz:.0f}Hz -> {bpm_val} BPM]",
                f"CHROMA_KRUMHANSL_SCHMUCKLER[{key_str} / {camelot}]",
                f"PEDAL_DELAY_MS[1/4={quarter_ms}ms | 1/8.={round(quarter_ms * 0.75, 1)}ms | 1/8={round(quarter_ms * 0.5, 1)}ms | 1/8T={round((quarter_ms * 2.0) / 3.0, 1)}ms | 1/16={round(quarter_ms * 0.25, 1)}ms]",
            ]
        )
    elif payload.tool_id in ("audio-converter", "converter", "convert"):
        src_fmt = str(payload.parameters.get("sourceFormat", "wav")).upper()
        dst_fmt = str(payload.parameters.get("targetFormat", "wav")).upper()
        bit_depth = int(payload.parameters.get("bitDepth", 24))
        bitrate_kbps = int(payload.parameters.get("bitrateKbps", 320))
        ch_mode = str(payload.parameters.get("channelMode", "stereo"))
        dsp_chain_summary.append(
            f"TRANSCODE[{src_fmt}->{dst_fmt}@{bit_depth}b/{bitrate_kbps}k/{ch_mode}]"
        )

    dsp_chain_summary.extend(
        [
            f"OUTPUT_TRACKS[{len(outputs)}]",
            f"LOUDNESS[{estimated_lufs} LUFS / delta={recommended_gain_delta_db:+.2f} dB]",
        ]
    )

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
        cleanup_telemetry=cleanup_telemetry,
        outputs=outputs,
        dsp_chain_summary=dsp_chain_summary,
        execution_engine=SERVICE_NAME,
        timestamp_est=ts,
    )


@router.post("/api/v1/tools/reverb-remover", response_model=ToolProcessResponse)
def process_reverb_remover(payload: ToolProcessRequest) -> ToolProcessResponse:
    return _execute_tool_pipeline("reverb-remover", payload)


@router.post("/api/v1/tools/echo-remover", response_model=ToolProcessResponse)
def process_echo_remover(payload: ToolProcessRequest) -> ToolProcessResponse:
    return _execute_tool_pipeline("echo-remover", payload)


@router.post("/api/v1/tools/audio-enhancer", response_model=ToolProcessResponse)
def process_audio_enhancer(payload: ToolProcessRequest) -> ToolProcessResponse:
    return _execute_tool_pipeline("audio-enhancer", payload)


@router.post("/api/v1/tools/{tool_slug}", response_model=ToolProcessResponse)
def process_tool(tool_slug: str, payload: ToolProcessRequest) -> ToolProcessResponse:
    return _execute_tool_pipeline(tool_slug, payload)
