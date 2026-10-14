"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ToolRackProps } from "@/app/components/tools/tool-rack-types";
import { DEMO_STEMS, encodeAudioBufferToWavBlob, synthesizeDemoAudioBuffer } from "@/app/lib/audio-dsp";
import {
  BatchTrackAnalysisRow,
  HarmonyVoicingMode,
  ROCK_TUNING_DRONES,
  ROCK_VOCAL_PRESETS,
  RockVocalPresetId,
  RockVocalPresetSpec,
  TuningDronePresetId,
  VocalLabParameters,
  analyzeTrackKeyAndBpm,
  computeDelaySubdivisionsMs,
  renderVocalPitchLabDsp,
  synthesizeTuningDroneBuffer,
} from "@/app/lib/dsp/vocal-bpm-dsp";

const SEMITONE_NOTES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

function transposeKeyLabel(baseKey: string, semitones: number): string {
  const parts = baseKey.split(" ");
  const root = parts[0] ?? "E";
  const scale = parts[1] ?? "Minor";
  const normalized = root === "D#" ? "Eb" : root === "G#" ? "Ab" : root === "A#" ? "Bb" : root;
  const idx = SEMITONE_NOTES.indexOf(normalized);
  if (idx === -1) return baseKey;
  const shiftedIdx = (((idx + semitones) % 12) + 12) % 12;
  return `${SEMITONE_NOTES[shiftedIdx]} ${scale}`;
}

