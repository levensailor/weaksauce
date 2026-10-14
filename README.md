# WEAKSAUCE — Brutalist 3-Piece Rock Studio Audio Utility Suite

**Author:** Jeff Levensailor  
**Repository:** [https://github.com/levensailor/weaksauce](https://github.com/levensailor/weaksauce)  
**Live Vercel Production URL:** [https://temporary-flying-zircon-zsiojzn.vercel.app](https://temporary-flying-zircon-zsiojzn.vercel.app)  
**Claim Deployment URL:** [https://vercel.com/claim-deployment?code=40d9d619-d209-4aee-bac2-0d305263468f](https://vercel.com/claim-deployment?code=40d9d619-d209-4aee-bac2-0d305263468f)  
**Reference Taxonomy:** [https://voice.ai/tools](https://voice.ai/tools) (Filtered for a 3-Piece Home Recording Rock Band + Engineer/Tinkerer/Singer Workflow)  
**Authentication / Login Instructions:** **Zero-Login / Anonymous Only.** No user accounts, login forms, sign-up walls, or artificial wait timers exist anywhere in the application. Open the URL and use every tool immediately.

---

## Overview

**WEAKSAUCE** is a 100% open-source Industrial Studio Brutalist music and audio utility suite designed specifically for **Jeff** — a singer, audio engineer, and tinkerer in a **3-piece home recording rock band** (Guitar, Bass, Drums, and Vocals).

We audited every item on `https://voice.ai/tools`, stripped out non-band SaaS bloat (`Text to Speech`, `Voice Agent`, login walls, and 40–60s queue paywall modals), reframed `Voice Changer` into the **Vocal Pitch, Formant & Doubler Lab**, and built dedicated Brutalist DSP Racks for all **8 rock studio utilities** organized into **4 Left-Menu Toolsets**:

### Left-Hand Toolsets & Right-Hand Brutalist DSP Racks

1. **`01 // STEMS & ISOLATION`** (`VocalRemoverRack` & `StemSplitterRack` + `app/lib/dsp/stems-dsp.ts`)
   - **`01.1` Vocal Remover** (`/tools/vocal-remover`) — Cascaded 4th-order Linkwitz-Riley (`LR4`) bass/cymbal crossover guards (`80–300 Hz` kick/bass protection, `5–14 kHz` cymbal air protection), Mid/Side azimuth vocal isolation, dual synchronized waveform scrubbers (`VOCALS` + `INSTRUMENTAL`), `180°` phase-invert null test, and Guide Vocal rehearsal faders (`0–150%`).
   - **`01.2` Stem Splitter** (`/tools/stem-splitter`) — **3-Piece Rock Core 4-Stem Mode (`Vocals`, `Guitar`, `Bass`, `Drums`)** + **Full 6-Stem Mode (`+ Piano & Other`)**, 6-channel Brutalist Rehearsal Mixing Console (`MUTE`, `SOLO`, `PAN`, `GAIN`), 1-click Minus-One Rehearsal presets (`No Vox`, `-12dB Guide Vox`, `No Guitar`, `No Bass`, `No Drums`, `Bass + Drums`), and zero-dependency CRC32 `.ZIP` stem bundle export.
2. **`02 // ROOM & SIGNAL CLEANUP`** (`CleanupSuiteRack` + `app/lib/dsp/cleanup-dsp.ts`)
   - **`02.1` Reverb Remover** (`/tools/reverb-remover`) — Envelope-tracked transient expander + spectral decay gate outputting both `Dry Signal (De-Reverbed)` and `Removed Reverb Tail (Room Bleed)` with `250–500 Hz` drywall boxiness cut and Dry/Room Re-Blend fader (`0–50%`).
   - **`02.2` Echo Remover** (`/tools/echo-remover`) — `15–350 ms` autocorrelation slapback detector with automatic wall-bounce distance calculation (`ms` + `meters / feet`), 32-bar autocorrelation spectrum, and multi-tap inverse comb cancellation.
   - **`02.3` Audio Enhancer** (`/tools/audio-enhancer`) — Surgical 8-harmonic `60 Hz (US)` / `50 Hz (EU)` guitar amp ground-loop hum notch filter bank (`60..480 Hz` at `Q=35`) with Goertzel DFT harmonic attenuation meter, spectral hiss gate, `3.5 kHz` presence exciter, `-14 LUFS` brickwall limiter, and 4 Rock Studio Macro Profiles (`[VOCAL MIC ENHANCE]`, `[GUITAR AMP HUM & HISS KILLER]`, `[BASS DI TIGHTENER]`, `[FULL REHEARSAL DEMO MASTER]`).
3. **`03 // VOCAL, KEY & BPM LAB`** (`VocalBpmLabRack` + `app/lib/dsp/vocal-bpm-dsp.ts`)
   - **`03.1` Vocal Pitch, Formant & Doubler Lab** (Reframed `/tools/voice-changer`) — `-12` to `+12` semitone WSOLA pitch shifter, Fine Cents (`-100..+100`), Formant throat shift (`-12..+12 st`), Abbey Road ADT stereo doubler (`15–35 ms` tape Haas delay + wow modulation), 3-part rock vocal harmonizer (`Root + 3rd + 5th`), tube preamp saturation, and 8 rock studio vocal presets.
   - **`03.2` Key & BPM Finder** (`/tools/bpm-finder`) — `240 Hz` low-pass onset beat detector, 12-bin Chroma Krumhansl-Schmuckler Key/Scale correlator, multi-track batch analysis table with `.CSV` setlist export, Guitar Delay Pedal millisecond subdivision calculator (`1/4`, `1/8.`, `1/8`, `1/8T`, `1/16`, `1/32`), Spacebar Tap Tempo, and playable Guitar/Bass Reference Tuning Drones (`E Standard`, `Drop D`, `Eb Half-Step Down`, `D Standard`).
4. **`04 // CAPTURE & FORMAT I/O`** (`CaptureConvertRack` + `app/lib/dsp/codecs.ts`)
   - **`04.1` Voice & Riff Recorder** (`/tools/voice-recorder`) — Uncompressed `Float32Array` studio mic recorder (up to `3 hours` / `10,800s`) with True Raw Studio Mic Mode (`echoCancellation / noiseSuppression / autoGainControl = false`), non-bleeding headphone metronome click track (`40–240 BPM` + count-in), live oscilloscope, peak/RMS meter with clipping latch, and Multi-Take Vault.
   - **`04.2` Master Audio Converter** (`/tools/converter`) — Multi-file batch transcoder supporting `WAV (16/24-bit PCM & 32-bit Float)`, `FLAC`, `MP3 (128–320 kbps)`, `OGG`, `M4A`, and `.MP4` rehearsal video stem extraction across all 21 `voice.ai/tools/converter` pair routes at `44.1 / 48 / 96 kHz` with `-1.0 dBFS` Peak and `-14 LUFS` normalization.

---

## Architecture & Logging

- **Frontend:** Next.js 16.4 (App Router, TypeScript, Tailwind CSS) + Web Audio API (`AudioContext`, `OfflineAudioContext`, `BiquadFilterNode`, `DynamicsCompressorNode`, `WaveShaperNode`).
- **Python FastAPI Backend (`/backend` & `/api/index.py`):** Built with `fastapi`, `pydantic`, `uvicorn`, `python-dotenv`, `numpy`, and `scipy`.
- **Rotating Localized EST Logger (`backend/utils/logger.py` & `app/lib/server-logger.ts`):** Logs simultaneously to console (`stdout`) and a rotating log file (`logs/weaksauce.log` / `/tmp/weaksauce.log`) rotating at `1 MB` and keeping `3` backup copies, formatted with a localized `America/New_York` (`EST`/`EDT`) timestamp, function name, and line number.

---

## Deployment Instructions (Vercel & GitHub)

1. Push commits to the `main` branch of [https://github.com/levensailor/weaksauce](https://github.com/levensailor/weaksauce).
2. Connect the GitHub repository `levensailor/weaksauce` to Vercel ([https://vercel.com/new](https://vercel.com/new)), or deploy from the CLI:

```bash
npx vercel deploy --prod
```

3. Vercel automatically builds the Next.js frontend and mounts the serverless Python FastAPI entry (`api/index.py`) and Next.js Route Handlers (`/api/v1/tools/[slug]` and `/api/v1/health`).

### Local Development

```bash
npm install
npm run dev -- --port 43180
```

---

## Public Assets & Endpoints

- **Live Vercel Production Deployment:** [https://temporary-flying-zircon-zsiojzn.vercel.app](https://temporary-flying-zircon-zsiojzn.vercel.app)
- **Claim Deployment Link (Transfer to Vercel Account):** [https://vercel.com/claim-deployment?code=40d9d619-d209-4aee-bac2-0d305263468f](https://vercel.com/claim-deployment?code=40d9d619-d209-4aee-bac2-0d305263468f)
- **GitHub Repository:** [https://github.com/levensailor/weaksauce](https://github.com/levensailor/weaksauce)
- **Favicon Assets:** `/app/icon.svg` (Vector Brutalist Stencil `WS` + Waveform) and `/public/favicon.ico` (32x32 ICO)
- **Health & Tool DSP API:**
  - `GET https://temporary-flying-zircon-zsiojzn.vercel.app/api/v1/health`
  - `POST https://temporary-flying-zircon-zsiojzn.vercel.app/api/v1/tools/{tool_slug}`
- **Login Instructions:** None required — application is 100% anonymous and zero-login.
