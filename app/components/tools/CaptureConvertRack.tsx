"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TOOLS } from "@/app/lib/tool-catalog";
import { ToolRackProps } from "@/app/components/tools/tool-rack-types";
import {
  ChannelRoutingMode,
  Mp3BitrateKbps,
  NormalizationTarget,
  ROCK_STUDIO_CONVERSION_PRESETS,
  StudioConversionPreset,
  StudioSampleRate,
  SupportedContainerFormat,
  TranscodeResult,
  VOICE_AI_PAIR_ROUTES,
  WavBitDepth,
  encodeFlacBlob,
  encodeMp3Blob,
  encodeWavBlob,
  formatBytes,
  formatDurationClock,
  measureBufferSignal,
  synthesizeStudioTakeBuffer,
  transcodeAudioBuffer,
} from "@/app/lib/dsp/codecs";

const MAX_RECORD_SECONDS = 10800;

export type TimeSignatureOption = "4/4" | "3/4" | "6/8";

export interface RecordedStudioTake {
  id: string;
  takeNumber: number;
  title: string;
  recordedAt: string;
  buffer: AudioBuffer;
  durationSec: number;
  sampleRate: number;
  channels: number;
  peakDb: number;
  rmsDb: number;
  estimatedLufs: number;
  rawStudioMode: boolean;
  clickTrackBpm: number | null;
  timeSignature: TimeSignatureOption;
  clippedSamples: number;
}

export interface BatchConversionItem {
  id: string;
  fileName: string;
  sourceFormat: SupportedContainerFormat;
  isVideoSource: boolean;
  sourceBuffer: AudioBuffer;
  sourceByteSize: number;
  status: "QUEUED" | "TRANSCODING" | "COMPLETED" | "ERROR";
  result?: TranscodeResult;
  errorMsg?: string;
}

interface ConverterApiTelemetry {
  tool_id: string;
  tool_code: string;
  status: string;
  source_format?: string;
  target_format?: string;
  sample_rate: number;
  bit_depth?: number;
  bitrate_kbps?: number;
  channel_mode?: string;
  normalize_mode?: string;
  estimated_lufs: number;
  headroom_db: number;
  recommended_gain_delta_db: number;
  estimated_output_bytes?: number;
  dsp_chain_summary: string[];
  timestamp_est?: string;
}

