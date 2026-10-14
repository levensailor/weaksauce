export type ToolsetId =
  | "all"
  | "stems-isolation"
  | "room-cleanup"
  | "vocal-key-bpm"
  | "capture-convert";

export type ToolId =
  | "vocal-remover"
  | "stem-splitter"
  | "reverb-remover"
  | "echo-remover"
  | "audio-enhancer"
  | "voice-changer"
  | "bpm-finder"
  | "voice-recorder"
  | "audio-converter";

export type DspRecipeType = ToolId;

export interface ToolOutputSpec {
  id: string;
  label: string;
  color: string;
}

export interface ToolParamSpec {
  id: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}

export interface ToolSelectOptionSpec {
  id: string;
  label: string;
  options: string[];
  defaultOption: string;
}

export interface ToolDefinition {
  id: ToolId;
  code: string;
  slug: ToolId;
  toolsetId: Exclude<ToolsetId, "all">;
  toolsetCode: "01" | "02" | "03" | "04";
  title: string;
  voiceAiOriginalName: string;
  voiceAiRoute: string;
  tagline: string;
  description: string;
  bandUseCase: string;
  acceptedFormats: string[];
  outputs: ToolOutputSpec[];
  params: ToolParamSpec[];
  selectControls?: ToolSelectOptionSpec[];
  openSourceStack: {
    client: string[];
    backend: string[];
  };
  uiComponentSpec: string[];
  dspArchitecture: string;
  apiEndpoint: string;
  recipe: DspRecipeType;
  workerTrackFile: string;
}

export interface ToolsetDefinition {
  id: ToolsetId;
  code: "00" | "01" | "02" | "03" | "04";
  name: string;
  shortLabel: string;
  description: string;
  tools: ToolId[];
  workerTrack: string;
}

export interface VoiceAiAuditItem {
  order: number;
  name: string;
  href: string;
  status: "KEPT" | "KEPT_HIGHEST_PRIORITY" | "KEPT_AND_REFRAMED" | "FILTERED_OUT";
  reframedName?: string;
  mappedToolCode?: string;
  mappedToolId?: ToolId;
  filterReason: string;
}

export const APP_CONFIG = {
  brandName: process.env.NEXT_PUBLIC_APP_NAME ?? "WEAKSAUCE",
  version: process.env.NEXT_PUBLIC_APP_VERSION ?? "v1.0.0",
  bandProfileTitle:
    process.env.NEXT_PUBLIC_BAND_PROFILE ??
    "3-PIECE HOME RECORDING ROCK BAND // ENGINEER + TINKERER + SINGER (JEFF)",
  authorName: process.env.NEXT_PUBLIC_AUTHOR_NAME ?? "Jeff Levensailor",
  referenceUrl: "https://voice.ai/tools",
};

