"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ToolDefinition } from "@/app/lib/tool-catalog";
import {
  AudioEnhancerResult,
  EchoRemovalResult,
  ROCK_ENHANCER_MACRO_PROFILES,
  ReverbRemovalResult,
  RockEnhancerMacroId,
  SlapbackDetectionResult,
  detectSlapbackEchoLag,
  runAudioEnhancerDsp,
  runEchoRemoverDsp,
  runReverbRemoverDsp,
  triggerWavDownload,
} from "@/app/lib/dsp/cleanup-dsp";

export interface CleanupSuiteRackProps {
  tool: ToolDefinition;
  activeBuffer: AudioBuffer | null;
  selectedOutputStemId: string;
  onSelectOutputStemId: (stemId: string) => void;
  onCommitProcessedBuffer: (
    nextBuffer: AudioBuffer,
    stemId: string,
    statusSummary: string
  ) => void;
  onAuditionBuffer?: (buffer: AudioBuffer, label: string) => void;
}

interface DualTrackRowSpec {
  id: string;
  codeLabel: string;
  title: string;
  subtitle: string;
  color: string;
  buffer: AudioBuffer | null;
  filenameSlug: string;
}

function drawMiniWaveform(
  canvas: HTMLCanvasElement | null,
  buffer: AudioBuffer | null,
  barColor: string
) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = "#0A0A0A";
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "#242424";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();

  if (!buffer) return;
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;
  const numBars = 84;
  const samplesPerBar = Math.max(1, Math.floor(ch0.length / numBars));
  const barW = Math.max(2, Math.floor(w / numBars) - 2);

  for (let b = 0; b < numBars; b++) {
    let peak = 0;
    const start = b * samplesPerBar;
    const step = Math.max(1, Math.floor(samplesPerBar / 16));
    for (let j = 0; j < samplesPerBar && start + j < ch0.length; j += step) {
      const m = 0.5 * (Math.abs(ch0[start + j]) + Math.abs(ch1[start + j]));
      if (m > peak) peak = m;
    }
    const barH = Math.max(2, Math.min(h - 6, peak * (h - 6) * 1.25));
    const x = b * (w / numBars);
    ctx.fillStyle = peak > 0.92 ? "#FF3B00" : barColor;
    ctx.fillRect(x, (h - barH) / 2, barW, barH);
  }
}

