"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TOOLS, ToolDefinition, ToolId } from "@/app/lib/tool-catalog";
import {
  DEFAULT_VOCAL_REMOVER_PARAMS,
  ExportAudioFormat,
  VocalRemoverParams,
  VocalRemoverResult,
  encodeStemBufferToBlob,
  mixVocalAndInstrumentalStems,
  pctToDbString,
  runVocalRemoverDsp,
} from "@/app/lib/dsp/stems-dsp";

export interface VocalRemoverRackProps {
  tool: ToolDefinition;
  activeBuffer: AudioBuffer | null;
  bufferLabel: string;
  highContrastDark: boolean;
  onCommitBuffer: (next: AudioBuffer, label: string) => void;
  onSendToTool: (targetToolId: ToolId, buffer: AudioBuffer, stemLabel: string) => void;
  onStatusChange: (msg: string) => void;
}

type AuditionBusMode = "REBALANCED_MIX" | "VOCALS_SOLO" | "INSTRUMENTAL_SOLO" | "DRY_ORIGINAL";

function drawStemWaveform(
  canvas: HTMLCanvasElement | null,
  buffer: AudioBuffer | null,
  progressRatio: number,
  color: string,
  muted: boolean,
  highContrastDark: boolean
) {
  if (!canvas || !buffer) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = highContrastDark ? "#0A0A0A" : "#ECEAE2";
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = highContrastDark ? "#222222" : "#CFCBC0";
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += Math.floor(w / 12)) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();

  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;
  const numBars = 128;
  const samplesPerBar = Math.max(1, Math.floor(ch0.length / numBars));
  const barW = Math.max(2, Math.floor(w / numBars) - 2);
  const playX = Math.floor(progressRatio * w);

  for (let b = 0; b < numBars; b++) {
    let peak = 0;
    const start = b * samplesPerBar;
    const step = Math.max(1, Math.floor(samplesPerBar / 24));
    for (let j = 0; j < samplesPerBar && start + j < ch0.length; j += step) {
      const m = 0.5 * (Math.abs(ch0[start + j]) + Math.abs(ch1[start + j]));
      if (m > peak) peak = m;
    }
    const x = b * (w / numBars);
    const barH = Math.min(h / 2 - 4, Math.max(2, peak * (h / 2 - 4) * 1.3));
    const isPlayed = x <= playX;

    if (muted) {
      ctx.fillStyle = "#444444";
    } else if (isPlayed) {
      ctx.fillStyle = "#B8FF01";
    } else {
      ctx.fillStyle = color;
    }

    ctx.fillRect(x, h / 2 - barH, barW, barH * 2);
  }

  ctx.strokeStyle = "#FF3B00";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(playX, 0);
  ctx.lineTo(playX, h);
  ctx.stroke();
}