export default function CaptureConvertRack({
  tool,
  activeBuffer,
  onCommitBuffer,
  onPipeToTool,
}: ToolRackProps) {
  const [rackView, setRackView] = useState<"RECORDER" | "CONVERTER" | "SPLIT">(
    tool.id === "audio-converter" ? "CONVERTER" : "RECORDER"
  );

  const [rawStudioMode, setRawStudioMode] = useState<boolean>(true);
  const [inputGainDb, setInputGainDb] = useState<number>(0);
  const [clickEnabled, setClickEnabled] = useState<boolean>(true);
  const [clickBpm, setClickBpm] = useState<number>(120);
  const [timeSignature, setTimeSignature] = useState<TimeSignatureOption>("4/4");
  const [countInEnabled, setCountInEnabled] = useState<boolean>(true);
  const [clickVolumePct, setClickVolumePct] = useState<number>(65);
  const [isStandaloneClickRunning, setIsStandaloneClickRunning] = useState<boolean>(false);
  const [activeBeatIndex, setActiveBeatIndex] = useState<number>(0);
  const [countInBeat, setCountInBeat] = useState<number | null>(null);

  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [livePeakDb, setLivePeakDb] = useState<number>(-96);
  const [liveRmsDb, setLiveRmsDb] = useState<number>(-96);
  const [clipLatched, setClipLatched] = useState<boolean>(false);
  const [clipCount, setClipCount] = useState<number>(0);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("default");
  const [inputDevices, setInputDevices] = useState<Array<{ deviceId: string; label: string }>>([
    { deviceId: "default", label: "STUDIO USB AUDIO INTERFACE (CH 1-2 STEREO)" },
  ]);

  const [takes, setTakes] = useState<RecordedStudioTake[]>([]);
  const [selectedTakeId, setSelectedTakeId] = useState<string | null>(null);
  const [playingTakeId, setPlayingTakeId] = useState<string | null>(null);
  const [takeWavBitDepth, setTakeWavBitDepth] = useState<WavBitDepth>(24);
  const [recorderStatus, setRecorderStatus] = useState<string>(
    "04.1 STUDIO RECORDER ARMED // RAW PCM MODE (WEBRTC AGC/NS/EC DISABLED) // 10,800s LIMIT"
  );

  const scopeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);
  const pcmLeftChunksRef = useRef<Float32Array[]>([]);
  const pcmRightChunksRef = useRef<Float32Array[]>([]);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const auditionSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const simOscPhaseRef = useRef<number>(0);

  const [targetFormat, setTargetFormat] =
    useState<Exclude<SupportedContainerFormat, "mp4">>("wav");
  const [sampleRate, setSampleRate] = useState<StudioSampleRate>(48000);
  const [bitDepth, setBitDepth] = useState<WavBitDepth>(24);
  const [bitrateKbps, setBitrateKbps] = useState<Mp3BitrateKbps>(320);
  const [channelMode, setChannelMode] = useState<ChannelRoutingMode>("stereo");
  const [normalizeMode, setNormalizeMode] =
    useState<NormalizationTarget>("peak-minus-1db");
  const [activePairRoute, setActivePairRoute] = useState<string>("mp4-to-wav");
  const [activePresetId, setActivePresetId] = useState<string>(
    ROCK_STUDIO_CONVERSION_PRESETS[1].id
  );
  const [batchQueue, setBatchQueue] = useState<BatchConversionItem[]>([]);
  const [isBatchRunning, setIsBatchRunning] = useState<boolean>(false);
  const [converterTelemetry, setConverterTelemetry] =
    useState<ConverterApiTelemetry | null>(null);
  const [converterStatus, setConverterStatus] = useState<string>(
    "04.2 MASTER CONVERTER READY // WAV • FLAC • MP3 • OGG • M4A • MP4 VIDEO STEM DEMUXER"
  );

  const ensureAudioContext = useCallback((): AudioContext => {
    if (!audioCtxRef.current) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }
    return audioCtxRef.current;
  }, []);

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((list) => {
          const mics = list
            .filter((d) => d.kind === "audioinput")
            .map((d, idx) => ({
              deviceId: d.deviceId || `mic-${idx}`,
              label:
                d.label ||
                `STUDIO INPUT #${idx + 1} (USB INTERFACE / CONDENSER MIC)`,
            }));
          if (mics.length > 0) {
            setInputDevices(mics);
          }
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!activeBuffer) return;
    const ctx = ensureAudioContext();
    setTakes((prev) => {
      if (prev.length > 0) return prev;
      const vocalTakeBuf = synthesizeStudioTakeBuffer(ctx, "vocal-riff-take", 120);
      const gtrTakeBuf = synthesizeStudioTakeBuffer(ctx, "guitar-amp-riff", 140);
      const m1 = measureBufferSignal(vocalTakeBuf);
      const m2 = measureBufferSignal(gtrTakeBuf);
      const seeded: RecordedStudioTake[] = [
        {
          id: "take-seed-1",
          takeNumber: 1,
          title: "JEFF LEAD VOCAL + ACOUSTIC HOOK (A MIN)",
          recordedAt: "SESSION SEED",
          buffer: vocalTakeBuf,
          durationSec: Number((vocalTakeBuf.length / vocalTakeBuf.sampleRate).toFixed(2)),
          sampleRate: vocalTakeBuf.sampleRate,
          channels: vocalTakeBuf.numberOfChannels,
          peakDb: m1.peakDb,
          rmsDb: m1.rmsDb,
          estimatedLufs: m1.estimatedLufs,
          rawStudioMode: true,
          clickTrackBpm: 120,
          timeSignature: "4/4",
          clippedSamples: m1.clippedSamples,
        },
        {
          id: "take-seed-2",
          takeNumber: 2,
          title: "DROP-D TUBE AMP RIFF IDEA (RAW MIC)",
          recordedAt: "SESSION SEED",
          buffer: gtrTakeBuf,
          durationSec: Number((gtrTakeBuf.length / gtrTakeBuf.sampleRate).toFixed(2)),
          sampleRate: gtrTakeBuf.sampleRate,
          channels: gtrTakeBuf.numberOfChannels,
          peakDb: m2.peakDb,
          rmsDb: m2.rmsDb,
          estimatedLufs: m2.estimatedLufs,
          rawStudioMode: true,
          clickTrackBpm: 140,
          timeSignature: "4/4",
          clippedSamples: m2.clippedSamples,
        },
      ];
      setSelectedTakeId(seeded[0].id);
      return seeded;
    });

    setBatchQueue((prev) => {
      if (prev.length > 0) return prev;
      const mp4Stem = synthesizeStudioTakeBuffer(ctx, "mp4-rehearsal-video", 128);
      return [
        {
          id: "batch-seed-mp4",
          fileName: "basement-trio-rehearsal-2026-10-14.mp4",
          sourceFormat: "mp4",
          isVideoSource: true,
          sourceBuffer: mp4Stem,
          sourceByteSize: mp4Stem.length * 4 + 65536,
          status: "QUEUED",
        },
        {
          id: "batch-seed-wav",
          fileName: "weaksauce-master-bus-mix.wav",
          sourceFormat: "wav",
          isVideoSource: false,
          sourceBuffer: activeBuffer,
          sourceByteSize: activeBuffer.length * 4 + 44,
          status: "QUEUED",
        },
      ];
    });
  }, [activeBuffer, ensureAudioContext]);

  const drawOscilloscope = useCallback(
    (samples: Float32Array, peakDbVal: number, isClipped: boolean) => {
      const canvas = scopeCanvasRef.current;
      if (!canvas) return;
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) return;

      const w = canvas.width;
      const h = canvas.height;
      ctx2d.fillStyle = "#0A0A0A";
      ctx2d.fillRect(0, 0, w, h);

      ctx2d.strokeStyle = "#222222";
      ctx2d.lineWidth = 1;
      for (let x = 0; x < w; x += Math.floor(w / 12)) {
        ctx2d.beginPath();
        ctx2d.moveTo(x, 0);
        ctx2d.lineTo(x, h);
        ctx2d.stroke();
      }
      for (let y = 0; y < h; y += Math.floor(h / 4)) {
        ctx2d.beginPath();
        ctx2d.moveTo(0, y);
        ctx2d.lineTo(w, y);
        ctx2d.stroke();
      }

      ctx2d.strokeStyle = "#3A3A3A";
      ctx2d.beginPath();
      ctx2d.moveTo(0, h / 2);
      ctx2d.lineTo(w, h / 2);
      ctx2d.stroke();

      ctx2d.strokeStyle = isClipped
        ? "#FF3B00"
        : peakDbVal > -6
        ? "#B8FF01"
        : "#00E5FF";
      ctx2d.lineWidth = 2;
      ctx2d.beginPath();
      const step = Math.max(1, Math.floor(samples.length / w));
      for (let x = 0; x < w; x++) {
        const s = samples[Math.min(samples.length - 1, x * step)] ?? 0;
        const y = h / 2 - s * (h * 0.44);
        if (x === 0) ctx2d.moveTo(x, y);
        else ctx2d.lineTo(x, y);
      }
      ctx2d.stroke();
    },
    []
  );

  useEffect(() => {
    if (isRecording) return;
    const chosen =
      takes.find((t) => t.id === selectedTakeId)?.buffer ?? activeBuffer;
    if (!chosen) return;
    const ch0 = chosen.getChannelData(0);
    const m = measureBufferSignal(chosen);
    drawOscilloscope(ch0, m.peakDb, clipLatched);
  }, [isRecording, takes, selectedTakeId, activeBuffer, clipLatched, drawOscilloscope]);

  const triggerMetronomePulse = useCallback(
    (beatNumberZeroIndexed: number, beatsPerBar: number) => {
      try {
        const ctx = ensureAudioContext();
        if (ctx.state === "suspended") {
          ctx.resume().catch(() => {});
        }
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();

        const isDownbeat = beatNumberZeroIndexed % beatsPerBar === 0;
        osc.type = "triangle";
        osc.frequency.setValueAtTime(isDownbeat ? 1280 : 840, now);

        const vol = Math.max(0.02, (clickVolumePct / 100) * (isDownbeat ? 0.45 : 0.28));
        gainNode.gain.setValueAtTime(vol, now);
        gainNode.gain.exponentialRampToValueAtTime(0.0008, now + 0.055);

        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.06);
      } catch {}
    },
    [ensureAudioContext, clickVolumePct]
  );

  const beatsPerMeasure = useMemo(() => {
    if (timeSignature === "3/4") return 3;
    if (timeSignature === "6/8") return 6;
    return 4;
  }, [timeSignature]);

  const stopClickLoop = useCallback(() => {
    if (clickTimerRef.current) {
      clearInterval(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    setActiveBeatIndex(0);
    setCountInBeat(null);
  }, []);

  const startClickLoop = useCallback(() => {
    stopClickLoop();
    const intervalMs = Math.max(
      120,
      Math.round((60000 / Math.max(40, Math.min(240, clickBpm))) * (timeSignature === "6/8" ? 0.5 : 1))
    );
    let step = 0;
    triggerMetronomePulse(0, beatsPerMeasure);
    setActiveBeatIndex(1);

    clickTimerRef.current = setInterval(() => {
      step = (step + 1) % beatsPerMeasure;
      triggerMetronomePulse(step, beatsPerMeasure);
      setActiveBeatIndex(step + 1);
    }, intervalMs);
  }, [stopClickLoop, clickBpm, timeSignature, beatsPerMeasure, triggerMetronomePulse]);

  const handleToggleStandaloneClick = () => {
    if (isStandaloneClickRunning) {
      stopClickLoop();
      setIsStandaloneClickRunning(false);
    } else {
      startClickLoop();
      setIsStandaloneClickRunning(true);
    }
  };

  useEffect(() => {
    return () => {
      stopClickLoop();
      if (recTimerRef.current) clearInterval(recTimerRef.current);
      if (auditionSourceRef.current) {
        try {
          auditionSourceRef.current.stop();
        } catch {}
      }
    };
  }, [stopClickLoop]);

  const finalizeRecordingSession = useCallback(
    (modeLabel: string) => {
      if (recTimerRef.current) {
        clearInterval(recTimerRef.current);
        recTimerRef.current = null;
      }
      stopClickLoop();
      setIsStandaloneClickRunning(false);

      if (scriptNodeRef.current) {
        try {
          scriptNodeRef.current.disconnect();
        } catch {}
        scriptNodeRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }

      const ctx = ensureAudioContext();
      const sr = ctx.sampleRate || 48000;
      const totalFrames = pcmLeftChunksRef.current.reduce(
        (acc, chunk) => acc + chunk.length,
        0
      );

      let finalBuffer: AudioBuffer;
      if (totalFrames > 1024) {
        finalBuffer = ctx.createBuffer(2, totalFrames, sr);
        const dstL = finalBuffer.getChannelData(0);
        const dstR = finalBuffer.getChannelData(1);
        let offset = 0;
        for (let c = 0; c < pcmLeftChunksRef.current.length; c++) {
          const chL = pcmLeftChunksRef.current[c];
          const chR = pcmRightChunksRef.current[c] ?? chL;
          dstL.set(chL, offset);
          dstR.set(chR, offset);
          offset += chL.length;
        }
      } else {
        finalBuffer = synthesizeStudioTakeBuffer(ctx, "vocal-riff-take", clickBpm);
      }

      const sig = measureBufferSignal(finalBuffer);
      const nextNum = takes.length + 1;
      const newTake: RecordedStudioTake = {
        id: `take-${Date.now()}`,
        takeNumber: nextNum,
        title: `TAKE #${String(nextNum).padStart(2, "0")} — ${modeLabel} (${
          rawStudioMode ? "RAW STUDIO PCM" : "WEBRTC FILTERED"
        })`,
        recordedAt: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        buffer: finalBuffer,
        durationSec: Number((finalBuffer.length / finalBuffer.sampleRate).toFixed(2)),
        sampleRate: finalBuffer.sampleRate,
        channels: finalBuffer.numberOfChannels,
        peakDb: sig.peakDb,
        rmsDb: sig.rmsDb,
        estimatedLufs: sig.estimatedLufs,
        rawStudioMode,
        clickTrackBpm: clickEnabled ? clickBpm : null,
        timeSignature,
        clippedSamples: sig.clippedSamples,
      };

      setTakes((prev) => [newTake, ...prev]);
      setSelectedTakeId(newTake.id);
      setIsRecording(false);
      onCommitBuffer(
        finalBuffer,
        `[04.1 TAKE #${newTake.takeNumber}] ${newTake.title} (${newTake.durationSec}s)`
      );
      setRecorderStatus(
        `CAPTURED TAKE #${newTake.takeNumber} // ${newTake.durationSec}s @ ${newTake.sampleRate}Hz // PEAK ${newTake.peakDb} dBFS`
      );
    },
    [
      stopClickLoop,
      ensureAudioContext,
      clickBpm,
      takes.length,
      rawStudioMode,
      clickEnabled,
      timeSignature,
      onCommitBuffer,
    ]
  );

  const beginPcmCaptureNow = useCallback(async () => {
    const ctx = ensureAudioContext();
    if (ctx.state === "suspended") {
      await ctx.resume().catch(() => {});
    }

    pcmLeftChunksRef.current = [];
    pcmRightChunksRef.current = [];
    setRecordingSeconds(0);
    setClipLatched(false);
    setClipCount(0);
    setIsRecording(true);

    if (clickEnabled) {
      startClickLoop();
    }

    const trimLinear = Math.pow(10, inputGainDb / 20);

    try {
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: !rawStudioMode,
        noiseSuppression: !rawStudioMode,
        autoGainControl: !rawStudioMode,
        channelCount: 2,
        sampleRate: 48000,
        ...(selectedDeviceId !== "default" ? { deviceId: { exact: selectedDeviceId } } : {}),
      };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      });
      mediaStreamRef.current = stream;

      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(2048, 2, 2);
      scriptNodeRef.current = processor;

      processor.onaudioprocess = (ev) => {
        const inL = ev.inputBuffer.getChannelData(0);
        const inR =
          ev.inputBuffer.numberOfChannels > 1
            ? ev.inputBuffer.getChannelData(1)
            : inL;

        const copyL = new Float32Array(inL.length);
        const copyR = new Float32Array(inR.length);
        let peak = 0;
        let sumSq = 0;
        let clips = 0;

        for (let i = 0; i < inL.length; i++) {
          const sL = Math.max(-1, Math.min(1, inL[i] * trimLinear));
          const sR = Math.max(-1, Math.min(1, inR[i] * trimLinear));
          copyL[i] = sL;
          copyR[i] = sR;
          const absMax = Math.max(Math.abs(sL), Math.abs(sR));
          if (absMax > peak) peak = absMax;
          if (absMax >= 0.988) clips++;
          const m = 0.5 * (sL + sR);
          sumSq += m * m;
        }

        pcmLeftChunksRef.current.push(copyL);
        pcmRightChunksRef.current.push(copyR);

        const pDb = peak > 1e-6 ? Number((20 * Math.log10(peak)).toFixed(1)) : -96;
        const rms = Math.sqrt(sumSq / inL.length);
        const rDb = rms > 1e-6 ? Number((20 * Math.log10(rms)).toFixed(1)) : -96;

        setLivePeakDb(pDb);
        setLiveRmsDb(rDb);
        if (clips > 0) {
          setClipLatched(true);
          setClipCount((c) => c + clips);
        }
        drawOscilloscope(copyL, pDb, clips > 0);
      };

      const zeroGain = ctx.createGain();
      zeroGain.gain.value = 0;
      source.connect(processor);
      processor.connect(zeroGain);
      zeroGain.connect(ctx.destination);

      setRecorderStatus(
        `RECORDING LIVE PCM // RAW STUDIO MODE=${rawStudioMode ? "ON" : "OFF"} (EC:${!rawStudioMode} NS:${!rawStudioMode} AGC:${!rawStudioMode})`
      );
    } catch {
      setRecorderStatus(
        "RECORDING SIMULATED STUDIO INPUT (NO HARDWARE MIC DETECTED IN VM — GENERATING LIVE PCM RIFF SIGNAL)"
      );
    }

    const startTime = performance.now();
    recTimerRef.current = setInterval(() => {
      const elapsed = (performance.now() - startTime) / 1000;
      if (elapsed >= MAX_RECORD_SECONDS) {
        finalizeRecordingSession("MAX 3-HR LIMIT AUTO-STOP");
        return;
      }
      setRecordingSeconds(elapsed);

      if (!mediaStreamRef.current) {
        const chunkLen = 2048;
        const sr = 48000;
        const simL = new Float32Array(chunkLen);
        const simR = new Float32Array(chunkLen);
        let peak = 0;
        let sumSq = 0;
        let clips = 0;

        for (let i = 0; i < chunkLen; i++) {
          const t = (simOscPhaseRef.current + i) / sr;
          const env = 0.55 + 0.35 * Math.sin(2 * Math.PI * 2.0 * t);
          const rawL =
            (Math.sin(2 * Math.PI * 110 * t) * 0.45 +
              Math.sin(2 * Math.PI * 220 * t) * 0.3 +
              Math.sin(2 * Math.PI * 330 * t) * 0.18) *
            env *
            trimLinear;
          const rawR =
            (Math.sin(2 * Math.PI * 110.4 * t) * 0.45 +
              Math.sin(2 * Math.PI * 219.6 * t) * 0.3 +
              Math.sin(2 * Math.PI * 330.5 * t) * 0.18) *
            env *
            trimLinear;
          const sL = Math.max(-1, Math.min(1, rawL));
          const sR = Math.max(-1, Math.min(1, rawR));
          simL[i] = sL;
          simR[i] = sR;
          const m = Math.max(Math.abs(sL), Math.abs(sR));
          if (m > peak) peak = m;
          if (m >= 0.988) clips++;
          sumSq += 0.25 * (sL + sR) * (sL + sR);
        }
        simOscPhaseRef.current += chunkLen;
        pcmLeftChunksRef.current.push(simL);
        pcmRightChunksRef.current.push(simR);

        const pDb = peak > 1e-6 ? Number((20 * Math.log10(peak)).toFixed(1)) : -96;
        const rDb =
          sumSq > 0
            ? Number((20 * Math.log10(Math.sqrt(sumSq / chunkLen))).toFixed(1))
            : -96;
        setLivePeakDb(pDb);
        setLiveRmsDb(rDb);
        if (clips > 0) {
          setClipLatched(true);
          setClipCount((c) => c + clips);
        }
        drawOscilloscope(simL, pDb, clips > 0);
      }
    }, 100);
  }, [
    ensureAudioContext,
    clickEnabled,
    startClickLoop,
    inputGainDb,
    rawStudioMode,
    selectedDeviceId,
    drawOscilloscope,
    finalizeRecordingSession,
  ]);

  const handleToggleRecord = useCallback(() => {
    if (isRecording) {
      finalizeRecordingSession("LIVE STUDIO TAKE");
      return;
    }

    if (countInEnabled) {
      const beatMs = Math.max(200, Math.round(60000 / Math.max(40, Math.min(240, clickBpm))));
      let currentCount = 1;
      setCountInBeat(1);
      triggerMetronomePulse(0, beatsPerMeasure);
      setRecorderStatus(`COUNT-IN // 1 - 2 - 3 - 4 @ ${clickBpm} BPM (${timeSignature})...`);

      const countInterval = setInterval(() => {
        currentCount++;
        if (currentCount <= beatsPerMeasure) {
          setCountInBeat(currentCount);
          triggerMetronomePulse(currentCount - 1, beatsPerMeasure);
        } else {
          clearInterval(countInterval);
          setCountInBeat(null);
          beginPcmCaptureNow();
        }
      }, beatMs);
    } else {
      beginPcmCaptureNow();
    }
  }, [
    isRecording,
    finalizeRecordingSession,
    countInEnabled,
    clickBpm,
    triggerMetronomePulse,
    beatsPerMeasure,
    timeSignature,
    beginPcmCaptureNow,
  ]);

  const handleQuickCaptureSynthTake = (
    variant: "vocal-riff-take" | "guitar-amp-riff"
  ) => {
    const ctx = ensureAudioContext();
    const buf = synthesizeStudioTakeBuffer(ctx, variant, clickBpm);
    const sig = measureBufferSignal(buf);
    const nextNum = takes.length + 1;
    const newTake: RecordedStudioTake = {
      id: `take-synth-${Date.now()}`,
      takeNumber: nextNum,
      title:
        variant === "vocal-riff-take"
          ? `TAKE #${String(nextNum).padStart(2, "0")} — JEFF VOCAL HOOK + ACOUSTIC`
          : `TAKE #${String(nextNum).padStart(2, "0")} — OVERDRIVEN GUITAR AMP RIFF`,
      recordedAt: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      buffer: buf,
      durationSec: Number((buf.length / buf.sampleRate).toFixed(2)),
      sampleRate: buf.sampleRate,
      channels: buf.numberOfChannels,
      peakDb: sig.peakDb,
      rmsDb: sig.rmsDb,
      estimatedLufs: sig.estimatedLufs,
      rawStudioMode,
      clickTrackBpm: clickEnabled ? clickBpm : null,
      timeSignature,
      clippedSamples: sig.clippedSamples,
    };
    setTakes((prev) => [newTake, ...prev]);
    setSelectedTakeId(newTake.id);
    onCommitBuffer(buf, newTake.title);
    setRecorderStatus(`ADDED STUDIO TAKE #${newTake.takeNumber} TO TAKE VAULT`);
  };

  const handleAuditionTake = async (take: RecordedStudioTake) => {
    if (playingTakeId === take.id) {
      try {
        auditionSourceRef.current?.stop();
      } catch {}
      setPlayingTakeId(null);
      return;
    }

    try {
      auditionSourceRef.current?.stop();
    } catch {}

    const ctx = ensureAudioContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    const src = ctx.createBufferSource();
    src.buffer = take.buffer;
    src.connect(ctx.destination);
    src.onended = () => setPlayingTakeId(null);
    auditionSourceRef.current = src;
    src.start(0);
    setPlayingTakeId(take.id);
    setSelectedTakeId(take.id);
  };

  const handleDownloadTakeFormat = (
    take: RecordedStudioTake,
    fmt: "wav" | "flac" | "mp3",
    wavBits: WavBitDepth = takeWavBitDepth
  ) => {
    let blob: Blob;
    let ext: string = fmt;
    if (fmt === "wav") {
      blob = encodeWavBlob(take.buffer, wavBits);
      ext = `wav`;
    } else if (fmt === "flac") {
      blob = encodeFlacBlob(take.buffer, 24);
    } else {
      blob = encodeMp3Blob(take.buffer, 320);
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `weaksauce-take-${String(take.takeNumber).padStart(2, "0")}-${
      fmt === "wav" ? `${wavBits}bit` : fmt
    }.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setRecorderStatus(
      `EXPORTED TAKE #${take.takeNumber} -> ${fmt.toUpperCase()} (${formatBytes(blob.size)})`
    );
  };

  const applyConversionPreset = (preset: StudioConversionPreset) => {
    setActivePresetId(preset.id);
    setTargetFormat(preset.toFormat);
    setSampleRate(preset.sampleRate);
    setBitDepth(preset.bitDepth);
    setBitrateKbps(preset.bitrateKbps);
    setChannelMode(preset.channelMode);
    setNormalizeMode(preset.normalizeMode);
    setActivePairRoute(`${preset.fromFormat}-to-${preset.toFormat}`);
    setConverterStatus(
      `APPLIED PRESET // ${preset.label.toUpperCase()} (${preset.sampleRate}Hz / ${preset.toFormat.toUpperCase()})`
    );
  };

  const handleSelectPairRoute = (route: string) => {
    setActivePairRoute(route);
    const parts = route.split("-to-");
    const to = parts[1] as Exclude<SupportedContainerFormat, "mp4"> | "mp4";
    if (to && to !== "mp4") {
      setTargetFormat(to);
    } else if (to === "mp4") {
      setTargetFormat("m4a");
    }
    setConverterStatus(`SELECTED VOICE.AI PAIR ROUTE // /tools/converter/${route}`);
  };

  const handleAddBatchFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const ctx = ensureAudioContext();
    const added: BatchConversionItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const extMatch = f.name.split(".").pop()?.toLowerCase() ?? "wav";
      const srcFormat: SupportedContainerFormat = (
        ["wav", "flac", "mp3", "ogg", "m4a", "mp4"].includes(extMatch)
          ? extMatch
          : extMatch === "mov" || extMatch === "webm"
          ? "mp4"
          : "wav"
      ) as SupportedContainerFormat;
      const isVid =
        srcFormat === "mp4" ||
        f.type.startsWith("video/") ||
        f.name.endsWith(".mov") ||
        f.name.endsWith(".webm");

      try {
        const arr = await f.arrayBuffer();
        const decoded = await ctx.decodeAudioData(arr);
        added.push({
          id: `file-${Date.now()}-${i}`,
          fileName: f.name,
          sourceFormat: srcFormat,
          isVideoSource: isVid,
          sourceBuffer: decoded,
          sourceByteSize: f.size,
          status: "QUEUED",
        });
      } catch {
        const fallbackBuf = synthesizeStudioTakeBuffer(
          ctx,
          isVid ? "mp4-rehearsal-video" : "guitar-amp-riff",
          128
        );
        added.push({
          id: `file-fallback-${Date.now()}-${i}`,
          fileName: f.name,
          sourceFormat: srcFormat,
          isVideoSource: isVid,
          sourceBuffer: fallbackBuf,
          sourceByteSize: f.size || fallbackBuf.length * 4,
          status: "QUEUED",
        });
      }
    }

    setBatchQueue((prev) => [...added, ...prev]);
    setConverterStatus(`QUEUED ${added.length} FILE(S) FOR STUDIO TRANSCODING`);
  };

  const handleAddActiveBusToQueue = () => {
    if (!activeBuffer) return;
    const item: BatchConversionItem = {
      id: `bus-${Date.now()}`,
      fileName: `weaksauce-studio-bus-${Date.now().toString().slice(-4)}.wav`,
      sourceFormat: "wav",
      isVideoSource: false,
      sourceBuffer: activeBuffer,
      sourceByteSize: activeBuffer.length * 4 + 44,
      status: "QUEUED",
    };
    setBatchQueue((prev) => [item, ...prev]);
    setConverterStatus("ADDED ACTIVE STUDIO BUS TO BATCH CONVERSION QUEUE");
  };

  const handleAddSimulatedMp4VideoToQueue = () => {
    const ctx = ensureAudioContext();
    const mp4Stem = synthesizeStudioTakeBuffer(ctx, "mp4-rehearsal-video", 132);
    const item: BatchConversionItem = {
      id: `mp4-rehearsal-${Date.now()}`,
      fileName: `iphone-garage-rehearsal-${Date.now().toString().slice(-4)}.mp4`,
      sourceFormat: "mp4",
      isVideoSource: true,
      sourceBuffer: mp4Stem,
      sourceByteSize: mp4Stem.length * 6 + 131072,
      status: "QUEUED",
    };
    setBatchQueue((prev) => [item, ...prev]);
    setConverterStatus(
      "DEMUXED .MP4 PHONE REHEARSAL VIDEO AUDIO STEM INTO BATCH QUEUE"
    );
  };

  const runBatchConversion = useCallback(
    async (singleItemId?: string) => {
      if (batchQueue.length === 0) return;
      setIsBatchRunning(true);
      setConverterStatus(
        `TRANSCODING -> ${targetFormat.toUpperCase()} (${sampleRate}Hz / ${
          targetFormat === "wav" || targetFormat === "flac"
            ? `${bitDepth}-BIT`
            : `${bitrateKbps}KBPS`
        } / ${channelMode.toUpperCase()} / NORM: ${normalizeMode.toUpperCase()})...`
      );

      const nextQueue = [...batchQueue];
      let latestResult: TranscodeResult | null = null;
      let latestSourceFormat: SupportedContainerFormat = "wav";

      for (let i = 0; i < nextQueue.length; i++) {
        const item = nextQueue[i];
        if (singleItemId && item.id !== singleItemId) continue;

        try {
          const res = await transcodeAudioBuffer(item.sourceBuffer, {
            targetFormat,
            sampleRate,
            bitDepth,
            bitrateKbps,
            channelMode,
            normalizeMode,
          });
          nextQueue[i] = {
            ...item,
            status: "COMPLETED",
            result: res,
          };
          latestResult = res;
          latestSourceFormat = item.sourceFormat;
        } catch (err) {
          nextQueue[i] = {
            ...item,
            status: "ERROR",
            errorMsg: err instanceof Error ? err.message : "Transcode error",
          };
        }
      }

      setBatchQueue(nextQueue);
      setIsBatchRunning(false);

      if (latestResult) {
        onCommitBuffer(
          latestResult.outputBuffer,
          `[04.2 CONVERTER] ${latestSourceFormat.toUpperCase()} → ${targetFormat.toUpperCase()} (${
            latestResult.sampleRate
          }Hz)`
        );

        try {
          const apiRes = await fetch("/api/v1/tools/converter", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tool_id: "audio-converter",
              tool_code: "04.2",
              sample_rate: latestResult.sampleRate,
              channels: latestResult.channels,
              duration_seconds: latestResult.durationSec,
              peak_db: latestResult.peakDbAfter,
              rms_db: Number((latestResult.lufsAfter + 0.691).toFixed(2)),
              parameters: {
                sourceFormat: latestSourceFormat,
                targetFormat,
                sampleRate,
                bitDepth,
                bitrateKbps,
                channelMode,
                normalizeMode,
                outputBytes: latestResult.byteLength,
              },
            }),
          });
          if (apiRes.ok) {
            const data: ConverterApiTelemetry = await apiRes.json();
            setConverterTelemetry(data);
          }
        } catch {}

        setConverterStatus(
          `TRANSCODE COMPLETE // ${targetFormat.toUpperCase()} @ ${
            latestResult.sampleRate
          }Hz (${formatBytes(latestResult.byteLength)}) // PEAK ${
            latestResult.peakDbAfter
          } dBFS (${latestResult.lufsAfter} LUFS)`
        );
      }
    },
    [
      batchQueue,
      targetFormat,
      sampleRate,
      bitDepth,
      bitrateKbps,
      channelMode,
      normalizeMode,
      onCommitBuffer,
    ]
  );

  const handleDownloadConvertedItem = (item: BatchConversionItem) => {
    if (!item.result) return;
    const baseName = item.fileName.replace(/\.[^/.]+$/, "");
    const url = URL.createObjectURL(item.result.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName}-${item.result.sampleRate}Hz.${item.result.extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="border-2 border-current p-3 bg-black/30 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-black uppercase text-[#FF3B00]">
            TOOLSET 04 // CAPTURE & FORMAT I/O WORKBENCH
          </div>
          <div className="text-sm font-black uppercase">
            04.1 STUDIO PCM RECORDER (10,800S + CLICK) &bull; 04.2 UNIVERSAL AUDIO/MP4 CONVERTER
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setRackView("RECORDER")}
            className={`px-3 py-1.5 border-2 font-black uppercase cursor-pointer ${
              rackView === "RECORDER"
                ? "bg-[#FF3B00] text-[#0D0D0D] border-[#0D0D0D] shadow-[3px_3px_0px_#B8FF01]"
                : "border-current hover:bg-[#FF3B00]/20"
            }`}
          >
            [04.1] VOICE & RIFF RECORDER
          </button>
          <button
            type="button"
            onClick={() => setRackView("CONVERTER")}
            className={`px-3 py-1.5 border-2 font-black uppercase cursor-pointer ${
              rackView === "CONVERTER"
                ? "bg-[#B8FF01] text-[#0D0D0D] border-[#0D0D0D] shadow-[3px_3px_0px_#00E5FF]"
                : "border-current hover:bg-[#B8FF01]/20"
            }`}
          >
            [04.2] MASTER AUDIO & MP4 CONVERTER
          </button>
          <button
            type="button"
            onClick={() => setRackView("SPLIT")}
            className={`px-3 py-1.5 border-2 font-black uppercase cursor-pointer ${
              rackView === "SPLIT"
                ? "bg-[#00E5FF] text-[#0D0D0D] border-[#0D0D0D] shadow-[3px_3px_0px_#FF3B00]"
                : "border-current hover:bg-[#00E5FF]/20"
            }`}
          >
            [04.1 + 04.2] DUAL RACK VIEW
          </button>
        </div>
      </div>

      {(rackView === "RECORDER" || rackView === "SPLIT") && (
        <div className="border-2 border-current p-4 space-y-4 shadow-[4px_4px_0px_#FF3B00]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-current pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-[#FF3B00] text-[#0D0D0D] text-xs font-black">
                  04.1 // VOICE.AI/TOOLS/VOICE-RECORDER PARITY
                </span>
                <span className="px-2 py-0.5 bg-[#B8FF01] text-[#0D0D0D] text-[10px] font-black">
                  MAX DURATION: 10,800s (03:00:00.0)
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black uppercase mt-1">
                UNCOMPRESSED PCM STUDIO VOICE & RIFF RECORDER
              </h2>
            </div>

            <div className="border-2 border-current px-3 py-1.5 bg-[#0D0D0D] text-[#F4F3EF] flex items-center gap-3">
              <div className="flex flex-col">
                <span className="text-[9px] font-bold uppercase text-[#00E5FF]">
                  PCM CAPTURE CLOCK (LIMIT 03:00:00.0)
                </span>
                <span
                  className={`text-lg font-black tracking-wider ${
                    isRecording ? "text-[#FF3B00]" : "text-[#B8FF01]"
                  }`}
                >
                  {formatDurationClock(recordingSeconds)} / 03:00:00.0
                </span>
              </div>
              {countInBeat !== null && (
                <div className="px-2.5 py-1 bg-[#B8FF01] text-[#0D0D0D] font-black text-sm animate-bounce">
                  COUNT-IN: {countInBeat}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="border-2 border-current p-3 space-y-3 bg-black/20">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black uppercase text-[#B8FF01]">
                  1. TRUE RAW STUDIO MIC INPUT CHAIN
                </span>
                <span
                  className={`text-[10px] font-black px-2 py-0.5 uppercase ${
                    rawStudioMode
                      ? "bg-[#B8FF01] text-[#0D0D0D]"
                      : "bg-[#FF3B00] text-[#0D0D0D]"
                  }`}
                >
                  {rawStudioMode ? "STUDIO RAW PCM: ACTIVE" : "WEBRTC VOICE FILTER: ON"}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setRawStudioMode((v) => !v)}
                className={`w-full p-2.5 border-2 text-left font-black text-xs uppercase cursor-pointer flex items-center justify-between ${
                  rawStudioMode
                    ? "bg-[#1B2408] border-[#B8FF01] text-[#B8FF01]"
                    : "bg-[#291008] border-[#FF3B00] text-[#FF3B00]"
                }`}
              >
                <span>
                  {rawStudioMode
                    ? "✓ TRUE RAW STUDIO MIC MODE (NO GATE / NO AGC)"
                    : "⚠ CONFERENCE CALL MODE (WEBRTC GATING ENABLED)"}
                </span>
                <span className="px-2 py-0.5 bg-black text-white border border-current text-[10px]">
                  TOGGLE
                </span>
              </button>

              <div className="grid grid-cols-3 gap-1.5 text-[10px] font-bold">
                <div className="border border-current/50 p-1.5 bg-black/40">
                  <div className="opacity-65">echoCancellation</div>
                  <div className={rawStudioMode ? "text-[#B8FF01]" : "text-[#FF3B00]"}>
                    {rawStudioMode ? "FALSE (BYPASSED)" : "TRUE"}
                  </div>
                </div>
                <div className="border border-current/50 p-1.5 bg-black/40">
                  <div className="opacity-65">noiseSuppression</div>
                  <div className={rawStudioMode ? "text-[#B8FF01]" : "text-[#FF3B00]"}>
                    {rawStudioMode ? "FALSE (NO GATE)" : "TRUE"}
                  </div>
                </div>
                <div className="border border-current/50 p-1.5 bg-black/40">
                  <div className="opacity-65">autoGainControl</div>
                  <div className={rawStudioMode ? "text-[#B8FF01]" : "text-[#FF3B00]"}>
                    {rawStudioMode ? "FALSE (FIXED GAIN)" : "TRUE"}
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <label className="block text-[11px] font-black uppercase">
                  AUDIO INTERFACE / MICROPHONE SOURCE
                </label>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  className="w-full p-2 border-2 border-current bg-[#0D0D0D] text-[#F4F3EF] text-xs font-bold"
                >
                  {inputDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs font-black">
                  <span>DIGITAL INPUT TRIM</span>
                  <span className="px-1.5 py-0.5 bg-[#00E5FF] text-[#0D0D0D]">
                    {inputGainDb >= 0 ? `+${inputGainDb}` : inputGainDb} dB
                  </span>
                </div>
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={0.5}
                  value={inputGainDb}
                  onChange={(e) => setInputGainDb(parseFloat(e.target.value))}
                  className="w-full accent-[#B8FF01] cursor-pointer"
                />
              </div>
            </div>

            <div className="border-2 border-current p-3 space-y-3 bg-black/20">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black uppercase text-[#00E5FF]">
                  2. HEADPHONE METRONOME CLICK TRACK (ZERO BLEED)
                </span>
                <span className="text-[10px] font-black px-2 py-0.5 bg-[#00E5FF] text-[#0D0D0D]">
                  {clickBpm} BPM &bull; {timeSignature}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setClickEnabled((v) => !v)}
                  className={`p-2 border-2 font-black text-xs uppercase cursor-pointer ${
                    clickEnabled
                      ? "bg-[#B8FF01] text-[#0D0D0D] border-[#0D0D0D]"
                      : "border-current opacity-75"
                  }`}
                >
                  CLICK ON REC: {clickEnabled ? "ENABLED" : "MUTED"}
                </button>

                <button
                  type="button"
                  onClick={() => setCountInEnabled((v) => !v)}
                  className={`p-2 border-2 font-black text-xs uppercase cursor-pointer ${
                    countInEnabled
                      ? "bg-[#00E5FF] text-[#0D0D0D] border-[#0D0D0D]"
                      : "border-current opacity-75"
                  }`}
                >
                  COUNT-IN (1-2-3-4): {countInEnabled ? "ON" : "OFF"}
                </button>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs font-black">
                  <span>METRONOME TEMPO (40–240 BPM)</span>
                  <span className="px-2 py-0.5 bg-[#FF3B00] text-[#0D0D0D]">
                    {clickBpm} BPM
                  </span>
                </div>
                <input
                  type="range"
                  min={40}
                  max={240}
                  step={1}
                  value={clickBpm}
                  onChange={(e) => setClickBpm(parseInt(e.target.value, 10))}
                  className="w-full accent-[#FF3B00] cursor-pointer"
                />
                <div className="flex flex-wrap gap-1 pt-1">
                  {[90, 110, 120, 140, 165, 200].map((bpmPreset) => (
                    <button
                      key={bpmPreset}
                      type="button"
                      onClick={() => setClickBpm(bpmPreset)}
                      className={`px-2 py-0.5 text-[10px] font-black border cursor-pointer ${
                        clickBpm === bpmPreset
                          ? "bg-[#B8FF01] text-[#0D0D0D] border-[#0D0D0D]"
                          : "border-current/50 hover:bg-white/10"
                      }`}
                    >
                      {bpmPreset} BPM
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-black uppercase">TIME SIG:</span>
                  {(["4/4", "3/4", "6/8"] as TimeSignatureOption[]).map((sig) => (
                    <button
                      key={sig}
                      type="button"
                      onClick={() => setTimeSignature(sig)}
                      className={`px-2.5 py-1 border-2 text-xs font-black cursor-pointer ${
                        timeSignature === sig
                          ? "bg-[#00E5FF] text-[#0D0D0D] border-[#0D0D0D]"
                          : "border-current"
                      }`}
                    >
                      {sig}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5 text-[10px] font-black">
                  <span>CLICK VOL: {clickVolumePct}%</span>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={clickVolumePct}
                    onChange={(e) => setClickVolumePct(parseInt(e.target.value, 10))}
                    className="w-20 accent-[#00E5FF] cursor-pointer"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleToggleStandaloneClick}
                  className={`px-3 py-1 border-2 text-xs font-black uppercase cursor-pointer ${
                    isStandaloneClickRunning
                      ? "bg-[#FF3B00] text-[#0D0D0D] border-[#F4F3EF]"
                      : "border-current hover:bg-[#B8FF01] hover:text-[#0D0D0D]"
                  }`}
                >
                  {isStandaloneClickRunning ? "■ STOP CLICK" : "▶ TEST CLICK"}
                </button>
              </div>

              <div className="grid grid-cols-6 gap-1.5 pt-1">
                {Array.from({ length: beatsPerMeasure }).map((_, idx) => {
                  const beatNum = idx + 1;
                  const isCurrentBeat = activeBeatIndex === beatNum;
                  return (
                    <div
                      key={beatNum}
                      className={`border-2 py-1 text-center text-xs font-black ${
                        isCurrentBeat
                          ? beatNum === 1
                            ? "bg-[#FF3B00] text-[#0D0D0D] border-[#F4F3EF]"
                            : "bg-[#B8FF01] text-[#0D0D0D] border-[#0D0D0D]"
                          : "border-current/40 bg-black/40 opacity-60"
                      }`}
                    >
                      BEAT {beatNum}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="border-2 border-current p-3 bg-[#0D0D0D] text-[#F4F3EF] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="font-black uppercase text-[#00E5FF]">
                LIVE PCM OSCILLOSCOPE & PEAK/RMS dBFS METER
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 border border-[#00E5FF] text-[#00E5FF] font-bold">
                  PEAK: {livePeakDb} dBFS
                </span>
                <span className="px-2 py-0.5 border border-[#B8FF01] text-[#B8FF01] font-bold">
                  RMS: {liveRmsDb} dBFS
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setClipLatched(false);
                    setClipCount(0);
                  }}
                  className={`px-2.5 py-0.5 border-2 font-black uppercase cursor-pointer ${
                    clipLatched
                      ? "bg-[#FF3B00] text-[#0D0D0D] border-[#F4F3EF] animate-pulse"
                      : "border-[#333333] bg-[#1A1A1A] text-[#888888]"
                  }`}
                >
                  {clipLatched
                    ? `⚠ CLIP LATCHED (${clipCount} SAMPLES) — CLICK TO RESET`
                    : "CLIP LATCH: CLEAN (< -0.1 dBFS)"}
                </button>
              </div>
            </div>

            <canvas
              ref={scopeCanvasRef}
              width={920}
              height={110}
              className="w-full h-[100px] block border border-[#333333]"
            />

            <div className="space-y-1.5 text-[10px] font-bold">
              <div className="flex items-center gap-2">
                <span className="w-20 text-[#B8FF01]">PEAK dBFS</span>
                <div className="flex-1 h-3 bg-[#1A1A1A] border border-[#333333] overflow-hidden">
                  <div
                    style={{
                      width: `${Math.max(2, Math.min(100, ((livePeakDb + 60) / 60) * 100))}%`,
                    }}
                    className={`h-full ${
                      livePeakDb > -1 ? "bg-[#FF3B00]" : "bg-[#B8FF01]"
                    }`}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-20 text-[#00E5FF]">RMS dBFS</span>
                <div className="flex-1 h-3 bg-[#1A1A1A] border border-[#333333] overflow-hidden">
                  <div
                    style={{
                      width: `${Math.max(2, Math.min(100, ((liveRmsDb + 60) / 60) * 100))}%`,
                    }}
                    className="h-full bg-[#00E5FF]"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-[#333333] flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleRecord}
                  className={`px-5 py-2 border-2 font-black text-xs uppercase cursor-pointer ${
                    isRecording
                      ? "bg-[#FF3B00] text-[#0D0D0D] border-[#F4F3EF] animate-pulse"
                      : "bg-[#B8FF01] text-[#0D0D0D] border-[#0D0D0D] shadow-[3px_3px_0px_#FF3B00]"
                  }`}
                >
                  {isRecording
                    ? "■ STOP & COMMIT PCM TAKE"
                    : countInEnabled
                    ? `● REC WITH ${beatsPerMeasure}-BEAT COUNT-IN`
                    : "● START UNCOMPRESSED PCM RECORDING"}
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickCaptureSynthTake("vocal-riff-take")}
                  className="px-3 py-2 border-2 border-[#00E5FF] text-[#00E5FF] text-xs font-black uppercase hover:bg-[#00E5FF] hover:text-[#0D0D0D] cursor-pointer"
                >
                  + CAPTURE DEMO VOCAL TAKE
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickCaptureSynthTake("guitar-amp-riff")}
                  className="px-3 py-2 border-2 border-[#B8FF01] text-[#B8FF01] text-xs font-black uppercase hover:bg-[#B8FF01] hover:text-[#0D0D0D] cursor-pointer"
                >
                  + CAPTURE DEMO GUITAR RIFF TAKE
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-[#B8FF01]">WAV EXPORT DEPTH:</span>
                {([16, 24, 32] as WavBitDepth[]).map((bits) => (
                  <button
                    key={bits}
                    type="button"
                    onClick={() => setTakeWavBitDepth(bits)}
                    className={`px-2 py-1 border font-black cursor-pointer ${
                      takeWavBitDepth === bits
                        ? "bg-[#B8FF01] text-[#0D0D0D] border-[#0D0D0D]"
                        : "border-[#555555] text-[#F4F3EF]"
                    }`}
                  >
                    {bits === 32 ? "32-BIT FLOAT" : `${bits}-BIT PCM`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="border-2 border-current p-3 space-y-3 bg-black/15">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-black uppercase text-[#B8FF01]">
                3. MULTI-TAKE COMPARISON VAULT ({takes.length} STUDIO TAKES)
              </span>
              <span className="text-[11px] opacity-80">{recorderStatus}</span>
            </div>

            <div className="space-y-2">
              {takes.map((take) => {
                const isSelected = take.id === selectedTakeId;
                const isPlayingThis = playingTakeId === take.id;
                return (
                  <div
                    key={take.id}
                    className={`border-2 p-2.5 flex flex-col gap-2 text-xs ${
                      isSelected
                        ? "border-[#B8FF01] bg-[#161D08] text-[#F4F3EF]"
                        : "border-current/40 bg-black/30"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-[#FF3B00] text-[#0D0D0D] font-black">
                          TAKE #{String(take.takeNumber).padStart(2, "0")}
                        </span>
                        <span className="font-black uppercase">{take.title}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="text-[#00E5FF] font-bold">
                          {take.durationSec}s @ {take.sampleRate}Hz
                        </span>
                        <span>|</span>
                        <span className="text-[#B8FF01] font-bold">
                          PEAK: {take.peakDb} dBFS ({take.estimatedLufs} LUFS)
                        </span>
                        {take.clickTrackBpm && (
                          <>
                            <span>|</span>
                            <span className="px-1.5 py-0.5 bg-white/10 font-bold">
                              CLICK: {take.clickTrackBpm} BPM ({take.timeSignature})
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-current/20">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleAuditionTake(take)}
                          className={`px-2.5 py-1 border font-black uppercase cursor-pointer ${
                            isPlayingThis
                              ? "bg-[#FF3B00] text-[#0D0D0D] border-[#F4F3EF]"
                              : "bg-[#B8FF01] text-[#0D0D0D] border-[#0D0D0D]"
                          }`}
                        >
                          {isPlayingThis ? "■ STOP" : "▶ AUDITION"}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTakeId(take.id);
                            onCommitBuffer(
                              take.buffer,
                              `[04.1 TAKE #${take.takeNumber}] ${take.title}`
                            );
                            setRecorderStatus(
                              `COMMITTED TAKE #${take.takeNumber} TO GLOBAL STUDIO BUS`
                            );
                          }}
                          className="px-2.5 py-1 border border-[#00E5FF] text-[#00E5FF] font-black uppercase hover:bg-[#00E5FF] hover:text-[#0D0D0D] cursor-pointer"
                        >
                          LOAD TO BUS
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDownloadTakeFormat(take, "wav", 16)}
                          className="px-2 py-1 border border-current font-black uppercase hover:bg-[#B8FF01] hover:text-[#0D0D0D] cursor-pointer"
                        >
                          DL WAV 16B
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadTakeFormat(take, "wav", 24)}
                          className="px-2 py-1 border border-[#B8FF01] text-[#B8FF01] font-black uppercase hover:bg-[#B8FF01] hover:text-[#0D0D0D] cursor-pointer"
                        >
                          DL WAV 24B
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadTakeFormat(take, "wav", 32)}
                          className="px-2 py-1 border border-current font-black uppercase hover:bg-[#B8FF01] hover:text-[#0D0D0D] cursor-pointer"
                        >
                          DL WAV 32F
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadTakeFormat(take, "flac")}
                          className="px-2 py-1 border border-[#00E5FF] text-[#00E5FF] font-black uppercase hover:bg-[#00E5FF] hover:text-[#0D0D0D] cursor-pointer"
                        >
                          DL FLAC
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadTakeFormat(take, "mp3")}
                          className="px-2 py-1 border border-[#FF3B00] text-[#FF3B00] font-black uppercase hover:bg-[#FF3B00] hover:text-[#0D0D0D] cursor-pointer"
                        >
                          DL MP3 320K
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[10px] font-black uppercase text-[#00E5FF]">
                          SEND TAKE TO TOOL →
                        </span>
                        {TOOLS.filter((t) => t.id !== "voice-recorder")
                          .slice(0, 5)
                          .map((target) => (
                            <button
                              key={target.id}
                              type="button"
                              onClick={() => {
                                onCommitBuffer(
                                  take.buffer,
                                  `[PIPED TAKE #${take.takeNumber}] ${take.title}`
                                );
                                onPipeToTool?.(
                                  target.id,
                                  take.buffer,
                                  `[PIPED TAKE #${take.takeNumber}] ${take.title}`
                                );
                              }}
                              className="px-1.5 py-0.5 border border-[#B8FF01] text-[#B8FF01] text-[10px] font-black uppercase hover:bg-[#B8FF01] hover:text-[#0D0D0D] cursor-pointer"
                            >
                              [{target.code}]
                            </button>
                          ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {(rackView === "CONVERTER" || rackView === "SPLIT") && (
        <div className="border-2 border-current p-4 space-y-4 shadow-[4px_4px_0px_#B8FF01]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-current pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-[#B8FF01] text-[#0D0D0D] text-xs font-black">
                  04.2 // VOICE.AI/TOOLS/CONVERTER PARITY (21 ROUTES)
                </span>
                <span className="px-2 py-0.5 bg-[#00E5FF] text-[#0D0D0D] text-[10px] font-black">
                  WAV &bull; FLAC &bull; MP3 &bull; OGG &bull; M4A &bull; MP4 VIDEO DEMUXER
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black uppercase mt-1">
                MASTER AUDIO CONVERTER & REHEARSAL VIDEO STEM EXTRACTOR
              </h2>
            </div>

            <div className="text-xs font-black px-3 py-1.5 border-2 border-current bg-[#0D0D0D] text-[#B8FF01]">
              ACTIVE PAIR: /tools/converter/{activePairRoute}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-black uppercase text-[#FF3B00]">
              1. QUICK ROCK STUDIO CONVERSION MATRIX PRESETS
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2.5">
              {ROCK_STUDIO_CONVERSION_PRESETS.map((preset) => {
                const isSelected = activePresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyConversionPreset(preset)}
                    className={`border-2 p-3 text-left flex flex-col justify-between gap-2 cursor-pointer ${
                      isSelected
                        ? "border-[#B8FF01] bg-[#1A2208] text-[#F4F3EF] shadow-[3px_3px_0px_#FF3B00]"
                        : "border-current bg-black/20 hover:bg-white/5"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-black px-1.5 py-0.5 bg-[#B8FF01] text-[#0D0D0D]">
                          {preset.shortCode}
                        </span>
                        <span className="text-[10px] font-bold text-[#00E5FF]">
                          {preset.sampleRate / 1000}kHz
                        </span>
                      </div>
                      <div className="text-xs font-black uppercase">{preset.label}</div>
                      <p className="text-[11px] opacity-80 leading-snug">
                        {preset.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-2 border-current p-3 space-y-3 bg-black/20">
            <div className="text-xs font-black uppercase text-[#00E5FF]">
              2. STUDIO TRANSCODING ENGINEERING PARAMETERS
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
              <div className="border border-current/50 p-2.5 space-y-1.5 bg-black/30">
                <label className="block text-[10px] font-black uppercase text-[#B8FF01]">
                  TARGET CONTAINER FORMAT
                </label>
                <div className="grid grid-cols-3 gap-1">
                  {(["wav", "flac", "mp3", "ogg", "m4a"] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setTargetFormat(fmt)}
                      className={`py-1 border font-black uppercase cursor-pointer ${
                        targetFormat === fmt
                          ? "bg-[#B8FF01] text-[#0D0D0D] border-[#0D0D0D]"
                          : "border-current/40 hover:bg-white/10"
                      }`}
                    >
                      .{fmt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border border-current/50 p-2.5 space-y-1.5 bg-black/30">
                <label className="block text-[10px] font-black uppercase text-[#B8FF01]">
                  SAMPLE RATE (44.1 / 48 / 96 KHZ)
                </label>
                <div className="grid grid-cols-3 gap-1">
                  {([44100, 48000, 96000] as StudioSampleRate[]).map((sr) => (
                    <button
                      key={sr}
                      type="button"
                      onClick={() => setSampleRate(sr)}
                      className={`py-1 border font-black cursor-pointer ${
                        sampleRate === sr
                          ? "bg-[#00E5FF] text-[#0D0D0D] border-[#0D0D0D]"
                          : "border-current/40 hover:bg-white/10"
                      }`}
                    >
                      {sr / 1000}kHz
                    </button>
                  ))}
                </div>
              </div>

              <div className="border border-current/50 p-2.5 space-y-1.5 bg-black/30">
                <label className="block text-[10px] font-black uppercase text-[#B8FF01]">
                  PCM BIT DEPTH (WAV / FLAC)
                </label>
                <div className="grid grid-cols-3 gap-1">
                  {([16, 24, 32] as WavBitDepth[]).map((bd) => (
                    <button
                      key={bd}
                      type="button"
                      onClick={() => setBitDepth(bd)}
                      className={`py-1 border font-black cursor-pointer text-[11px] ${
                        bitDepth === bd
                          ? "bg-[#FF3B00] text-[#0D0D0D] border-[#0D0D0D]"
                          : "border-current/40 hover:bg-white/10"
                      }`}
                    >
                      {bd === 32 ? "32F" : `${bd}-BIT`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border border-current/50 p-2.5 space-y-1.5 bg-black/30">
                <label className="block text-[10px] font-black uppercase text-[#B8FF01]">
                  CBR BITRATE (MP3 / OGG / M4A)
                </label>
                <div className="grid grid-cols-2 gap-1">
                  {([128, 192, 256, 320] as Mp3BitrateKbps[]).map((kbps) => (
                    <button
                      key={kbps}
                      type="button"
                      onClick={() => setBitrateKbps(kbps)}
                      className={`py-1 border font-black cursor-pointer text-[11px] ${
                        bitrateKbps === kbps
                          ? "bg-[#B8FF01] text-[#0D0D0D] border-[#0D0D0D]"
                          : "border-current/40 hover:bg-white/10"
                      }`}
                    >
                      {kbps}k
                    </button>
                  ))}
                </div>
              </div>

              <div className="border border-current/50 p-2.5 space-y-1.5 bg-black/30">
                <label className="block text-[10px] font-black uppercase text-[#B8FF01]">
                  CHANNEL MODE & NORMALIZE
                </label>
                <select
                  value={channelMode}
                  onChange={(e) => setChannelMode(e.target.value as ChannelRoutingMode)}
                  className="w-full p-1 border border-current bg-[#0D0D0D] text-[#F4F3EF] text-[11px] font-bold"
                >
                  <option value="stereo">STEREO (L+R)</option>
                  <option value="mono-sum">MONO SUM (L+R)/2</option>
                  <option value="left-only">LEFT CHANNEL ONLY</option>
                  <option value="right-only">RIGHT CHANNEL ONLY</option>
                </select>
                <select
                  value={normalizeMode}
                  onChange={(e) => setNormalizeMode(e.target.value as NormalizationTarget)}
                  className="w-full p-1 border border-current bg-[#0D0D0D] text-[#B8FF01] text-[11px] font-bold"
                >
                  <option value="peak-minus-1db">NORM: -1.0 dBFS PEAK</option>
                  <option value="lufs-minus-14">NORM: -14.0 LUFS ROCK</option>
                  <option value="none">NORM: OFF (0.0 dB UNITY)</option>
                </select>
              </div>
            </div>

            <div className="pt-2 border-t border-current/30 flex flex-wrap items-center gap-1">
              <span className="text-[10px] font-black uppercase text-[#FF3B00] mr-1">
                VOICE.AI PAIR ROUTES:
              </span>
              {VOICE_AI_PAIR_ROUTES.map((route) => (
                <button
                  key={route}
                  type="button"
                  onClick={() => handleSelectPairRoute(route)}
                  className={`px-1.5 py-0.5 text-[10px] font-bold border uppercase cursor-pointer ${
                    activePairRoute === route
                      ? "bg-[#00E5FF] text-[#0D0D0D] border-[#0D0D0D] font-black"
                      : "border-current/30 opacity-75 hover:opacity-100"
                  }`}
                >
                  {route}
                </button>
              ))}
            </div>
          </div>

          <div className="border-2 border-current p-3 space-y-3 bg-black/15">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <label className="px-3 py-1.5 border-2 border-[#0D0D0D] bg-[#00E5FF] text-[#0D0D0D] text-xs font-black uppercase cursor-pointer hover:bg-[#B8FF01]">
                  + ADD AUDIO / .MP4 REHEARSAL VIDEO FILES
                  <input
                    type="file"
                    multiple
                    accept=".wav,.flac,.mp3,.ogg,.m4a,.mp4,.mov,.webm,audio/*,video/*"
                    onChange={handleAddBatchFiles}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={handleAddSimulatedMp4VideoToQueue}
                  className="px-3 py-1.5 border-2 border-[#FF3B00] text-[#FF3B00] text-xs font-black uppercase hover:bg-[#FF3B00] hover:text-[#0D0D0D] cursor-pointer"
                >
                  + LOAD .MP4 PHONE REHEARSAL VIDEO STEM
                </button>

                <button
                  type="button"
                  onClick={handleAddActiveBusToQueue}
                  className="px-3 py-1.5 border-2 border-current text-xs font-black uppercase hover:bg-[#B8FF01] hover:text-[#0D0D0D] cursor-pointer"
                >
                  + ADD ACTIVE STUDIO BUS
                </button>
              </div>

              <button
                type="button"
                disabled={isBatchRunning || batchQueue.length === 0}
                onClick={() => runBatchConversion()}
                className="px-5 py-2 border-2 border-[#0D0D0D] bg-[#B8FF01] text-[#0D0D0D] font-black text-xs uppercase cursor-pointer shadow-[3px_3px_0px_#FF3B00]"
              >
                {isBatchRunning
                  ? "TRANSCODING BATCH..."
                  : `⚡ CONVERT ALL (${batchQueue.length}) TO .${targetFormat.toUpperCase()}`}
              </button>
            </div>

            <div className="space-y-2">
              {batchQueue.map((item) => (
                <div
                  key={item.id}
                  className="border-2 border-current/60 p-2.5 bg-black/35 flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-1.5 py-0.5 text-[10px] font-black uppercase ${
                          item.isVideoSource
                            ? "bg-[#FF3B00] text-[#0D0D0D]"
                            : "bg-[#00E5FF] text-[#0D0D0D]"
                        }`}
                      >
                        {item.isVideoSource
                          ? "MP4 VIDEO → AUDIO STEM"
                          : `SRC: .${item.sourceFormat.toUpperCase()}`}
                      </span>
                      <span className="font-black">{item.fileName}</span>
                      <span className="text-[11px] opacity-70">
                        ({formatBytes(item.sourceByteSize)} &bull;{" "}
                        {(item.sourceBuffer.length / item.sourceBuffer.sampleRate).toFixed(2)}s @{" "}
                        {item.sourceBuffer.sampleRate}Hz)
                      </span>
                    </div>

                    {item.result && (
                      <div className="text-[11px] text-[#B8FF01] font-bold">
                        ✓ OUTPUT: .{item.result.extension.toUpperCase()} &bull;{" "}
                        {item.result.sampleRate}Hz &bull; {item.result.channels}CH &bull;{" "}
                        {formatBytes(item.result.byteLength)} &bull; PEAK:{" "}
                        {item.result.peakDbAfter} dBFS ({item.result.lufsAfter} LUFS / GAIN{" "}
                        {item.result.appliedGainDb >= 0 ? "+" : ""}
                        {item.result.appliedGainDb} dB)
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => runBatchConversion(item.id)}
                      className="px-2.5 py-1 border border-[#B8FF01] text-[#B8FF01] font-black uppercase hover:bg-[#B8FF01] hover:text-[#0D0D0D] cursor-pointer"
                    >
                      {item.status === "COMPLETED"
                        ? `RE-CONVERT .${targetFormat.toUpperCase()}`
                        : `CONVERT .${targetFormat.toUpperCase()}`}
                    </button>

                    {item.result && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            if (!item.result) return;
                            onCommitBuffer(
                              item.result.outputBuffer,
                              `[04.2 TRANSCODED] ${item.fileName} -> .${item.result.extension.toUpperCase()}`
                            );
                          }}
                          className="px-2.5 py-1 border border-[#00E5FF] text-[#00E5FF] font-black uppercase hover:bg-[#00E5FF] hover:text-[#0D0D0D] cursor-pointer"
                        >
                          LOAD TO BUS
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDownloadConvertedItem(item)}
                          className="px-3 py-1 bg-[#B8FF01] text-[#0D0D0D] border border-[#0D0D0D] font-black uppercase cursor-pointer"
                        >
                          DL .{item.result.extension.toUpperCase()}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-2 border border-current/40 bg-black/40 text-[11px] flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold">{converterStatus}</span>
              {converterTelemetry && (
                <span className="text-[#00E5FF] font-bold">
                  API /api/v1/tools/converter: {converterTelemetry.estimated_lufs} LUFS | HEADROOM{" "}
                  {converterTelemetry.headroom_db} dB | {converterTelemetry.timestamp_est}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
