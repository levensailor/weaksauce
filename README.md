# WEAKSAUCE — Brutalist 3-Piece Rock Studio Audio Utility Suite

**Author:** Jeff Levensailor  
**Repository:** [https://github.com/levensailor/weaksauce](https://github.com/levensailor/weaksauce)  
**Reference Taxonomy:** [https://voice.ai/tools](https://voice.ai/tools) (Filtered for a 3-Piece Home Recording Rock Band + Engineer/Tinkerer/Singer Workflow)  
**Authentication / Login Instructions:** **Zero-Login / Anonymous Only.** No user accounts, login forms, sign-up walls, or artificial wait timers exist anywhere in the application. Open the URL and use every tool immediately.

---

## Overview

**WEAKSAUCE** is an Industrial Studio Brutalist music and audio utility suite designed specifically for **Jeff** — a singer, audio engineer, and tinkerer in a **3-piece home recording rock band** (Guitar, Bass, Drums, and Vocals).

We audited every item on `https://voice.ai/tools`, stripped out non-band SaaS bloat (`Text to Speech`, `Voice Agent`, login walls, and 40–60s queue paywall modals), reframed `Voice Changer` into the **Vocal Pitch, Formant & Doubler Lab**, and organized the **8 essential rock studio utilities** into **4 Left-Menu Toolsets**:

### Left-Hand Toolsets & Right-Hand Tools

1. **`01 // STEMS & ISOLATION`**
   - **`01.1` Vocal Remover** (`/tools/vocal-remover`) — Splits mixes into `Vocals (Isolated Lead/Backing)` and `Instrumental (Band Backing)` with guide-vocal balance faders and bass/cymbal crossover protection.
   - **`01.2` Stem Splitter** (`/tools/stem-splitter`) — Separates mixes into **3-Piece Rock Core (`Vocals`, `Guitar`, `Bass`, `Drums`)** or **Full 6-Stem (`+ Piano & Other`)** for minus-one rehearsal and part transcription.
2. **`02 // ROOM & SIGNAL CLEANUP`**
   - **`02.1` Reverb Remover** (`/tools/reverb-remover`) — Strips boxy basement/garage room reflections and outputs both `Dry / De-Reverbed Signal` and `Removed Reverb Tail (Room Bleed)`.
   - **`02.2` Echo Remover** (`/tools/echo-remover`) — Suppresses parallel-wall flutter echo and slapback bounce, outputting both `Clean Signal` and `Isolated Echo Residual`.
   - **`02.3` Audio Enhancer** (`/tools/audio-enhancer`) — 8-harmonic `60Hz / 50Hz` single-coil guitar amp hum notch filter, spectral hiss reducer, presence booster, and `-14 LUFS` master limiter.
3. **`03 // VOCAL, KEY & BPM LAB`**
   - **`03.1` Vocal Pitch, Formant & Doubler Lab** (Reframed `/tools/voice-changer`) — `-12` to `+12` semitone pitch shifter, formant control, and 8 rock vocal modes (`Abbey Road ADT Stereo Doubler`, `Octave Down Baritone`, `3rd + 5th Harmonizer`, `Garage Bullhorn`, `Driven Tube Preamp`, `Slapback Tape`).
   - **`03.2` Key & BPM Finder** (`/tools/bpm-finder`) — `240Hz` low-pass onset beat detector, 12-bin Chroma Key/Scale correlator, Tap Tempo, guitar tuning reference drone (`E Standard`, `Drop D`, `Eb`), and millisecond guitar delay pedal subdivision calculator (`1/4`, `1/8.`, `1/8`, `1/16`).
4. **`04 // CAPTURE & FORMAT I/O`**
   - **`04.1` Voice & Riff Recorder** (`/tools/voice-recorder`) — Uncompressed studio mic recorder with Raw Studio Mode (`echoCancellation / noiseSuppression / autoGainControl = false`), built-in headphone click track, and direct `WAV / FLAC / MP3` export.
   - **`04.2` Master Audio Converter** (`/tools/converter`) — Transcodes between `WAV`, `FLAC`, `MP3`, `OGG`, `M4A`, and extracts audio stems from `MP4 / MOV` rehearsal videos at `44.1 / 48 / 96 kHz`.

---

## Architecture & Logging

- **Frontend:** Next.js (App Router, TypeScript, Tailwind CSS) + Web Audio API (`AudioContext`, `OfflineAudioContext`, `BiquadFilterNode`, `DynamicsCompressorNode`, `wavesurfer.js`).
- **Python FastAPI Backend (`/backend` & `/api/index.py`):** Built with `fastapi`, `pydantic`, `uvicorn`, `python-dotenv`, `numpy`, and `scipy`.
- **Rotating Localized EST Logger (`backend/utils/logger.py`):** Logs simultaneously to console (`stdout`) and a rotating log file (`logs/weaksauce.log` / `/tmp/weaksauce.log`) rotating at `1 MB` and keeping `3` backup copies, formatted with a localized `America/New_York` (`EST`/`EDT`) timestamp, function name, and line number.

---

## Deployment Instructions (Vercel & GitHub)

1. Push commits to the `main` branch of [https://github.com/levensailor/weaksauce](https://github.com/levensailor/weaksauce).
2. Connect the GitHub repository `levensailor/weaksauce` to Vercel, or deploy from the CLI:

```bash
npx vercel deploy --prod
```

3. Vercel automatically builds the Next.js frontend and mounts the serverless Python FastAPI entry (`api/index.py`) and Next.js Route Handlers (`/api/v1/tools/[slug]` and `/api/v1/health`).

### Local Development (Optional)

```bash
npm install
npm run dev -- --port 43180
```

---

## Public Assets & Endpoints

- **GitHub Repository:** [https://github.com/levensailor/weaksauce](https://github.com/levensailor/weaksauce)
- **Favicon Assets:** `/app/icon.svg` (Vector Brutalist Stencil `WS` + Waveform) and `/public/favicon.ico` (32x32 ICO)
- **Health & Telemetry API:** `GET /api/v1/health` and `POST /api/v1/tools/{tool_slug}`
- **Login Instructions:** None required — application is 100% anonymous and zero-login.
