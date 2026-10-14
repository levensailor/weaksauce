"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TOOLS, ToolDefinition, ToolId } from "@/app/lib/tool-catalog";
import {
  ExportAudioFormat,
  INITIAL_STEM_CHANNELS,
  MINUS_ONE_REHEARSAL_PRESETS,
  MinusOnePreset,
  StemChannelConfig,
  StemId,
  StemSplitMode,
  StemSplitterResult,
  buildMultiStemZipBlob,
  encodeStemBufferToBlob,
  encodeStemBufferToBytes,
  mixStemConsoleToBuffer,
  runStemSplitterDsp,
} from "@/app/lib/dsp/stems-dsp";

export interface StemSplitterRackProps {
  tool: ToolDefinition;
  activeBuffer: AudioBuffer | null;
  bufferLabel: string;
  highContrastDark: boolean;
  onCommitBuffer: (next: AudioBuffer, label: string) => void;
  onSendToTool: (targetToolId: ToolId, buffer: AudioBuffer, stemLabel: string) => void;
  onStatusChange: (msg: string) => void;
}

function drawMiniStemStrip(
  canvas: HTMLCanvasElement | null,
  buffer: AudioBuffer | null,
  progressRatio: number,
  color: string,
  audible: boolean,
  highContrastDark: boolean
) {
  if (!canvas || !buffer) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = highContrastDark ? "#090909" : "#E8E6DE";
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = highContrastDark ? "#222222" : "#CFCBC0";
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();

  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;
  const numBars = 96;
  const samplesPerBar = Math.max(1, Math.floor(ch0.length / numBars));
  const barW = Math.max(2, Math.floor(w / numBars) - 1);
  const playX = Math.floor(progressRatio * w);

  for (let b = 0; b < numBars; b++) {
    let peak = 0;
    const start = b * samplesPerBar;
    const step = Math.max(1, Math.floor(samplesPerBar / 16));
    for (let j = 0; j < samplesPerBar && start + j < ch0.length; j += step) {
      const p = Math.max(Math.abs(ch0[start + j]), Math.abs(ch1[start + j]));
      if (p > peak) peak = p;
    }
    const x = b * (w / numBars);
    const barH = Math.min(h / 2 - 2, Math.max(2, peak * (h / 2 - 2) * 1.35));

    if (!audible) {
      ctx.fillStyle = "#3A3A3A";
    } else if (x <= playX) {
      ctx.fillStyle = "#F4F3EF";
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

export default function StemSplitterRack({
  tool,
  activeBuffer,
  bufferLabel,
  highContrastDark,
  onCommitBuffer,
  onSendToTool,
  onStatusChange,
}: StemSplitterRackProps) {
  const [splitMode, setSplitMode] = useState<StemSplitMode>("rock-4");
  const [channels, setChannels] = useState<StemChannelConfig[]>(INITIAL_STEM_CHANNELS);
  const splitResult: StemSplitterResult | null = useMemo(() => {
    if (!activeBuffer) return null;
    return runStemSplitterDsp(activeBuffer, splitMode);
  }, [activeBuffer, splitMode]);
  const [activeMinusOneId, setActiveMinusOneId] = useState<string>("full-band");
  const [exportFormat, setExportFormat] = useState<ExportAudioFormat>("wav");
  const [sendTargetTool, setSendTargetTool] = useState<ToolId>("audio-enhancer");

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playOffsetSec, setPlayOffsetSec] = useState<number>(0);
  const [progressRatio, setProgressRatio] = useState<number>(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const startWallTimeRef = useRef<number>(0);
  const startOffsetRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  const canvasMapRef = useRef<Record<StemId, HTMLCanvasElement | null>>({
    vocals: null,
    guitar: null,
    bass: null,
    drums: null,
    piano: null,
    other: null,
  });

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
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.onended = null;
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch {
        // already stopped
      }
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.onended = null;
          sourceNodeRef.current.stop();
          sourceNodeRef.current.disconnect();
        } catch {
          // already stopped
        }
        sourceNodeRef.current = null;
      }
    };
  }, [activeBuffer]);

  const visibleChannels = useMemo(
    () =>
      splitMode === "rock-4"
        ? channels.filter((c) =>
            ["vocals", "guitar", "bass", "drums"].includes(c.id)
          )
        : channels,
    [channels, splitMode]
  );

  const anySoloActive = useMemo(
    () => visibleChannels.some((c) => c.solo),
    [visibleChannels]
  );

  const consoleMasterBuffer = useMemo(() => {
    if (!splitResult) return null;
    return mixStemConsoleToBuffer(splitResult.stems, channels, splitMode);
  }, [splitResult, channels, splitMode]);

  useEffect(() => {
    if (!splitResult) return;
    for (const ch of visibleChannels) {
      const audible = anySoloActive ? ch.solo : !ch.mute;
      drawMiniStemStrip(
        canvasMapRef.current[ch.id],
        splitResult.stems[ch.id],
        progressRatio,
        ch.color,
        audible,
        highContrastDark
      );
    }
  }, [splitResult, visibleChannels, anySoloActive, progressRatio, highContrastDark]);

  const startConsolePlayback = useCallback(
    async (offsetSec: number, overrideBuffer?: AudioBuffer | null) => {
      const target = overrideBuffer ?? consoleMasterBuffer;
      if (!target) return;

      stopTransport();
      const ctx = ensureAudioContext();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      const clampedOffset = Math.max(0, Math.min(target.duration - 0.05, offsetSec));
      const src = ctx.createBufferSource();
      src.buffer = target;
      src.connect(ctx.destination);

      startWallTimeRef.current = ctx.currentTime;
      startOffsetRef.current = clampedOffset;
      sourceNodeRef.current = src;
      setIsPlaying(true);

      const tick = () => {
        if (!audioCtxRef.current || !sourceNodeRef.current) return;
        const elapsed =
          startOffsetRef.current +
          (audioCtxRef.current.currentTime - startWallTimeRef.current);
        if (elapsed >= target.duration) {
          setPlayOffsetSec(0);
          setProgressRatio(0);
          setIsPlaying(false);
          return;
        }
        setPlayOffsetSec(elapsed);
        setProgressRatio(elapsed / target.duration);
        rafRef.current = requestAnimationFrame(tick);
      };

      src.onended = () => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        setIsPlaying(false);
      };

      src.start(0, clampedOffset);
      rafRef.current = requestAnimationFrame(tick);
    },
    [consoleMasterBuffer, ensureAudioContext, stopTransport]
  );

  useEffect(() => {
    return () => {
      stopTransport();
    };
  }, [stopTransport]);

  const handleScrubStrip = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!consoleMasterBuffer) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const sec = ratio * consoleMasterBuffer.duration;
    setPlayOffsetSec(sec);
    setProgressRatio(sec / consoleMasterBuffer.duration);
    if (isPlaying) {
      void startConsolePlayback(sec);
    }
  };

  const updateChannel = (
    id: StemId,
    patch: Partial<Pick<StemChannelConfig, "mute" | "solo" | "pan" | "gainDb">>
  ) => {
    setActiveMinusOneId("custom");
    setChannels((prev) =>
      prev.map((ch) => (ch.id === id ? { ...ch, ...patch } : ch))
    );
  };

  const handleApplyMinusOnePreset = (preset: MinusOnePreset) => {
    setActiveMinusOneId(preset.id);
    const nextChannels = channels.map((ch) => ({
      ...ch,
      solo: false,
      mute: preset.mutedStems.includes(ch.id),
      gainDb: preset.gainOverridesDb?.[ch.id] ?? 0,
    }));
    setChannels(nextChannels);
    onStatusChange(`REHEARSAL MIX PRESET // ${preset.label}`);
    if (isPlaying && splitResult) {
      const nextBuf = mixStemConsoleToBuffer(
        splitResult.stems,
        nextChannels,
        splitMode
      );
      void startConsolePlayback(playOffsetSec, nextBuf);
    }
  };

  const handleResetFullBandMix = () => {
    setActiveMinusOneId("full-band");
    setChannels(INITIAL_STEM_CHANNELS);
    onStatusChange("RESET 6-CHANNEL CONSOLE // ALL STEMS UNITY (0.0 dB)");
  };

  const handleDownloadSingleStem = (stemId: StemId) => {
    if (!splitResult) return;
    const buf = splitResult.stems[stemId];
    const blob = encodeStemBufferToBlob(buf, exportFormat);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `weaksauce-01.2-stem-${stemId}.${exportFormat}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onStatusChange(
      `DOWNLOADED STEM // weaksauce-01.2-stem-${stemId}.${exportFormat.toUpperCase()}`
    );
  };

  const handleExportMinusOneMix = () => {
    if (!consoleMasterBuffer) return;
    const tag = activeMinusOneId || "rehearsal-mix";
    const blob = encodeStemBufferToBlob(consoleMasterBuffer, exportFormat);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `weaksauce-01.2-${tag}.${exportFormat}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onStatusChange(
      `EXPORTED MINUS-ONE REHEARSAL MIX // weaksauce-01.2-${tag}.${exportFormat.toUpperCase()}`
    );
  };

  const handleDownloadAllStemsZip = () => {
    if (!splitResult) return;
    const stemIds: StemId[] =
      splitMode === "rock-4"
        ? ["vocals", "guitar", "bass", "drums"]
        : ["vocals", "guitar", "bass", "drums", "piano", "other"];

    const entries = stemIds.map((id, idx) => ({
      filename: `0${idx + 1}-${id}.wav`,
      data: encodeStemBufferToBytes(splitResult.stems[id], "wav"),
    }));

    if (consoleMasterBuffer) {
      entries.push({
        filename: `00-rehearsal-console-mix.wav`,
        data: encodeStemBufferToBytes(consoleMasterBuffer, "wav"),
      });
    }

    const zipBlob = buildMultiStemZipBlob(entries);
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `weaksauce-01.2-${splitMode}-stems-pack.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onStatusChange(
      `PACKAGED & DOWNLOADED ZIP ARCHIVE // weaksauce-01.2-${splitMode}-stems-pack.zip (${entries.length} WAV FILES)`
    );
  };

  const otherTools = useMemo(
    () => TOOLS.filter((t) => t.id !== tool.id),
    [tool.id]
  );

  return (
    <div className="border-2 border-current p-4 space-y-4 shadow-[4px_4px_0px_#B8FF01]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-current pb-3">
        <div>
          <div className="text-xs font-black uppercase text-[#B8FF01]">
            [01.2] STEM SPLITTER &amp; 6-CHANNEL REHEARSAL CONSOLE // VOICE.AI/TOOLS/STEM-SPLITTER PARITY
          </div>
          <h2 className="text-base sm:text-lg font-black uppercase">
            {splitMode === "rock-4"
              ? "3-PIECE ROCK BAND CORE (4 STEMS: VOCALS / GUITAR / BASS / DRUMS)"
              : "FULL 6-STEM STUDIO SPLIT (VOCALS / GUITAR / BASS / DRUMS / PIANO / OTHER)"}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => {
              setSplitMode("rock-4");
              onStatusChange(
                "STEM MODE // 3-PIECE ROCK CORE (4 STEMS: VOCALS, GUITAR, BASS, DRUMS)"
              );
            }}
            className={`px-3 py-1.5 border-2 font-black uppercase cursor-pointer ${
              splitMode === "rock-4"
                ? "bg-[#B8FF01] text-[#0D0D0D] border-[#0D0D0D] shadow-[2px_2px_0px_#FF3B00]"
                : "border-current hover:bg-[#B8FF01]/20"
            }`}
          >
            3-PIECE ROCK CORE (4 STEMS)
          </button>

          <button
            type="button"
            onClick={() => {
              setSplitMode("full-6");
              onStatusChange(
                "STEM MODE // FULL 6-STEM SPLIT (+ PIANO & OTHER AMBIENCE)"
              );
            }}
            className={`px-3 py-1.5 border-2 font-black uppercase cursor-pointer ${
              splitMode === "full-6"
                ? "bg-[#00E5FF] text-[#0D0D0D] border-[#0D0D0D] shadow-[2px_2px_0px_#FF3B00]"
                : "border-current hover:bg-[#00E5FF]/20"
            }`}
          >
            FULL 6-STEM MODE (+ PIANO &amp; OTHER)
          </button>
        </div>
      </div>

      <div className="p-3 border-2 border-current bg-black/25 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-black uppercase text-[#FF3B00]">
            1-CLICK &quot;MINUS-ONE&quot; BAND REHEARSAL MIX PRESETS ({bufferLabel})
          </span>
          <button
            type="button"
            onClick={handleResetFullBandMix}
            className="px-2.5 py-0.5 border border-current text-[10px] font-black uppercase cursor-pointer hover:bg-[#B8FF01] hover:text-[#0D0D0D]"
          >
            RESET FULL BAND UNITY MIX
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {MINUS_ONE_REHEARSAL_PRESETS.map((preset) => {
            const isSelected = activeMinusOneId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApplyMinusOnePreset(preset)}
                title={preset.description}
                className={`p-2 border-2 text-left text-xs cursor-pointer flex flex-col justify-between gap-1 ${
                  isSelected
                    ? "bg-[#FF3B00] text-[#0D0D0D] border-[#F4F3EF] font-black"
                    : "border-current hover:bg-[#FF3B00]/20"
                }`}
              >
                <span className="font-black uppercase text-[11px]">
                  [{preset.shortTag}]
                </span>
                <span className="text-[10px] leading-tight opacity-85">
                  {preset.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-2 border-current bg-[#0D0D0D] text-[#F4F3EF] p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (isPlaying) {
                stopTransport();
              } else {
                void startConsolePlayback(playOffsetSec);
              }
            }}
            className={`px-4 py-1.5 border-2 font-black uppercase cursor-pointer ${
              isPlaying
                ? "bg-[#FF3B00] text-[#0D0D0D] border-[#F4F3EF]"
                : "bg-[#B8FF01] text-[#0D0D0D] border-[#0D0D0D]"
            }`}
          >
            {isPlaying ? "■ STOP CONSOLE MIX" : "▶ PLAY LIVE STEM CONSOLE"}
          </button>

          <button
            type="button"
            onClick={() => {
              stopTransport();
              setPlayOffsetSec(0);
              setProgressRatio(0);
            }}
            className="px-2.5 py-1.5 border border-[#F4F3EF] font-bold uppercase cursor-pointer hover:bg-[#F4F3EF] hover:text-[#0D0D0D]"
          >
            ⏮ ZERO
          </button>

          <span className="font-bold text-[#00E5FF] px-1">
            {playOffsetSec.toFixed(2)}s / {(consoleMasterBuffer?.duration ?? 0).toFixed(2)}s
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Stem export audio format"
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as ExportAudioFormat)}
            className="bg-[#181818] border-2 border-[#666666] px-2 py-1 font-bold uppercase text-xs"
          >
            <option value="wav">WAV (16-BIT PCM)</option>
            <option value="flac">FLAC (24-BIT LOSSLESS)</option>
            <option value="mp3">MP3 (320 KBPS)</option>
          </select>

          <button
            type="button"
            onClick={handleExportMinusOneMix}
            className="px-3 py-1.5 border-2 border-[#0D0D0D] bg-[#00E5FF] text-[#0D0D0D] font-black uppercase cursor-pointer hover:bg-[#B8FF01]"
          >
            [EXPORT MINUS-ONE REHEARSAL MIX]
          </button>

          <button
            type="button"
            onClick={handleDownloadAllStemsZip}
            className="px-3 py-1.5 border-2 border-[#0D0D0D] bg-[#B8FF01] text-[#0D0D0D] font-black uppercase cursor-pointer shadow-[2px_2px_0px_#FF3B00] hover:bg-[#FF3B00]"
          >
            [DOWNLOAD ALL STEMS (.ZIP)]
          </button>
        </div>
      </div>

      <div className="space-y-2.5">
        {visibleChannels.map((ch, idx) => {
          const isAudible = anySoloActive ? ch.solo : !ch.mute;
          const m = splitResult?.stemMetrics[ch.id];

          return (
            <div
              key={ch.id}
              className={`border-2 p-3 transition-none ${
                isAudible
                  ? "border-current bg-black/20"
                  : "border-current/40 bg-black/5 opacity-65"
              }`}
            >
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-center">
                <div className="xl:col-span-3 flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span
                      style={{ backgroundColor: ch.color }}
                      className="w-3.5 h-3.5 shrink-0 border border-black"
                    />
                    <span className="font-black text-sm uppercase">
                      {`CH 0${idx + 1} // ${ch.label}`}
                    </span>
                  </div>
                  <div className="text-[10px] font-bold opacity-80">
                    {ch.roleLabel}
                  </div>
                  <div className="text-[10px] text-[#00E5FF]">
                    {ch.freqBandLabel}
                    {m ? ` | PEAK ${m.peakDb} dB` : ""}
                  </div>
                </div>

                <div className="xl:col-span-4">
                  <canvas
                    ref={(el) => {
                      canvasMapRef.current[ch.id] = el;
                    }}
                    width={520}
                    height={52}
                    onClick={handleScrubStrip}
                    className="w-full h-[48px] block border border-[#333333] cursor-ew-resize"
                    title={`Click to scrub ${ch.label} stem`}
                  />
                </div>

                <div className="xl:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="border border-current/40 p-1.5 bg-black/25">
                    <div className="flex justify-between text-[10px] font-black">
                      <span>PAN</span>
                      <span className="text-[#00E5FF]">
                        {ch.pan === 0
                          ? "CENTER"
                          : ch.pan < 0
                          ? `${Math.abs(ch.pan)}L`
                          : `${ch.pan}R`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-100}
                      max={100}
                      step={5}
                      value={ch.pan}
                      onChange={(e) =>
                        updateChannel(ch.id, { pan: Number(e.target.value) })
                      }
                      className="w-full accent-[#00E5FF] cursor-pointer"
                    />
                  </div>

                  <div className="border border-current/40 p-1.5 bg-black/25">
                    <div className="flex justify-between text-[10px] font-black">
                      <span>GAIN</span>
                      <span className="text-[#B8FF01]">
                        {ch.gainDb >= 0 ? `+${ch.gainDb}` : ch.gainDb} dB
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-24}
                      max={6}
                      step={0.5}
                      value={ch.gainDb}
                      onChange={(e) =>
                        updateChannel(ch.id, { gainDb: Number(e.target.value) })
                      }
                      className="w-full accent-[#B8FF01] cursor-pointer"
                    />
                  </div>
                </div>

                <div className="xl:col-span-2 flex flex-wrap xl:justify-end items-center gap-1.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => updateChannel(ch.id, { mute: !ch.mute })}
                    className={`px-2 py-1 border-2 font-black uppercase cursor-pointer ${
                      ch.mute
                        ? "bg-[#FF3B00] text-[#0D0D0D] border-[#F4F3EF]"
                        : "border-current hover:bg-[#FF3B00]/25"
                    }`}
                  >
                    [MUTE]
                  </button>

                  <button
                    type="button"
                    onClick={() => updateChannel(ch.id, { solo: !ch.solo })}
                    className={`px-2 py-1 border-2 font-black uppercase cursor-pointer ${
                      ch.solo
                        ? "bg-[#B8FF01] text-[#0D0D0D] border-[#0D0D0D]"
                        : "border-current hover:bg-[#B8FF01]/25"
                    }`}
                  >
                    [SOLO]
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownloadSingleStem(ch.id)}
                    className="px-2 py-1 border-2 border-current bg-[#0D0D0D] text-[#F4F3EF] font-black uppercase cursor-pointer hover:bg-[#00E5FF] hover:text-[#0D0D0D]"
                    title={`Download isolated ${ch.label} stem as .${exportFormat.toUpperCase()}`}
                  >
                    ↓ {exportFormat.toUpperCase()}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (splitResult) {
                        onSendToTool(
                          sendTargetTool,
                          splitResult.stems[ch.id],
                          `01.2 ${ch.label} STEM`
                        );
                      }
                    }}
                    className="px-2 py-1 border border-[#B8FF01] text-[#B8FF01] font-black uppercase cursor-pointer hover:bg-[#B8FF01] hover:text-[#0D0D0D]"
                    title={`Pipe ${ch.label} stem to selected tool`}
                  >
                    PIPE →
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-2 border-t-2 border-current flex flex-wrap items-center justify-between gap-3 text-xs">
        <button
          type="button"
          onClick={() => {
            if (!consoleMasterBuffer) return;
            onCommitBuffer(
              consoleMasterBuffer,
              `01.2 STEM CONSOLE MIX (${splitMode.toUpperCase()} // ${activeMinusOneId.toUpperCase()})`
            );
          }}
          className="px-3.5 py-1.5 border-2 border-[#0D0D0D] bg-[#B8FF01] text-[#0D0D0D] font-black uppercase cursor-pointer shadow-[3px_3px_0px_#FF3B00]"
        >
          COMMIT ACTIVE CONSOLE MIX TO GLOBAL BUS
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-black uppercase text-[#00E5FF]">
            TARGET TOOL FOR [PIPE →]:
          </span>
          <select
            aria-label="Target tool for stem piping"
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
              if (consoleMasterBuffer) {
                onSendToTool(
                  sendTargetTool,
                  consoleMasterBuffer,
                  `01.2 CONSOLE MIX (${activeMinusOneId.toUpperCase()})`
                );
              }
            }}
            className="px-3 py-1.5 border-2 border-[#B8FF01] bg-[#0D0D0D] text-[#B8FF01] font-black uppercase cursor-pointer hover:bg-[#B8FF01] hover:text-[#0D0D0D]"
          >
            SEND CONSOLE MIX TO TOOL →
          </button>
        </div>
      </div>
    </div>
  );
}