export const VOICE_AI_SCRAPE_AUDIT: VoiceAiAuditItem[] = [
  {
    order: 1,
    name: "Text to Speech",
    href: "https://voice.ai/app/dashboard/text-to-speech",
    status: "FILTERED_OUT",
    filterReason:
      "Synthetic text-to-speech narration is irrelevant for a 3-piece rock band with a human singer (Jeff) tracking real vocals.",
  },
  {
    order: 2,
    name: "Voice Agent",
    href: "https://voice.ai/app/agent-playground",
    status: "FILTERED_OUT",
    filterReason:
      "Conversational AI phone/call-center agent playground (HVAC, real estate, legal answering bots) is enterprise B2B fluff with zero music/band utility.",
  },
  {
    order: 3,
    name: "Account / Login / Paywall Queue Timer (40-60s wait)",
    href: "https://voice.ai/tools",
    status: "FILTERED_OUT",
    filterReason:
      "Removed artificial 40–60s queue timers (PaywallModal707), account sign-up walls, and voice-cloning upsells. Weaksauce is 100% zero-login and immediate.",
  },
  {
    order: 4,
    name: "Vocal Remover",
    href: "/tools/vocal-remover",
    status: "KEPT",
    mappedToolCode: "01.1",
    mappedToolId: "vocal-remover",
    filterReason:
      "Essential for stripping lead vocals from songs so Jeff can practice singing lead or isolate reference vocal tracks to inspect phrasing and reverb.",
  },
  {
    order: 5,
    name: "Stem Splitter",
    href: "/tools/stem-splitter",
    status: "KEPT_HIGHEST_PRIORITY",
    mappedToolCode: "01.2",
    mappedToolId: "stem-splitter",
    filterReason:
      "Splits songs into Vocals, Guitar, Bass, Drums, Piano, and Other—directly matching the exact instruments of a 3-piece rock band for minus-one rehearsal, remixing, and learning parts.",
  },
  {
    order: 6,
    name: "Reverb Remover",
    href: "/tools/reverb-remover",
    status: "KEPT",
    mappedToolCode: "02.1",
    mappedToolId: "reverb-remover",
    filterReason:
      "Essential for tightening untreated bedroom/basement room bleed on vocal mics and drum overheads before mixing.",
  },
  {
    order: 7,
    name: "Echo Remover",
    href: "/tools/echo-remover",
    status: "KEPT",
    mappedToolCode: "02.2",
    mappedToolId: "echo-remover",
    filterReason:
      "Essential for suppressing garage/basement parallel-wall flutter echo and slapback reflections on vocals, snare drums, and guitar cabs.",
  },
  {
    order: 8,
    name: "Audio Enhancer",
    href: "/tools/audio-enhancer",
    status: "KEPT",
    mappedToolCode: "02.3",
    mappedToolId: "audio-enhancer",
    filterReason:
      "Essential for cleaning up 60Hz/50Hz guitar amp ground hum, pedalboard hiss, rehearsal room noise, and boosting vocal/instrument clarity.",
  },
  {
    order: 9,
    name: "Voice Changer",
    href: "/tools/voice-changer",
    status: "KEPT_AND_REFRAMED",
    reframedName: "Vocal Pitch, Formant & Doubler Lab",
    mappedToolCode: "03.1",
    mappedToolId: "voice-changer",
    filterReason:
      "Kept the core -12 to +12 semitone pitch shifter and mic/file workflow from /tools/voice-changer, removed the 15-second cap and celebrity/politician/cartoon meme voice skins, and replaced them with studio rock vocal processors (Abbey Road ADT Doubler, Octave Up/Down, 3rd/5th Harmonizer, Garage Megaphone, Driven Tube Mic, Slapback Tape).",
  },
  {
    order: 10,
    name: "Key BPM Finder",
    href: "/tools/bpm-finder",
    status: "KEPT",
    mappedToolCode: "03.2",
    mappedToolId: "bpm-finder",
    filterReason:
      "Essential for finding song Key/Scale and BPM on rehearsal demos or reference tracks, setting DAW click tracks, and calculating guitar delay pedal times.",
  },
  {
    order: 11,
    name: "Voice Recorder",
    href: "/tools/voice-recorder",
    status: "KEPT",
    mappedToolCode: "04.1",
    mappedToolId: "voice-recorder",
    filterReason:
      "Essential zero-friction scratchpad for recording vocal melodies, guitar riffs, or full-band room takes directly to uncompressed WAV/FLAC/MP3.",
  },
  {
    order: 12,
    name: "Audio Converter",
    href: "/tools/converter",
    status: "KEPT",
    mappedToolCode: "04.2",
    mappedToolId: "audio-converter",
    filterReason:
      "Essential studio file utility for transcoding between WAV, FLAC, MP3, OGG, M4A, and extracting audio from MP4 rehearsal videos.",
  },
];

export const TOOLSETS: ToolsetDefinition[] = [
  {
    id: "all",
    code: "00",
    name: "ALL BAND TOOLS (OVERVIEW)",
    shortLabel: "00 // ALL BAND TOOLS (8)",
    description:
      "Full 8-Tool Brutalist Studio Rack Grid filtered from voice.ai/tools for Jeff's 3-Piece Rock Band.",
    tools: [
      "vocal-remover",
      "stem-splitter",
      "reverb-remover",
      "echo-remover",
      "audio-enhancer",
      "voice-changer",
      "bpm-finder",
      "voice-recorder",
      "audio-converter",
    ].filter((_, idx) => idx < 8) as ToolId[],
    workerTrack: "Track 0 (Foundation Overview)",
  },
  {
    id: "stems-isolation",
    code: "01",
    name: "STEMS & ISOLATION",
    shortLabel: "01 // STEMS & ISOLATION",
    description:
      "Isolate vocals, guitar, bass, and drums for minus-one rehearsal, learning parts, and remixing.",
    tools: ["vocal-remover", "stem-splitter"],
    workerTrack: "Track 1 (VocalRemoverTool + StemSplitterTool)",
  },
  {
    id: "room-cleanup",
    code: "02",
    name: "ROOM & SIGNAL CLEANUP",
    shortLabel: "02 // ROOM & SIGNAL CLEANUP",
    description:
      "Strip basement reverb, garage flutter echo, 60Hz guitar amp hum, and mic hiss.",
    tools: ["reverb-remover", "echo-remover", "audio-enhancer"],
    workerTrack: "Track 2 (ReverbRemoverTool + EchoRemoverTool + AudioEnhancerTool)",
  },
  {
    id: "vocal-key-bpm",
    code: "03",
    name: "VOCAL, KEY & BPM LAB",
    shortLabel: "03 // VOCAL, KEY & BPM LAB",
    description:
      "Transpose vocal pitch/formants, double-track vocals, and detect song Key, Scale & BPM.",
    tools: ["voice-changer", "bpm-finder"],
    workerTrack: "Track 3 (VoiceChangerTool + KeyBpmFinderTool)",
  },
  {
    id: "capture-convert",
    code: "04",
    name: "CAPTURE & FORMAT I/O",
    shortLabel: "04 // CAPTURE & FORMAT I/O",
    description:
      "Record uncompressed studio takes with a click track and convert between WAV, FLAC, MP3, OGG, M4A & MP4.",
    tools: ["voice-recorder", "audio-converter"],
    workerTrack: "Track 4 (VoiceRecorderTool + AudioConverterTool)",
  },
];