export default function VocalRemoverRack({
  tool,
  activeBuffer,
  bufferLabel,
  highContrastDark,
  onCommitBuffer,
  onSendToTool,
  onStatusChange,
}: VocalRemoverRackProps) {
  const [params, setParams] = useState<VocalRemoverParams>(DEFAULT_VOCAL_REMOVER_PARAMS);
  const dspResult: VocalRemoverResult | null = useMemo(() => {
    if (!activeBuffer) return null;
    return runVocalRemoverDsp(activeBuffer, params);
  }, [activeBuffer, params]);
  const [auditionMode, setAuditionMode] = useState<AuditionBusMode>("REBALANCED_MIX");
  const [vocalMuted, setVocalMuted] = useState<boolean>(false);
  const [instMuted, setInstMuted] = useState<boolean>(false);
  const [vocalExportFmt, setVocalExportFmt] = useState<ExportAudioFormat>("wav");
  const [instExportFmt, setInstExportFmt] = useState<ExportAudioFormat>("wav");
  const [mixExportFmt, setMixExportFmt] = useState<ExportAudioFormat>("wav");
  const [sendTargetTool, setSendTargetTool] = useState<ToolId>("voice-changer");

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playOffsetSec, setPlayOffsetSec] = useState<number>(0);
  const [progressRatio, setProgressRatio] = useState<number>(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startWallTimeRef = useRef<number>(0);
  const startOffsetRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  const vocalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const instCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const ensureAudioContext = useCallback((): AudioContext => {
    if (!audioCtxRef.current) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }
    return audioCtxRef.current;
  }, []);

  const stopTransport = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (activeSourceRef.current) {
      try {
        activeSourceRef.current.onended = null;
        activeSourceRef.current.stop();
        activeSourceRef.current.disconnect();
      } catch {
        // already stopped
      }
      activeSourceRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (activeSourceRef.current) {
        try {
          activeSourceRef.current.onended = null;
          activeSourceRef.current.stop();
          activeSourceRef.current.disconnect();
        } catch {
          // already stopped
        }
        activeSourceRef.current = null;
      }
    };
  }, [activeBuffer]);

  const liveRebalancedBuffer = useMemo(() => {
    if (!dspResult) return null;
    const effectiveVocalPct = vocalMuted ? 0 : params.vocalLevelPct;
    const effectiveInstPct = instMuted ? 0 : params.instrumentalLevelPct;
    return mixVocalAndInstrumentalStems(
      dspResult.vocalsBuffer,
      dspResult.instrumentalBuffer,
      effectiveVocalPct,
      effectiveInstPct,
      params.phaseInvertVocal
    );
  }, [
    dspResult,
    params.vocalLevelPct,
    params.instrumentalLevelPct,
    params.phaseInvertVocal,
    vocalMuted,
    instMuted,
  ]);

  const activePlaybackBuffer = useMemo(() => {
    if (!dspResult || !activeBuffer) return null;
    if (auditionMode === "VOCALS_SOLO") return dspResult.vocalsBuffer;
    if (auditionMode === "INSTRUMENTAL_SOLO") return dspResult.instrumentalBuffer;
    if (auditionMode === "DRY_ORIGINAL") return activeBuffer;
    return liveRebalancedBuffer ?? dspResult.rebalancedMixBuffer;
  }, [auditionMode, dspResult, activeBuffer, liveRebalancedBuffer]);

  useEffect(() => {
    if (!dspResult) return;
    drawStemWaveform(
      vocalCanvasRef.current,
      dspResult.vocalsBuffer,
      progressRatio,
      "#FF3B00",
      vocalMuted || auditionMode === "INSTRUMENTAL_SOLO",
      highContrastDark
    );
    drawStemWaveform(
      instCanvasRef.current,
      dspResult.instrumentalBuffer,
      progressRatio,
      "#00E5FF",
      instMuted || auditionMode === "VOCALS_SOLO",
      highContrastDark
    );
  }, [
    dspResult,
    progressRatio,
    vocalMuted,
    instMuted,
    auditionMode,
    highContrastDark,
  ]);

  const startPlaybackAt = useCallback(
    async (offsetSec: number, bufferOverride?: AudioBuffer | null) => {
      const targetBuf = bufferOverride ?? activePlaybackBuffer;
      if (!targetBuf) return;

      stopTransport();
      const ctx = ensureAudioContext();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      const clampedOffset = Math.max(0, Math.min(targetBuf.duration - 0.05, offsetSec));
      const src = ctx.createBufferSource();
      src.buffer = targetBuf;
      src.connect(ctx.destination);

      startWallTimeRef.current = ctx.currentTime;
      startOffsetRef.current = clampedOffset;
      activeSourceRef.current = src;
      setIsPlaying(true);

      const tick = () => {
        if (!audioCtxRef.current || !activeSourceRef.current) return;
        const elapsed =
          startOffsetRef.current + (audioCtxRef.current.currentTime - startWallTimeRef.current);
        if (elapsed >= targetBuf.duration) {
          setPlayOffsetSec(0);
          setProgressRatio(0);
          setIsPlaying(false);
          return;
        }
        setPlayOffsetSec(elapsed);
        setProgressRatio(elapsed / targetBuf.duration);
        rafRef.current = requestAnimationFrame(tick);
      };

      src.onended = () => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        setIsPlaying(false);
      };

      src.start(0, clampedOffset);
      rafRef.current = requestAnimationFrame(tick);
    },
    [activePlaybackBuffer, ensureAudioContext, stopTransport]
  );

  useEffect(() => {
    return () => {
      stopTransport();
    };
  }, [stopTransport]);

  const handleScrubCanvas = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!activePlaybackBuffer) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetSec = ratio * activePlaybackBuffer.duration;
    setPlayOffsetSec(targetSec);
    setProgressRatio(ratio);
    if (isPlaying) {
      void startPlaybackAt(targetSec);
    }
  };

  const handleApplyRehearsalPreset = (
    label: string,
    vocalPct: number,
    instPct: number,
    mode: AuditionBusMode = "REBALANCED_MIX"
  ) => {
    setVocalMuted(false);
    setInstMuted(false);
    setAuditionMode(mode);
    setParams((prev) => ({
      ...prev,
      vocalLevelPct: vocalPct,
      instrumentalLevelPct: instPct,
    }));
    onStatusChange(`VOCAL REMOVER PRESET // ${label} (VOX ${vocalPct}% / INST ${instPct}%)`);
  };

  const handleDownloadStem = (
    buffer: AudioBuffer | null,
    stemSlug: string,
    format: ExportAudioFormat
  ) => {
    if (!buffer) return;
    const blob = encodeStemBufferToBlob(buffer, format);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `weaksauce-01.1-vocal-remover-${stemSlug}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onStatusChange(
      `EXPORTED STEM // weaksauce-01.1-vocal-remover-${stemSlug}.${format.toUpperCase()}`
    );
  };

  const otherTools = useMemo(
    () => TOOLS.filter((t) => t.id !== tool.id),
    [tool.id]
  );

  return (
    <div className="border-2 border-current p-4 space-y-4 shadow-[4px_4px_0px_#FF3B00]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-current pb-3">
        <div>
          <div className="text-xs font-black uppercase text-[#FF3B00]">
            [01.1] VOCAL REMOVER & GUIDE VOCAL REHEARSAL RACK // VOICE.AI/TOOLS/VOCAL-REMOVER PARITY
          </div>
          <h2 className="text-base sm:text-lg font-black uppercase">
            MID/SIDE + LR4 SPECTRAL CENTER ISOLATOR (VOCALS + INSTRUMENTAL)
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="px-2 py-1 bg-[#B8FF01] text-[#0D0D0D] font-black uppercase">
            ZERO QUEUE WAIT (0.0s)
          </span>
          {dspResult && (
            <span className="px-2 py-1 border border-current font-bold">
              VOCAL SUPPRESSION: {dspResult.metrics.spectralSuppressionDb} dB
            </span>
          )}
        </div>
      </div>

      <div className="p-3 border-2 border-current bg-black/25 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-black uppercase text-[#B8FF01]">
            JEFF&apos;S LEAD SINGER REHEARSAL PRESETS (1-CLICK FADER SCENES)
          </span>
          <span className="text-[11px] opacity-75">
            SOURCE: {bufferLabel}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() =>
              handleApplyRehearsalPreset(
                "-12dB GUIDE VOCAL REHEARSAL",
                25,
                100,
                "REBALANCED_MIX"
              )
            }
            className={`p-2 border-2 text-left text-xs cursor-pointer ${
              params.vocalLevelPct === 25 &&
              params.instrumentalLevelPct === 100 &&
              auditionMode === "REBALANCED_MIX"
                ? "bg-[#B8FF01] text-[#0D0D0D] border-[#0D0D0D] font-black"
                : "border-current hover:bg-[#B8FF01]/20"
            }`}
          >
            <div className="font-black uppercase">★ -12dB GUIDE VOCAL</div>
            <div className="text-[10px] opacity-80">
              Vocals 25% (-12dB) + Band 100% for singing lead with pitch reference
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              handleApplyRehearsalPreset(
                "100% INSTRUMENTAL BACKING (KARAOKE)",
                0,
                100,
                "INSTRUMENTAL_SOLO"
              )
            }
            className={`p-2 border-2 text-left text-xs cursor-pointer ${
              auditionMode === "INSTRUMENTAL_SOLO" || params.vocalLevelPct === 0
                ? "bg-[#00E5FF] text-[#0D0D0D] border-[#0D0D0D] font-black"
                : "border-current hover:bg-[#00E5FF]/20"
            }`}
          >
            <div className="font-black uppercase">INSTRUMENTAL ONLY (0% VOX)</div>
            <div className="text-[10px] opacity-80">
              Strips lead vocal completely for minus-one band vocal tracking
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              handleApplyRehearsalPreset(
                "ISOLATED ACAPELLA STUDY",
                125,
                0,
                "VOCALS_SOLO"
              )
            }
            className={`p-2 border-2 text-left text-xs cursor-pointer ${
              auditionMode === "VOCALS_SOLO" || params.instrumentalLevelPct === 0
                ? "bg-[#FF3B00] text-[#0D0D0D] border-[#0D0D0D] font-black"
                : "border-current hover:bg-[#FF3B00]/20"
            }`}
          >
            <div className="font-black uppercase">ACAPELLA SOLO (STUDY VOX)</div>
            <div className="text-[10px] opacity-80">
              Solos isolated lead vocal to inspect melody, phrasing &amp; harmonies
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              handleApplyRehearsalPreset(
                "VOCAL UP FRONT (+3.5dB BOOST)",
                150,
                85,
                "REBALANCED_MIX"
              )
            }
            className={`p-2 border-2 text-left text-xs cursor-pointer ${
              params.vocalLevelPct === 150
                ? "bg-[#B8FF01] text-[#0D0D0D] border-[#0D0D0D] font-black"
                : "border-current hover:bg-[#B8FF01]/20"
            }`}
          >
            <div className="font-black uppercase">LYRIC TRANSCRIBER (150% VOX)</div>
            <div className="text-[10px] opacity-80">
              Boosts buried rehearsal vocals to 150% while dipping band backing
            </div>
          </button>
        </div>
      </div>

      <div className="space-y-3 border-2 border-current p-3 bg-[#0D0D0D] text-[#F4F3EF]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#333333] pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (isPlaying) {
                  stopTransport();
                } else {
                  void startPlaybackAt(playOffsetSec);
                }
              }}
              className={`px-4 py-1.5 border-2 font-black text-xs uppercase cursor-pointer ${
                isPlaying
                  ? "bg-[#FF3B00] text-[#0D0D0D] border-[#F4F3EF]"
                  : "bg-[#B8FF01] text-[#0D0D0D] border-[#0D0D0D]"
              }`}
            >
              {isPlaying ? "■ PAUSE DUAL STEM TRANSPORT" : "▶ PLAY SYNCHRONIZED STEMS"}
            </button>

            <button
              type="button"
              onClick={() => {
                stopTransport();
                setPlayOffsetSec(0);
                setProgressRatio(0);
              }}
              className="px-2.5 py-1.5 border border-[#F4F3EF] text-xs font-bold uppercase cursor-pointer hover:bg-[#F4F3EF] hover:text-[#0D0D0D]"
            >
              ⏮ ZERO
            </button>

            <span className="text-xs font-bold text-[#B8FF01] px-2">
              {playOffsetSec.toFixed(2)}s / {(activePlaybackBuffer?.duration ?? 0).toFixed(2)}s
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {(
              [
                { id: "REBALANCED_MIX", label: "REHEARSAL MIX" },
                { id: "VOCALS_SOLO", label: "SOLO VOCALS" },
                { id: "INSTRUMENTAL_SOLO", label: "SOLO INSTRUMENTAL" },
                { id: "DRY_ORIGINAL", label: "BYPASS (DRY)" },
              ] as Array<{ id: AuditionBusMode; label: string }>
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setAuditionMode(m.id);
                  if (isPlaying) {
                    const nextBuf =
                      m.id === "VOCALS_SOLO"
                        ? dspResult?.vocalsBuffer
                        : m.id === "INSTRUMENTAL_SOLO"
                        ? dspResult?.instrumentalBuffer
                        : m.id === "DRY_ORIGINAL"
                        ? activeBuffer
                        : liveRebalancedBuffer;
                    void startPlaybackAt(playOffsetSec, nextBuf);
                  }
                }}
                className={`px-2.5 py-1 border font-black uppercase cursor-pointer ${
                  auditionMode === m.id
                    ? "bg-[#00E5FF] text-[#0D0D0D] border-[#00E5FF]"
                    : "border-[#555555] text-[#F4F3EF] hover:border-[#B8FF01]"
                }`}
              >
                {m.label}
              </button>
            ))}

            <button
              type="button"
              onClick={() =>
                setParams((p) => ({ ...p, phaseInvertVocal: !p.phaseInvertVocal }))
              }
              className={`px-2.5 py-1 border font-black uppercase cursor-pointer ${
                params.phaseInvertVocal
                  ? "bg-[#FF3B00] text-[#0D0D0D] border-[#F4F3EF]"
                  : "border-[#FF3B00] text-[#FF3B00]"
              }`}
              title="Invert vocal phase (180°) to audition phase-cancellation against the instrumental bus"
            >
              Ø PHASE INVERT {params.phaseInvertVocal ? "ON (180°)" : "OFF"}
            </button>
          </div>
        </div>

        <div className="border border-[#333333] p-2.5 bg-[#141414] space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-[#FF3B00] inline-block border border-black" />
              <span className="font-black uppercase text-[#FF3B00]">
                STEM 01 // VOCALS (ISOLATED LEAD &amp; BACKING HARMONIES)
              </span>
              {dspResult && (
                <span className="text-[11px] opacity-75">
                  PEAK: {dspResult.metrics.vocals.peakDb} dBFS | LUFS:{" "}
                  {dspResult.metrics.vocals.lufs}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setAuditionMode((m) =>
                    m === "VOCALS_SOLO" ? "REBALANCED_MIX" : "VOCALS_SOLO"
                  );
                }}
                className={`px-2 py-0.5 border text-[10px] font-black uppercase cursor-pointer ${
                  auditionMode === "VOCALS_SOLO"
                    ? "bg-[#B8FF01] text-[#0D0D0D] border-[#B8FF01]"
                    : "border-[#666666] text-[#F4F3EF]"
                }`}
              >
                SOLO
              </button>
              <button
                type="button"
                onClick={() => setVocalMuted((m) => !m)}
                className={`px-2 py-0.5 border text-[10px] font-black uppercase cursor-pointer ${
                  vocalMuted
                    ? "bg-[#FF3B00] text-[#0D0D0D] border-[#FF3B00]"
                    : "border-[#666666] text-[#F4F3EF]"
                }`}
              >
                {vocalMuted ? "MUTED" : "MUTE"}
              </button>

              <select
                aria-label="Vocal stem download format"
                value={vocalExportFmt}
                onChange={(e) => setVocalExportFmt(e.target.value as ExportAudioFormat)}
                className="bg-[#0D0D0D] border border-[#666666] text-[10px] px-1.5 py-0.5 font-bold uppercase"
              >
                <option value="wav">WAV (16-BIT)</option>
                <option value="flac">FLAC (24-BIT)</option>
                <option value="mp3">MP3 (320K)</option>
              </select>

              <button
                type="button"
                onClick={() =>
                  handleDownloadStem(
                    dspResult?.vocalsBuffer ?? null,
                    "vocals",
                    vocalExportFmt
                  )
                }
                className="px-2.5 py-0.5 bg-[#FF3B00] text-[#0D0D0D] text-[10px] font-black uppercase cursor-pointer hover:bg-[#B8FF01]"
              >
                ↓ DL VOCALS ({vocalExportFmt.toUpperCase()})
              </button>

              <button
                type="button"
                onClick={() => {
                  if (dspResult) {
                    onSendToTool(
                      sendTargetTool,
                      dspResult.vocalsBuffer,
                      "01.1 ISOLATED VOCALS"
                    );
                  }
                }}
                className="px-2 py-0.5 border border-[#B8FF01] text-[#B8FF01] text-[10px] font-black uppercase cursor-pointer hover:bg-[#B8FF01] hover:text-[#0D0D0D]"
              >
                SEND VOCALS →
              </button>
            </div>
          </div>

          <canvas
            ref={vocalCanvasRef}
            width={980}
            height={68}
            onClick={handleScrubCanvas}
            className="w-full h-[64px] block cursor-ew-resize border border-[#292929]"
            title="Click anywhere on waveform to scrub synchronized Vocals + Instrumental playback"
          />
        </div>

        <div className="border border-[#333333] p-2.5 bg-[#141414] space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-[#00E5FF] inline-block border border-black" />
              <span className="font-black uppercase text-[#00E5FF]">
                STEM 02 // INSTRUMENTAL (3-PIECE ROCK BACKING: GUITAR + BASS + DRUMS)
              </span>
              {dspResult && (
                <span className="text-[11px] opacity-75">
                  PEAK: {dspResult.metrics.instrumental.peakDb} dBFS | LUFS:{" "}
                  {dspResult.metrics.instrumental.lufs}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setAuditionMode((m) =>
                    m === "INSTRUMENTAL_SOLO" ? "REBALANCED_MIX" : "INSTRUMENTAL_SOLO"
                  );
                }}
                className={`px-2 py-0.5 border text-[10px] font-black uppercase cursor-pointer ${
                  auditionMode === "INSTRUMENTAL_SOLO"
                    ? "bg-[#B8FF01] text-[#0D0D0D] border-[#B8FF01]"
                    : "border-[#666666] text-[#F4F3EF]"
                }`}
              >
                SOLO
              </button>
              <button
                type="button"
                onClick={() => setInstMuted((m) => !m)}
                className={`px-2 py-0.5 border text-[10px] font-black uppercase cursor-pointer ${
                  instMuted
                    ? "bg-[#FF3B00] text-[#0D0D0D] border-[#FF3B00]"
                    : "border-[#666666] text-[#F4F3EF]"
                }`}
              >
                {instMuted ? "MUTED" : "MUTE"}
              </button>

              <select
                aria-label="Instrumental stem download format"
                value={instExportFmt}
                onChange={(e) => setInstExportFmt(e.target.value as ExportAudioFormat)}
                className="bg-[#0D0D0D] border border-[#666666] text-[10px] px-1.5 py-0.5 font-bold uppercase"
              >
                <option value="wav">WAV (16-BIT)</option>
                <option value="flac">FLAC (24-BIT)</option>
                <option value="mp3">MP3 (320K)</option>
              </select>

              <button
                type="button"
                onClick={() =>
                  handleDownloadStem(
                    dspResult?.instrumentalBuffer ?? null,
                    "instrumental",
                    instExportFmt
                  )
                }
                className="px-2.5 py-0.5 bg-[#00E5FF] text-[#0D0D0D] text-[10px] font-black uppercase cursor-pointer hover:bg-[#B8FF01]"
              >
                ↓ DL INSTRUMENTAL ({instExportFmt.toUpperCase()})
              </button>

              <button
                type="button"
                onClick={() => {
                  if (dspResult) {
                    onSendToTool(
                      sendTargetTool,
                      dspResult.instrumentalBuffer,
                      "01.1 INSTRUMENTAL BACKING"
                    );
                  }
                }}
                className="px-2 py-0.5 border border-[#B8FF01] text-[#B8FF01] text-[10px] font-black uppercase cursor-pointer hover:bg-[#B8FF01] hover:text-[#0D0D0D]"
              >
                SEND INST →
              </button>
            </div>
          </div>

          <canvas
            ref={instCanvasRef}
            width={980}
            height={68}
            onClick={handleScrubCanvas}
            className="w-full h-[64px] block cursor-ew-resize border border-[#292929]"
            title="Click anywhere on waveform to scrub synchronized Vocals + Instrumental playback"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border-2 border-current p-3 space-y-3 bg-black/15">
          <div className="flex items-center justify-between border-b border-current/30 pb-1.5">
            <span className="text-xs font-black uppercase text-[#B8FF01]">
              GUIDE VOCAL REHEARSAL FADERS (0% – 150%)
            </span>
            <button
              type="button"
              onClick={() =>
                handleApplyRehearsalPreset(
                  "-12dB GUIDE VOCAL PRESET",
                  25,
                  100,
                  "REBALANCED_MIX"
                )
              }
              className="px-2 py-0.5 bg-[#FF3B00] text-[#0D0D0D] text-[10px] font-black uppercase cursor-pointer hover:bg-[#B8FF01]"
            >
              LOAD -12dB GUIDE VOCAL PRESET
            </button>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs font-black">
              <span className="text-[#FF3B00]">VOCALS FADER (LEAD / GUIDE VOX)</span>
              <span className="px-2 py-0.5 bg-[#FF3B00] text-[#0D0D0D]">
                {params.vocalLevelPct}% ({pctToDbString(params.vocalLevelPct)})
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={150}
              step={1}
              value={params.vocalLevelPct}
              onChange={(e) => {
                setAuditionMode("REBALANCED_MIX");
                setParams((p) => ({ ...p, vocalLevelPct: Number(e.target.value) }));
              }}
              className="w-full accent-[#FF3B00] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] opacity-70">
              <span>0% (KARAOKE MUTE)</span>
              <span>25% (-12dB GUIDE VOX)</span>
              <span>100% (UNITY)</span>
              <span>150% (+3.5dB)</span>
            </div>
          </div>

          <div className="space-y-1 pt-1">
            <div className="flex items-center justify-between text-xs font-black">
              <span className="text-[#00E5FF]">INSTRUMENTAL FADER (BAND BACKING)</span>
              <span className="px-2 py-0.5 bg-[#00E5FF] text-[#0D0D0D]">
                {params.instrumentalLevelPct}% ({pctToDbString(params.instrumentalLevelPct)})
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={150}
              step={1}
              value={params.instrumentalLevelPct}
              onChange={(e) => {
                setAuditionMode("REBALANCED_MIX");
                setParams((p) => ({
                  ...p,
                  instrumentalLevelPct: Number(e.target.value),
                }));
              }}
              className="w-full accent-[#00E5FF] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] opacity-70">
              <span>0% (ACAPELLA)</span>
              <span>50% (-6dB)</span>
              <span>100% (UNITY)</span>
              <span>150% (+3.5dB)</span>
            </div>
          </div>
        </div>

        <div className="border-2 border-current p-3 space-y-3 bg-black/15">
          <div className="flex items-center justify-between border-b border-current/30 pb-1.5">
            <span className="text-xs font-black uppercase text-[#00E5FF]">
              LR4 SPECTRAL CROSSOVER GUARDS (BASS &amp; CYMBAL PROTECTION)
            </span>
            <button
              type="button"
              onClick={() => setParams(DEFAULT_VOCAL_REMOVER_PARAMS)}
              className="px-2 py-0.5 border border-current text-[10px] font-bold uppercase cursor-pointer hover:bg-[#B8FF01] hover:text-[#0D0D0D]"
            >
              RESET DSP
            </button>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs font-black">
              <span>LOW CUT BASS &amp; KICK PROTECTION</span>
              <span className="px-2 py-0.5 bg-[#B8FF01] text-[#0D0D0D]">
                {params.lowCutHz} Hz
              </span>
            </div>
            <input
              type="range"
              min={80}
              max={300}
              step={5}
              value={params.lowCutHz}
              onChange={(e) =>
                setParams((p) => ({ ...p, lowCutHz: Number(e.target.value) }))
              }
              className="w-full accent-[#B8FF01] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] opacity-70">
              <span>80 Hz (DEEP BARITONE)</span>
              <span>170 Hz (ROCK KICK/BASS GUARD)</span>
              <span>300 Hz (TENOR ONLY)</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs font-black">
              <span>HIGH CUT CYMBAL &amp; HI-HAT PROTECTION</span>
              <span className="px-2 py-0.5 bg-[#B8FF01] text-[#0D0D0D]">
                {(params.highCutHz / 1000).toFixed(1)} kHz ({params.highCutHz} Hz)
              </span>
            </div>
            <input
              type="range"
              min={6000}
              max={14000}
              step={250}
              value={params.highCutHz}
              onChange={(e) =>
                setParams((p) => ({ ...p, highCutHz: Number(e.target.value) }))
              }
              className="w-full accent-[#B8FF01] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] opacity-70">
              <span>6.0 kHz (WARM)</span>
              <span>9.0 kHz (STUDIO SIBILANCE)</span>
              <span>14.0 kHz (FULL AIR)</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs font-black">
              <span>CENTER CHANNEL VOCAL WIDTH</span>
              <span className="px-2 py-0.5 bg-[#B8FF01] text-[#0D0D0D]">
                {params.centerWidthPct}%
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={params.centerWidthPct}
              onChange={(e) =>
                setParams((p) => ({ ...p, centerWidthPct: Number(e.target.value) }))
              }
              className="w-full accent-[#B8FF01] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] opacity-70">
              <span>10% (PINPOINT DEAD-CENTER)</span>
              <span>65% (LEAD + ADT DOUBLES)</span>
              <span>100% (WIDE HARMONIES)</span>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-2 border-t-2 border-current flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (!liveRebalancedBuffer) return;
              onCommitBuffer(
                liveRebalancedBuffer,
                `01.1 VOCAL REMOVER MIX (VOX ${params.vocalLevelPct}% / INST ${params.instrumentalLevelPct}%)`
              );
            }}
            className="px-3 py-1.5 border-2 border-[#0D0D0D] bg-[#B8FF01] text-[#0D0D0D] font-black uppercase cursor-pointer shadow-[3px_3px_0px_#FF3B00]"
          >
            COMMIT REBALANCED MIX TO GLOBAL BUS
          </button>

          <select
            aria-label="Rebalanced mix export format"
            value={mixExportFmt}
            onChange={(e) => setMixExportFmt(e.target.value as ExportAudioFormat)}
            className="p-1.5 border-2 border-current bg-[#0D0D0D] text-[#F4F3EF] font-bold uppercase"
          >
            <option value="wav">WAV (16-BIT PCM)</option>
            <option value="flac">FLAC (24-BIT LOSSLESS)</option>
            <option value="mp3">MP3 (320 KBPS)</option>
          </select>

          <button
            type="button"
            onClick={() =>
              handleDownloadStem(
                liveRebalancedBuffer,
                `rehearsal-mix-vox${params.vocalLevelPct}-inst${params.instrumentalLevelPct}`,
                mixExportFmt
              )
            }
            className="px-3 py-1.5 border-2 border-current font-black uppercase cursor-pointer hover:bg-[#00E5FF] hover:text-[#0D0D0D]"
          >
            ↓ EXPORT REHEARSAL MIX (.{mixExportFmt.toUpperCase()})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-black uppercase text-[#00E5FF]">SEND TO TOOL:</span>
          <select
            aria-label="Target tool for piping stem"
            value={sendTargetTool}
            onChange={(e) => setSendTargetTool(e.target.value as ToolId)}
            className="p-1.5 border-2 border-current bg-[#0D0D0D] text-[#F4F3EF] font-bold uppercase"
          >
            {otherTools.map((t) => (
              <option key={t.id} value={t.id}>
                [{t.code}] {t.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              const targetBuf = activePlaybackBuffer ?? liveRebalancedBuffer;
              if (targetBuf) {
                onSendToTool(
                  sendTargetTool,
                  targetBuf,
                  `01.1 ${auditionMode}`
                );
              }
            }}
            className="px-3 py-1.5 border-2 border-[#B8FF01] bg-[#0D0D0D] text-[#B8FF01] font-black uppercase cursor-pointer hover:bg-[#B8FF01] hover:text-[#0D0D0D]"
          >
            PIPE ACTIVE STEM →
          </button>
        </div>
      </div>
    </div>
  );
}
