# Language

## Vietnamese (shipped)
- **Text**: every farmer-facing string lives in `src/i18n/vi.json` (UI) and `content/advice.vi.json` (advice cards — the fixed answer library). No English on farmer screens. Short lines (≤ 2 lines per item), large type (18 px base), every icon has a text label.
- **Voice**: every advice card and the two UI prompts (`welcome`, `ask_person`) are pre-recorded at build time with Piper TTS, voice `vi_VN-vais1000-medium` (trained on the VAIS-1000 corpus, CC BY 4.0) → Opus 24 kbps (`.ogg`) + MP3 32 kbps fallback, 11 clips, ~0.65 MB total, precached for offline use. If a clip cannot play, the app falls back to the browser's `speechSynthesis` with `lang=vi-VN` (that depends on the phone having a Vietnamese voice installed).
- Regenerate: `python -m venv .ttsvenv && .ttsvenv/bin/pip install piper-tts && .ttsvenv/bin/python tools/tts/generate.py` (needs `ffmpeg`).

## The brief's "less-supported language" question
Tây Nguyên farmers include many ethnic-minority households whose first language is not Vietnamese. We checked what open speech tech actually exists for the main Highland languages (Hugging Face, 4 Oct 2026):

| Language | ISO 639-3 | Meta MMS TTS | Meta MMS ASR (mms-1b-all adapter) | Status in Ami Ama |
|---|---|---|---|---|
| Bahnar (Ba Na) | `bdq` | ✅ [`facebook/mms-tts-bdq`](https://huggingface.co/facebook/mms-tts-bdq) | ✅ `bdq` listed | **Language-pack slot ready** (`src/i18n/bdq.json`, empty) — needs a native speaker |
| Ê Đê (Rhade) | `rad` | ❌ (no model) | ❌ not listed | Not possible with MMS — needs community recordings |
| Jarai (Gia Rai) | `jra` | ❌ (no model) | ❌ not listed | Not possible with MMS — needs community recordings |

Notes:
- MMS models are licensed **CC BY-NC 4.0** (non-commercial). Fine for a pilot/NGO deployment; a commercial cooperative app would need another route (e.g. record a native speaker reading the ~11 audio texts — which is also simply better quality).
- We did **not** write any Bahnar text: machine-translating agronomy advice into a low-resource language without a speaker would break the "no hallucinations" guardrail.

## How a language pack works
1. **UI strings**: copy `src/i18n/vi.json` → `src/i18n/<code>.json` (121 short keys; `bdq.json` already exists with every key empty). Empty values fall back to Vietnamese, so a pack can be rolled out partially.
2. **Advice cards**: copy `content/advice.vi.json` → `content/advice.<code>.json` (9 cards × see/why/goal/do/safety/audio_text). Must be translated **and** reviewed by an extension officer who speaks the language.
3. **Audio**: either (a) a native speaker records the 11 `audio_text` lines (≈ 5 minutes of reading; best), or (b) for Bahnar, synthesize with MMS-TTS `bdq` at build time (same `tools/tts/generate.py` flow with a different engine), then have a speaker check every clip.
4. Register the pack in `src/i18n/index.ts` (`packs`) and add a language switch.
5. Ê Đê / Jarai: start with (a) recordings; contribute sentences/recordings to Mozilla Common Voice so ASR/TTS can exist later.

Cost estimate for one pack: ~1 day of a bilingual extension officer + 1 hour of recording.
