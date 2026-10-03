# Ami Ama — Build Spec for the Coding Agent

> **Read this whole file before writing code.** It is the single source of truth.
> Hard deadline: **Sunday 4 Oct 2026, 20:00 Asia/Saigon (= 09:00 ET)**. Aim to be feature-complete by **14:00**,
> so the human has time for videos and submission. When in doubt: smaller, working, offline, honest.

---

## 0. Context in one minute

- Event: Hack-Nation 7th Global AI Hackathon → **Challenge 04b: World Bank "Small AI for Development" — Track B: Agriculture**.
- Product: **Ami Ama** — an **offline, on-device** AI assistant for smallholder **robusta coffee** farmers in Vietnam's
  Central Highlands (Tây Nguyên). ("Ama"/"Ami" are the Ê Đê words for father/mother, as in Buôn **Ma** Thuột ← Buôn Ama Thuột.)
- Core loop: farmer photographs a coffee leaf → a **tiny on-device vision model** names the likely problem
  → app shows a **fixed, source-cited 4-step advice card in Vietnamese**, read aloud → if the model is unsure, it says
  **"Chưa chắc — hỏi cán bộ"** and prepares a message for a human → the observation is saved in an offline **field log**.
- Delivery: a **PWA** (installable web app) hosted on **Vercel**. After first load it works **100% in airplane mode**.
  No backend. No API keys. No cloud LLM.

### Who we build for (fictional persona, label as fictional in UI/docs)
Chị **H'Nơ**, 38, Ê Đê, farms 2 ha of robusta in Krông Pắc, Đắk Lắk. Speaks Ê Đê at home, Vietnamese when needed.
Her own phone is basic; the household smartphone is her daughter's (weekends) or the cooperative lead farmer's.
No Wi-Fi at home, buys 3G bundles occasionally. Extension officer visits ~twice a year. Sells to whichever trader comes.
(Mirrors "Noor" in the World Bank brief.)

---

## 1. How we are judged (optimize for these, in this order)

### World Bank panel (decides the Track B winner)
| Criterion | Weight | What it means for the build |
|---|---|---|
| Built solution (Small AI fidelity) | 25% | Works **end to end offline** on a normal Android phone; small model files |
| Development relevance & impact | 20% | Real coffee-smallholder problem; outcome matters to H'Nơ |
| Data grounding | 15% | Every dataset named with source/license/size **and what it does NOT cover** |
| Evidence it works | 15% | Real metrics on held-out **field** photos; in-app "Evidence" screen |
| Clarity, design, inclusivity, AI value | 15% | Voice + big buttons for low literacy; explain why SMS/search can't do this |
| Scalability / replicability | 10% | Language packs, crop packs, retrain loop documented |
| **Responsible AI** | **PASS/FAIL** | Human-in-the-loop, abstain when unsure, fixed answer library, privacy & consent |

### Hack-Nation general jury
Technical depth 33% · Communication 33% · Innovation/creativity 33%.

### Community prizes we target
Creativity award (4-step card + language-pack idea), Best Quote, Go Viral (LinkedIn) — mostly handled by the human,
but the app must look good in a 10-second airplane-mode GIF.

### Rules from the World Bank brief (must all be visibly satisfied)
1. Runs on a device the user already has → mid/low-end Android + Chrome.
2. Core feature works offline → leaf check + advice + audio + log, all offline.
3. Model files small enough to side-load / send over weak connection → **vision model ≤ 6 MB**, whole precache ≤ 25 MB.
4. ≥ 1 interaction in a named local language → **Vietnamese** (text + voice). Be ready to answer "what about a less-supported
   language?" → **Bahnar (Ba Na)** is covered by Meta MMS (ASR + TTS `bdq`); **Ê Đê and Jarai are not** → document honestly.
5. Guardrails: a person makes the final call; tool flags uncertainty; no hallucinations → **fixed answer library only.**

---

## 2. Scope & priorities

