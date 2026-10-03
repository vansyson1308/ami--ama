# Ami Ama — Execution plan

Start: Sun 4 Oct 2026, 00:20 Asia/Saigon. Feature-freeze 14:00, final 20:00.
Environment: cloud container, 4 vCPU, 15 GB RAM, **no GPU**, open egress (PyPI, Hugging Face, Mendeley, npm).
The ML track and the app track run in parallel: training runs in the background while the app is built.

| # | Time box (VN) | Milestone | Tasks | Acceptance (self-run) |
|---|---|---|---|---|
| M1 | 00:20–01:30 | PWA shell + offline | Vite+React+TS scaffold; vite-plugin-pwa (injectManifest/generateSW) precaching `models/ audio/ content/ ort/`; copy ort wasm to `/public/ort/`; manifest + icons; Vietnamese UI strings in `src/i18n/vi.json`; offline indicator; `vercel.json` | `npm run build` OK; Playwright: load → "Sẵn sàng dùng offline ✓" → offline → reload shows app; manifest valid (installability audit) |
| M2 | 00:20–03:30 (background) | Data + training | `ml/download.py` (RoCoLe via Mendeley public API, JMuBEN + beans via HF parquet); `ml/prepare.py` (JMuBEN ≤1,200/class, RoCoLe 60/20/20 stratified **grouped by plant**, beans 70/15/15; manifests in `ml/splits/`); `ml/train.py` (timm mobilenetv3_large_100 → fallback small, CPU); `ml/train_colab.ipynb` | `ml/reports/metrics.json` with RoCoLe test macro-F1 (whatever it is) |
| M3 | 03:30–04:30 | Calibrate + export | `ml/calibrate.py` (temperature, tau, ECE, risk–coverage); `ml/export.py` (ONNX opset 17, static QDQ int8 → dynamic fallback); `ml/verify_onnx.py` | ≤ 6 MB; int8 vs fp32 drop ≤ 2 pts; verify passes |
| M4 | 04:30–07:00 | In-browser inference | `src/ml/` preprocess (same resize/crop as Python), ort session (WASM, 1 thread, local wasm), quality gate (luminance, Laplacian var), decision rule identical to Python; Result + Abstain screens; samples in `public/samples/` | Playwright parity: same top-1 on 10 samples, |Δp| ≤ 0.01 vs Python |
| M5 | 07:00–09:00 | Audio + log + Hỏi người | `tools/tts/generate.py` (Piper vi_VN-vais1000-medium → Opus/MP3); field log in IndexedDB (idb-keyval), consent, GPS opt-in, export JSON/share; escalation SMS + Web Share | Playwright: audio element offline, log persists after offline reload, sms: link correct |
| M6 | 09:00–11:00 | Evidence + About + docs | Evidence screen from model_card.json; About/Privacy; DATA_CARD, MODEL_CARD, RESPONSIBLE_AI, LANGUAGE; bdq.json stub | §8 checklist all true |
| M7 | 11:00–13:00 | Price screen + polish | Giá cà phê from `content/prices.vi.json` with staleness warning; full e2e suite + screenshots; Lighthouse; sizes | e2e green; Lighthouse installable; TODO(human) real-phone test |
| M8 | 13:00–14:00 | Freeze | README final, ACCEPTANCE.md, tag `v1.0` | build green, tag pushed |

## Fallbacks (pre-decided)
- No GPU → train at 224 on pre-resized 256-px cache, `mobilenetv3_large_100` with frozen backbone warm-up; if > 8 min/epoch switch to `mobilenetv3_small_100`.
- Static int8 fails / drops > 2 pts → dynamic quant → fp16/fp32 if ≤ 6 MB.
- Piper unavailable → other offline Python TTS → runtime `speechSynthesis` vi-VN (documented).
- Vercel: no account access from this container → click-steps as TODO(human) in PROGRESS.md.

## Human-only items (batched)
- Vercel import (if no token), real Android airplane-mode test, updated price snapshot (`content/prices.vi.json`).