export const TOOLS: ToolDefinition[] = [
  {
    id: "vocal-remover",
    code: "01.1",
    slug: "vocal-remover",
    toolsetId: "stems-isolation",
    toolsetCode: "01",
    title: "Vocal Remover",
    voiceAiOriginalName: "Vocal Remover",
    voiceAiRoute: "/tools/vocal-remover",
    tagline: "Isolate lead vocals (Acapella) and band backing track (Instrumental).",
    description:
      "Splits any stereo song or rehearsal bounce into two synchronized stems: Vocals (Isolated Lead/Backing) and Instrumental (Band Backing), plus a custom Guide Vocal re-balancer.",
    bandUseCase:
      "Create karaoke/minus-vocal rehearsal mixes for Jeff to practice lead vocals, or lower the original singer by -12 dB ('guide vocal mode') while tracking.",
    acceptedFormats: [".mp3", ".wav", ".flac", ".ogg", ".m4a"],
    outputs: [
      { id: "vocals", label: "Vocals (Isolated Lead/Backing)", color: "#FF3B00" },
      { id: "instrumental", label: "Instrumental (Band Backing)", color: "#00E5FF" },
      { id: "rebalanced", label: "Custom Rebalanced Mix", color: "#B8FF01" },
    ],
    params: [
      { id: "vocalGainDb", label: "VOCAL LEVEL", unit: "dB", min: -48, max: 6, step: 1, defaultValue: -24 },
      { id: "instGainDb", label: "INSTRUMENTAL LEVEL", unit: "dB", min: -48, max: 6, step: 1, defaultValue: 0 },
      { id: "lowCutHz", label: "BASS PROTECTION CROSSOVER", unit: "Hz", min: 80, max: 300, step: 10, defaultValue: 170 },
      { id: "highCutHz", label: "CYMBAL AIR CROSSOVER", unit: "Hz", min: 5000, max: 14000, step: 250, defaultValue: 8500 },
    ],
    openSourceStack: {
      client: [
        "Web Audio API OfflineAudioContext",
        "Mid/Side Phase + Linkwitz-Riley Spectral Vocal Masking",
        "wavesurfer.js v7 Dual Stem Sync",
      ],
      backend: [
        "librosa.decompose.hpss",
        "librosa.decompose.nn_filter",
        "scipy.signal.stft",
        "demucs (optional htdemucs hook)",
      ],
    },
    uiComponentSpec: [
      "Dual synchronized stem output rows: VOCALS (#FF3B00) and INSTRUMENTAL (#00E5FF)",
      "Interactive Vocal & Instrumental dB balance faders (-48 dB to +6 dB)",
      "Bass Protection (80–300 Hz) & Cymbal Air (5–14 kHz) crossover guards",
      "Direct WAV / FLAC / MP3 stem export + [SEND TO NEXT TOOL]",
    ],
    dspArchitecture:
      "Decomposes stereo signal into Mid = (L+R)/2 and Side = (L-R)/2 with cascaded Linkwitz-Riley low/high crossovers, isolating center vocal formants while keeping sub-bass (<170 Hz) and stereo guitars intact.",
    apiEndpoint: "/api/v1/tools/vocal-remover",
    recipe: "vocal-remover",
    workerTrackFile: "src/components/tools/VocalRemoverTool.tsx",
  },
  {
    id: "stem-splitter",
    code: "01.2",
    slug: "stem-splitter",
    toolsetId: "stems-isolation",
    toolsetCode: "01",
    title: "Stem Splitter (3-Piece Rock Core + 6-Stem)",
    voiceAiOriginalName: "Stem Splitter",
    voiceAiRoute: "/tools/stem-splitter",
    tagline: "Dissect full mixes into Guitar, Bass, Drums, Vocals, Piano & Other stems.",
    description:
      "Built around a 3-piece rock band lineup: separates mixes into Vocals, Guitar, Bass, and Drums (plus Piano & Other in 6-stem mode) with a live rehearsal mixing console.",
    bandUseCase:
      "Solo or mute Guitar, Bass, Drums, or Vocals for 'minus-one' band practice, part transcription, or remixing rehearsal bounces.",
    acceptedFormats: [".mp3", ".wav", ".flac", ".ogg", ".m4a"],
    outputs: [
      { id: "vocals", label: "Vocals", color: "#FF3B00" },
      { id: "guitar", label: "Guitar", color: "#FFB800" },
      { id: "bass", label: "Bass", color: "#00E5FF" },
      { id: "drums", label: "Drums", color: "#B8FF01" },
      { id: "piano", label: "Piano / Keys", color: "#D946EF" },
      { id: "other", label: "Other / Ambience", color: "#94A3B8" },
    ],
    selectControls: [
      {
        id: "splitMode",
        label: "STEM CONFIGURATION",
        options: [
          "3-Piece Rock Core (4 Stems: Vocals, Guitar, Bass, Drums)",
          "Full 6-Stem Split (+ Piano & Other)",
        ],
        defaultOption: "3-Piece Rock Core (4 Stems: Vocals, Guitar, Bass, Drums)",
      },
    ],
    params: [
      { id: "vocalsDb", label: "VOCALS STEM GAIN", unit: "dB", min: -24, max: 6, step: 0.5, defaultValue: 0 },
      { id: "guitarDb", label: "GUITAR STEM GAIN", unit: "dB", min: -24, max: 6, step: 0.5, defaultValue: 1.5 },
      { id: "bassDb", label: "BASS STEM GAIN", unit: "dB", min: -24, max: 6, step: 0.5, defaultValue: 2.0 },
      { id: "drumsDb", label: "DRUMS STEM GAIN", unit: "dB", min: -24, max: 6, step: 0.5, defaultValue: 2.0 },
    ],
    openSourceStack: {
      client: [
        "Web Audio 4th-Order Linkwitz-Riley + Mid/Side Transient Matrix",
        "wavesurfer.js Multi-Stem Sync",
        "fflate ZIP bundler",
      ],
      backend: [
        "librosa.decompose.hpss",
        "scipy.signal multi-band STFT separator",
        "demucs (htdemucs_6s 6-stem)",
      ],
    },
    uiComponentSpec: [
      "Mode Switch: [3-PIECE ROCK CORE (4 STEMS)] vs [FULL 6-STEM SPLIT]",
      "6-Channel Brutalist Rehearsal Console with Mute/Solo/Gain per instrument",
      "[EXPORT CUSTOM MINUS-ONE MIX] + individual stem export",
    ],
    dspArchitecture:
      "Uses 4th-order Linkwitz-Riley crossovers + fast/slow envelope transient discrimination to partition Bass (<200Hz mono), Drums (percussive transients), Vocals (center harmonic band), and Guitar (stereo midrange overdrive).",
    apiEndpoint: "/api/v1/tools/stem-splitter",
    recipe: "stem-splitter",
    workerTrackFile: "src/components/tools/StemSplitterTool.tsx",
  },
  {
    id: "reverb-remover",
    code: "02.1",
    slug: "reverb-remover",
    toolsetId: "room-cleanup",
    toolsetCode: "02",
    title: "Reverb Remover",
    voiceAiOriginalName: "Reverb Remover",
    voiceAiRoute: "/tools/reverb-remover",
    tagline: "Strip boxy basement/bedroom room reflections and isolate dry close-mic signal.",
    description:
      "Attenuates diffuse room decay tails and outputs both the Dry / De-Reverbed Signal and the Removed Reverb Tail (Room Bleed) for wet/dry re-blending.",
    bandUseCase:
      "Dry up roomy vocal takes, drum overheads, or guitar cab mics recorded in an untreated garage or spare room before adding studio plate reverb.",
    acceptedFormats: [".wav", ".mp3", ".flac", ".ogg", ".m4a"],
    outputs: [
      { id: "vocals", label: "Dry / De-Reverbed Signal", color: "#B8FF01" },
      { id: "noise", label: "Removed Reverb Tail (Room Bleed)", color: "#FF3B00" },
    ],
    params: [
      { id: "dereverbAmount", label: "REVERB SUPPRESSION", unit: "%", min: 10, max: 100, step: 5, defaultValue: 75 },
      { id: "tailReleaseMs", label: "ROOM TAIL TIGHTENING", unit: "ms", min: 30, max: 400, step: 10, defaultValue: 120 },
      { id: "deBoxHz", label: "350HZ BASEMENT BOXINESS CUT", unit: "dB", min: -12, max: 0, step: 0.5, defaultValue: -4 },
    ],
    openSourceStack: {
      client: [
        "Web Audio Envelope Follower + Transient-Preserving Decay Gate",
        "Biquad 350Hz Boxiness Notch",
      ],
      backend: [
        "scipy.signal STFT Late-Reverb Spectral Variance Suppression",
        "pedalboard.NoiseGate",
      ],
    },
    uiComponentSpec: [
      "Dual track output matching voice.ai: [Dry / De-Reverbed Signal] + [Removed Reverb Tail]",
      "Reverb Suppression %, Tail Tightening ms, and 350Hz Basement Boxiness Cut dB",
    ],
    dspArchitecture:
      "Tracks fast attack peaks and applies exponential decay gating to suppress diffuse room tails while carving 350Hz drywall boxiness.",
    apiEndpoint: "/api/v1/tools/reverb-remover",
    recipe: "reverb-remover",
    workerTrackFile: "src/components/tools/ReverbRemoverTool.tsx",
  },
  {
    id: "echo-remover",
    code: "02.2",
    slug: "echo-remover",
    toolsetId: "room-cleanup",
    toolsetCode: "02",
    title: "Echo Remover",
    voiceAiOriginalName: "Echo Remover",
    voiceAiRoute: "/tools/echo-remover",
    tagline: "Eliminate slapback delay, parallel-wall flutter echo, and comb filtering.",
    description:
      "Detects slapback echo lag times (15–250 ms) and suppresses discrete wall reflections, outputting both Clean Signal and Isolated Echo Residual.",
    bandUseCase:
      "Fix slapback bounce off garage doors or concrete basement walls on loud rock vocals and snare hits.",
    acceptedFormats: [".wav", ".mp3", ".flac", ".ogg", ".m4a"],
    outputs: [
      { id: "vocals", label: "Clean Signal (Echo Removed)", color: "#00E5FF" },
      { id: "noise", label: "Isolated Echo Residual", color: "#FF3B00" },
    ],
    params: [
      { id: "echoSuppression", label: "ECHO REDUCTION DEPTH", unit: "%", min: 10, max: 100, step: 5, defaultValue: 80 },
      { id: "delaySearchMs", label: "SLAPBACK DELAY FOCUS", unit: "ms", min: 15, max: 250, step: 5, defaultValue: 55 },
      { id: "highDampHz", label: "FLUTTER REFLECTION DAMPING", unit: "Hz", min: 2000, max: 12000, step: 250, defaultValue: 6500 },
    ],
    openSourceStack: {
      client: [
        "Autocorrelation Echo Lag Detector",
        "Inverse Comb Cancellation Filter + Inter-Transient Gate",
      ],
      backend: [
        "numpy Cepstral Echo Peak Cancellation",
        "noisereduce",
        "scipy.signal",
      ],
    },
    uiComponentSpec: [
      "Auto-detected Slapback Delay readout (ms) + Inverse Comb Echo Suppressor",
      "Dual outputs: [Clean Signal (Echo Removed)] and [Isolated Echo Residual]",
    ],
    dspArchitecture:
      "Attenuates delayed slapback copies at the target lag window via inverse comb subtraction and inter-transient envelope gating.",
    apiEndpoint: "/api/v1/tools/echo-remover",
    recipe: "echo-remover",
    workerTrackFile: "src/components/tools/EchoRemoverTool.tsx",
  },
  {
    id: "audio-enhancer",
    code: "02.3",
    slug: "audio-enhancer",
    toolsetId: "room-cleanup",
    toolsetCode: "02",
    title: "Audio Enhancer (Amp Hum, Hiss & Clarity)",
    voiceAiOriginalName: "Audio Enhancer",
    voiceAiRoute: "/tools/audio-enhancer",
    tagline: "Kill 60Hz guitar amp hum, mic hiss, and mud while maximizing rock presence.",
    description:
      "One-stop studio cleanup combining an 8-harmonic 60Hz/50Hz ground-loop notch bank, spectral noise floor gate, vocal/instrument presence lift, and -14 LUFS limiter.",
    bandUseCase:
      "Clean up noisy single-coil guitar pickups, pedalboard buzz, vocal mic floor noise, and muddy 3-piece rehearsal mixes.",
    acceptedFormats: [".mp3", ".wav", ".flac", ".ogg", ".m4a"],
    outputs: [
      { id: "denoised", label: "Enhanced & Denoised Master", color: "#B8FF01" },
      { id: "removedNoise", label: "Removed Hum & Hiss Floor", color: "#94A3B8" },
    ],
    selectControls: [
      {
        id: "preset",
        label: "STUDIO TARGET PROFILE",
        options: [
          "Vocal Mic Clarity & De-Noise",
          "Guitar Amp 60Hz Hum & Hiss Killer",
          "Bass DI Sub-Tightener",
          "Full 3-Piece Rehearsal Master (-14 LUFS)",
        ],
        defaultOption: "Vocal Mic Clarity & De-Noise",
      },
      {
        id: "humFreq",
        label: "MAINS POWER HUM NOTCH",
        options: [
          "60 Hz (US/North America - 8 Harmonics)",
          "50 Hz (EU/UK/AU - 8 Harmonics)",
          "Off",
        ],
        defaultOption: "60 Hz (US/North America - 8 Harmonics)",
      },
    ],
    params: [
      { id: "denoiseAmount", label: "NOISE FLOOR REDUCTION", unit: "%", min: 0, max: 100, step: 5, defaultValue: 70 },
      { id: "presenceBoostDb", label: "CLARITY & PRESENCE LIFT", unit: "dB", min: 0, max: 9, step: 0.5, defaultValue: 3.5 },
      { id: "humNotchHz", label: "HUM FUNDAMENTAL (50/60)", unit: "Hz", min: 50, max: 60, step: 10, defaultValue: 60 },
    ],
    openSourceStack: {
      client: [
        "8-Harmonic 60Hz/50Hz Notch Filter Bank",
        "Spectral Noise Gate",
        "Presence EQ + Brickwall Limiter",
      ],
      backend: [
        "noisereduce",
        "scipy.signal.iirnotch",
        "pedalboard (Compressor, HighpassFilter, PeakFilter, Limiter)",
        "pyloudnorm",
      ],
    },
    uiComponentSpec: [
      "4 Rock Studio Macro Profiles (Vocal Mic, Guitar 60Hz Hum Killer, Bass DI, Full Rehearsal Master)",
      "60Hz / 50Hz 8-Harmonic Notch selector + Denoise % + Presence Lift dB",
    ],
    dspArchitecture:
      "Cascades high-Q (Q=30) notch filters across harmonics f0..4*f0, gates low-energy hiss frames, boosts 3.2kHz presence, and normalizes loudness.",
    apiEndpoint: "/api/v1/tools/audio-enhancer",
    recipe: "audio-enhancer",
    workerTrackFile: "src/components/tools/AudioEnhancerTool.tsx",
  },
  {
    id: "voice-changer",
    code: "03.1",
    slug: "voice-changer",
    toolsetId: "vocal-key-bpm",
    toolsetCode: "03",
    title: "Vocal Pitch, Formant & Doubler Lab",
    voiceAiOriginalName: "Voice Changer (Reframed for Rock Vocalist/Engineer)",
    voiceAiRoute: "/tools/voice-changer",
    tagline: "Transpose pitch (-12 to +12 semitones), shift vocal formants, and apply rock studio vocal FX.",
    description:
      "Keeps the -12 to +12 semitone pitch shifter from voice.ai/tools/voice-changer, removes the 15s cap and cartoon skins, and adds 8 rock studio vocal processors (Abbey Road ADT Doubler, Octave Up/Down, 3rd/5th Harmonizer, Garage Megaphone, Driven Tube Mic, Slapback Tape).",
    bandUseCase:
      "Audition songs in a different vocal key, generate Abbey Road ADT stereo vocal doubles, create octave/3rd/5th backing harmonies, or dial in garage-rock megaphone grit.",
    acceptedFormats: [".mp3", ".wav", ".flac", ".ogg", ".m4a"],
    outputs: [
      { id: "transformed", label: "Transformed Vocal / Instrument Track", color: "#FF3B00" },
    ],
    selectControls: [
      {
        id: "vocalCharacter",
        label: "ROCK VOCAL CHARACTER MODE",
        options: [
          "Abbey Road ADT Stereo Doubler",
          "Clean Pitch & Formant Shift",
          "Octave Down Baritone Sub-Growl",
          "Octave Up Falsetto / 12-String Shimmer",
          "Power Trio 3rd + 5th Backing Harmonizer",
          "Garage Bullhorn / Lo-Fi Radio Vox",
          "Driven Tube Preamp (1176 + Saturation)",
          "Slapback Rockabilly / Post-Punk Tape",
        ],
        defaultOption: "Abbey Road ADT Stereo Doubler",
      },
    ],
    params: [
      { id: "pitchSemitones", label: "SET PITCH (SEMITONES)", unit: "st", min: -12, max: 12, step: 1, defaultValue: 0 },
      { id: "fineCents", label: "FINE TUNE (CENTS)", unit: "ct", min: -100, max: 100, step: 5, defaultValue: 0 },
      { id: "formantShift", label: "FORMANT / THROAT SHIFT", unit: "st", min: -6, max: 6, step: 0.5, defaultValue: 0 },
      { id: "wetMix", label: "EFFECT / HARMONY BLEND", unit: "%", min: 0, max: 100, step: 5, defaultValue: 65 },
    ],
    openSourceStack: {
      client: [
        "WSOLA / Granular Pitch & Formant Shifter",
        "Stereo ADT Haas Modulated Delay",
        "WaveShaper Tube Saturation",
      ],
      backend: [
        "pedalboard (PitchShift, Chorus, Distortion, Delay, Compressor)",
        "librosa.effects.pitch_shift",
      ],
    },
    uiComponentSpec: [
      "Set Pitch slider (-12 to +12 semitones) + Fine Cents + Formant Shift",
      "8 Studio Rock Vocal Character presets (ADT Doubler, Octave Sub, 3rd/5th Harmony, Bullhorn, Tube Mic, Slapback)",
    ],
    dspArchitecture:
      "Combines dual-grain Hann-windowed pitch shifting with modulated 22ms Haas stereo ADT doubling and asymmetric tube saturation.",
    apiEndpoint: "/api/v1/tools/voice-changer",
    recipe: "voice-changer",
    workerTrackFile: "src/components/tools/VoiceChangerTool.tsx",
  },
  {
    id: "bpm-finder",
    code: "03.2",
    slug: "bpm-finder",
    toolsetId: "vocal-key-bpm",
    toolsetCode: "03",
    title: "Key & BPM Finder (+ Pedal Delay Calculator)",
    voiceAiOriginalName: "Key BPM Finder",
    voiceAiRoute: "/tools/bpm-finder",
    tagline: "Batch detect Song Key, Scale, BPM, Camelot code, and guitar pedal delay times.",
    description:
      "Replicates voice.ai's 240Hz low-pass onset beat detector and 12-bin Chroma Key/Scale analyzer, adding a guitar delay pedal millisecond calculator (1/4, 1/8., 1/8, 1/16), Tap Tempo, and E-Standard / Drop-D reference tuning drones.",
    bandUseCase:
      "Drop rehearsal takes or reference tracks to build a band setlist sheet with exact BPM, Key/Scale, Tap Tempo, and millisecond delay pedal subdivisions.",
    acceptedFormats: [".mp3", ".wav", ".flac", ".ogg", ".m4a"],
    outputs: [
      {
        id: "analysisTable",
        label: "Batch Key, Scale, BPM & Pedal Delay Manifest (.CSV / .JSON)",
        color: "#00E5FF",
      },
    ],
    selectControls: [
      {
        id: "tuningReference",
        label: "GUITAR / BASS REFERENCE DRONE",
        options: [
          "E Standard (E2 A2 D3 G3 B3 E4)",
          "Drop D (D2 A2 D3 G3 B3 E4)",
          "Eb Half-Step Down (Eb2 Ab2 Db3 Gb3 Bb3 Eb4)",
          "D Standard (D2 G2 C3 F3 A3 D4)",
        ],
        defaultOption: "E Standard (E2 A2 D3 G3 B3 E4)",
      },
    ],
    params: [
      { id: "lowPassBeatHz", label: "BEAT DETECTOR LPF (VOICE.AI=240)", unit: "Hz", min: 120, max: 400, step: 20, defaultValue: 240 },
      { id: "droneMixPct", label: "REFERENCE TUNING DRONE LEVEL", unit: "%", min: 0, max: 50, step: 5, defaultValue: 0 },
    ],
    openSourceStack: {
      client: [
        "240Hz Low-Pass Onset Autocorrelation BPM Detector (voice.ai parity)",
        "12-Bin Chroma Krumhansl-Schmuckler Key/Scale Correlator",
        "Web Audio Reference Tuning Oscillator",
      ],
      backend: [
        "librosa.beat.beat_track",
        "librosa.feature.chroma_cqt",
      ],
    },
    uiComponentSpec: [
      "Batch Analysis Table (FILE | BPM | KEY & SCALE | CAMELOT | 1/4 & DOTTED-1/8 DELAY MS)",
      "Interactive Spacebar Tap Tempo + Guitar/Bass Reference Tuning Drone",
    ],
    dspArchitecture:
      "Filters signal with a 240Hz low-pass biquad (matching voice.ai's C5vx8orS.js worker), computes onset autocorrelation for BPM, and correlates 12-pitch-class chroma energy.",
    apiEndpoint: "/api/v1/tools/bpm-finder",
    recipe: "bpm-finder",
    workerTrackFile: "src/components/tools/KeyBpmFinderTool.tsx",
  },
  {
    id: "voice-recorder",
    code: "04.1",
    slug: "voice-recorder",
    toolsetId: "capture-convert",
    toolsetCode: "04",
    title: "Voice & Riff Recorder",
    voiceAiOriginalName: "Voice Recorder",
    voiceAiRoute: "/tools/voice-recorder",
    tagline: "Record uncompressed studio mic takes (up to 3 hrs) with raw studio mode & click track.",
    description:
      "Captures vocal hooks, guitar riffs, or full-room 3-piece rehearsals directly in the browser with WebRTC voice-mangling disabled, optional headphone metronome click track, and instant WAV/FLAC/MP3 export.",
    bandUseCase:
      "Grab a vocal melody or guitar riff idea with zero DAW boot time, record in time to the headphone metronome, and pipe straight into the Stem Splitter or Enhancer.",
    acceptedFormats: ["Microphone Input", "Audio Interface Line-In"],
    outputs: [
      { id: "recordingWav", label: "Uncompressed Studio PCM (.WAV)", color: "#FF3B00" },
      { id: "recordingFlac", label: "Lossless Archival (.FLAC)", color: "#00E5FF" },
      { id: "recordingMp3", label: "Band Chat Share (.MP3 320kbps)", color: "#B8FF01" },
    ],
    params: [
      { id: "clickTrackBpm", label: "CLICK TRACK TEMPO", unit: "BPM", min: 40, max: 240, step: 1, defaultValue: 120 },
      { id: "inputGainDb", label: "DIGITAL INPUT TRIM", unit: "dB", min: -12, max: 12, step: 0.5, defaultValue: 0 },
      { id: "rawStudioMode", label: "RAW STUDIO MIC MODE (1=ON)", unit: "bool", min: 0, max: 1, step: 1, defaultValue: 1 },
    ],
    openSourceStack: {
      client: [
        "navigator.mediaDevices.getUserMedia (raw studio constraints)",
        "Float32 PCM Ring-Buffer Recorder",
        "Web Audio Lookahead Metronome",
      ],
      backend: [
        "soundfile",
        "ffmpeg (WAV / FLAC / MP3 archival encoder)",
      ],
    },
    uiComponentSpec: [
      "Raw Studio Mic Mode toggle (echoCancellation/noiseSuppression/autoGainControl = false)",
      "Headphone Metronome Click Track (40–240 BPM) + Live Level Meter",
      "Direct WAV / FLAC / MP3 export + 1-click pipe to any tool",
    ],
    dspArchitecture:
      "Captures uncolored PCM audio from selected audio interface/mic input, applies digital trim, and encodes directly to IEEE PCM WAV.",
    apiEndpoint: "/api/v1/tools/voice-recorder",
    recipe: "voice-recorder",
    workerTrackFile: "src/components/tools/VoiceRecorderTool.tsx",
  },
  {
    id: "audio-converter",
    code: "04.2",
    slug: "audio-converter",
    toolsetId: "capture-convert",
    toolsetCode: "04",
    title: "Master Audio Converter & Video Stem Extractor",
    voiceAiOriginalName: "Audio Converter",
    voiceAiRoute: "/tools/converter",
    tagline: "Convert between WAV, FLAC, MP3, OGG, M4A & extract audio from MP4 rehearsal videos.",
    description:
      "Supports all 21 pair conversion routes from voice.ai/tools/converter across MP3, WAV, FLAC, OGG, M4A, and MP4 rehearsal videos, with configurable sample rate (44.1 / 48 / 96 kHz), bit depth, and stereo/mono channel summing.",
    bandUseCase:
      "Transcode 24-bit DAW masters into MP3/FLAC for bandmate chat review, or extract uncompressed WAV audio stems from phone rehearsal videos (.MP4/.MOV).",
    acceptedFormats: [".mp3", ".wav", ".flac", ".ogg", ".m4a", ".mp4", ".webm", ".mov"],
    outputs: [
      { id: "convertedFile", label: "Transcoded Master Audio File", color: "#B8FF01" },
    ],
    selectControls: [
      {
        id: "targetFormat",
        label: "TARGET CONTAINER FORMAT",
        options: ["wav", "flac", "mp3", "ogg", "m4a"],
        defaultOption: "wav",
      },
      {
        id: "bitDepthOrBitrate",
        label: "QUALITY / BITRATE",
        options: [
          "24-bit Studio PCM",
          "16-bit PCM",
          "32-bit Float",
          "320 kbps CBR",
          "192 kbps CBR",
        ],
        defaultOption: "24-bit Studio PCM",
      },
    ],
    params: [
      { id: "sampleRate", label: "TARGET SAMPLE RATE", unit: "Hz", min: 44100, max: 96000, step: 3900, defaultValue: 48000 },
      { id: "monoSum", label: "CHANNEL MODE (0=STEREO, 1=MONO)", unit: "mode", min: 0, max: 1, step: 1, defaultValue: 0 },
    ],
    openSourceStack: {
      client: [
        "Web Audio OfflineAudioContext Resampler",
        "IEEE PCM WAV / FLAC / LAME MP3 Encoder",
      ],
      backend: [
        "ffmpeg",
        "soundfile",
      ],
    },
    uiComponentSpec: [
      "Target Format matrix (WAV, FLAC, MP3, OGG, M4A) + MP4 Video Audio Demuxer",
      "Sample Rate selector (44.1 / 48 / 96 kHz), Bit Depth, and Stereo/Mono Sum switch",
    ],
    dspArchitecture:
      "Demuxes audio from any media container, resamples via OfflineAudioContext to target sample rate, optionally sums L+R to phase-safe mono, and encodes master output.",
    apiEndpoint: "/api/v1/tools/convert",
    recipe: "audio-converter",
    workerTrackFile: "src/components/tools/AudioConverterTool.tsx",
  },
];

export function getToolsForToolset(toolsetId: ToolsetId): ToolDefinition[] {
  if (toolsetId === "all") return TOOLS;
  return TOOLS.filter((t) => t.toolsetId === toolsetId);
}

export function getToolById(toolId: ToolId): ToolDefinition {
  return TOOLS.find((t) => t.id === toolId) ?? TOOLS[0];
}
