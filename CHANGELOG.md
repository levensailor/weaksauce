# Changelog

All notable features added to **WEAKSAUCE** are documented in this timestamped log.

## [2026-10-14 01:06:00 EDT] - Integrate All 4 Rock Studio Toolset Branches (`01`–`04`) and 8 Voice.ai Filtered DSP Racks into `main`
- **Toolset `01 // STEMS & ISOLATION` (`VocalRemoverRack` & `StemSplitterRack`)**:
  - `01.1` **Vocal Remover**: Cascaded 4th-order Linkwitz-Riley (`LR4`) bass/cymbal crossover guards (`80–300 Hz` and `5–14 kHz`), Mid/Side azimuth vocal extraction, dual synchronized stem waveform scrubbers (`VOCALS` + `INSTRUMENTAL`), `180°` phase-invert null-test toggle, and Guide Vocal rehearsal faders (`0–150%`).
  - `01.2` **Stem Splitter**: **3-Piece Rock Core 4-Stem Mode (`Vocals`, `Guitar`, `Bass`, `Drums`)** + **Full 6-Stem Mode (`+ Piano & Other`)**, 6-channel Brutalist Rehearsal Mixing Console (`MUTE`, `SOLO`, constant-power `PAN`, `GAIN`), 1-click Minus-One Rehearsal presets, and zero-dependency CRC32 multi-stem `.ZIP` bundler.
- **Toolset `02 // ROOM & SIGNAL CLEANUP` (`CleanupSuiteRack`)**:
  - `02.1` **Reverb Remover**: Envelope-tracked transient expander + spectral decay gate outputting both `Dry Signal (De-Reverbed)` and `Removed Reverb Tail (Room Bleed)` with `250–500 Hz` drywall boxiness notch and Dry/Room Re-Blend fader.
  - `02.2` **Echo Remover**: `15–350 ms` pre-emphasized autocorrelation slapback detector with physical wall-bounce distance readout (`ms` + `meters / feet`), 32-bar autocorrelation spectrum, and inverse comb cancellation.
  - `02.3` **Audio Enhancer**: Surgical 8-harmonic `60 Hz (US)` / `50 Hz (EU)` guitar amp ground-loop hum notch filter bank (`60..480 Hz` at `Q=35`) with Goertzel DFT harmonic attenuation meter, spectral hiss gate, `3.5 kHz` presence exciter, `-14 LUFS` brickwall limiter, and 4 one-click Rock Studio Macro Profiles (`[VOCAL MIC ENHANCE]`, `[GUITAR AMP HUM & HISS KILLER]`, `[BASS DI TIGHTENER]`, `[FULL REHEARSAL DEMO MASTER]`).
- **Toolset `03 // VOCAL, KEY & BPM LAB` (`VocalBpmLabRack`)**:
  - `03.1` **Vocal Pitch, Formant & Doubler Lab**: Reframed from `voice.ai/tools/voice-changer` with zero duration limit, `-12` to `+12` semitone WSOLA pitch shifting, formant throat shift, Abbey Road ADT stereo doubler (`15–35 ms` modulated tape Haas delay), 3-part rock vocal harmonizer (`Root + 3rd + 5th`), asymmetric triode tube saturation, and 8 rock studio vocal presets.
  - `03.2` **Key & BPM Finder**: `240 Hz` low-pass beat-tracking autocorrelation + 12-bin Krumhansl-Schmuckler Chroma Key/Scale correlator, multi-track batch analysis table with `.CSV` setlist export, Guitar Delay Pedal millisecond subdivision calculator (`1/4`, `1/8.`, `1/8`, `1/8T`, `1/16`, `1/32`), Spacebar Tap Tempo, and playable Guitar/Bass Reference Tuning Drones (`E Standard`, `Drop D`, `Eb`, `D Standard`).
- **Toolset `04 // CAPTURE & FORMAT I/O` (`CaptureConvertRack`)**:
  - `04.1` **Voice & Riff Recorder**: Uncompressed `Float32Array` studio recorder (up to `3 hours` / `10,800s`) with True Raw Studio Mic Mode (`echoCancellation / noiseSuppression / autoGainControl = false`), non-bleeding headphone metronome click track (`40–240 BPM` + count-in), live oscilloscope & clipping latch indicator, and Multi-Take Vault.
  - `04.2` **Master Audio Converter**: Multi-file batch transcoder supporting `WAV (16/24-bit PCM & 32-bit Float)`, `FLAC`, `MP3 (128–320 kbps)`, `OGG`, `M4A`, and `.MP4` rehearsal video stem extraction across all 21 `voice.ai/tools/converter` pair routes at `44.1 / 48 / 96 kHz`.

## [2026-10-14 00:28:00 EDT] - Scaffold Weaksauce Brutalist 3-Piece Rock Studio Suite, FastAPI DSP Backend, and Voice.ai Filtered Catalog
- Scaffolded Next.js App Router + TypeScript + Tailwind CSS Brutalist UI shell and Python FastAPI backend (`backend/` and `api/`) with Pydantic validation and `1 MB` rotating EST logging (`3` backups, function name, and line number).
- Generated custom Brutalist stencil `WS` waveform favicon (`app/icon.svg` and `public/favicon.ico`).
- Implemented the 4 Left-Menu Rock Band Toolsets and 8 Right-Panel Tools filtered from `voice.ai/tools` for a 3-piece home recording rock band and engineer/singer (Jeff).