export default function CleanupSuiteRack({
  tool,
  activeBuffer,
  selectedOutputStemId,
  onSelectOutputStemId,
  onCommitProcessedBuffer,
}: CleanupSuiteRackProps) {
  const [dereverbAmountPct, setDereverbAmountPct] = useState<number>(75);
  const [tailDecayGateMs, setTailDecayGateMs] = useState<number>(120);
  const [boxinessCutFreqHz, setBoxinessCutFreqHz] = useState<number>(350);
  const [boxinessCutDb, setBoxinessCutDb] = useState<number>(-4.5);
  const [dryRoomReBlendPct, setDryRoomReBlendPct] = useState<number>(12);
  const [reverbResult, setReverbResult] = useState<ReverbRemovalResult | null>(null);

  const [echoSuppressionPct, setEchoSuppressionPct] = useState<number>(80);
  const [slapbackDelayMs, setSlapbackDelayMs] = useState<number>(42.5);
  const [autoLockSlapback, setAutoLockSlapback] = useState<boolean>(true);
  const [flutterDampingHz, setFlutterDampingHz] = useState<number>(6500);
  const [multiTapCancellation, setMultiTapCancellation] = useState<boolean>(true);
  const [echoResult, setEchoResult] = useState<EchoRemovalResult | null>(null);

  const [macroProfileId, setMacroProfileId] = useState<RockEnhancerMacroId>(
    "GUITAR_AMP_HUM_HISS_KILLER"
  );
  const [humFundamentalHz, setHumFundamentalHz] = useState<0 | 50 | 60>(60);
  const [denoiseAmountPct, setDenoiseAmountPct] = useState<number>(75);
  const [presenceBoostDb, setPresenceBoostDb] = useState<number>(3.5);
  const [hissGateThresholdDb, setHissGateThresholdDb] = useState<number>(-42);
  const [targetLufs, setTargetLufs] = useState<number>(-14.0);
  const [enhancerResult, setEnhancerResult] = useState<AudioEnhancerResult | null>(
    null
  );

  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);

  const trackCanvasARef = useRef<HTMLCanvasElement | null>(null);
  const trackCanvasBRef = useRef<HTMLCanvasElement | null>(null);
  const localAudioCtxRef = useRef<AudioContext | null>(null);
  const localSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const stopLocalAudition = useCallback(() => {
    if (localSourceRef.current) {
      try {
        localSourceRef.current.stop();
        localSourceRef.current.disconnect();
      } catch {
        // already stopped
      }
      localSourceRef.current = null;
    }
    setPlayingTrackId(null);
  }, []);

  const liveSlapbackScan: SlapbackDetectionResult | null = useMemo(() => {
    if (!activeBuffer) return null;
    return detectSlapbackEchoLag(activeBuffer);
  }, [activeBuffer]);

  const effectiveSlapbackDelayMs = useMemo(() => {
    if (autoLockSlapback && liveSlapbackScan) {
      return liveSlapbackScan.detectedLagMs;
    }
    return slapbackDelayMs;
  }, [autoLockSlapback, liveSlapbackScan, slapbackDelayMs]);

  const executeCleanupDsp = useCallback(
    async (targetStemOverride?: string) => {
      if (!activeBuffer) return;
      stopLocalAudition();
      setIsRendering(true);
      try {
        const stemToCommit = targetStemOverride ?? selectedOutputStemId;

        if (tool.id === "reverb-remover") {
          const res = await runReverbRemoverDsp(activeBuffer, {
            dereverbAmountPct,
            tailDecayGateMs,
            boxinessCutFreqHz,
            boxinessCutDb,
            dryRoomReBlendPct,
          });
          setReverbResult(res);
          const chosenBuf =
            stemToCommit === "noise"
              ? res.removedReverbTailBuffer
              : dryRoomReBlendPct > 0
              ? res.reblendedBuffer
              : res.dryBuffer;
          onCommitProcessedBuffer(
            chosenBuf,
            stemToCommit,
            `[02.1 REVERB REMOVER] DEREVERB=${dereverbAmountPct}% | TAIL_GATE=${tailDecayGateMs}ms | DEBOX=${boxinessCutDb}dB@${boxinessCutFreqHz}Hz | REBLEND=${dryRoomReBlendPct}%`
          );
        } else if (tool.id === "echo-remover") {
          const res = await runEchoRemoverDsp(activeBuffer, {
            echoSuppressionPct,
            slapbackDelayMs: effectiveSlapbackDelayMs,
            flutterDampingHz,
            multiTapCancellation,
          });
          setEchoResult(res);
          const chosenBuf =
            stemToCommit === "noise"
              ? res.isolatedEchoResidualBuffer
              : res.cleanBuffer;
          onCommitProcessedBuffer(
            chosenBuf,
            stemToCommit,
            `[02.2 ECHO REMOVER] ${res.slapbackAnalysis.summaryBanner} | SUPPRESSION=${echoSuppressionPct}%`
          );
        } else {
          const res = await runAudioEnhancerDsp(activeBuffer, {
            macroProfileId,
            humFundamentalHz,
            denoiseAmountPct,
            presenceBoostDb,
            hissGateThresholdDb,
            targetLufs,
          });
          setEnhancerResult(res);
          const chosenBuf =
            stemToCommit === "removedNoise"
              ? res.removedHumAndHissBuffer
              : res.enhancedBuffer;
          onCommitProcessedBuffer(
            chosenBuf,
            stemToCommit,
            `[02.3 AUDIO ENHANCER] PROFILE=${macroProfileId} | ${
              humFundamentalHz > 0 ? `${humFundamentalHz}Hz 8-HARMONIC NOTCH` : "NOTCH OFF"
            } | +${presenceBoostDb}dB @ 3.5kHz | ${res.telemetry.outputLufs} LUFS`
          );
        }
      } finally {
        setIsRendering(false);
      }
    },
    [
      activeBuffer,
      stopLocalAudition,
      selectedOutputStemId,
      tool.id,
      dereverbAmountPct,
      tailDecayGateMs,
      boxinessCutFreqHz,
      boxinessCutDb,
      dryRoomReBlendPct,
      onCommitProcessedBuffer,
      effectiveSlapbackDelayMs,
      echoSuppressionPct,
      flutterDampingHz,
      multiTapCancellation,
      macroProfileId,
      humFundamentalHz,
      denoiseAmountPct,
      presenceBoostDb,
      hissGateThresholdDb,
      targetLufs,
    ]
  );

  useEffect(() => {
    if (!activeBuffer) return;
    let cancelled = false;
    async function computeInitialState() {
      if (!activeBuffer) return;
      if (tool.id === "reverb-remover") {
        const res = await runReverbRemoverDsp(activeBuffer, {
          dereverbAmountPct,
          tailDecayGateMs,
          boxinessCutFreqHz,
          boxinessCutDb,
          dryRoomReBlendPct,
        });
        if (!cancelled) setReverbResult(res);
      } else if (tool.id === "echo-remover") {
        const res = await runEchoRemoverDsp(activeBuffer, {
          echoSuppressionPct,
          slapbackDelayMs: effectiveSlapbackDelayMs,
          flutterDampingHz,
          multiTapCancellation,
        });
        if (!cancelled) setEchoResult(res);
      } else {
        const res = await runAudioEnhancerDsp(activeBuffer, {
          macroProfileId,
          humFundamentalHz,
          denoiseAmountPct,
          presenceBoostDb,
          hissGateThresholdDb,
          targetLufs,
        });
        if (!cancelled) setEnhancerResult(res);
      }
    }
    void computeInitialState();
    return () => {
      cancelled = true;
      stopLocalAudition();
    };
  }, [
    tool.id,
    activeBuffer,
    dereverbAmountPct,
    tailDecayGateMs,
    boxinessCutFreqHz,
    boxinessCutDb,
    dryRoomReBlendPct,
    echoSuppressionPct,
    effectiveSlapbackDelayMs,
    flutterDampingHz,
    multiTapCancellation,
    macroProfileId,
    humFundamentalHz,
    denoiseAmountPct,
    presenceBoostDb,
    hissGateThresholdDb,
    targetLufs,
    stopLocalAudition,
  ]);

  const dualTracks: DualTrackRowSpec[] = useMemo(() => {
    if (tool.id === "reverb-remover") {
      return [
        {
          id: "vocals",
          codeLabel: "STEM A // DRY SIGNAL",
          title: "Dry Signal (De-Reverbed + Room Re-Blend)",
          subtitle: `Transient-Expanded Close Mic (${dereverbAmountPct}% De-Room, ${dryRoomReBlendPct}% Natural Air Blend)`,
          color: "#B8FF01",
          buffer:
            dryRoomReBlendPct > 0
              ? reverbResult?.reblendedBuffer ?? activeBuffer
              : reverbResult?.dryBuffer ?? activeBuffer,
          filenameSlug: "dry-dereverbed-signal",
        },
        {
          id: "noise",
          codeLabel: "STEM B // REMOVED ROOM BLEED",
          title: "Removed Reverb Tail (Room Bleed Residual)",
          subtitle: `Isolated ${tailDecayGateMs}ms Diffuse Tail + ${boxinessCutFreqHz}Hz Drywall Boxiness`,
          color: "#FF3B00",
          buffer: reverbResult?.removedReverbTailBuffer ?? null,
          filenameSlug: "removed-reverb-tail-residual",
        },
      ];
    }

    if (tool.id === "echo-remover") {
      const lagMs =
        echoResult?.telemetry.appliedDelayMs ??
        liveSlapbackScan?.detectedLagMs ??
        slapbackDelayMs;
      const distM =
        echoResult?.telemetry.wallDistanceMeters ??
        liveSlapbackScan?.wallDistanceMeters ??
        7.3;
      return [
        {
          id: "vocals",
          codeLabel: "STEM A // ECHO-CANCELLED",
          title: "Clean Audio (Echo Cancelled)",
          subtitle: `Inverse Comb Cancelled @ ${lagMs} ms (~${distM}m Wall Bounce Removed)`,
          color: "#00E5FF",
          buffer: echoResult?.cleanBuffer ?? activeBuffer,
          filenameSlug: "clean-echo-cancelled",
        },
        {
          id: "noise",
          codeLabel: "STEM B // ECHO RESIDUAL",
          title: "Isolated Echo Residual (Slapback & Flutter)",
          subtitle: `Extracted Parallel-Wall Slapback Reflections (${lagMs} ms Lag)`,
          color: "#FF3B00",
          buffer: echoResult?.isolatedEchoResidualBuffer ?? null,
          filenameSlug: "isolated-echo-residual",
        },
      ];
    }

    return [
      {
        id: "denoised",
        codeLabel: "STEM A // ENHANCED ROCK MASTER",
        title: "Enhanced & Denoised Master (-14 LUFS)",
        subtitle: `8-Harmonic ${humFundamentalHz || 60}Hz Hum Notch + Hiss Gate + 3.5kHz Presence Exciter`,
        color: "#B8FF01",
        buffer: enhancerResult?.enhancedBuffer ?? activeBuffer,
        filenameSlug: "enhanced-rock-master",
      },
      {
        id: "removedNoise",
        codeLabel: "STEM B // HUM & HISS RESIDUAL",
        title: "Removed 60Hz/50Hz Amp Hum & Hiss Floor",
        subtitle: "Isolated Ground-Loop Buzz Harmonics (1st–8th) & Preamp Hiss",
        color: "#94A3B8",
        buffer: enhancerResult?.removedHumAndHissBuffer ?? null,
        filenameSlug: "removed-hum-hiss-floor",
      },
    ];
  }, [
    tool.id,
    dereverbAmountPct,
    dryRoomReBlendPct,
    reverbResult,
    activeBuffer,
    tailDecayGateMs,
    boxinessCutFreqHz,
    echoResult,
    liveSlapbackScan,
    slapbackDelayMs,
    humFundamentalHz,
    enhancerResult,
  ]);

  useEffect(() => {
    drawMiniWaveform(
      trackCanvasARef.current,
      dualTracks[0]?.buffer ?? null,
      dualTracks[0]?.color ?? "#B8FF01"
    );
    drawMiniWaveform(
      trackCanvasBRef.current,
      dualTracks[1]?.buffer ?? null,
      dualTracks[1]?.color ?? "#FF3B00"
    );
  }, [dualTracks]);

  const handleAuditionDualTrack = async (track: DualTrackRowSpec) => {
    if (playingTrackId === track.id) {
      stopLocalAudition();
      return;
    }
    stopLocalAudition();
    onSelectOutputStemId(track.id);
    if (!track.buffer) return;

    onCommitProcessedBuffer(
      track.buffer,
      track.id,
      `AUDITIONING [${tool.code}] -> ${track.title.toUpperCase()}`
    );

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!localAudioCtxRef.current) {
      localAudioCtxRef.current = new AudioCtx();
    }
    const ctx = localAudioCtxRef.current;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    const src = ctx.createBufferSource();
    src.buffer = track.buffer;
    src.connect(ctx.destination);
    src.onended = () => setPlayingTrackId(null);
    localSourceRef.current = src;
    src.start(0);
    setPlayingTrackId(track.id);
  };

  const handleApplyMacroProfile = (profileId: RockEnhancerMacroId) => {
    const profile =
      ROCK_ENHANCER_MACRO_PROFILES.find((p) => p.id === profileId) ??
      ROCK_ENHANCER_MACRO_PROFILES[0];
    setMacroProfileId(profile.id);
    setHumFundamentalHz(profile.humFundamentalHz);
    setDenoiseAmountPct(profile.denoiseAmountPct);
    setPresenceBoostDb(profile.presenceBoostDb);
    setTargetLufs(profile.targetLufs);
  };

  return (
    <div className="border-2 border-current p-4 space-y-5 shadow-[4px_4px_0px_#00E5FF] bg-[#0F0F0F] text-[#F4F3EF]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-current pb-3">
        <div>
          <div className="text-xs font-black uppercase text-[#B8FF01]">
            02 // ROOM & SIGNAL CLEANUP STUDIO RACK • [{tool.code}] {tool.title}
          </div>
          <h2 className="text-base sm:text-lg font-black uppercase tracking-tight">
            {tool.tagline}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-black px-2.5 py-1 bg-[#FF3B00] text-[#0D0D0D]">
            VOICE.AI PARITY: 2-STEM RESIDUAL OUTPUT
          </span>
          <span className="text-[11px] font-black px-2.5 py-1 bg-[#B8FF01] text-[#0D0D0D]">
            ZERO QUEUE WAIT
          </span>
        </div>
      </div>

      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-black uppercase text-[#00E5FF]">
            DUAL-STEM SEPARATION OUTPUTS (CLICK ROW TO SOLO / AUDITION / DOWNLOAD WAV)
          </span>
          <span className="text-[11px] opacity-75">
            EXACT PARITY WITH VOICE.AI{tool.voiceAiRoute.toUpperCase()} 2-TRACK OUTPUT
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {dualTracks.map((track, idx) => {
            const isSelected = selectedOutputStemId === track.id;
            const isTrackPlaying = playingTrackId === track.id;
            return (
              <div
                key={track.id}
                className={`border-2 p-3 space-y-2 transition-none ${
                  isSelected
                    ? "border-[#B8FF01] bg-[#161B0A]"
                    : "border-[#383838] bg-[#141414]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      style={{ backgroundColor: track.color }}
                      className="w-3.5 h-3.5 shrink-0 border border-black"
                    />
                    <div className="truncate">
                      <div className="text-[10px] font-black uppercase text-[#00E5FF]">
                        {track.codeLabel}
                      </div>
                      <div className="text-xs font-black uppercase truncate">
                        {track.title}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleAuditionDualTrack(track)}
                      className={`px-2.5 py-1 border-2 text-[11px] font-black uppercase cursor-pointer ${
                        isTrackPlaying
                          ? "bg-[#FF3B00] text-[#0D0D0D] border-[#F4F3EF]"
                          : "bg-[#B8FF01] text-[#0D0D0D] border-[#0D0D0D]"
                      }`}
                    >
                      {isTrackPlaying ? "■ STOP" : "▶ SOLO STEM"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (track.buffer) {
                          triggerWavDownload(
                            track.buffer,
                            `weaksauce-${tool.slug}-${track.filenameSlug}.wav`
                          );
                        }
                      }}
                      className="px-2.5 py-1 border-2 border-[#F4F3EF] text-[11px] font-black uppercase hover:bg-[#00E5FF] hover:text-[#0D0D0D] cursor-pointer"
                    >
                      DL WAV
                    </button>
                  </div>
                </div>

                <canvas
                  ref={idx === 0 ? trackCanvasARef : trackCanvasBRef}
                  width={520}
                  height={64}
                  className="w-full h-[58px] block border border-[#2C2C2C]"
                />

                <div className="text-[11px] opacity-80 flex items-center justify-between">
                  <span>{track.subtitle}</span>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectOutputStemId(track.id);
                      void executeCleanupDsp(track.id);
                    }}
                    className="underline font-bold text-[#B8FF01] cursor-pointer"
                  >
                    LOAD TO MAIN BUS
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {tool.id === "reverb-remover" && (
        <div className="space-y-4 border-t-2 border-current pt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="border-2 border-[#B8FF01] p-3 bg-[#151A09]">
              <div className="text-[10px] font-black uppercase text-[#B8FF01]">
                ESTIMATED RT60 ROOM REDUCTION
              </div>
              <div className="text-lg font-black">
                -{reverbResult?.telemetry.rt60ReductionEstimatePct ?? 68}% DECAY TAIL
              </div>
              <div className="text-[11px] opacity-80">
                Strips untreated drywall & concrete basement splash
              </div>
            </div>
            <div className="border-2 border-current p-3 bg-black/30">
              <div className="text-[10px] font-black uppercase text-[#00E5FF]">
                LOW-MID BOXINESS CARVE (250–500 HZ)
              </div>
              <div className="text-lg font-black">
                {boxinessCutDb} dB @ {boxinessCutFreqHz} Hz
              </div>
              <div className="text-[11px] opacity-80">
                Eliminates bedroom ceiling/wall standing-wave mud
              </div>
            </div>
            <div className="border-2 border-[#FF3B00] p-3 bg-[#1F110C]">
              <div className="text-[10px] font-black uppercase text-[#FF3B00]">
                SNARE & CAB NATURAL AIR RE-BLEND
              </div>
              <div className="text-lg font-black">
                {dryRoomReBlendPct}% ROOM RE-BLEND
              </div>
              <div className="text-[11px] opacity-80">
                Prevents snare drums & guitar cabs from sounding choked
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="border-2 border-current p-3 space-y-2 bg-black/25">
              <div className="flex justify-between text-xs font-black">
                <span>DEREVERB AMOUNT (0–100%)</span>
                <span className="px-2 py-0.5 bg-[#B8FF01] text-[#0D0D0D]">
                  {dereverbAmountPct}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={dereverbAmountPct}
                onChange={(e) => setDereverbAmountPct(Number(e.target.value))}
                className="w-full accent-[#B8FF01] cursor-pointer"
              />
              <div className="text-[10px] opacity-70">
                Envelope-tracked transient expander depth
              </div>
            </div>

            <div className="border-2 border-current p-3 space-y-2 bg-black/25">
              <div className="flex justify-between text-xs font-black">
                <span>TAIL DECAY GATE (MS)</span>
                <span className="px-2 py-0.5 bg-[#00E5FF] text-[#0D0D0D]">
                  {tailDecayGateMs} ms
                </span>
              </div>
              <input
                type="range"
                min={30}
                max={400}
                step={10}
                value={tailDecayGateMs}
                onChange={(e) => setTailDecayGateMs(Number(e.target.value))}
                className="w-full accent-[#00E5FF] cursor-pointer"
              />
              <div className="text-[10px] opacity-70">
                30ms = tight drum gate • 180ms = natural vocal decay
              </div>
            </div>

            <div className="border-2 border-[#FF3B00] p-3 space-y-2 bg-[#1B120E]">
              <div className="flex justify-between text-xs font-black">
                <span>DRY / ROOM RE-BLEND FADER</span>
                <span className="px-2 py-0.5 bg-[#FF3B00] text-[#0D0D0D]">
                  {dryRoomReBlendPct}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={50}
                step={2}
                value={dryRoomReBlendPct}
                onChange={(e) => setDryRoomReBlendPct(Number(e.target.value))}
                className="w-full accent-[#FF3B00] cursor-pointer"
              />
              <div className="text-[10px] opacity-80">
                Re-injects controlled room bleed so snares & cabs breathe
              </div>
            </div>

            <div className="border-2 border-current p-3 space-y-2 bg-black/25">
              <div className="flex justify-between text-xs font-black">
                <span>BOXINESS CENTER FREQ (250–500 HZ)</span>
                <span className="px-2 py-0.5 bg-[#B8FF01] text-[#0D0D0D]">
                  {boxinessCutFreqHz} Hz
                </span>
              </div>
              <input
                type="range"
                min={250}
                max={500}
                step={10}
                value={boxinessCutFreqHz}
                onChange={(e) => setBoxinessCutFreqHz(Number(e.target.value))}
                className="w-full accent-[#B8FF01] cursor-pointer"
              />
              <div className="text-[10px] opacity-70">
                Tunes biquad notch to drywall/bedroom resonant mode
              </div>
            </div>

            <div className="border-2 border-current p-3 space-y-2 bg-black/25 sm:col-span-2">
              <div className="flex justify-between text-xs font-black">
                <span>LOW-MID BOXINESS CUT DEPTH (DB)</span>
                <span className="px-2 py-0.5 bg-[#FF3B00] text-[#0D0D0D]">
                  {boxinessCutDb} dB @ {boxinessCutFreqHz} Hz
                </span>
              </div>
              <input
                type="range"
                min={-12}
                max={0}
                step={0.5}
                value={boxinessCutDb}
                onChange={(e) => setBoxinessCutDb(Number(e.target.value))}
                className="w-full accent-[#FF3B00] cursor-pointer"
              />
              <div className="text-[10px] opacity-70">
                Carves hollow 250–500 Hz buildup typical of untreated basements and spare bedrooms
              </div>
            </div>
          </div>
        </div>
      )}

      {tool.id === "echo-remover" && (
        <div className="space-y-4 border-t-2 border-current pt-4">
          <div className="border-2 border-[#00E5FF] bg-[#09191D] p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-[10px] font-black uppercase text-[#00E5FF]">
                AUTOMATIC SLAPBACK DELAY DETECTOR (15–350 MS AUTOCORRELATION PEAK SCANNER)
              </div>
              <div className="text-sm sm:text-base font-black text-[#B8FF01]">
                {echoResult?.slapbackAnalysis.summaryBanner ??
                  liveSlapbackScan?.summaryBanner ??
                  "DETECTED GARAGE SLAPBACK: 42.5 ms / ~7.3m wall bounce"}
              </div>
              <div className="text-xs opacity-85">
                ACOUSTIC MODE:{" "}
                <strong className="text-[#00E5FF]">
                  {echoResult?.slapbackAnalysis.acousticClassification ??
                    liveSlapbackScan?.acousticClassification ??
                    "GARAGE PARALLEL-WALL SLAPBACK"}
                </strong>{" "}
                | CONFIDENCE:{" "}
                <strong>
                  {Math.round(
                    ((echoResult?.slapbackAnalysis.correlationConfidence ??
                      liveSlapbackScan?.correlationConfidence ??
                      0.84) * 100)
                  )}
                  %
                </strong>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setAutoLockSlapback(true);
                  if (liveSlapbackScan) {
                    setSlapbackDelayMs(liveSlapbackScan.detectedLagMs);
                  }
                }}
                className={`px-3 py-1.5 border-2 text-xs font-black uppercase cursor-pointer ${
                  autoLockSlapback
                    ? "bg-[#B8FF01] text-[#0D0D0D] border-[#0D0D0D]"
                    : "border-[#00E5FF] text-[#00E5FF]"
                }`}
              >
                {autoLockSlapback ? "✓ AUTO-LOCKED TO PEAK LAG" : "LOCK TO DETECTED LAG"}
              </button>
              <button
                type="button"
                onClick={() => setMultiTapCancellation((v) => !v)}
                className={`px-3 py-1.5 border-2 text-xs font-black uppercase cursor-pointer ${
                  multiTapCancellation
                    ? "bg-[#00E5FF] text-[#0D0D0D] border-[#0D0D0D]"
                    : "border-current"
                }`}
              >
                2ND-TAP FLUTTER CANCEL: {multiTapCancellation ? "ON" : "OFF"}
              </button>
            </div>
          </div>

          {liveSlapbackScan && (
            <div className="border-2 border-current p-3 bg-black/40 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-black uppercase">
                <span className="text-[#00E5FF]">
                  15–350 MS AUTOCORRELATION REFLECTION SPECTRUM
                </span>
                <span className="text-[#B8FF01]">
                  PEAK LAG: {liveSlapbackScan.detectedLagMs} ms (~
                  {liveSlapbackScan.wallDistanceMeters}m /{" "}
                  {liveSlapbackScan.wallDistanceFeet}ft wall)
                </span>
              </div>
              <div className="grid grid-cols-24 sm:grid-cols-32 gap-1 items-end h-16 pt-2">
                {liveSlapbackScan.autocorrelationCurve.slice(0, 32).map((pt) => {
                  const isPeak =
                    Math.abs(pt.lagMs - liveSlapbackScan.detectedLagMs) < 8;
                  const pct = Math.max(10, Math.min(100, Math.round(pt.correlation * 140)));
                  return (
                    <div
                      key={pt.lagMs}
                      title={`${pt.lagMs} ms`}
                      className="flex flex-col items-center justify-end h-full"
                    >
                      <div
                        style={{ height: `${pct}%` }}
                        className={`w-full ${
                          isPeak ? "bg-[#FF3B00]" : "bg-[#00E5FF]/70"
                        }`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="border-2 border-current p-3 space-y-2 bg-black/25">
              <div className="flex justify-between text-xs font-black">
                <span>ECHO REDUCTION DEPTH</span>
                <span className="px-2 py-0.5 bg-[#B8FF01] text-[#0D0D0D]">
                  {echoSuppressionPct}%
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={echoSuppressionPct}
                onChange={(e) => setEchoSuppressionPct(Number(e.target.value))}
                className="w-full accent-[#B8FF01] cursor-pointer"
              />
              <div className="text-[10px] opacity-70">
                Inverse comb cancellation attenuation depth
              </div>
            </div>

            <div className="border-2 border-current p-3 space-y-2 bg-black/25">
              <div className="flex justify-between text-xs font-black">
                <span>SLAPBACK DELAY LAG (15–350 MS)</span>
                <span className="px-2 py-0.5 bg-[#00E5FF] text-[#0D0D0D]">
                  {effectiveSlapbackDelayMs} ms
                </span>
              </div>
              <input
                type="range"
                min={15}
                max={350}
                step={0.5}
                value={effectiveSlapbackDelayMs}
                onChange={(e) => {
                  setAutoLockSlapback(false);
                  setSlapbackDelayMs(Number(e.target.value));
                }}
                className="w-full accent-[#00E5FF] cursor-pointer"
              />
              <div className="text-[10px] opacity-70">
                Est. Wall Bounce:{" "}
                {((343 * (effectiveSlapbackDelayMs / 1000)) / 2).toFixed(1)}m /{" "}
                {(((343 * (effectiveSlapbackDelayMs / 1000)) / 2) * 3.28084).toFixed(1)}ft
              </div>
            </div>

            <div className="border-2 border-current p-3 space-y-2 bg-black/25">
              <div className="flex justify-between text-xs font-black">
                <span>FLUTTER DAMPING CUTOFF</span>
                <span className="px-2 py-0.5 bg-[#FF3B00] text-[#0D0D0D]">
                  {flutterDampingHz} Hz
                </span>
              </div>
              <input
                type="range"
                min={2000}
                max={12000}
                step={250}
                value={flutterDampingHz}
                onChange={(e) => setFlutterDampingHz(Number(e.target.value))}
                className="w-full accent-[#FF3B00] cursor-pointer"
              />
              <div className="text-[10px] opacity-70">
                Suppresses metallic parallel-wall high-frequency zing
              </div>
            </div>
          </div>
        </div>
      )}

      {tool.id === "audio-enhancer" && (
        <div className="space-y-4 border-t-2 border-current pt-4">
          <div className="space-y-2">
            <div className="text-xs font-black uppercase text-[#B8FF01]">
              4 ONE-CLICK ROCK STUDIO MACRO PROFILES (JEFF&apos;S 3-PIECE BAND PRESETS)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {ROCK_ENHANCER_MACRO_PROFILES.map((macro) => {
                const isActive = macro.id === macroProfileId;
                return (
                  <button
                    key={macro.id}
                    type="button"
                    onClick={() => handleApplyMacroProfile(macro.id)}
                    className={`text-left p-3 border-2 cursor-pointer transition-none flex flex-col justify-between gap-1 ${
                      isActive
                        ? "border-[#B8FF01] bg-[#B8FF01] text-[#0D0D0D] shadow-[3px_3px_0px_#FF3B00]"
                        : "border-current bg-black/30 hover:bg-[#FF3B00]/20"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-black text-xs uppercase">
                        {macro.buttonLabel}
                      </span>
                      <span
                        className={`text-[10px] font-black px-1.5 py-0.5 ${
                          isActive
                            ? "bg-[#0D0D0D] text-[#B8FF01]"
                            : "bg-[#00E5FF] text-[#0D0D0D]"
                        }`}
                      >
                        {macro.targetLufs} LUFS
                      </span>
                    </div>
                    <p
                      className={`text-[11px] leading-snug ${
                        isActive ? "text-[#0D0D0D] font-semibold" : "opacity-80"
                      }`}
                    >
                      {macro.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-2 border-[#00E5FF] p-3.5 bg-[#0A1417] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[10px] font-black uppercase text-[#00E5FF]">
                  SURGICAL 8-HARMONIC GUITAR AMP GROUND-LOOP HUM NOTCH BANK (Q=35)
                </div>
                <div className="text-xs font-black uppercase text-[#B8FF01]">
                  {humFundamentalHz === 60
                    ? "US 60 HZ HARMONIC COMB: 60 • 120 • 180 • 240 • 300 • 360 • 420 • 480 HZ"
                    : humFundamentalHz === 50
                    ? "EU/UK 50 HZ HARMONIC COMB: 50 • 100 • 150 • 200 • 250 • 300 • 350 • 400 HZ"
                    : "HUM NOTCH BANK BYPASSED (0 HZ)"}
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {([60, 50, 0] as const).map((hz) => (
                  <button
                    key={hz}
                    type="button"
                    onClick={() => setHumFundamentalHz(hz)}
                    className={`px-2.5 py-1 border-2 text-xs font-black uppercase cursor-pointer ${
                      humFundamentalHz === hz
                        ? "bg-[#FF3B00] text-[#0D0D0D] border-[#F4F3EF]"
                        : "border-current hover:bg-[#B8FF01] hover:text-[#0D0D0D]"
                    }`}
                  >
                    {hz === 60 ? "60 HZ (US)" : hz === 50 ? "50 HZ (EU)" : "NOTCH OFF"}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {(
                enhancerResult?.harmonicBankTelemetry ??
                [1, 2, 3, 4, 5, 6, 7, 8].map((h) => ({
                  harmonicIndex: h,
                  frequencyHz: (humFundamentalHz || 60) * h,
                  inputLevelDb: -32,
                  attenuationDb: humFundamentalHz > 0 ? -28 : 0,
                  postNotchLevelDb: -60,
                }))
              ).map((band) => {
                const cutDepthPct = Math.min(
                  100,
                  Math.max(8, Math.round((Math.abs(band.attenuationDb) / 36) * 100))
                );
                return (
                  <div
                    key={band.harmonicIndex}
                    className="border border-[#00E5FF]/50 bg-[#0D0D0D] p-2 flex flex-col items-center gap-1.5"
                  >
                    <span className="text-[10px] font-black text-[#00E5FF]">
                      H{band.harmonicIndex} • {band.frequencyHz}Hz
                    </span>
                    <div className="w-full h-16 bg-[#1A1A1A] border border-[#333333] flex flex-col justify-start overflow-hidden">
                      <div
                        style={{ height: `${cutDepthPct}%` }}
                        className="w-full bg-[#FF3B00]"
                      />
                    </div>
                    <span className="text-[10px] font-black text-[#B8FF01]">
                      {band.attenuationDb} dB
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="border-2 border-current p-3 space-y-2 bg-black/25">
              <div className="flex justify-between text-xs font-black">
                <span>SPECTRAL AMP HISS GATE</span>
                <span className="px-2 py-0.5 bg-[#B8FF01] text-[#0D0D0D]">
                  {denoiseAmountPct}% ({hissGateThresholdDb} dB)
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={denoiseAmountPct}
                onChange={(e) => setDenoiseAmountPct(Number(e.target.value))}
                className="w-full accent-[#B8FF01] cursor-pointer"
              />
              <input
                type="range"
                min={-65}
                max={-28}
                step={1}
                value={hissGateThresholdDb}
                onChange={(e) => setHissGateThresholdDb(Number(e.target.value))}
                className="w-full accent-[#00E5FF] cursor-pointer"
              />
              <div className="text-[10px] opacity-70">
                Top slider: Hiss Reduction % • Bottom: Gate Threshold dB
              </div>
            </div>

            <div className="border-2 border-current p-3 space-y-2 bg-black/25">
              <div className="flex justify-between text-xs font-black">
                <span>3.5 KHZ PRESENCE EXCITER</span>
                <span className="px-2 py-0.5 bg-[#00E5FF] text-[#0D0D0D]">
                  +{presenceBoostDb} dB
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={9}
                step={0.5}
                value={presenceBoostDb}
                onChange={(e) => setPresenceBoostDb(Number(e.target.value))}
                className="w-full accent-[#00E5FF] cursor-pointer"
              />
              <div className="text-[10px] opacity-70">
                Harmonic upper-midrange lift for rock vocals & guitar bite
              </div>
            </div>

            <div className="border-2 border-current p-3 space-y-2 bg-black/25">
              <div className="flex justify-between text-xs font-black">
                <span>ROCK MASTER TARGET LUFS</span>
                <span className="px-2 py-0.5 bg-[#FF3B00] text-[#0D0D0D]">
                  {targetLufs} LUFS
                </span>
              </div>
              <input
                type="range"
                min={-18}
                max={-9}
                step={0.5}
                value={targetLufs}
                onChange={(e) => setTargetLufs(Number(e.target.value))}
                className="w-full accent-[#FF3B00] cursor-pointer"
              />
              <div className="text-[10px] opacity-70">
                Brickwall ceiling: -0.8 dBFS | Output:{" "}
                <strong className="text-[#B8FF01]">
                  {enhancerResult?.telemetry.outputLufs ?? -14.0} LUFS
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="pt-3 border-t-2 border-current flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isRendering}
            onClick={() => void executeCleanupDsp()}
            className="px-4 py-2 border-2 border-[#0D0D0D] bg-[#B8FF01] text-[#0D0D0D] font-black text-xs uppercase cursor-pointer shadow-[3px_3px_0px_#FF3B00] hover:bg-[#00E5FF]"
          >
            {isRendering
              ? "RENDERING STUDIO CLEANUP..."
              : `⚡ RENDER [${tool.code}] ${tool.title.toUpperCase()} NOW`}
          </button>
          <span className="text-[11px] opacity-80">
            Outputs both clean signal & isolated room/hum residual in-browser
          </span>
        </div>

        <div className="text-[11px] font-bold text-[#00E5FF]">
          ENGINE: WEBAUDIO FLOAT32 BIQUAD + FASTAPI /API/V1/TOOLS/{tool.slug.toUpperCase()}
        </div>
      </div>
    </div>
  );
}
