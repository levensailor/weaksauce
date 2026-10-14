from typing import Literal
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    service: str
    status: Literal["READY", "DEGRADED"]
    architecture: str
    persona_profile: str
    toolset_count: int = Field(default=4, ge=1)
    tool_count: int = Field(default=8, ge=1)
    timestamp_est: str


class ToolProcessRequest(BaseModel):
    tool_id: Literal[
        "vocal-remover",
        "stem-splitter",
        "reverb-remover",
        "echo-remover",
        "audio-enhancer",
        "voice-changer",
        "bpm-finder",
        "voice-recorder",
        "audio-converter",
        "converter",
        "convert",
    ]
    tool_code: str = Field(..., min_length=2, max_length=16)
    sample_rate: int = Field(default=44100, ge=8000, le=192000)
    channels: int = Field(default=2, ge=1, le=8)
    duration_seconds: float = Field(..., gt=0.0, le=10800.0)
    peak_db: float = Field(default=-1.0, ge=-120.0, le=12.0)
    rms_db: float = Field(default=-14.0, ge=-120.0, le=12.0)
    parameters: dict[str, float | int | str | bool] = Field(default_factory=dict)


class VocalRemoverRequest(ToolProcessRequest):
    tool_id: Literal["vocal-remover"] = "vocal-remover"
    tool_code: str = Field(default="01.1", min_length=2, max_length=16)
    low_cut_hz: float = Field(default=170.0, ge=80.0, le=300.0)
    high_cut_hz: float = Field(default=9000.0, ge=5000.0, le=14000.0)
    center_width_pct: float = Field(default=65.0, ge=10.0, le=100.0)
    vocal_level_pct: float = Field(default=25.0, ge=0.0, le=150.0)
    instrumental_level_pct: float = Field(default=100.0, ge=0.0, le=150.0)
    phase_invert_vocal: bool = Field(default=False)


class StemSplitterRequest(ToolProcessRequest):
    tool_id: Literal["stem-splitter"] = "stem-splitter"
    tool_code: str = Field(default="01.2", min_length=2, max_length=16)
    split_mode: Literal["rock-4", "full-6"] = Field(default="rock-4")
    minus_one_preset: str = Field(default="full-band", max_length=64)


class ToolOutputTrack(BaseModel):
    id: str
    label: str
    color: str
    estimated_peak_db: float


class DelaySubdivisionsMs(BaseModel):
    quarter_ms: float
    dotted_eighth_ms: float
    eighth_ms: float
    eighth_triplet_ms: float | None = None
    slapback_sixteenth_ms: float


class SlapbackEchoTelemetry(BaseModel):
    detected_lag_ms: float
    wall_distance_meters: float
    wall_distance_feet: float
    acoustic_classification: str
    summary_banner: str


class HarmonicHumNotchBand(BaseModel):
    harmonic_index: int
    frequency_hz: int
    attenuation_db: float


class CleanupSuiteTelemetry(BaseModel):
    dereverb_amount_pct: float | None = None
    tail_decay_gate_ms: float | None = None
    boxiness_cut_freq_hz: float | None = None
    boxiness_cut_db: float | None = None
    dry_room_reblend_pct: float | None = None
    slapback_detection: SlapbackEchoTelemetry | None = None
    macro_profile_id: str | None = None
    hum_fundamental_hz: int | None = None
    harmonic_notch_bank: list[HarmonicHumNotchBand] | None = None
    presence_exciter_freq_hz: float | None = None
    presence_boost_db: float | None = None


class ToolProcessResponse(BaseModel):
    tool_id: str
    tool_code: str
    status: Literal["PROCESSED"]
    estimated_lufs: float
    headroom_db: float
    recommended_gain_delta_db: float
    detected_bpm: float | None = None
    delay_subdivisions_ms: DelaySubdivisionsMs | None = None
    cleanup_telemetry: CleanupSuiteTelemetry | None = None
    outputs: list[ToolOutputTrack]
    dsp_chain_summary: list[str]
    execution_engine: str
    timestamp_est: str
