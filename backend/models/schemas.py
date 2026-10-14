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
    ]
    tool_code: str = Field(..., min_length=2, max_length=16)
    sample_rate: int = Field(default=44100, ge=8000, le=192000)
    channels: int = Field(default=2, ge=1, le=8)
    duration_seconds: float = Field(..., gt=0.0, le=10800.0)
    peak_db: float = Field(default=-1.0, ge=-120.0, le=12.0)
    rms_db: float = Field(default=-14.0, ge=-120.0, le=12.0)
    parameters: dict[str, float | int | str | bool] = Field(default_factory=dict)


class ToolOutputTrack(BaseModel):
    id: str
    label: str
    color: str
    estimated_peak_db: float


class DelaySubdivisionsMs(BaseModel):
    quarter_ms: float
    dotted_eighth_ms: float
    eighth_ms: float
    slapback_sixteenth_ms: float


class ToolProcessResponse(BaseModel):
    tool_id: str
    tool_code: str
    status: Literal["PROCESSED"]
    estimated_lufs: float
    headroom_db: float
    recommended_gain_delta_db: float
    detected_bpm: float | None = None
    delay_subdivisions_ms: DelaySubdivisionsMs | None = None
    outputs: list[ToolOutputTrack]
    dsp_chain_summary: list[str]
    execution_engine: str
    timestamp_est: str