export default function VocalBpmLabRack({
  tool,
  activeBuffer,
  onCommitBuffer,
}: ToolRackProps) {
  const [subTabOverride, setSubTabOverride] = useState<{
    forToolId: string;
    tab: "VOICE_CHANGER" | "BPM_FINDER";
  } | null>(null);

  const labSubTab: "VOICE_CHANGER" | "BPM_FINDER" =
    subTabOverride && subTabOverride.forToolId === tool.id
      ? subTabOverride.tab
      : tool.id === "bpm-finder"
      ? "BPM_FINDER"
      : "VOICE_CHANGER";

  const setLabSubTab = useCallback(
    (tab: "VOICE_CHANGER" | "BPM_FINDER") => {
      setSubTabOverride({ forToolId: tool.id, tab });
    },
    [tool.id]
  );

  const [selectedPresetId, setSelectedPresetId] = useState<RockVocalPresetId>("abbey-road-adt");
  const [pitchSemitones, setPitchSemitones] = useState<number>(0);
  const [fineCents, setFineCents] = useState<number>(0);
  const [formantShift, setFormantShift] = useState<number>(0);
  const [adtDelayMs, setAdtDelayMs] = useState<number>(22);
  const [adtDetuneCents, setAdtDetuneCents] = useState<number>(15);
  const [adtWowHz, setAdtWowHz] = useState<number>(1.1);
  const [adtWidthPct, setAdtWidthPct] = useState<number>(85);
  const [harmonyMode, setHarmonyMode] = useState<HarmonyVoicingMode>("off");
  const [harmonyBlendPct, setHarmonyBlendPct] = useState<number>(0);
  const [tubeDriveDb, setTubeDriveDb] = useState<number>(2.5);
  const [slapbackMs, setSlapbackMs] = useState<number>(0);
  const [slapbackFeedbackPct, setSlapbackFeedbackPct] = useState<number>(0);
  const [wetMix, setWetMix] = useState<number>(70);
  const [isRenderingVocal, setIsRenderingVocal] = useState<boolean>(false);
  const [vocalStatus, setVocalStatus] = useState<string>(
    "03.1 READY // ABBEY ROAD ADT STEREO DOUBLER ARMED (NO 15s LIMIT, ZERO MEME SKINS)"
  );
  const [apiChainLog, setApiChainLog] = useState<string[]>([
    "WSOLA_GRAIN[2048] -> FORMANT_WARP[0.0st] -> ABBEY_ROAD_ADT[22ms/±15ct] -> TRIODE_PREAMP[+2.5dB]",
  ]);

  const [lowPassCutoffHz, setLowPassCutoffHz] = useState<number>(240);
  const [batchRows, setBatchRows] = useState<BatchTrackAnalysisRow[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const offlineSeed = new OfflineAudioContext(2, 44100 * 6, 44100);
      return DEMO_STEMS.map((stem) => {
        const buf = synthesizeDemoAudioBuffer(offlineSeed, stem.id);
        return analyzeTrackKeyAndBpm(
          buf,
          `${stem.id}.wav (${stem.label})`,
          "DEMO",
          240
        );
      });
    } catch {
      return [];
    }
  });
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [tapTimestamps, setTapTimestamps] = useState<number[]>([]);
  const [tappedBpm, setTappedBpm] = useState<number | null>(null);
  const [manualBpmOverride, setManualBpmOverride] = useState<number | null>(null);
  const [selectedDronePresetId, setSelectedDronePresetId] =
    useState<TuningDronePresetId>("e-standard");
  const [activeDroneNoteLabel, setActiveDroneNoteLabel] = useState<string | null>(null);
  const [bpmStatus, setBpmStatus] = useState<string>(
    "03.2 READY // 240Hz LPF BEAT AUTOCORRELATION + 12-BIN KRUMHANSL-SCHMUCKLER CHROMA ENGINE"
  );

  const droneCtxRef = useRef<AudioContext | null>(null);
  const droneOscRef = useRef<{
    osc1: OscillatorNode;
    osc2: OscillatorNode;
    gain: GainNode;
  } | null>(null);

  const activeVocalPreset: RockVocalPresetSpec = useMemo(
    () =>
      ROCK_VOCAL_PRESETS.find((p) => p.id === selectedPresetId) ??
      ROCK_VOCAL_PRESETS[1],
    [selectedPresetId]
  );

  const activeBufferAnalysis = useMemo(() => {
    if (!activeBuffer) return null;
    return analyzeTrackKeyAndBpm(
      activeBuffer,
      "ACTIVE STUDIO BUS (CURRENT TRACK)",
      "ACTIVE_BUS",
      lowPassCutoffHz
    );
  }, [activeBuffer, lowPassCutoffHz]);

  const selectedBatchRow: BatchTrackAnalysisRow | null = useMemo(() => {
    if (selectedRowId) {
      const found = batchRows.find((r) => r.id === selectedRowId);
      if (found) return found;
    }
    return activeBufferAnalysis ?? batchRows[0] ?? null;
  }, [selectedRowId, batchRows, activeBufferAnalysis]);

  const effectiveBpmForDelayCalc = useMemo(() => {
    if (manualBpmOverride !== null) return manualBpmOverride;
    if (tappedBpm !== null) return tappedBpm;
    if (selectedBatchRow) return selectedBatchRow.bpm;
    if (activeBufferAnalysis) return activeBufferAnalysis.bpm;
    return 128;
  }, [manualBpmOverride, tappedBpm, selectedBatchRow, activeBufferAnalysis]);

  const delaySubdivisions = useMemo(
    () => computeDelaySubdivisionsMs(effectiveBpmForDelayCalc),
    [effectiveBpmForDelayCalc]
  );

  const stopLiveDrone = useCallback(() => {
    if (droneOscRef.current) {
      try {
        droneOscRef.current.osc1.stop();
        droneOscRef.current.osc2.stop();
        droneOscRef.current.osc1.disconnect();
        droneOscRef.current.osc2.disconnect();
        droneOscRef.current.gain.disconnect();
      } catch {
        // already stopped
      }
      droneOscRef.current = null;
    }
    setActiveDroneNoteLabel(null);
  }, []);

  useEffect(() => {
    return () => {
      stopLiveDrone();
    };
  }, [stopLiveDrone]);

  const handleApplyVocalPreset = (preset: RockVocalPresetSpec) => {
    setSelectedPresetId(preset.id);
    const d = preset.defaultParams;
    setPitchSemitones(d.pitchSemitones);
    setFineCents(d.fineCents);
    setFormantShift(d.formantShift);
    setAdtDelayMs(d.adtDelayMs);
    setAdtDetuneCents(d.adtDetuneCents);
    setAdtWowHz(d.adtWowHz);
    setAdtWidthPct(d.adtWidthPct);
    setHarmonyMode(d.harmonyMode);
    setHarmonyBlendPct(d.harmonyBlendPct);
    setTubeDriveDb(d.tubeDriveDb);
    setSlapbackMs(d.slapbackMs);
    setSlapbackFeedbackPct(d.slapbackFeedbackPct);
    setWetMix(d.wetMix);
    setVocalStatus(`PRESET LOADED // [${preset.shortTag}] — ${preset.name.toUpperCase()}`);
  };

  const handleRenderVocalLab = async (overridePreset?: RockVocalPresetSpec) => {
    if (!activeBuffer) return;
    setIsRenderingVocal(true);

    const p: VocalLabParameters = overridePreset
      ? {
          presetId: overridePreset.id,
          ...overridePreset.defaultParams,
        }
      : {
          presetId: selectedPresetId,
          pitchSemitones,
          fineCents,
          formantShift,
          adtDelayMs,
          adtDetuneCents,
          adtWowHz,
          adtWidthPct,
          harmonyMode,
          harmonyBlendPct,
          tubeDriveDb,
          slapbackMs,
          slapbackFeedbackPct,
          wetMix,
        };

    const presetName = overridePreset ? overridePreset.name : activeVocalPreset.name;
    setVocalStatus(
      `RENDERING 03.1 VOCAL DSP // [${presetName.toUpperCase()}] PITCH=${p.pitchSemitones >= 0 ? "+" : ""}${p.pitchSemitones}st FORMANT=${p.formantShift >= 0 ? "+" : ""}${p.formantShift}st ADT=${p.adtDelayMs}ms...`
    );

    try {
      const rendered = await renderVocalPitchLabDsp(activeBuffer, p);
      const label = `03.1 VOCAL LAB // ${presetName.toUpperCase()} (${p.pitchSemitones >= 0 ? "+" : ""}${p.pitchSemitones}st / FORMANT ${p.formantShift >= 0 ? "+" : ""}${p.formantShift}st / ADT ${p.adtDelayMs}ms)`;
      onCommitBuffer(rendered, label);

      try {
        const res = await fetch("/api/v1/tools/voice-changer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tool_id: "voice-changer",
            tool_code: "03.1",
            sample_rate: rendered.sampleRate,
            channels: rendered.numberOfChannels,
            duration_seconds: rendered.duration,
            peak_db: -1.2,
            rms_db: -13.8,
            parameters: {
              presetId: p.presetId,
              vocalCharacter: presetName,
              pitchSemitones: p.pitchSemitones,
              fineCents: p.fineCents,
              formantShift: p.formantShift,
              adtDelayMs: p.adtDelayMs,
              adtDetuneCents: p.adtDetuneCents,
              adtWowHz: p.adtWowHz,
              adtWidthPct: p.adtWidthPct,
              harmonyMode: p.harmonyMode,
              harmonyBlendPct: p.harmonyBlendPct,
              tubeDriveDb: p.tubeDriveDb,
              slapbackMs: p.slapbackMs,
              wetMix: p.wetMix,
            },
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { dsp_chain_summary?: string[] };
          if (data.dsp_chain_summary) {
            setApiChainLog(data.dsp_chain_summary);
          }
        }
      } catch {
        // Non-blocking API telemetry
      }

      setVocalStatus(
        `COMPLETE // ${label} COMMITTED TO ACTIVE STUDIO BUS`
      );
    } catch {
      setVocalStatus("ERROR // FAILED TO RENDER 03.1 VOCAL LAB DSP");
    } finally {
      setIsRenderingVocal(false);
    }
  };

  const handleExportTransformedWav = () => {
    if (!activeBuffer) return;
    const blob = encodeAudioBufferToWavBlob(activeBuffer);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `weaksauce-03.1-${selectedPresetId}-${pitchSemitones}st.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setVocalStatus(
      `EXPORTED // weaksauce-03.1-${selectedPresetId}-${pitchSemitones}st.wav`
    );
  };

  const handleAddBatchTracks = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    setBpmStatus(`ANALYZING ${files.length} TRACK(S) WITH ${lowPassCutoffHz}Hz LPF BEAT TRACKER & 12-BIN CHROMA...`);

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = droneCtxRef.current ?? new AudioCtx();
    droneCtxRef.current = ctx;

    const newRows: BatchTrackAnalysisRow[] = [];
    for (const file of files) {
      try {
        const ab = await file.arrayBuffer();
        const decoded = await ctx.decodeAudioData(ab);
        const row = analyzeTrackKeyAndBpm(decoded, file.name, "UPLOAD", lowPassCutoffHz);
        newRows.push(row);
      } catch {
        // Skip undecodable file
      }
    }

    if (newRows.length > 0) {
      setBatchRows((prev) => [...newRows, ...prev]);
      setSelectedRowId(newRows[0].id);

      try {
        await fetch("/api/v1/tools/bpm-finder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tool_id: "bpm-finder",
            tool_code: "03.2",
            sample_rate: newRows[0].sampleRate,
            channels: 2,
            duration_seconds: newRows[0].durationSec,
            peak_db: -1.0,
            rms_db: -13.5,
            parameters: {
              detectedBpm: newRows[0].bpm,
              detectedKey: newRows[0].keyAndScale,
              camelotCode: newRows[0].camelotCode,
              lowPassBeatHz: lowPassCutoffHz,
              batchCount: batchRows.length + newRows.length,
            },
          }),
        });
      } catch {
        // non-blocking
      }

      setBpmStatus(
        `BATCH COMPLETE // ADDED ${newRows.length} TRACK(S) — TOP: ${newRows[0].fileName} (${newRows[0].bpm} BPM / ${newRows[0].keyAndScale})`
      );
    } else {
      setBpmStatus("WARNING // COULD NOT DECODE SELECTED AUDIO FILE(S)");
    }
    e.target.value = "";
  };

  const handleAnalyzeActiveBusIntoBatch = async () => {
    if (!activeBuffer) return;
    const row = analyzeTrackKeyAndBpm(
      activeBuffer,
      `STUDIO_BUS_TAKE_${batchRows.length + 1}.wav`,
      "ACTIVE_BUS",
      lowPassCutoffHz
    );
    setBatchRows((prev) => [row, ...prev]);
    setSelectedRowId(row.id);
    setManualBpmOverride(null);
    setTappedBpm(null);
    setBpmStatus(
      `ANALYZED ACTIVE BUS // ${row.bpm} BPM | KEY: ${row.keyAndScale} (${row.camelotCode}) | CONFIDENCE: ${row.confidencePct}%`
    );
  };

  const handleTapTempoTrigger = useCallback(() => {
    const now = performance.now();
    setTapTimestamps((prev) => {
      const recent = [...prev.filter((t) => now - t < 3500), now];
      if (recent.length >= 2) {
        const intervals: number[] = [];
        for (let i = 1; i < recent.length; i++) {
          intervals.push(recent[i] - recent[i - 1]);
        }
        const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const computed = Math.round((60000 / avgMs) * 10) / 10;
        setTappedBpm(computed);
        setManualBpmOverride(null);
        setBpmStatus(
          `TAP TEMPO LOCKED // ${computed} BPM (${recent.length} TAPS) -> DOTTED 1/8 DELAY = ${(
            (60000 / computed) *
            0.75
          ).toFixed(1)} ms`
        );
      } else {
        setBpmStatus("TAP TEMPO // FIRST TAP REGISTERED — KEEP TAPPING SPACEBAR OR PAD...");
      }
      return recent;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (labSubTab !== "BPM_FINDER") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        handleTapTempoTrigger();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [labSubTab, handleTapTempoTrigger]);

  const handleToggleNoteDrone = async (label: string, freqHz: number) => {
    if (activeDroneNoteLabel === label) {
      stopLiveDrone();
      setBpmStatus(`STOPPED REFERENCE TUNING DRONE // ${label}`);
      return;
    }
    stopLiveDrone();
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!droneCtxRef.current) {
      droneCtxRef.current = new AudioCtx();
    }
    const ctx = droneCtxRef.current;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc1.type = "sawtooth";
    osc1.frequency.value = freqHz;

    osc2.type = "triangle";
    osc2.frequency.value = freqHz * 2;

    filter.type = "lowpass";
    filter.frequency.value = freqHz * 4.5;

    gain.gain.value = 0.16;

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();

    droneOscRef.current = { osc1, osc2, gain };
    setActiveDroneNoteLabel(label);
    setBpmStatus(
      `PLAYING LIVE TUNING DRONE // ${label} (${freqHz.toFixed(2)} Hz) — CLICK AGAIN TO STOP`
    );
  };

  const handleCommitDroneToBus = (presetId: TuningDronePresetId, freqHz?: number, noteTag?: string) => {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!droneCtxRef.current) {
      droneCtxRef.current = new AudioCtx();
    }
    const buf = synthesizeTuningDroneBuffer(droneCtxRef.current, presetId, freqHz, 4.0);
    const presetObj =
      ROCK_TUNING_DRONES.find((d) => d.id === presetId) ?? ROCK_TUNING_DRONES[0];
    const label = noteTag
      ? `TUNING REFERENCE DRONE // ${presetObj.shortLabel} — ${noteTag} (${freqHz} Hz)`
      : `TUNING REFERENCE CHORD DRONE // ${presetObj.shortLabel}`;
    onCommitBuffer(buf, label);
    setBpmStatus(`COMMITTED TO STUDIO BUS // ${label}`);
  };

  const handleExportBatchCsv = () => {
    const rows = batchRows.length > 0 ? batchRows : activeBufferAnalysis ? [activeBufferAnalysis] : [];
    if (rows.length === 0) return;

    const header = [
      "File Name",
      "BPM",
      "Half BPM",
      "Double BPM",
      "Key & Scale",
      "Relative Key",
      "Camelot",
      "Confidence (%)",
      "1/4 Delay (ms)",
      "1/8. Dotted Delay (ms)",
      "1/8 Delay (ms)",
      "1/8T Triplet Delay (ms)",
      "1/16 Slapback (ms)",
      "Tuning Hint",
    ].join(",");

    const lines = rows.map((r) =>
      [
        `"${r.fileName.replace(/"/g, '""')}"`,
        r.bpm,
        r.halfBpm,
        r.doubleBpm,
        `"${r.keyAndScale}"`,
        `"${r.relativePairKey}"`,
        r.camelotCode,
        r.confidencePct,
        r.delays.quarterMs,
        r.delays.dottedEighthMs,
        r.delays.eighthMs,
        r.delays.eighthTripletMs,
        r.delays.sixteenthSlapbackMs,
        `"${r.tuningHint}"`,
      ].join(",")
    );

    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "weaksauce-03.2-setlist-key-bpm-delays.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setBpmStatus("EXPORTED SETLIST MANIFEST // weaksauce-03.2-setlist-key-bpm-delays.csv");
  };

  const activeTuningPreset = useMemo(
    () =>
      ROCK_TUNING_DRONES.find((d) => d.id === selectedDronePresetId) ??
      ROCK_TUNING_DRONES[0],
    [selectedDronePresetId]
  );

  const detectedBaseKey = activeBufferAnalysis?.keyAndScale ?? "E Minor";
  const transposedTargetKey = transposeKeyLabel(detectedBaseKey, pitchSemitones);

  return (
    <div className="space-y-4">
      <div className="border-2 border-current p-3 bg-[#141414] text-[#F4F3EF] flex flex-wrap items-center justify-between gap-3 shadow-[4px_4px_0px_#FF3B00]">
        <div>
          <div className="text-[11px] font-black uppercase tracking-widest text-[#FF3B00]">
            TOOLSET 03 // VOCAL, KEY & BPM LAB — DEDICATED STUDIO RACK
          </div>
          <div className="text-sm sm:text-base font-black uppercase">
            {labSubTab === "VOICE_CHANGER"
              ? "[03.1] VOCAL PITCH, FORMANT & ABBEY ROAD ADT DOUBLER LAB (VOICE.AI/TOOLS/VOICE-CHANGER)"
              : "[03.2] KEY & BPM FINDER + BATCH TABLE + PEDAL DELAY CALCULATOR (VOICE.AI/TOOLS/BPM-FINDER)"}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setLabSubTab("VOICE_CHANGER")}
            className={`px-3 py-1.5 border-2 text-xs font-black uppercase cursor-pointer ${
              labSubTab === "VOICE_CHANGER"
                ? "bg-[#B8FF01] text-[#0D0D0D] border-[#0D0D0D] shadow-[3px_3px_0px_#FF3B00]"
                : "border-[#F4F3EF] text-[#F4F3EF] hover:bg-[#FF3B00] hover:text-[#0D0D0D]"
            }`}
          >
            03.1 VOCAL PITCH / ADT / HARMONY LAB
          </button>
          <button
            type="button"
            onClick={() => setLabSubTab("BPM_FINDER")}
            className={`px-3 py-1.5 border-2 text-xs font-black uppercase cursor-pointer ${
              labSubTab === "BPM_FINDER"
                ? "bg-[#00E5FF] text-[#0D0D0D] border-[#0D0D0D] shadow-[3px_3px_0px_#B8FF01]"
                : "border-[#F4F3EF] text-[#F4F3EF] hover:bg-[#00E5FF] hover:text-[#0D0D0D]"
            }`}
          >
            03.2 KEY & BPM FINDER + DELAY CALC
          </button>
        </div>
      </div>

      {labSubTab === "VOICE_CHANGER" ? (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-8 border-2 border-current p-4 space-y-4 shadow-[4px_4px_0px_#00E5FF]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-current pb-2">
              <div>
                <span className="text-xs font-black uppercase text-[#B8FF00] bg-[#0D0D0D] px-2 py-0.5 border border-current">
                  REFRAMED FROM VOICE.AI/TOOLS/VOICE-CHANGER
                </span>
                <h2 className="text-base sm:text-lg font-black uppercase mt-1">
                  8 ROCK STUDIO VOCAL & INSTRUMENT TRANSFORMATIONS (NO 15S CAP • NO CARTOON SKINS)
                </h2>
              </div>
              <div className="text-xs font-black px-2.5 py-1 bg-[#FF3B00] text-[#0D0D0D] border-2 border-[#0D0D0D]">
                KEY TRANSPOSE PREVIEW: {detectedBaseKey} → {transposedTargetKey}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-black uppercase">
                <span className="text-[#00E5FF]">
                  STEP 1 // SELECT STUDIO ROCK VOCAL PRESET (1-CLICK LOAD OR AUDITION)
                </span>
                <span className="opacity-75">
                  ACTIVE: #{activeVocalPreset.index} {activeVocalPreset.name.toUpperCase()}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {ROCK_VOCAL_PRESETS.map((preset) => {
                  const isSelected = preset.id === selectedPresetId;
                  return (
                    <div
                      key={preset.id}
                      className={`border-2 p-2.5 flex flex-col justify-between gap-2 transition-none ${
                        isSelected
                          ? "border-[#B8FF01] bg-[#1A2108] text-[#F4F3EF] shadow-[3px_3px_0px_#FF3B00]"
                          : "border-current bg-black/20 hover:bg-[#B8FF01]/10"
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] font-black px-1.5 py-0.5 bg-[#B8FF01] text-[#0D0D0D]">
                            {preset.shortTag}
                          </span>
                          <span className="text-[10px] font-bold text-[#00E5FF]">
                            {preset.defaultParams.pitchSemitones >= 0 ? "+" : ""}
                            {preset.defaultParams.pitchSemitones} ST
                          </span>
                        </div>
                        <div className="text-xs font-black uppercase leading-tight">
                          {preset.name}
                        </div>
                        <p className="text-[10px] opacity-80 leading-snug">
                          {preset.description}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 pt-1 border-t border-current/25">
                        <button
                          type="button"
                          onClick={() => handleApplyVocalPreset(preset)}
                          className={`flex-1 py-1 text-[10px] font-black uppercase border cursor-pointer ${
                            isSelected
                              ? "bg-[#B8FF01] text-[#0D0D0D] border-[#0D0D0D]"
                              : "border-current hover:bg-[#B8FF01] hover:text-[#0D0D0D]"
                          }`}
                        >
                          {isSelected ? "✓ LOADED" : "LOAD KNOBS"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleApplyVocalPreset(preset);
                            void handleRenderVocalLab(preset);
                          }}
                          className="px-2 py-1 text-[10px] font-black uppercase border border-[#0D0D0D] bg-[#FF3B00] text-[#0D0D0D] cursor-pointer hover:bg-[#00E5FF]"
                        >
                          ⚡ RENDER
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-2 border-current p-3 bg-black/20 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-black uppercase text-[#B8FF01]">
                  STEP 2 // PITCH TRANSPOSE (-12..+12 ST), FINE CENTS (-100..+100) & THROAT FORMANT (-12..+12 ST)
                </span>
                <div className="flex flex-wrap gap-1">
                  {[-12, -7, -5, -2, -1, 0, 1, 2, 4, 7, 12].map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setPitchSemitones(st)}
                      className={`px-1.5 py-0.5 text-[10px] font-black border cursor-pointer ${
                        pitchSemitones === st
                          ? "bg-[#FF3B00] text-[#0D0D0D] border-[#0D0D0D]"
                          : "border-current hover:bg-[#B8FF01] hover:text-[#0D0D0D]"
                      }`}
                    >
                      {st > 0 ? `+${st}` : st}st
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="border-2 border-current p-2.5 bg-[#0D0D0D] text-[#F4F3EF] space-y-1.5">
                  <div className="flex justify-between text-xs font-black">
                    <span>SET PITCH (SEMITONES)</span>
                    <span className="px-1.5 bg-[#B8FF01] text-[#0D0D0D]">
                      {pitchSemitones > 0 ? `+${pitchSemitones}` : pitchSemitones} ST
                    </span>
                  </div>
                  <input
                    type="range"
                    aria-label="Set Pitch (Semitones)"
                    min={-12}
                    max={12}
                    step={1}
                    value={pitchSemitones}
                    onChange={(e) => setPitchSemitones(parseFloat(e.target.value))}
                    className="w-full accent-[#FF3B00] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] opacity-70">
                    <span>-12 ST (OCT DN)</span>
                    <span>0 ST</span>
                    <span>+12 ST (OCT UP)</span>
                  </div>
                </div>

                <div className="border-2 border-current p-2.5 bg-[#0D0D0D] text-[#F4F3EF] space-y-1.5">
                  <div className="flex justify-between text-xs font-black">
                    <span>FINE TUNE (CENTS)</span>
                    <span className="px-1.5 bg-[#00E5FF] text-[#0D0D0D]">
                      {fineCents > 0 ? `+${fineCents}` : fineCents} CT
                    </span>
                  </div>
                  <input
                    type="range"
                    aria-label="Fine Tune (Cents)"
                    min={-100}
                    max={100}
                    step={1}
                    value={fineCents}
                    onChange={(e) => setFineCents(parseFloat(e.target.value))}
                    className="w-full accent-[#00E5FF] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] opacity-70">
                    <span>-100 CT</span>
                    <span>440 Hz CENTER</span>
                    <span>+100 CT</span>
                  </div>
                </div>

                <div className="border-2 border-current p-2.5 bg-[#0D0D0D] text-[#F4F3EF] space-y-1.5">
                  <div className="flex justify-between text-xs font-black">
                    <span>FORMANT SHIFT (THROAT)</span>
                    <span className="px-1.5 bg-[#FF3B00] text-[#0D0D0D]">
                      {formantShift > 0 ? `+${formantShift}` : formantShift} ST
                    </span>
                  </div>
                  <input
                    type="range"
                    aria-label="Formant Shift"
                    min={-12}
                    max={12}
                    step={0.5}
                    value={formantShift}
                    onChange={(e) => setFormantShift(parseFloat(e.target.value))}
                    className="w-full accent-[#B8FF01] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] opacity-70">
                    <span>-12 ST (CHEST)</span>
                    <span>0 ST (NATURAL)</span>
                    <span>+12 ST (HEAD)</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="border-2 border-current p-3 bg-black/20 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-[#00E5FF]">
                    ABBEY ROAD ADT STEREO DOUBLER (15–35ms TAPE + WOW)
                  </span>
                  <span className="text-[10px] font-black px-1.5 py-0.5 bg-[#00E5FF] text-[#0D0D0D]">
                    {adtDelayMs}ms / ±{adtDetuneCents}ct
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <div className="flex justify-between font-bold text-[11px]">
                      <span>ADT TAPE DELAY LAG (15–35 ms)</span>
                      <span className="text-[#B8FF01]">{adtDelayMs} ms</span>
                    </div>
                    <input
                      type="range"
                      aria-label="ADT Tape Delay Lag"
                      min={15}
                      max={35}
                      step={1}
                      value={adtDelayMs}
                      onChange={(e) => setAdtDelayMs(parseFloat(e.target.value))}
                      className="w-full accent-[#00E5FF] cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between font-bold text-[11px]">
                      <span>CLONE DETUNE SPREAD (±CENTS)</span>
                      <span className="text-[#B8FF01]">±{adtDetuneCents} ct</span>
                    </div>
                    <input
                      type="range"
                      aria-label="Clone Detune Spread"
                      min={0}
                      max={35}
                      step={1}
                      value={adtDetuneCents}
                      onChange={(e) => setAdtDetuneCents(parseFloat(e.target.value))}
                      className="w-full accent-[#00E5FF] cursor-pointer"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="flex justify-between font-bold text-[10px]">
                        <span>WOW LFO RATE</span>
                        <span>{adtWowHz} Hz</span>
                      </div>
                      <input
                        type="range"
                        aria-label="ADT Wow LFO Rate"
                        min={0.2}
                        max={3.5}
                        step={0.1}
                        value={adtWowHz}
                        onChange={(e) => setAdtWowHz(parseFloat(e.target.value))}
                        className="w-full accent-[#B8FF01] cursor-pointer"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between font-bold text-[10px]">
                        <span>STEREO ADT WIDTH</span>
                        <span>{adtWidthPct}%</span>
                      </div>
                      <input
                        type="range"
                        aria-label="Stereo ADT Width"
                        min={0}
                        max={100}
                        step={5}
                        value={adtWidthPct}
                        onChange={(e) => setAdtWidthPct(parseFloat(e.target.value))}
                        className="w-full accent-[#B8FF01] cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-2 border-current p-3 bg-black/20 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-[#FF3B00]">
                    3-PART HARMONY STACKER & TUBE PREAMP SATURATION
                  </span>
                  <span className="text-[10px] font-black px-1.5 py-0.5 bg-[#FF3B00] text-[#0D0D0D]">
                    DRIVE +{tubeDriveDb}dB
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <label className="block text-[11px] font-black uppercase text-[#B8FF01] mb-1">
                      3-PART ROCK VOCAL HARMONY VOICING
                    </label>
                    <select
                      aria-label="3-Part Rock Vocal Harmony Voicing"
                      value={harmonyMode}
                      onChange={(e) => {
                        const mode = e.target.value as HarmonyVoicingMode;
                        setHarmonyMode(mode);
                        if (mode !== "off" && harmonyBlendPct === 0) {
                          setHarmonyBlendPct(65);
                        }
                      }}
                      className="w-full p-1.5 border-2 border-current bg-[#0D0D0D] text-[#F4F3EF] text-xs font-bold"
                    >
                      <option value="off">OFF (SINGLE LEAD + ADT DOUBLE ONLY)</option>
                      <option value="root-3rd-5th-minor">
                        ROOT + MINOR 3RD (+3 ST) + PERFECT 5TH (+7 ST) [ROCK MINOR]
                      </option>
                      <option value="root-3rd-5th-major">
                        ROOT + MAJOR 3RD (+4 ST) + PERFECT 5TH (+7 ST) [ROCK MAJOR]
                      </option>
                      <option value="octave-up-down">
                        ROOT + SUB OCTAVE (-12 ST) + HIGH OCTAVE (+12 ST) [3-OCTAVE STACK]
                      </option>
                      <option value="power-fifth-stack">
                        ROOT + LOW 4TH (-5 ST) + HIGH 5TH (+7 ST) [POWER CHORD VOX]
                      </option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="flex justify-between font-bold text-[10px]">
                        <span>HARMONY STACK BLEND</span>
                        <span className="text-[#B8FF01]">{harmonyBlendPct}%</span>
                      </div>
                      <input
                        type="range"
                        aria-label="Harmony Stack Blend"
                        min={0}
                        max={100}
                        step={5}
                        value={harmonyBlendPct}
                        onChange={(e) => setHarmonyBlendPct(parseFloat(e.target.value))}
                        className="w-full accent-[#FF3B00] cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between font-bold text-[10px]">
                        <span>TUBE PREAMP DRIVE</span>
                        <span className="text-[#FF3B00]">+{tubeDriveDb} dB</span>
                      </div>
                      <input
                        type="range"
                        aria-label="Tube Preamp Drive"
                        min={0}
                        max={18}
                        step={0.5}
                        value={tubeDriveDb}
                        onChange={(e) => setTubeDriveDb(parseFloat(e.target.value))}
                        className="w-full accent-[#FF3B00] cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="flex justify-between font-bold text-[10px]">
                        <span>TAPE SLAPBACK DELAY</span>
                        <span className="text-[#00E5FF]">{slapbackMs} ms</span>
                      </div>
                      <input
                        type="range"
                        aria-label="Tape Slapback Delay"
                        min={0}
                        max={220}
                        step={5}
                        value={slapbackMs}
                        onChange={(e) => setSlapbackMs(parseFloat(e.target.value))}
                        className="w-full accent-[#00E5FF] cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between font-bold text-[10px]">
                        <span>DRY / WET EFFECT MIX</span>
                        <span className="text-[#B8FF01]">{wetMix}%</span>
                      </div>
                      <input
                        type="range"
                        aria-label="Dry / Wet Effect Mix"
                        min={0}
                        max={100}
                        step={5}
                        value={wetMix}
                        onChange={(e) => setWetMix(parseFloat(e.target.value))}
                        className="w-full accent-[#B8FF01] cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t-2 border-current flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isRenderingVocal}
                  onClick={() => void handleRenderVocalLab()}
                  className="px-4 py-2 border-2 border-[#0D0D0D] bg-[#B8FF01] text-[#0D0D0D] font-black text-xs uppercase cursor-pointer shadow-[3px_3px_0px_#FF3B00] hover:bg-[#00E5FF]"
                >
                  {isRenderingVocal
                    ? "RENDERING WSOLA + ADT..."
                    : "⚡ RENDER & COMMIT VOCAL LAB TO STUDIO BUS"}
                </button>

                <button
                  type="button"
                  onClick={() => handleApplyVocalPreset(activeVocalPreset)}
                  className="px-3 py-2 border-2 border-current text-xs font-bold uppercase cursor-pointer hover:bg-[#FF3B00] hover:text-[#0D0D0D]"
                >
                  RESET TO PRESET DEFAULTS
                </button>
              </div>

              <button
                type="button"
                onClick={handleExportTransformedWav}
                className="px-3 py-2 border-2 border-[#0D0D0D] bg-[#FF3B00] text-[#0D0D0D] font-black text-xs uppercase cursor-pointer hover:bg-[#B8FF01]"
              >
                ⬇ DOWNLOAD TRANSFORMED WAV
              </button>
            </div>

            <div className="text-xs font-bold px-2.5 py-1.5 border-2 border-current bg-black/30 text-[#B8FF01]">
              {vocalStatus}
            </div>
          </div>

          <div className="xl:col-span-4 border-2 border-current p-4 space-y-4 shadow-[4px_4px_0px_#B8FF01]">
            <div className="border-b-2 border-current pb-2">
              <span className="text-xs font-black uppercase text-[#FF3B00]">
                03.1 STUDIO VOCAL ARCHITECTURE
              </span>
              <h3 className="text-sm font-black uppercase">
                ACTIVE PRESET: {activeVocalPreset.name}
              </h3>
            </div>

            <div className="border-2 border-current p-3 bg-black/25 space-y-2 text-xs">
              <div className="font-black uppercase text-[#00E5FF]">
                JEFF&apos;S 3-PIECE ROCK BAND APPLICATION
              </div>
              <p className="leading-relaxed">{activeVocalPreset.bandUseCase}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="border-2 border-current p-2 bg-[#0D0D0D] text-[#F4F3EF]">
                <div className="text-[10px] opacity-70">PITCH RATIO</div>
                <div className="text-sm font-black text-[#B8FF01]">
                  {Math.pow(2, (pitchSemitones + fineCents / 100) / 12).toFixed(3)}x (
                  {pitchSemitones >= 0 ? `+${pitchSemitones}` : pitchSemitones}st)
                </div>
              </div>
              <div className="border-2 border-current p-2 bg-[#0D0D0D] text-[#F4F3EF]">
                <div className="text-[10px] opacity-70">FORMANT ENVELOPE</div>
                <div className="text-sm font-black text-[#00E5FF]">
                  {formantShift >= 0 ? `+${formantShift}` : formantShift} ST WARP
                </div>
              </div>
              <div className="border-2 border-current p-2 bg-[#0D0D0D] text-[#F4F3EF]">
                <div className="text-[10px] opacity-70">ABBEY ROAD ADT</div>
                <div className="text-sm font-black text-[#FF3B00]">
                  {adtDelayMs}ms / ±{adtDetuneCents}ct ({adtWidthPct}%)
                </div>
              </div>
              <div className="border-2 border-current p-2 bg-[#0D0D0D] text-[#F4F3EF]">
                <div className="text-[10px] opacity-70">3-PART HARMONY</div>
                <div className="text-sm font-black text-[#B8FF01]">
                  {harmonyMode === "off" ? "BYPASSED" : `${harmonyMode.toUpperCase()} (${harmonyBlendPct}%)`}
                </div>
              </div>
            </div>

            <div className="border-2 border-[#FF3B00] p-3 bg-[#FF3B00]/10 text-xs space-y-1.5">
              <div className="font-black uppercase text-[#FF3B00]">
                WHY WE REFRAMED VOICE.AI/TOOLS/VOICE-CHANGER
              </div>
              <p className="text-[11px] leading-snug">
                Raw <code>voice.ai/tools/voice-changer</code> caps uploads at 15 seconds and pushes
                cartoon/celebrity/politician skins. We kept its exact{" "}
                <strong>-12 to +12 Semitone Pitch Shifter</strong> and replaced the gimmicks with
                full-length <strong>Formant Shifting</strong>,{" "}
                <strong>Abbey Road ADT Doubling</strong>,{" "}
                <strong>3-Part Rock Vocal Harmony Stacking</strong>, and{" "}
                <strong>Driven Tube Preamp Saturation</strong>.
              </p>
            </div>

            <div className="border-2 border-current p-2.5 bg-[#0D0D0D] text-[#F4F3EF] space-y-1 text-[11px]">
              <div className="font-black uppercase text-[#B8FF01]">
                POST /api/v1/tools/voice-changer DSP CHAIN
              </div>
              {apiChainLog.map((line, idx) => (
                <div key={`${line}-${idx}`} className="truncate font-mono text-[#00E5FF]">
                  {line}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-7 border-2 border-current p-4 space-y-4 shadow-[4px_4px_0px_#00E5FF]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-current pb-2">
              <div>
                <span className="text-xs font-black uppercase text-[#00E5FF]">
                  VOICE.AI/TOOLS/BPM-FINDER PARITY ENGINE (240HZ LPF + 12-BIN CHROMA)
                </span>
                <h2 className="text-base sm:text-lg font-black uppercase">
                  MULTI-TRACK BATCH KEY, SCALE, CAMELOT & BPM ANALYZER
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="px-3 py-1.5 border-2 border-[#0D0D0D] bg-[#B8FF01] text-[#0D0D0D] text-xs font-black uppercase cursor-pointer shadow-[3px_3px_0px_#FF3B00] hover:bg-[#00E5FF]">
                  [+ ADD TRACKS TO BATCH]
                  <input
                    type="file"
                    accept="audio/*,video/*"
                    multiple
                    onChange={handleAddBatchTracks}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => void handleAnalyzeActiveBusIntoBatch()}
                  className="px-2.5 py-1.5 border-2 border-current text-xs font-black uppercase cursor-pointer hover:bg-[#FF3B00] hover:text-[#0D0D0D]"
                >
                  + SCAN ACTIVE BUS
                </button>

                <button
                  type="button"
                  onClick={handleExportBatchCsv}
                  className="px-2.5 py-1.5 border-2 border-current text-xs font-black uppercase cursor-pointer hover:bg-[#B8FF01] hover:text-[#0D0D0D]"
                >
                  ⬇ EXPORT CSV
                </button>
              </div>
            </div>

            <div className="border-2 border-current p-2.5 bg-black/20 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-[#00E5FF] text-[#0D0D0D] font-black">
                  BEAT LPF: {lowPassCutoffHz} Hz
                </span>
                <span className="opacity-85">
                  Kick/Bass Onset Low-Pass Filter (voice.ai <code>C5vx8orS.js</code> default ={" "}
                  <strong>240 Hz</strong>)
                </span>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-56">
                <input
                  type="range"
                  aria-label="Beat Detector Low-Pass Cutoff Hz"
                  min={120}
                  max={400}
                  step={10}
                  value={lowPassCutoffHz}
                  onChange={(e) => setLowPassCutoffHz(parseFloat(e.target.value))}
                  className="w-full accent-[#00E5FF] cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => setLowPassCutoffHz(240)}
                  className="px-2 py-0.5 border border-current text-[10px] font-black uppercase cursor-pointer"
                >
                  240Hz
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border-2 border-current bg-[#0D0D0D] text-[#F4F3EF]">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b-2 border-[#F4F3EF] bg-[#1A1A1A] text-[10px] font-black uppercase tracking-wider">
                    <th className="p-2">FILE</th>
                    <th className="p-2 text-[#B8FF01]">BPM</th>
                    <th className="p-2">HALF / DOUBLE BPM</th>
                    <th className="p-2 text-[#00E5FF]">KEY &amp; SCALE</th>
                    <th className="p-2">CAMELOT</th>
                    <th className="p-2">CONFIDENCE</th>
                    <th className="p-2">1/8. DELAY</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#333333]">
                  {batchRows.map((row) => {
                    const isSelected = selectedBatchRow?.id === row.id;
                    return (
                      <tr
                        key={row.id}
                        onClick={() => {
                          setSelectedRowId(row.id);
                          setManualBpmOverride(null);
                          setTappedBpm(null);
                        }}
                        className={`cursor-pointer ${
                          isSelected
                            ? "bg-[#1E260A] text-[#F4F3EF] font-bold"
                            : "hover:bg-[#191919]"
                        }`}
                      >
                        <td className="p-2 max-w-[190px] truncate">
                          <span
                            className={`inline-block w-2 h-2 mr-1.5 ${
                              isSelected ? "bg-[#B8FF01]" : "bg-[#00E5FF]"
                            }`}
                          />
                          {row.fileName}
                        </td>
                        <td className="p-2 font-black text-[#B8FF01]">{row.bpm} BPM</td>
                        <td className="p-2 opacity-80">
                          {row.halfBpm} / {row.doubleBpm}
                        </td>
                        <td className="p-2 font-black text-[#00E5FF]">{row.keyAndScale}</td>
                        <td className="p-2">
                          <span className="px-1.5 py-0.5 bg-[#FF3B00] text-[#0D0D0D] font-black text-[10px]">
                            {row.camelotCode}
                          </span>
                        </td>
                        <td className="p-2 font-bold">{row.confidencePct}%</td>
                        <td className="p-2 text-[#B8FF01] font-mono">
                          {row.delays.dottedEighthMs} ms
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {selectedBatchRow && (
              <div className="border-2 border-current p-3 bg-[#0D0D0D] text-[#F4F3EF] space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-black uppercase text-[#B8FF01]">
                    12-BIN CHROMAGRAM ENERGY VISUALIZER // {selectedBatchRow.fileName}
                  </span>
                  <span className="text-[11px] text-[#00E5FF] font-bold">
                    KEY: {selectedBatchRow.keyAndScale} ({selectedBatchRow.camelotCode}) • RELATIVE:{" "}
                    {selectedBatchRow.relativePairKey} • TUNING: {selectedBatchRow.tuningHint}
                  </span>
                </div>

                <div className="grid grid-cols-12 gap-1.5 items-end h-28 border border-[#333333] p-2 bg-[#121212]">
                  {selectedBatchRow.chromaEnergy.map((bin) => {
                    const isRoot = bin.note === selectedBatchRow.keyNote;
                    return (
                      <div
                        key={bin.note}
                        className="flex flex-col items-center justify-end h-full gap-1"
                      >
                        <span className="text-[9px] font-mono opacity-75">{bin.energy}%</span>
                        <div
                          style={{ height: `${Math.max(10, bin.energy)}%` }}
                          className={`w-full border border-black ${
                            isRoot
                              ? "bg-[#FF3B00]"
                              : bin.energy >= 70
                              ? "bg-[#B8FF01]"
                              : "bg-[#00E5FF]"
                          }`}
                        />
                        <span
                          className={`text-[10px] font-black ${
                            isRoot ? "text-[#FF3B00] underline" : "text-[#F4F3EF]"
                          }`}
                        >
                          {bin.note}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="text-xs font-bold px-2.5 py-1.5 border-2 border-current bg-black/30 text-[#00E5FF]">
              {bpmStatus}
            </div>
          </div>

          <div className="xl:col-span-5 border-2 border-current p-4 space-y-4 shadow-[4px_4px_0px_#FF3B00]">
            <div className="border-2 border-current p-3 bg-[#0D0D0D] text-[#F4F3EF] space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#333333] pb-2">
                <div>
                  <span className="text-[10px] font-black uppercase text-[#FF3B00]">
                    GUITAR DELAY PEDAL &amp; STUDIO PRE-DELAY CALCULATOR
                  </span>
                  <h3 className="text-sm font-black uppercase text-[#B8FF01]">
                    EXACT SUBDIVISIONS @ {delaySubdivisions.bpm} BPM
                  </h3>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    aria-label="Manual BPM Override"
                    min={40}
                    max={260}
                    step={0.5}
                    value={effectiveBpmForDelayCalc}
                    onChange={(e) => setManualBpmOverride(parseFloat(e.target.value) || 120)}
                    className="w-20 px-2 py-1 border border-[#B8FF01] bg-[#161616] text-[#B8FF01] text-xs font-black"
                  />
                  <span className="text-[10px] font-bold">BPM</span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div className="border border-[#333333] p-2 bg-[#141414]">
                  <div className="text-[10px] opacity-70">1/4 QUARTER NOTE</div>
                  <div className="text-base font-black text-[#F4F3EF]">
                    {delaySubdivisions.quarterMs} ms
                  </div>
                  <div className="text-[9px] text-[#00E5FF]">Standard Solo Repeat</div>
                </div>

                <div className="border-2 border-[#B8FF01] p-2 bg-[#1B2208]">
                  <div className="text-[10px] font-black text-[#B8FF01]">1/8. DOTTED EIGHTH</div>
                  <div className="text-base font-black text-[#B8FF01]">
                    {delaySubdivisions.dottedEighthMs} ms
                  </div>
                  <div className="text-[9px] opacity-85">Rhythmic Rock / Post-Punk</div>
                </div>

                <div className="border border-[#333333] p-2 bg-[#141414]">
                  <div className="text-[10px] opacity-70">1/8 EIGHTH NOTE</div>
                  <div className="text-base font-black text-[#F4F3EF]">
                    {delaySubdivisions.eighthMs} ms
                  </div>
                  <div className="text-[9px] text-[#00E5FF]">Driving Eighth Echo</div>
                </div>

                <div className="border border-[#333333] p-2 bg-[#141414]">
                  <div className="text-[10px] opacity-70">1/8T EIGHTH TRIPLET</div>
                  <div className="text-base font-black text-[#FF3B00]">
                    {delaySubdivisions.eighthTripletMs} ms
                  </div>
                  <div className="text-[9px] opacity-80">Shuffle / Gallop Feel</div>
                </div>

                <div className="border border-[#00E5FF] p-2 bg-[#091E24]">
                  <div className="text-[10px] font-black text-[#00E5FF]">1/16 SLAPBACK</div>
                  <div className="text-base font-black text-[#00E5FF]">
                    {delaySubdivisions.sixteenthSlapbackMs} ms
                  </div>
                  <div className="text-[9px] opacity-85">Garage Vocal / Cab Doubler</div>
                </div>

                <div className="border border-[#333333] p-2 bg-[#141414]">
                  <div className="text-[10px] opacity-70">PLATE PRE-DELAY (1/32)</div>
                  <div className="text-base font-black text-[#B8FF01]">
                    {delaySubdivisions.preDelayPlateMs} ms
                  </div>
                  <div className="text-[9px] opacity-80">Vocal Reverb Clarity</div>
                </div>
              </div>
            </div>

            <div className="border-2 border-current p-3 bg-black/20 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-black uppercase text-[#B8FF01]">
                  INTERACTIVE SPACEBAR TAP TEMPO PAD
                </span>
                <span className="text-[10px] font-bold opacity-75">
                  TAPS REGISTERED: {tapTimestamps.length}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTapTempoTrigger}
                  className="flex-1 py-3 border-2 border-[#0D0D0D] bg-[#FF3B00] text-[#0D0D0D] font-black text-xs sm:text-sm uppercase cursor-pointer shadow-[3px_3px_0px_#B8FF01] active:translate-y-0.5"
                >
                  🥁 TAP HERE OR PRESS [SPACEBAR] IN TIME{" "}
                  {tappedBpm ? `— ${tappedBpm} BPM` : ""}
                </button>
                {tappedBpm && (
                  <button
                    type="button"
                    onClick={() => {
                      setTappedBpm(null);
                      setTapTimestamps([]);
                    }}
                    className="px-3 py-3 border-2 border-current text-xs font-black uppercase cursor-pointer hover:bg-[#B8FF01] hover:text-[#0D0D0D]"
                  >
                    RESET
                  </button>
                )}
              </div>
            </div>

            <div className="border-2 border-current p-3 bg-black/25 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] font-black uppercase text-[#00E5FF]">
                    3-PIECE ROCK BAND REFERENCE TUNING DRONES
                  </span>
                  <h4 className="text-xs font-black uppercase">
                    PLAYABLE SYNTH TUNING FORK FOR GUITAR &amp; BASS
                  </h4>
                </div>
                {activeDroneNoteLabel && (
                  <button
                    type="button"
                    onClick={stopLiveDrone}
                    className="px-2 py-0.5 bg-[#FF3B00] text-[#0D0D0D] text-[10px] font-black uppercase cursor-pointer"
                  >
                    ■ STOP DRONE ({activeDroneNoteLabel})
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {ROCK_TUNING_DRONES.map((preset) => {
                  const isSelected = preset.id === selectedDronePresetId;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setSelectedDronePresetId(preset.id)}
                      className={`p-2 border-2 text-left text-xs font-black uppercase cursor-pointer ${
                        isSelected
                          ? "bg-[#B8FF01] text-[#0D0D0D] border-[#0D0D0D]"
                          : "border-current hover:bg-[#B8FF01]/20"
                      }`}
                    >
                      <div>{preset.shortLabel}</div>
                      <div className="text-[9px] font-normal opacity-80 truncate">
                        {preset.label}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="text-[11px] opacity-85">
                <strong>BAND ROLE:</strong> {activeTuningPreset.bandRole}
              </div>

              <div className="space-y-1">
                <div className="text-[10px] font-black uppercase text-[#B8FF01]">
                  6-STRING GUITAR REFERENCE NOTES (CLICK TO AUDITION SYNTH DRONE)
                </div>
                <div className="grid grid-cols-6 gap-1">
                  {activeTuningPreset.guitarNotes.map((n, idx) => {
                    const tag = `GTR-${n.note}`;
                    const isPlayingNote = activeDroneNoteLabel === tag;
                    return (
                      <button
                        key={`${n.note}-${idx}`}
                        type="button"
                        onClick={() => void handleToggleNoteDrone(tag, n.freqHz)}
                        className={`p-1.5 border text-center cursor-pointer ${
                          isPlayingNote
                            ? "bg-[#FF3B00] text-[#0D0D0D] border-[#F4F3EF] font-black"
                            : "border-current bg-[#0D0D0D] text-[#F4F3EF] hover:bg-[#00E5FF] hover:text-[#0D0D0D]"
                        }`}
                      >
                        <div className="text-xs font-black">{n.note}</div>
                        <div className="text-[9px] opacity-75">{n.freqHz}Hz</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-[10px] font-black uppercase text-[#00E5FF]">
                  4-STRING BASS GUITAR FUNDAMENTALS (+ OCTAVE OVERDRIVE HARMONIC)
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {activeTuningPreset.bassNotes.map((n, idx) => {
                    const tag = `BASS-${n.note}`;
                    const isPlayingNote = activeDroneNoteLabel === tag;
                    return (
                      <button
                        key={`${n.note}-${idx}`}
                        type="button"
                        onClick={() => void handleToggleNoteDrone(tag, n.freqHz)}
                        className={`p-1.5 border text-center cursor-pointer ${
                          isPlayingNote
                            ? "bg-[#FF3B00] text-[#0D0D0D] border-[#F4F3EF] font-black"
                            : "border-current bg-[#0D0D0D] text-[#F4F3EF] hover:bg-[#B8FF01] hover:text-[#0D0D0D]"
                        }`}
                      >
                        <div className="text-xs font-black">{n.note}</div>
                        <div className="text-[9px] opacity-75">{n.freqHz}Hz</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleCommitDroneToBus(selectedDronePresetId)}
                className="w-full py-1.5 border-2 border-[#0D0D0D] bg-[#00E5FF] text-[#0D0D0D] text-xs font-black uppercase cursor-pointer hover:bg-[#B8FF01]"
              >
                ⚡ RENDER 4s {activeTuningPreset.shortLabel} DRONE TO STUDIO BUS
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
