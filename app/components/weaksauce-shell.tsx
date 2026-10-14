"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  APP_CONFIG,
  TOOLSETS,
  TOOLS,
  ToolDefinition,
  ToolId,
  ToolsetId,
  VOICE_AI_SCRAPE_AUDIT,
  getToolById,
  getToolsForToolset,
} from "@/app/lib/tool-catalog";
import {
  AudioMetrics,
  DEMO_STEMS,
  analyzeAudioBuffer,
  encodeAudioBufferToWavBlob,
  runToolDspRecipe,
  synthesizeDemoAudioBuffer,
} from "@/app/lib/audio-dsp";

interface BackendToolResponse {
  tool_id: string;
  tool_code: string;
  status: string;
  estimated_lufs: number;
  headroom_db: number;
  recommended_gain_delta_db: number;
  detected_bpm?: number;
  delay_subdivisions_ms?: {
    quarter_ms: number;
    dotted_eighth_ms: number;
    eighth_ms: number;
    slapback_sixteenth_ms: number;
  };
  outputs: Array<{
    id: string;
    label: string;
    color: string;
    estimated_peak_db: number;
  }>;
  dsp_chain_summary: string[];
  execution_engine: string;
  timestamp_est?: string;
}

export default function WeaksauceShell() {
  const [activeToolsetId, setActiveToolsetId] = useState<ToolsetId>("stems-isolation");
  const [activeToolId, setActiveToolId] = useState<ToolId>("vocal-remover");
  const [workspaceMode, setWorkspaceMode] = useState<"RACK" | "GRID" | "VOICE_AI_AUDIT">("RACK");
  const [rightTab, setRightTab] = useState<"WORKBENCH" | "OSS_SPEC">("WORKBENCH");
  const [showDroppedDrawer, setShowDroppedDrawer] = useState<boolean>(false);
  const [highContrastDark, setHighContrastDark] = useState<boolean>(true);

  // Audio Context & Transport
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const [activeBuffer, setActiveBuffer] = useState<AudioBuffer | null>(null);
  const [processedBuffer, setProcessedBuffer] = useState<AudioBuffer | null>(null);
  const [selectedOutputStemId, setSelectedOutputStemId] = useState<string>("vocals");
  const [bufferLabel, setBufferLabel] = useState<string>(
    "3-PIECE GARAGE ROCK MIX (DRUMS + SVT BASS + CRUNCH GTR + LEAD VOCAL)"
  );
  const [activePresetId, setActivePresetId] = useState<string>("trio-mix");
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [abMode, setAbMode] = useState<"DRY_INPUT" | "WET_OUTPUT">("WET_OUTPUT");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isRecordingMic, setIsRecordingMic] = useState<boolean>(false);
  const [pipelineHistory, setPipelineHistory] = useState<string[]>([
    "01. BOOT | 3-PIECE GARAGE ROCK DEMO LOADED (44.1kHz STEREO)",
  ]);

  // Tool Parameters & Select Options
  const [paramValues, setParamValues] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const tool of TOOLS) {
      for (const p of tool.params) {
        initial[p.id] = p.defaultValue;
      }
    }
    return initial;
  });
  const [selectValues, setSelectValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const tool of TOOLS) {
      for (const s of tool.selectControls ?? []) {
        initial[s.id] = s.defaultOption;
      }
    }
    return initial;
  });
  const [tapTimestamps, setTapTimestamps] = useState<number[]>([]);
  const [tappedBpm, setTappedBpm] = useState<number | null>(null);
  const [backendResponse, setBackendResponse] = useState<BackendToolResponse | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>(
    "SYSTEM READY | ZERO-LOGIN STATELESS 3-PIECE ROCK STUDIO WORKBENCH"
  );

  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const activeToolset = useMemo(
    () => TOOLSETS.find((ts) => ts.id === activeToolsetId) ?? TOOLSETS[1],
    [activeToolsetId]
  );

  const activeTool: ToolDefinition = useMemo(
    () => getToolById(activeToolId),
    [activeToolId]
  );

  const toolsInActiveSet = useMemo(
    () => getToolsForToolset(activeToolsetId),
    [activeToolsetId]
  );

  const droppedVoiceAiItems = useMemo(
    () => VOICE_AI_SCRAPE_AUDIT.filter((i) => i.status === "FILTERED_OUT"),
    []
  );

  const applyToolDefaults = useCallback((tool: ToolDefinition) => {
    setParamValues((prev) => {
      const next = { ...prev };
      for (const p of tool.params) {
        next[p.id] = p.defaultValue;
      }
      return next;
    });
    setSelectValues((prev) => {
      const next = { ...prev };
      for (const s of tool.selectControls ?? []) {
        next[s.id] = s.defaultOption;
      }
      return next;
    });
    if (tool.outputs.length > 0) {
      setSelectedOutputStemId(tool.outputs[0].id);
    }
  }, []);

  const ensureAudioContext = useCallback((): AudioContext => {
    if (!audioCtxRef.current) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }
    return audioCtxRef.current;
  }, []);

  const stopPlayback = useCallback(() => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch {
        // already stopped
      }
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  // Load initial 3-piece rock band demo stem on mount
  useEffect(() => {
    const ctx = ensureAudioContext();
    const demo = synthesizeDemoAudioBuffer(ctx, "trio-mix");
    setActiveBuffer(demo);
    setProcessedBuffer(demo);
    return () => {
      stopPlayback();
    };
  }, [ensureAudioContext, stopPlayback]);

  const currentAuditionBuffer = useMemo(() => {
    if (abMode === "WET_OUTPUT" && processedBuffer) return processedBuffer;
    return activeBuffer;
  }, [abMode, activeBuffer, processedBuffer]);

  const metrics: AudioMetrics | null = useMemo(() => {
    if (!currentAuditionBuffer) return null;
    return analyzeAudioBuffer(currentAuditionBuffer);
  }, [currentAuditionBuffer]);

  // Draw Brutalist stereo waveform & stem bars
  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || !currentAuditionBuffer) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx2d.fillStyle = highContrastDark ? "#0D0D0D" : "#F4F3EF";
    ctx2d.fillRect(0, 0, width, height);

    ctx2d.strokeStyle = highContrastDark ? "#262626" : "#D4D2C8";
    ctx2d.lineWidth = 1;
    for (let x = 0; x < width; x += Math.floor(width / 16)) {
      ctx2d.beginPath();
      ctx2d.moveTo(x, 0);
      ctx2d.lineTo(x, height);
      ctx2d.stroke();
    }
    for (let y = 0; y < height; y += Math.floor(height / 4)) {
      ctx2d.beginPath();
      ctx2d.moveTo(0, y);
      ctx2d.lineTo(width, y);
      ctx2d.stroke();
    }

    ctx2d.strokeStyle = highContrastDark ? "#404040" : "#8C8A80";
    ctx2d.beginPath();
    ctx2d.moveTo(0, height / 2);
    ctx2d.lineTo(width, height / 2);
    ctx2d.stroke();

    const ch0 = currentAuditionBuffer.getChannelData(0);
    const ch1 =
      currentAuditionBuffer.numberOfChannels > 1
        ? currentAuditionBuffer.getChannelData(1)
        : ch0;
    const numBars = 140;
    const samplesPerBar = Math.max(1, Math.floor(ch0.length / numBars));
    const barWidth = Math.max(2, Math.floor(width / numBars) - 2);

    const activeStemColor =
      activeTool.outputs.find((o) => o.id === selectedOutputStemId)?.color ?? "#B8FF01";

    for (let b = 0; b < numBars; b++) {
      let peakL = 0;
      let peakR = 0;
      const start = b * samplesPerBar;
      const step = Math.max(1, Math.floor(samplesPerBar / 32));
      for (let j = 0; j < samplesPerBar && start + j < ch0.length; j += step) {
        const aL = Math.abs(ch0[start + j]);
        const aR = Math.abs(ch1[start + j]);
        if (aL > peakL) peakL = aL;
        if (aR > peakR) peakR = aR;
      }

      const x = b * (width / numBars);
      const halfH = height / 2 - 8;
      const hL = Math.min(halfH, peakL * halfH * 1.15);
      const hR = Math.min(halfH, peakR * halfH * 1.15);

      ctx2d.fillStyle =
        peakL > 0.9 ? "#FF3B00" : abMode === "WET_OUTPUT" ? activeStemColor : "#00E5FF";
      ctx2d.fillRect(x, height / 2 - hL, barWidth, Math.max(2, hL));

      ctx2d.fillStyle = peakR > 0.9 ? "#FF3B00" : "#00E5FF";
      ctx2d.fillRect(x, height / 2 + 1, barWidth, Math.max(2, hR));
    }
  }, [currentAuditionBuffer, abMode, highContrastDark, activeTool.outputs, selectedOutputStemId]);

  // Sync with `/api/v1/tools/{slug}` backend endpoint
  useEffect(() => {
    if (!metrics) return;
    let cancelled = false;
    async function syncBackend() {
      if (!metrics) return;
      try {
        const res = await fetch(`/api/v1/tools/${activeTool.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tool_id: activeTool.id,
            tool_code: activeTool.code,
            sample_rate: metrics.sampleRate,
            channels: metrics.channels,
            duration_seconds: metrics.durationSec,
            peak_db: metrics.peakDb,
            rms_db: metrics.rmsDb,
            parameters: {
              ...paramValues,
              ...selectValues,
              detectedBpm: tappedBpm ?? metrics.detectedBpm,
            },
          }),
        });
        if (res.ok) {
          const data: BackendToolResponse = await res.json();
          if (!cancelled) setBackendResponse(data);
        }
      } catch {
        // Non-blocking telemetry
      }
    }
    syncBackend();
    return () => {
      cancelled = true;
    };
  }, [activeTool.id, activeTool.code, metrics, paramValues, selectValues, tappedBpm]);

  const handleLoadDemoPreset = (presetId: string) => {
    stopPlayback();
    const ctx = ensureAudioContext();
    const preset = DEMO_STEMS.find((d) => d.id === presetId) ?? DEMO_STEMS[0];
    const buf = synthesizeDemoAudioBuffer(ctx, preset.id);
    setActivePresetId(preset.id);
    setActiveBuffer(buf);
    setProcessedBuffer(buf);
    setBufferLabel(`${preset.label} (44.1kHz STEREO)`);
    setStatusMessage(`LOADED 3-PIECE ROCK DEMO // ${preset.label}`);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stopPlayback();
    setStatusMessage(`DECODING STUDIO FILE // ${file.name.toUpperCase()}...`);
    try {
      const ctx = ensureAudioContext();
      const arrayBuf = await file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuf);
      setActiveBuffer(decoded);
      setProcessedBuffer(decoded);
      setBufferLabel(`FILE: ${file.name.toUpperCase()}`);
      setPipelineHistory((prev) => [
        ...prev,
        `UPLOAD // ${file.name.toUpperCase()} (${decoded.sampleRate}Hz / ${decoded.duration.toFixed(2)}s)`,
      ]);
      setStatusMessage(`READY // DECODED ${file.name.toUpperCase()}`);
    } catch {
      setStatusMessage(`ERROR // FAILED TO DECODE ${file.name.toUpperCase()}`);
    }
  };

  const handleRunDsp = async (overrideStemId?: string) => {
    if (!activeBuffer) return;
    stopPlayback();
    const targetStem = overrideStemId ?? selectedOutputStemId;
    if (overrideStemId) setSelectedOutputStemId(overrideStemId);
    setIsProcessing(true);
    setStatusMessage(
      `RUNNING DSP KERNEL // [${activeTool.code}] ${activeTool.title.toUpperCase()} -> STEM [${targetStem.toUpperCase()}]...`
    );
    try {
      const rendered = await runToolDspRecipe(
        activeBuffer,
        activeTool.recipe,
        paramValues,
        targetStem
      );
      setProcessedBuffer(rendered);
      setAbMode("WET_OUTPUT");
      setStatusMessage(
        `DSP COMPLETE // [${activeTool.code}] STEM [${targetStem.toUpperCase()}] READY (${rendered.duration.toFixed(2)}s @ ${rendered.sampleRate}Hz)`
      );
    } catch {
      setStatusMessage(`DSP ERROR // FAILED TO RENDER ${activeTool.code}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePipeToTool = (nextToolId: ToolId) => {
    const sourceForPipe = processedBuffer ?? activeBuffer;
    if (!sourceForPipe) return;
    stopPlayback();
    const nextTool = getToolById(nextToolId);
    setActiveBuffer(sourceForPipe);
    setProcessedBuffer(sourceForPipe);
    setActiveToolsetId(nextTool.toolsetId);
    setActiveToolId(nextTool.id);
    applyToolDefaults(nextTool);
    setWorkspaceMode("RACK");
    setRightTab("WORKBENCH");
    const stamp = `PIPED [${activeTool.code} ${selectedOutputStemId.toUpperCase()}] -> [${nextTool.code} ${nextTool.title.toUpperCase()}]`;
    setBufferLabel(stamp);
    setPipelineHistory((prev) => [...prev, stamp]);
    setStatusMessage(stamp);
  };

  const handleTogglePlay = async () => {
    if (isPlaying) {
      stopPlayback();
      return;
    }
    const target = currentAuditionBuffer;
    if (!target) return;

    const ctx = ensureAudioContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    const src = ctx.createBufferSource();
    src.buffer = target;
    src.connect(ctx.destination);
    src.onended = () => setIsPlaying(false);
    sourceNodeRef.current = src;
    src.start(0);
    setIsPlaying(true);
  };

  const handleExportStemFile = (stemId?: string, ext: string = "wav") => {
    const target = currentAuditionBuffer;
    if (!target) return;
    const blob = encodeAudioBufferToWavBlob(target);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stemTag = stemId ?? selectedOutputStemId;
    a.download = `weaksauce-${activeTool.slug}-${stemTag}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatusMessage(
      `DOWNLOADED // weaksauce-${activeTool.slug}-${stemTag}.${ext}`
    );
  };

  const handleToggleMicRecord = async () => {
    if (isRecordingMic) {
      mediaRecorderRef.current?.stop();
      setIsRecordingMic(false);
      return;
    }
    try {
      const rawMode = (paramValues.rawStudioMode ?? 1) === 1;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: !rawMode,
          noiseSuppression: !rawMode,
          autoGainControl: !rawMode,
        },
      });
      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordedChunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordedChunksRef.current);
        const arrayBuf = await blob.arrayBuffer();
        const ctx = ensureAudioContext();
        const decoded = await ctx.decodeAudioData(arrayBuf);
        setActiveBuffer(decoded);
        setProcessedBuffer(decoded);
        setBufferLabel("LIVE STUDIO MIC TAKE (RAW UNCOMPRESSED)");
        setPipelineHistory((prev) => [
          ...prev,
          `MIC CAPTURE // ${decoded.duration.toFixed(2)}s RAW STUDIO TAKE`,
        ]);
        setStatusMessage("CAPTURED LIVE STUDIO MIC TAKE INTO GLOBAL BUS");
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecordingMic(true);
      setStatusMessage(
        "RECORDING LIVE STUDIO MICROPHONE (WEBRTC AUTO-GAIN/NOISE-GATE DISABLED)..."
      );
    } catch {
      setStatusMessage(
        "MIC ACCESS UNAVAILABLE IN HEADLESS SESSION — LOAD 3-PIECE ROCK DEMO TRACK ABOVE"
      );
    }
  };

  const handleTapTempo = () => {
    const now = performance.now();
    const recent = [...tapTimestamps.filter((t) => now - t < 4000), now];
    setTapTimestamps(recent);
    if (recent.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < recent.length; i++) {
        intervals.push(recent[i] - recent[i - 1]);
      }
      const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      setTappedBpm(Math.round((60000 / avgMs) * 10) / 10);
    }
  };

  const handleSelectToolset = (id: ToolsetId) => {
    setActiveToolsetId(id);
    if (id === "all") {
      setWorkspaceMode("GRID");
      return;
    }
    const setTools = getToolsForToolset(id);
    if (setTools.length > 0) {
      setActiveToolId(setTools[0].id);
      applyToolDefaults(setTools[0]);
      setWorkspaceMode("RACK");
    }
  };

  const handleSelectTool = (tool: ToolDefinition) => {
    setActiveToolsetId(tool.toolsetId);
    setActiveToolId(tool.id);
    applyToolDefaults(tool);
    setWorkspaceMode("RACK");
  };

  return (
    <div
      className={`min-h-screen flex flex-col font-mono selection:bg-[#B8FF01] selection:text-[#0D0D0D] ${
        highContrastDark
          ? "bg-[#0D0D0D] text-[#F4F3EF]"
          : "bg-[#F4F3EF] text-[#0D0D0D]"
      }`}
    >
      {/* TOP BRUTALIST SYSTEM BAR */}
      <header
        className={`border-b-2 ${
          highContrastDark ? "border-[#F4F3EF] bg-[#121212]" : "border-[#0D0D0D] bg-[#E8E6DF]"
        } px-3 py-2 flex flex-wrap items-center justify-between gap-2`}
      >
        <div className="flex items-center gap-3">
          <div className="bg-[#B8FF01] text-[#0D0D0D] border-2 border-[#0D0D0D] px-2.5 py-1 font-black tracking-tighter text-sm sm:text-base shadow-[3px_3px_0px_#FF3B00]">
            WEAKSAUCE // 3-PIECE STUDIO LAB
          </div>
          <div className="hidden md:flex flex-col">
            <span className="text-xs font-extrabold tracking-wider uppercase text-[#B8FF01]">
              {APP_CONFIG.bandProfileTitle}
            </span>
            <span className="text-[11px] opacity-75">
              ZERO-LOGIN OPEN-SOURCE AUDIO WORKBENCH // REF: VOICE.AI/TOOLS (4 TOOLSETS / 8 BAND TOOLS)
            </span>
          </div>
        </div>

        {/* GLOBAL TELEMETRY & AUDIT BUTTONS */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {metrics && (
            <div className="hidden xl:flex items-center gap-2 border-2 border-current px-2.5 py-1 bg-black/20">
              <span className="text-[#00E5FF] font-bold">
                KEY: {metrics.detectedKey} [{metrics.camelotCode}]
              </span>
              <span>|</span>
              <span className="text-[#B8FF01] font-bold">
                BPM: {tappedBpm ?? metrics.detectedBpm}
              </span>
              <span>|</span>
              <span>
                1/4 DELAY: {metrics.delaySubdivisionsMs.quarterMs}ms
              </span>
              <span>|</span>
              <span className={metrics.peakDb > -0.3 ? "text-[#FF3B00] font-bold" : ""}>
                PEAK: {metrics.peakDb} dBFS
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() =>
              setWorkspaceMode((m) => (m === "VOICE_AI_AUDIT" ? "RACK" : "VOICE_AI_AUDIT"))
            }
            className={`px-2.5 py-1 border-2 font-bold uppercase cursor-pointer ${
              workspaceMode === "VOICE_AI_AUDIT"
                ? "bg-[#FF3B00] text-[#0D0D0D] border-[#F4F3EF]"
                : "border-current hover:bg-[#FF3B00] hover:text-[#0D0D0D]"
            }`}
          >
            VOICE.AI SCRAPE & FILTER AUDIT (11→8)
          </button>

          <button
            type="button"
            onClick={() => setHighContrastDark((d) => !d)}
            className="px-2.5 py-1 border-2 border-current font-bold uppercase cursor-pointer hover:bg-[#B8FF01] hover:text-[#0D0D0D]"
          >
            {highContrastDark ? "THEME: STUDIO CARBON" : "THEME: RAW NEWSPRINT"}
          </button>
        </div>
      </header>

      {/* MAIN SPLIT SHELL: LEFT NAVIGATION RAIL (4 ROCK TOOLSETS) + RIGHT WORKSPACE */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* LEFT NAVIGATION RAIL */}
        <aside
          aria-label="Rock Band Audio Toolsets"
          className={`w-full lg:w-[320px] xl:w-[350px] shrink-0 border-b-2 lg:border-b-0 lg:border-r-2 ${
            highContrastDark ? "border-[#F4F3EF] bg-[#111111]" : "border-[#0D0D0D] bg-[#EAE8E1]"
          } flex flex-col justify-between overflow-y-auto`}
        >
          <div>
            <div className="p-3 border-b-2 border-current flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-widest text-[#FF3B00]">
                  LEFT MENU // ROCK STUDIO TOOLSETS
                </div>
                <div className="text-xs font-bold">
                  4 TOOLSETS • 8 VOICE.AI BAND TOOLS
                </div>
              </div>
              <span className="text-[10px] font-black px-1.5 py-0.5 bg-[#B8FF01] text-[#0D0D0D]">
                ZERO-LOGIN
              </span>
            </div>

            <nav className="divide-y-2 divide-current">
              {TOOLSETS.map((ts) => {
                const isSelected = ts.id === activeToolsetId;
                const setTools = getToolsForToolset(ts.id);

                return (
                  <div key={ts.id} className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => handleSelectToolset(ts.id)}
                      className={`w-full text-left p-3 transition-none cursor-pointer flex flex-col gap-1 ${
                        isSelected
                          ? "bg-[#B8FF01] text-[#0D0D0D]"
                          : "hover:bg-[#FF3B00]/15"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-black text-xs sm:text-sm tracking-tight uppercase">
                          {ts.shortLabel}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 border ${
                            isSelected
                              ? "border-[#0D0D0D] bg-[#0D0D0D] text-[#B8FF01]"
                              : "border-current"
                          }`}
                        >
                          {setTools.length} TOOLS
                        </span>
                      </div>
                      <p
                        className={`text-[11px] leading-tight ${
                          isSelected ? "text-[#0D0D0D] font-semibold" : "opacity-75"
                        }`}
                      >
                        {ts.description}
                      </p>
                    </button>

                    {/* Nested tool buttons for the 4 category toolsets */}
                    {isSelected && ts.id !== "all" && (
                      <div
                        className={`border-t-2 border-current divide-y divide-current/30 ${
                          highContrastDark ? "bg-[#181818]" : "bg-[#DFDDD4]"
                        }`}
                      >
                        {setTools.map((tool) => {
                          const isToolActive =
                            tool.id === activeToolId && workspaceMode === "RACK";
                          return (
                            <button
                              key={tool.id}
                              type="button"
                              onClick={() => handleSelectTool(tool)}
                              className={`w-full text-left px-3 py-2.5 text-xs flex items-center justify-between gap-2 cursor-pointer ${
                                isToolActive
                                  ? "bg-[#FF3B00] text-[#0D0D0D] font-black"
                                  : "hover:bg-[#B8FF01]/20"
                              }`}
                            >
                              <div className="flex flex-col truncate">
                                <span className="truncate font-bold">
                                  [{tool.code}] {tool.title}
                                </span>
                                <span
                                  className={`text-[10px] truncate ${
                                    isToolActive ? "text-[#0D0D0D]/80" : "opacity-65"
                                  }`}
                                >
                                  voice.ai{tool.voiceAiRoute}
                                </span>
                              </div>
                              <span
                                className={`shrink-0 text-[9px] px-1.5 py-0.5 font-black uppercase ${
                                  isToolActive
                                    ? "bg-[#0D0D0D] text-[#B8FF01]"
                                    : "bg-[#00E5FF] text-[#0D0D0D]"
                                }`}
                              >
                                {tool.outputs.length} OUT
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </div>

          {/* FILTERED-OUT TRANSPARENCY DRAWER (DROPPED FROM VOICE.AI [3]) + SIGNAL LOG */}
          <div className="p-3 border-t-2 border-current text-[11px] space-y-2.5">
            <div className="border-2 border-[#FF3B00] p-2 bg-[#FF3B00]/10">
              <button
                type="button"
                onClick={() => setShowDroppedDrawer((v) => !v)}
                className="w-full flex items-center justify-between font-black uppercase text-[#FF3B00] cursor-pointer text-left"
              >
                <span>DROPPED FROM VOICE.AI [{droppedVoiceAiItems.length}]</span>
                <span>{showDroppedDrawer ? "▲ HIDE" : "▼ WHY DROPPED"}</span>
              </button>
              {showDroppedDrawer && (
                <div className="mt-2 space-y-1.5 text-[10px] border-t border-[#FF3B00]/40 pt-1.5">
                  {droppedVoiceAiItems.map((item) => (
                    <div key={item.name}>
                      <strong className="text-[#FF3B00]">✕ {item.name}:</strong>{" "}
                      <span className="opacity-85">{item.filterReason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="font-black uppercase text-[#00E5FF]">
              BAND AUDIO PIPELINE LOG ({pipelineHistory.length})
            </div>
            <div className="max-h-24 overflow-y-auto space-y-1 border border-current/40 p-2 bg-black/30">
              {pipelineHistory.map((item, idx) => (
                <div key={`${item}-${idx}`} className="truncate">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* RIGHT-HAND MAIN WORKSPACE */}
        <main className="flex-1 flex flex-col overflow-y-auto">
          {/* WORKSPACE SUB-HEADER */}
          <div
            className={`border-b-2 border-current p-3 flex flex-wrap items-center justify-between gap-3 ${
              highContrastDark ? "bg-[#161616]" : "bg-[#E4E2DA]"
            }`}
          >
            <div>
              <div className="text-[11px] font-bold uppercase text-[#00E5FF]">
                {activeToolset.shortLabel} | SOURCE ROUTE: VOICE.AI{activeTool.voiceAiRoute}
              </div>
              <h1 className="text-lg sm:text-xl font-black uppercase tracking-tight">
                [{activeTool.code}] {activeTool.title}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setWorkspaceMode("RACK");
                  setRightTab("WORKBENCH");
                }}
                className={`px-3 py-1.5 border-2 font-black uppercase cursor-pointer ${
                  workspaceMode === "RACK" && rightTab === "WORKBENCH"
                    ? "bg-[#B8FF01] text-[#0D0D0D] border-[#0D0D0D] shadow-[3px_3px_0px_#FF3B00]"
                    : "border-current"
                }`}
              >
                01. ACTIVE TOOL RACK
              </button>
              <button
                type="button"
                onClick={() => {
                  setWorkspaceMode("RACK");
                  setRightTab("OSS_SPEC");
                }}
                className={`px-3 py-1.5 border-2 font-black uppercase cursor-pointer ${
                  workspaceMode === "RACK" && rightTab === "OSS_SPEC"
                    ? "bg-[#FF3B00] text-[#0D0D0D] border-[#0D0D0D] shadow-[3px_3px_0px_#B8FF01]"
                    : "border-current"
                }`}
              >
                02. OSS SPEC & ARCHITECTURE PLAN
              </button>
              <button
                type="button"
                onClick={() => setWorkspaceMode("GRID")}
                className={`px-3 py-1.5 border-2 font-black uppercase cursor-pointer ${
                  workspaceMode === "GRID"
                    ? "bg-[#00E5FF] text-[#0D0D0D] border-[#0D0D0D] shadow-[3px_3px_0px_#FF3B00]"
                    : "border-current"
                }`}
              >
                03. VIEW RIGHT-PANEL TOOL GRID ({toolsInActiveSet.length})
              </button>
            </div>
          </div>

          {/* SHARED 3-PIECE ROCK BAND I/O DECK */}
          <section className="p-4 border-b-2 border-current space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-black uppercase px-2 py-1 bg-[#FF3B00] text-[#0D0D0D]">
                  LOAD 3-PIECE ROCK DEMO TRACK
                </span>
                {DEMO_STEMS.map((stem) => (
                  <button
                    key={stem.id}
                    type="button"
                    onClick={() => handleLoadDemoPreset(stem.id)}
                    className={`text-xs px-2.5 py-1 border-2 font-bold uppercase cursor-pointer ${
                      activePresetId === stem.id
                        ? "bg-[#B8FF01] text-[#0D0D0D] border-[#0D0D0D]"
                        : "border-current hover:bg-[#B8FF01]/20"
                    }`}
                  >
                    {stem.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs px-3 py-1 border-2 border-current font-black uppercase cursor-pointer bg-[#00E5FF] text-[#0D0D0D] hover:bg-[#B8FF01]">
                  UPLOAD FILE ({activeTool.acceptedFormats.slice(0, 4).join(", ")})
                  <input
                    type="file"
                    accept="audio/*,video/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={handleToggleMicRecord}
                  className={`text-xs px-3 py-1 border-2 font-black uppercase cursor-pointer ${
                    isRecordingMic
                      ? "bg-[#FF3B00] text-[#0D0D0D] animate-pulse border-[#F4F3EF]"
                      : "border-current hover:bg-[#FF3B00] hover:text-[#0D0D0D]"
                  }`}
                >
                  {isRecordingMic ? "■ STOP STUDIO MIC" : "● REC RAW STUDIO MIC"}
                </button>
              </div>
            </div>

            {/* WAVEFORM PLAYER & MULTI-STEM OUTPUT SELECTOR */}
            <div className="relative border-2 border-current bg-[#0D0D0D] p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between text-[11px] text-[#F4F3EF] gap-2">
                <div className="font-bold">
                  ACTIVE BUS: <span className="text-[#B8FF01]">{bufferLabel}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[#B8FF01]">
                    STEM: {selectedOutputStemId.toUpperCase()}
                  </span>
                  {metrics && (
                    <span>
                      {metrics.durationSec}s | {metrics.sampleRate}Hz | PHASE:{" "}
                      {metrics.phaseCorrelation}
                    </span>
                  )}
                </div>
              </div>

              <canvas
                ref={waveformCanvasRef}
                width={1080}
                height={145}
                className="w-full h-[130px] block border border-[#333333]"
              />

              {/* VOICE.AI PARITY OUTPUT STEM ROWS */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1">
                {activeTool.outputs.map((stem) => {
                  const isStemSelected = stem.id === selectedOutputStemId;
                  return (
                    <div
                      key={stem.id}
                      className={`border-2 p-2 flex items-center justify-between gap-2 text-xs ${
                        isStemSelected
                          ? "border-[#B8FF01] bg-[#1D240B] text-[#F4F3EF]"
                          : "border-[#333333] bg-[#141414] text-[#F4F3EF]"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleRunDsp(stem.id)}
                        className="text-left flex items-center gap-2 cursor-pointer flex-1 truncate"
                      >
                        <span
                          style={{ backgroundColor: stem.color }}
                          className="w-3 h-3 shrink-0 border border-black"
                        />
                        <span className="font-bold truncate">{stem.label}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportStemFile(stem.id, "wav")}
                        className="px-2 py-0.5 border border-[#F4F3EF] text-[10px] font-black uppercase hover:bg-[#B8FF01] hover:text-[#0D0D0D] cursor-pointer shrink-0"
                      >
                        DL WAV
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* TRANSPORT & PIPE TO NEXT TOOL BAR */}
              <div className="pt-2 border-t border-[#333333] flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTogglePlay}
                    className={`px-4 py-1.5 border-2 font-black text-xs uppercase cursor-pointer ${
                      isPlaying
                        ? "bg-[#FF3B00] text-[#0D0D0D] border-[#F4F3EF]"
                        : "bg-[#B8FF01] text-[#0D0D0D] border-[#0D0D0D]"
                    }`}
                  >
                    {isPlaying ? "■ STOP PLAYBACK" : "▶ PLAY ACTIVE STEM / BUS"}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setAbMode((m) => (m === "WET_OUTPUT" ? "DRY_INPUT" : "WET_OUTPUT"))
                    }
                    className={`px-3 py-1.5 border-2 text-xs font-black uppercase cursor-pointer ${
                      abMode === "WET_OUTPUT"
                        ? "bg-[#00E5FF] text-[#0D0D0D] border-[#0D0D0D]"
                        : "bg-[#222222] text-[#F4F3EF] border-[#F4F3EF]"
                    }`}
                  >
                    A/B: {abMode === "WET_OUTPUT" ? "WET (PROCESSED)" : "DRY (ORIGINAL)"}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRunDsp()}
                    disabled={isProcessing}
                    className="px-4 py-1.5 border-2 border-[#0D0D0D] bg-[#FF3B00] text-[#0D0D0D] font-black text-xs uppercase cursor-pointer hover:bg-[#B8FF01]"
                  >
                    {isProcessing
                      ? "PROCESSING DSP..."
                      : `⚡ PROCESS [${activeTool.code}] NOW (0s WAIT)`}
                  </button>
                </div>

                {/* CROSS-TOOL PIPELINE SELECTOR */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-black uppercase text-[#00E5FF]">
                    SEND OUTPUT TO TOOL →
                  </span>
                  {TOOLS.filter((t) => t.id !== activeTool.id)
                    .slice(0, 4)
                    .map((targetTool) => (
                      <button
                        key={targetTool.id}
                        type="button"
                        onClick={() => handlePipeToTool(targetTool.id)}
                        className="px-2 py-1 border border-[#B8FF01] text-[#B8FF01] text-[10px] font-black uppercase hover:bg-[#B8FF01] hover:text-[#0D0D0D] cursor-pointer"
                      >
                        [{targetTool.code}]
                      </button>
                    ))}
                </div>
              </div>
            </div>

            {/* STATUS TICKER */}
            <div className="text-xs font-bold px-2.5 py-1 border-2 border-current bg-black/20 flex flex-wrap items-center justify-between gap-2">
              <span>STATUS: {statusMessage}</span>
              {backendResponse && (
                <span className="text-[#B8FF01]">
                  FASTAPI TELEMETRY: {backendResponse.estimated_lufs} LUFS | -14 LUFS DELTA:{" "}
                  {backendResponse.recommended_gain_delta_db >= 0 ? "+" : ""}
                  {backendResponse.recommended_gain_delta_db} dB
                </span>
              )}
            </div>
          </section>

          {/* WORKSPACE CONTENT: VOICE.AI AUDIT MATRIX / TOOLSET GRID / OSS SPEC / ACTIVE RACK */}
          {workspaceMode === "VOICE_AI_AUDIT" ? (
            <section className="p-4 space-y-4">
              <div className="border-2 border-current p-4 space-y-2">
                <div className="text-xs font-black uppercase text-[#FF3B00]">
                  COMPLETE SCRAPE & FILTER AUDIT // HTTPS://VOICE.AI/TOOLS
                </div>
                <h2 className="text-lg font-black uppercase">
                  11 RAW VOICE.AI ITEMS → 8 ROCK BAND TOOLS IN 4 LEFT-MENU TOOLSETS
                </h2>
                <p className="text-xs opacity-85">
                  Filtered specifically for{" "}
                  <strong>
                    a 3-piece home recording rock band with an engineer/tinkerer/singer guy (Jeff)
                  </strong>
                  . We stripped out SaaS narration (`Text to Speech`), B2B call-center bots (`Voice
                  Agent`), and fake 40–60s queue paywall timers, reframed `Voice Changer` into the{" "}
                  <strong>Vocal Pitch, Formant & Doubler Lab</strong>, and prioritized the 6-stem{" "}
                  <strong>Stem Splitter</strong> (`Vocals, Guitar, Bass, Drums, Piano, Other`).
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {VOICE_AI_SCRAPE_AUDIT.map((item) => {
                  const isKept = item.status !== "FILTERED_OUT";
                  const linkedTool = item.mappedToolId
                    ? getToolById(item.mappedToolId)
                    : undefined;
                  return (
                    <div
                      key={item.order}
                      className={`border-2 p-3 flex flex-col justify-between gap-2 ${
                        isKept
                          ? "border-current"
                          : "border-[#FF3B00] bg-[#FF3B00]/10"
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-black text-sm uppercase">
                            #{item.order} {item.name}
                            {item.reframedName ? ` → ${item.reframedName}` : ""}
                          </span>
                          <span
                            className={`text-[10px] font-black px-2 py-0.5 uppercase ${
                              item.status === "FILTERED_OUT"
                                ? "bg-[#FF3B00] text-[#0D0D0D]"
                                : item.status === "KEPT_HIGHEST_PRIORITY"
                                ? "bg-[#B8FF01] text-[#0D0D0D]"
                                : "bg-[#00E5FF] text-[#0D0D0D]"
                            }`}
                          >
                            {item.status}
                          </span>
                        </div>
                        <div className="text-[11px] opacity-75">
                          SOURCE: <code>{item.href}</code>
                        </div>
                        <p className="text-xs">{item.filterReason}</p>
                      </div>

                      {linkedTool && (
                        <button
                          type="button"
                          onClick={() => handleSelectTool(linkedTool)}
                          className="self-start text-xs font-black uppercase px-2.5 py-1 border-2 border-[#0D0D0D] bg-[#B8FF01] text-[#0D0D0D] cursor-pointer hover:bg-[#00E5FF]"
                        >
                          OPEN [{linkedTool.code}] {linkedTool.title} →
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : workspaceMode === "GRID" ? (
            <section className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-black uppercase">
                  {activeToolset.shortLabel} — RIGHT-PANEL TOOL GRID ({toolsInActiveSet.length} TOOLS)
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {toolsInActiveSet.map((tool) => (
                  <div
                    key={tool.id}
                    className="border-2 border-current p-4 flex flex-col justify-between gap-3 shadow-[4px_4px_0px_#FF3B00]"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black px-2 py-0.5 bg-[#B8FF01] text-[#0D0D0D]">
                          {tool.code} | SET {tool.toolsetCode}
                        </span>
                        <span className="text-[10px] font-black px-2 py-0.5 bg-[#00E5FF] text-[#0D0D0D]">
                          VOICE.AI: {tool.voiceAiRoute}
                        </span>
                      </div>
                      <h3 className="text-base font-black uppercase">{tool.title}</h3>
                      <p className="text-xs opacity-85">{tool.tagline}</p>
                      <div className="text-[11px] p-2 border border-current/40 bg-black/20">
                        <strong className="text-[#B8FF01]">JEFF / 3-PIECE BAND USE CASE:</strong>{" "}
                        {tool.bandUseCase}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {tool.outputs.map((out) => (
                          <span
                            key={out.id}
                            style={{ borderColor: out.color }}
                            className="text-[10px] font-bold px-1.5 py-0.5 border"
                          >
                            OUT: {out.label}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-current/30">
                      <code className="text-[10px] opacity-75">{tool.workerTrackFile}</code>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            handleSelectTool(tool);
                            setRightTab("OSS_SPEC");
                          }}
                          className="text-xs font-bold uppercase px-2.5 py-1 border-2 border-current cursor-pointer hover:bg-[#FF3B00] hover:text-[#0D0D0D]"
                        >
                          OSS SPEC
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleSelectTool(tool);
                            setRightTab("WORKBENCH");
                          }}
                          className="text-xs font-black uppercase px-3 py-1 border-2 border-[#0D0D0D] bg-[#B8FF01] text-[#0D0D0D] cursor-pointer hover:bg-[#00E5FF]"
                        >
                          OPEN RACK →
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : rightTab === "OSS_SPEC" ? (
            /* BRUTALIST OSS SPEC & ARCHITECTURE PLAN DRAWER/TAB */
            <section className="p-4 space-y-4">
              <div className="border-2 border-current p-4 shadow-[4px_4px_0px_#B8FF01] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-current pb-2">
                  <div>
                    <span className="text-xs font-black uppercase text-[#FF3B00]">
                      OSS SPEC & ARCHITECTURE PLAN | {activeTool.code} ({activeTool.voiceAiRoute})
                    </span>
                    <h2 className="text-lg font-black uppercase">
                      [{activeTool.code}] {activeTool.title}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2.5 py-1 bg-[#B8FF01] text-[#0D0D0D]">
                      WORKER: {activeTool.workerTrackFile}
                    </span>
                    <span className="text-xs font-bold px-2.5 py-1 bg-[#00E5FF] text-[#0D0D0D]">
                      API: POST {activeTool.apiEndpoint}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="border-2 border-current p-3 space-y-2">
                    <div className="font-black uppercase text-[#B8FF01]">
                      CLIENT-SIDE WEB AUDIO / WASM OPEN-SOURCE STACK
                    </div>
                    <ul className="list-disc list-inside space-y-1">
                      {activeTool.openSourceStack.client.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="border-2 border-current p-3 space-y-2">
                    <div className="font-black uppercase text-[#FF3B00]">
                      PYTHON FASTAPI SERVERLESS DSP STACK
                    </div>
                    <ul className="list-disc list-inside space-y-1">
                      {activeTool.openSourceStack.backend.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="border-2 border-current p-3 space-y-2">
                    <div className="font-black uppercase text-[#00E5FF]">
                      BRUTALIST UI COMPONENT SPECIFICATION
                    </div>
                    <ul className="list-disc list-inside space-y-1">
                      {activeTool.uiComponentSpec.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="border-2 border-current p-3 space-y-2">
                    <div className="font-black uppercase text-[#B8FF01]">
                      DSP SIGNAL ARCHITECTURE & ACCEPTED FORMATS
                    </div>
                    <p className="leading-relaxed">{activeTool.dspArchitecture}</p>
                    <div className="pt-2 border-t border-current/30 text-[11px]">
                      <strong>ACCEPTED FORMATS:</strong>{" "}
                      {activeTool.acceptedFormats.join(" • ")}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ) : (
            /* ACTIVE INTERACTIVE DSP RACK */
            <section className="p-4 grid grid-cols-1 xl:grid-cols-3 gap-4">
              {/* PARAMETER FADERS & SELECTORS (2 COLS) */}
              <div className="xl:col-span-2 border-2 border-current p-4 space-y-4 shadow-[4px_4px_0px_#00E5FF]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-current pb-2">
                  <div>
                    <span className="text-xs font-black uppercase text-[#B8FF01]">
                      INTERACTIVE ROCK STUDIO RACK | {activeTool.code}
                    </span>
                    <h2 className="text-base font-black uppercase">{activeTool.tagline}</h2>
                  </div>
                  <span className="text-[11px] font-black px-2 py-0.5 bg-[#FF3B00] text-[#0D0D0D]">
                    VOICE.AI PARITY: {activeTool.voiceAiOriginalName}
                  </span>
                </div>

                <p className="text-xs opacity-90">{activeTool.description}</p>

                <div className="p-2.5 border-2 border-current bg-black/25 text-xs">
                  <span className="font-black text-[#00E5FF] uppercase">
                    3-PIECE BAND USE CASE (JEFF):{" "}
                  </span>
                  {activeTool.bandUseCase}
                </div>

                {/* SELECT DROPDOWN / MODE BUTTONS IF PRESENT */}
                {activeTool.selectControls && activeTool.selectControls.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {activeTool.selectControls.map((sel) => {
                      const currentChoice = selectValues[sel.id] ?? sel.defaultOption;
                      return (
                        <div
                          key={sel.id}
                          className="border-2 border-current p-3 space-y-2 bg-black/15"
                        >
                          <label className="block text-xs font-black uppercase text-[#B8FF01]">
                            {sel.label}
                          </label>
                          <select
                            value={currentChoice}
                            onChange={(e) =>
                              setSelectValues((prev) => ({
                                ...prev,
                                [sel.id]: e.target.value,
                              }))
                            }
                            className="w-full p-2 border-2 border-current bg-[#0D0D0D] text-[#F4F3EF] text-xs font-bold"
                          >
                            {sel.options.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* NUMERIC DSP SLIDERS */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  {activeTool.params.map((param) => {
                    const val = paramValues[param.id] ?? param.defaultValue;
                    return (
                      <div
                        key={param.id}
                        className="border-2 border-current p-3 flex flex-col gap-2 bg-black/15"
                      >
                        <div className="flex items-center justify-between text-xs font-black">
                          <span>{param.label}</span>
                          <span className="px-2 py-0.5 bg-[#B8FF01] text-[#0D0D0D]">
                            {val} {param.unit}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={param.min}
                          max={param.max}
                          step={param.step}
                          value={val}
                          onChange={(e) =>
                            setParamValues((prev) => ({
                              ...prev,
                              [param.id]: parseFloat(e.target.value),
                            }))
                          }
                          className="w-full accent-[#FF3B00] cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] opacity-65">
                          <span>
                            MIN: {param.min} {param.unit}
                          </span>
                          <span>
                            DEFAULT: {param.defaultValue} {param.unit}
                          </span>
                          <span>
                            MAX: {param.max} {param.unit}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ACTION BUTTONS */}
                <div className="pt-2 border-t-2 border-current flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleRunDsp()}
                      className="px-4 py-2 border-2 border-[#0D0D0D] bg-[#B8FF01] text-[#0D0D0D] font-black text-xs uppercase cursor-pointer shadow-[3px_3px_0px_#FF3B00]"
                    >
                      RENDER & AUDITION [{activeTool.code}]
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const reset: Record<string, number> = {};
                        for (const p of activeTool.params) reset[p.id] = p.defaultValue;
                        setParamValues(reset);
                      }}
                      className="px-3 py-2 border-2 border-current text-xs font-bold uppercase cursor-pointer hover:bg-[#FF3B00] hover:text-[#0D0D0D]"
                    >
                      RESET KNOBS
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleTapTempo}
                    className="px-3 py-2 border-2 border-current bg-[#00E5FF] text-[#0D0D0D] font-black text-xs uppercase cursor-pointer"
                  >
                    SPACEBAR / CLICK TAP TEMPO {tappedBpm ? `(${tappedBpm} BPM)` : ""}
                  </button>
                </div>
              </div>

              {/* RIGHT TELEMETRY: KEY/BPM, GUITAR DELAY CALCULATOR & CHROMA (1 COL) */}
              <div className="border-2 border-current p-4 space-y-4 shadow-[4px_4px_0px_#FF3B00]">
                <div className="border-b-2 border-current pb-2">
                  <span className="text-xs font-black uppercase text-[#00E5FF]">
                    STUDIO BUS TELEMETRY
                  </span>
                  <h3 className="text-sm font-black uppercase">
                    KEY / BPM + GUITAR PEDAL DELAY + LUFS
                  </h3>
                </div>

                {metrics && (
                  <>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="border-2 border-current p-2">
                        <div className="text-[10px] opacity-70">DETECTED KEY</div>
                        <div className="text-sm font-black text-[#B8FF01]">
                          {metrics.detectedKey} ({metrics.camelotCode})
                        </div>
                      </div>
                      <div className="border-2 border-current p-2">
                        <div className="text-[10px] opacity-70">240HZ BEAT BPM</div>
                        <div className="text-sm font-black text-[#00E5FF]">
                          {tappedBpm ?? metrics.detectedBpm} BPM
                        </div>
                      </div>
                      <div className="border-2 border-current p-2">
                        <div className="text-[10px] opacity-70">INTEGRATED LUFS</div>
                        <div className="text-sm font-black">{metrics.estimatedLufs} LUFS</div>
                      </div>
                      <div className="border-2 border-current p-2">
                        <div className="text-[10px] opacity-70">PEAK / CREST</div>
                        <div className="text-sm font-black">
                          {metrics.peakDb} dB / {metrics.crestFactorDb} dB
                        </div>
                      </div>
                    </div>

                    {/* GUITAR PEDAL & STUDIO REVERB DELAY TIME CALCULATOR (MS) */}
                    <div className="border-2 border-current p-2.5 space-y-1.5 text-xs bg-black/20">
                      <div className="font-black uppercase text-[#FF3B00]">
                        GUITAR PEDAL DELAY SUBDIVISIONS (@ {tappedBpm ?? metrics.detectedBpm} BPM)
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-[11px]">
                        <div>
                          1/4 NOTE: <strong>{metrics.delaySubdivisionsMs.quarterMs} ms</strong>
                        </div>
                        <div>
                          1/8 DOTTED:{" "}
                          <strong className="text-[#B8FF01]">
                            {metrics.delaySubdivisionsMs.dottedEighthMs} ms
                          </strong>
                        </div>
                        <div>
                          1/8 NOTE: <strong>{metrics.delaySubdivisionsMs.eighthMs} ms</strong>
                        </div>
                        <div>
                          1/16 SLAPBACK:{" "}
                          <strong className="text-[#00E5FF]">
                            {metrics.delaySubdivisionsMs.slapbackSixteenthMs} ms
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* 12-BIN CHROMA ENERGY BARS */}
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-black uppercase">
                        12-BIN CHROMAGRAM ENERGY (ROOT / 4TH / 5TH)
                      </div>
                      <div className="grid grid-cols-12 gap-1 items-end h-24 border-2 border-current p-2 bg-[#0D0D0D]">
                        {metrics.chromaEnergy.map((item) => (
                          <div
                            key={item.note}
                            className="flex flex-col items-center justify-end h-full gap-1"
                          >
                            <div
                              style={{ height: `${Math.max(8, item.energy)}%` }}
                              className={`w-full ${
                                item.energy > 80
                                  ? "bg-[#FF3B00]"
                                  : item.energy > 50
                                  ? "bg-[#B8FF01]"
                                  : "bg-[#00E5FF]"
                              }`}
                            />
                            <span className="text-[9px] font-bold text-[#F4F3EF]">
                              {item.note}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