**P0 (must ship, in this order)**
1. PWA shell, Vietnamese UI, installable, offline precache, "Sẵn sàng dùng offline ✓" indicator.
2. ML pipeline (`/ml`) → trained, calibrated, int8-quantized ONNX leaf model + `model_card.json`.
3. On-device inference with onnxruntime-web (WASM) + image-quality gate + abstain logic.
4. Advice cards from `content/advice.vi.json` (provided, do not invent content) with source citations.
5. Pre-generated Vietnamese audio for every card (Piper TTS at build time) + play button.
6. Field log (IndexedDB): photo thumbnail, result, confidence, date, optional GPS (with consent). Export (share text / JSON).
7. "Hỏi người" escalation: pre-filled SMS (`sms:` link) and Web Share (Zalo etc.) with summary.
8. "Bằng chứng" (Evidence) screen + About/Privacy screen + Data/Model cards in repo.
9. README with architecture, datasets, metrics, limitations, how to run.

**P1 (if time)**
- Price reference screen (bundled, date-stamped snapshot `content/prices.vi.json`; compare buyer's offer; staleness warning).
- Severity hint for rust (from RoCoLe levels) — only if accuracy is reported.
- Bahnar language-pack demo slot (see §7.3).

**P2 (stretch, only if everything above is done and tested)**
- Voice question input: transformers.js Whisper-tiny (vi) → map to fixed intents (keyword matching), never free text answers.

**Out of scope (do NOT build):** backend, accounts, cloud LLM, chat with a generative model, pesticide brand/dose
recommendations, medical/health anything.

---

## 3. Tech stack (fixed — don't bikeshed)

- **Vite + React + TypeScript**, plain CSS (or CSS modules). No heavy UI kit.
- **vite-plugin-pwa** (Workbox, `injectManifest` or `generateSW` with precache of `/models/**`, `/audio/**`, `/content/**`).
- **onnxruntime-web** (WASM backend; set `ort.env.wasm.numThreads = 1` fallback for low-end; serve `.wasm` files locally from `/ort/` so it works offline — do NOT load from CDN).
- **idb-keyval** or **Dexie** for IndexedDB.
- Deploy: **Vercel** static (`vite build` → `dist`). Add `vercel.json` with headers: `Cache-Control` for models/audio, and
  `Cross-Origin-Opener-Policy/Embedder-Policy` only if multithreaded WASM is used (default: don't, keep single-thread).
- ML: **Python 3.11**, PyTorch + **timm**, `datasets` (Hugging Face), `onnx`, `onnxruntime`, `onnxruntime.quantization`,
  scikit-learn, matplotlib.
- TTS at build time: **piper-tts** (Python) with voice `vi_VN-vais1000-medium` (fallback `vi_VN-25hours_single-low`)
  from `rhasspy/piper-voices` on Hugging Face → encode to **Opus/OGG ~24 kbps** (ffmpeg) to keep size small; MP3 fallback for iOS.

---

## 4. Repository layout

```
/                       README.md, LICENSE (MIT), vercel.json, package.json
/docs/SPEC.md           this file
/docs/DATA_CARD.md      datasets: source, license, size, coverage, gaps, synthetic flags
/docs/MODEL_CARD.md     architecture, training, metrics, calibration, threshold, limitations
/docs/RESPONSIBLE_AI.md human-in-loop, abstain, privacy, consent, bias, lost/shared phone
/docs/LANGUAGE.md       Vietnamese, Bahnar (MMS), Ê Đê/Jarai gap, how to add a language pack
/content/advice.vi.json fixed answer library (PROVIDED — do not invent new agronomy)
/content/prices.vi.json price snapshot (P1)
/ml/                    training pipeline (see §5)
/tools/tts/             build-time audio generation (see §7)
/public/models/         leaf_v1.int8.onnx, labels.json, model_card.json
/public/audio/vi/       <card_id>.ogg / .mp3
/public/ort/            onnxruntime-web wasm files (copied at build)
/src/                   app
```

---

## 5. ML pipeline (`/ml`) — the part the human cannot do, so be explicit and reproducible

All steps are scripts with a `Makefile` (or `ml/run_all.sh`). Seed everything (`seed=42`). Log to `ml/reports/`.

### 5.1 Datasets (cite all in DATA_CARD.md)
| Key | Dataset | Get it | License | Notes |
|---|---|---|---|---|
| `rocole` | **RoCoLe** – Robusta Coffee Leaf images (Parraga-Alava et al., 2019, Data in Brief) | Mendeley Data DOI `10.17632/c5yvn32dzg.2` → https://data.mendeley.com/datasets/c5yvn32dzg/2 (Download All zip). If the script can't fetch it, **the human downloads the zip** and puts it at `ml/data/raw/rocole.zip`. | CC BY 4.0 | 1,560 images, **robusta**, smartphone, real field, Ecuador. Classes: healthy 791, red spider mite 167, rust levels 1–4 (344/166/62/30). Inspect the zip's annotation files to map labels. |
| `jmuben` | **JMuBEN** arabica leaves (via AgML) | HF `Project-AgML/arabica_coffee_leaf_disease_classification` (parquet) | CC BY 4.0 | 58,549 images, arabica, Kenya. Classes: Cerscospora, Healthy, Leaf_rust, Miner, Phoma. **Subsample** (see below). |
| `beans` | **iBean** (Makerere AI Lab) | HF `AI-Lab-Makerere/beans` | check card (MIT at time of writing) | Used ONLY as **negative class "not a coffee leaf"**. Listed in the World Bank brief. |

Optional negatives if time: a few hundred generic images (soil, hands, sky) — only from openly licensed sources; record them.

### 5.2 Label taxonomy (final model classes)
```
0 healthy            ← rocole:healthy + jmuben:Healthy
1 rust               ← rocole:rust_level_1..4 + jmuben:Leaf_rust   (keep rocole level as metadata for P1 severity)
2 red_spider_mite    ← rocole:red_spider_mite
3 leaf_miner         ← jmuben:Miner
4 cercospora         ← jmuben:Cerscospora
5 phoma              ← jmuben:Phoma
6 not_coffee_leaf    ← beans (all classes) [+ optional negatives]
```
Write `public/models/labels.json` with `id`, `key`, `vi_name`, `card_id` (matches advice.vi.json).

### 5.3 Splits — designed to produce honest "field" evidence
- **Subsample JMuBEN** to ≤ 1,200 images per class (stratified, seeded) — it is huge, near-duplicate and studio-like.
- **RoCoLe is the field test**: split RoCoLe by image (stratified) into **train 60% / val 20% / test 20%**.
  Report metrics **separately** for `test_rocole` (robusta, field — the number that matters) and `test_jmuben`.
- Beans: 70/15/15.
- Save split manifests (`ml/splits/*.csv`) and commit them (not the images).

### 5.4 Training recipe
- Backbone: `timm` **`mobilenetv3_large_100`** pretrained (fallback `mobilenetv3_small_100` if CPU-only and slow).
- Input 224×224, ImageNet normalization. Augment: RandomResizedCrop(0.6–1.0), flips, rotation ±25°, ColorJitter
  (0.3,0.3,0.3,0.05), RandomGaussianBlur(p=0.2), RandomGrayscale(p=0.05), random JPEG quality 40–95 (simulate cheap cameras).
- Class imbalance: `WeightedRandomSampler` + label smoothing 0.1.
- Optimizer AdamW lr 3e-4 (head 1e-3), cosine schedule, 12 epochs max, early stop on val macro-F1.
- **Compute**: works on CPU (expect ~3–8 min/epoch on a laptop with ~7k training images); if a GPU or Colab T4 is
  available use it. Provide `ml/train_colab.ipynb` mirroring `train.py` as a fallback.
- Keep total wall-clock for training ≤ 60 min. If time is short: freeze backbone for 3 epochs, then unfreeze last 2 blocks.

### 5.5 Calibration + abstain (this is the Responsible-AI core — do it properly)
- Fit **temperature scaling** on the val set; store `temperature`.
- Choose a confidence threshold `tau` on val so that **accuracy on accepted predictions ≥ 90%** on the RoCoLe val split
  (fallback ≥ 85% if coverage would drop below 50%). Store `tau` and the resulting coverage.
- Runtime decision rule (implement identically in Python eval and TS app):
  1. If image-quality gate fails → ask to retake (no prediction).
  2. If top class is `not_coffee_leaf` with p ≥ tau → "Đây có vẻ không phải lá cà phê".
  3. If max p < tau **or** (top1 − top2) < 0.15 → **ABSTAIN**: "Chưa chắc — hỏi cán bộ" (show top-2 as "có thể là…").
  4. Else show top-1 card with confidence words: p ≥ 0.9 "Khá chắc chắn", ≥ tau "Có thể", never show raw % as the main message
     (show % in a small "chi tiết" toggle).
- Report: accuracy, macro-F1, per-class P/R/F1, confusion matrix (PNG), **ECE before/after calibration**, **risk–coverage curve**
  (PNG), coverage at tau, for both test sets. Save to `ml/reports/` and summarize in `public/models/model_card.json` and MODEL_CARD.md.

### 5.6 Export
- Export ONNX (opset 17, dynamic batch=1 fixed is fine), input name `input` float32 [1,3,224,224], output `logits`.
- Quantize: `onnxruntime.quantization.quantize_static` (QDQ, per-channel, 200 calibration images) → `leaf_v1.int8.onnx`;
  if static fails, `quantize_dynamic`. **Verify** int8 vs fp32 accuracy drop ≤ 2 pts on test sets; record both.
- Size target ≤ 6 MB. Record file size + SHA256 in model_card.json.
- `ml/verify_onnx.py`: runs the int8 model with onnxruntime (CPU) on 20 test images and compares to PyTorch.
- `public/models/model_card.json` schema:
```json
{ "version":"leaf_v1", "arch":"mobilenetv3_large_100", "input":{"size":224,"mean":[0.485,0.456,0.406],"std":[0.229,0.224,0.225]},
  "temperature":1.0, "tau":0.0, "margin":0.15, "labels":"labels.json", "size_bytes":0, "sha256":"",
  "metrics":{"test_rocole":{"acc":0,"macro_f1":0,"coverage_at_tau":0,"acc_at_tau":0,"ece":0},"test_jmuben":{}},
  "trained_on":["rocole","jmuben(subsampled)","beans"], "date":"2026-10-04",
  "not_covered":["Vietnamese field photos","fruit/cherry pests (rệp sáp, mọt đục quả)","stem borers (mọt đục cành)",
                 "root problems (tuyến trùng)","nutrient deficiencies","pink disease (nấm hồng)","anthracnose/khô cành"] }
```

### 5.7 Image-quality gate (TS, runs before the model)
- Too dark/bright: mean luminance < 40 or > 230 → retake.
- Blur: variance of Laplacian on 256-px grayscale < threshold (tune on a few samples; start 60) → retake.
- Guidance overlay on capture screen: "1 lá · mặt dưới lá · đủ sáng · lấp đầy khung".

---

## 6. App spec (Vietnamese UI, mobile-first 360×640, large type ≥ 18 px, contrast AA, big tap targets ≥ 48 px)

### Screens
1. **Onboarding (first run)**: what it does, works offline, data stays on phone, consent toggles (save photos, use GPS).
   One screen, big "Bắt đầu".
2. **Home**: 4 big tiles with icons + short labels: **Chụp lá** · **Sổ rẫy** · **Giá cà phê** (P1) · **Hỏi người**.
   Header shows offline readiness: "Sẵn sàng dùng offline ✓" (all precached) or progress while caching.
3. **Capture**: `<input type="file" accept="image/*" capture="environment">` (most robust on low-end Android) + preview,
   guidance overlay, quality gate, "Kiểm tra".
4. **Result**:
   - Title (vi_name), confidence words, small "chi tiết" with top-3 %.
   - **4-step card** (from advice.vi.json): **Thấy gì** · **Vì sao** · **Cần đạt** · **Làm gì** — big icons, short lines.
   - 🔊 **Nghe** button (plays `/audio/vi/<card_id>.ogg`, fallback `.mp3`, fallback `speechSynthesis` vi-VN).
   - Source line(s) with links (open only if online).
   - Safety footer from card (`safety`).
   - Buttons: **Lưu vào sổ rẫy** · **Hỏi cán bộ** · **Chụp lại**.
   - ABSTAIN variant: "Chưa chắc — hỏi cán bộ" card (card_id `uncertain`) + "có thể là A hoặc B" + escalation primary.
5. **Sổ rẫy (Field log)**: list of entries (thumbnail 160 px JPEG, date, result, confidence words, GPS if consented, note
   field with optional voice memo P2). Export: "Chia sẻ" (Web Share text summary), "Tải JSON". Delete entry / delete all.
   Show "Chờ gửi" (store-and-forward) badge for entries not yet shared.
6. **Hỏi người**: pick entry (or latest) → pre-filled message:
   `"[Ami Ama] Rẫy của tôi: <date>, lá có dấu hiệu <vi_name or 'chưa rõ'> (<confidence words>). Vị trí: <lat,lng or 'không chia sẻ'>. Nhờ cán bộ xem giúp."`
   Buttons: SMS (`sms:?&body=`) — works on basic phones' numbers; **Chia sẻ** (Web Share → Zalo/Messenger) with the photo
   when supported. Field to save the extension officer's phone number locally.
7. **Giá cà phê (P1)**: shows bundled snapshot (price, place, date, source). User enters trader's offer → shows
   difference (đ/kg and %) and **staleness warning** if snapshot older than 3 days: "Giá này cũ X ngày — hỏi HTX/đài
   trước khi bán". Clearly labelled: "Không phải AI — đây là bảng giá tham chiếu".
8. **Bằng chứng (Evidence)**: model version, size, metrics from model_card.json (field test vs studio test), coverage at
   threshold, list of what it does NOT detect, datasets with licenses. This screen is for judges — make it clean.
9. **Giới thiệu & Quyền riêng tư**: on-device processing, no telemetry, what is stored where, delete-all, lost/shared phone
   note, fictional persona disclaimer, team, license, sources.

### Behaviour & constraints
- First load downloads everything needed for offline; show progress. After that: **airplane mode test must pass**.
- Inference latency target ≤ 1.5 s on a mid-range Android; load model once, keep session.
- No network calls at runtime except: none. (Links open externally only on user tap.)
- All UI strings in `src/i18n/vi.json` (keys) so a language pack can be added (`bdq.json` stub).
- Accessibility: every icon has a text label; audio for every advice card; avoid long paragraphs (≤ 2 lines per item).

---

## 7. Content, audio, language

### 7.1 Advice library
- `content/advice.vi.json` is **provided**. The app may only display text from it. Do not generate or paraphrase advice.
- Cards: `healthy, rust, red_spider_mite, leaf_miner, cercospora, phoma, not_coffee_leaf, uncertain, retake`.
- Each card has `see / why / goal / do` (arrays of short lines), `safety`, `sources`, `audio_text`.

### 7.2 Audio generation (`tools/tts/generate.py`)
- Reads advice.vi.json → for each card synthesizes `audio_text` with Piper `vi_VN-vais1000-medium` → WAV → ffmpeg →
  `public/audio/vi/<card_id>.ogg` (Opus 24 kbps mono) and `.mp3` (32 kbps). Also UI prompts (`welcome`, `retake`).
- Commit the generated audio (small). Record voice name + license (Piper voice card) in DATA_CARD.md.
- Total audio budget ≤ 3 MB.

### 7.3 Bahnar (P1, honesty-first)
- Do **not** invent Bahnar text. Implement the **language-pack mechanism** (`src/i18n/bdq.json` with only keys, empty values)
  and a `docs/LANGUAGE.md` section: MMS `facebook/mms-tts-bdq` and MMS-1b-all ASR adapter `bdq` exist; a pack needs a
  native speaker to translate ~40 strings + 9 cards; Ê Đê (`rad`) and Jarai (`jra`) are not covered by MMS → would need
  community recordings (e.g., Common Voice). This answers the brief's "less-supported language" question.

---

## 8. Responsible AI checklist (pass/fail — all must be true and visible)
- [ ] Fixed answer library; model only selects a card. No free-text generation.
- [ ] Calibrated threshold; ABSTAIN path tested; "hỏi người" always one tap away.
- [ ] Never recommends pesticide brands or doses; safety footer says to follow label and ask an officer.
- [ ] On-device only; no analytics; explicit consent for photo storage and GPS; delete-all works.
- [ ] Shared/lost phone note; data stays in the browser storage of that phone.
- [ ] Limitations listed in-app (Evidence screen) and in docs (not covered classes, robusta/arabica shift, no VN photos).
- [ ] Bias statement: trained on Ecuador/Kenya leaves; may underperform on Vietnamese varieties/lighting → feedback loop
      plan (consented photos labelled by extension officers → retrain).

---

## 9. README must contain
1. One-line problem statement in the World Bank format:
   "Because of Ami Ama, a smallholder robusta farmer in Tây Nguyên will identify a leaf problem and know a safe first step
   — or know to call a person — on the same day she sees it, offline and in Vietnamese, instead of waiting months for an
   extension visit or guessing; we know because ~640,000 smallholder households produce ~95% of Vietnam's coffee
   (Daily Coffee News, Jul 2026) and extension visits are rare."
2. Live demo link (Vercel) + "try it in airplane mode" instructions + GIF.
3. Why AI (vs SMS/spreadsheet/search): image recognition offline in the field; voice for low literacy; search needs data
   and literacy; SMS can't see a leaf.
4. Architecture diagram (mermaid): Camera → quality gate → ONNX int8 (WASM) → calibrated decision → fixed card + audio →
   field log (IndexedDB) → store-and-forward share (SMS/Zalo).
5. Datasets table (source, license, size, what's not covered), metrics table (field vs studio), model size.
6. Responsible AI summary, Language section, Scalability (crop packs: pepper/durian/cashew; language packs; cooperative
   deployment; registry/EUDR plot log), What's next.
7. How to run locally, how to retrain (`make -C ml all`), how to regenerate audio.
8. Credits & licenses (MIT code; dataset CC BY attributions; Piper voice license).

Evidence/context numbers you may cite (with sources):
- Vietnam ≈ 640,000 smallholder coffee households, ~1.4M plots, ~95% of output, ~700,000 ha, ~97% robusta, #2 producer
  — Daily Coffee News, 1 Jul 2026, https://dailycoffeenews.com/2026/07/01/report-says-vietnams-robusta-boom-faces-a-reckoning/
- > 80% of Vietnam's population uses smartphones — National Statistics Office via VietnamNet,
  https://vietnamnet.vn/en/more-than-80-of-vietnam-s-population-uses-smartphones-2537308.html
- EU Deforestation Regulation applies 30 Dec 2026 (large/medium) / 30 Jun 2027 (micro/small) — plot geolocation needed;
  https://ecustoms.sgs.com/2025/11/27/eudr-officially-postponed-new-deadlines-set-for-2026-and-2027/
- 2.6 B people offline; internet use 27% in low-income countries — World Bank challenge brief.

---

## 10. Milestones & acceptance tests (report status after each)

| # | Target time (VN) | Milestone | Acceptance |
|---|---|---|---|
| M1 | 01:30 | Scaffold PWA + deploy to Vercel + offline shell | Vercel URL loads; Lighthouse PWA installable; airplane mode shows app |
| M2 | 03:30 | ML data + training done | `ml/reports/` has metrics; RoCoLe test macro-F1 reported (whatever it is — be honest) |
| M3 | 04:30 | ONNX int8 exported + verified | ≤ 6 MB; int8 vs fp32 drop ≤ 2 pts; verify script passes |
| M4 | 07:00 | In-browser inference + result card + abstain | Same prediction as Python on 10 sample images (±1e-2 prob) |
| M5 | 09:00 | Audio + field log + Hỏi người | Audio plays offline; log persists after reload; SMS/share opens |
| M6 | 11:00 | Evidence + About + docs (DATA/MODEL/RESPONSIBLE_AI/LANGUAGE) | All checklists in §8 true |
| M7 | 13:00 | P1 price screen, polish, real-phone test | Airplane-mode end-to-end on a real Android phone |
| M8 | 14:00 | Freeze | Tag `v1.0`; README final; no failing build |

Put 6–10 sample test images (from the RoCoLe/JMuBEN **test** splits, respecting CC BY attribution) in
`public/samples/` and add a "Thử với ảnh mẫu" button — judges without coffee plants can still test the demo.

---

## 11. Agent operating rules
- Commit early and often with clear messages; push after every milestone.
- Never add a network dependency at runtime. Never call external AI APIs. No secrets in the repo.
- Never invent agronomic advice, statistics, or dataset facts. If something is missing, leave a `TODO(human)` and tell the human.
- Don't commit raw datasets or large binaries other than the final model (≤ 6 MB) and audio (≤ 3 MB).
- If a step blocks > 20 min (e.g., dataset download), take the fallback in this spec and note it in the README.
- Keep the UI copy short and plain Vietnamese (no jargon, no English in farmer-facing screens).
