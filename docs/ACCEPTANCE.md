# Acceptance checklist (≈ 15 minutes)

Live URL: **https://ami-ama.vercel.app** (Vercel, production = `main`)
Release: tag `v1.0` · PRs: [#1](https://github.com/vansyson1308/ami--ama/pull/1) (M1, merged), [#2](https://github.com/vansyson1308/ami--ama/pull/2) (model + M2–M7)

Already verified automatically in this container (headless Chromium, Pixel 5 emulation, production build via `vite preview`) — evidence in `docs/PROGRESS.md`, `docs/e2e-parity.json`, `docs/screenshots/`. The boxes below are for **you** on a real phone.

## A. Install & offline (Android + Chrome) — 4 min
- [ ] Open the live URL on Wi-Fi/4G → first screen "Chào bạn!" → tick "Lưu ảnh nhỏ…" → **Bắt đầu**.
- [ ] Header badge turns to **"Sẵn sàng dùng offline ✓"** (one-time download ≈ 20 MB uncompressed).
- [ ] Chrome ⋮ → **Add to Home screen / Install app** works; icon is the green leaf.
- [ ] Turn on **airplane mode**, swipe the app away, reopen from the home screen → app loads, badge still ✓.

## B. Core loop offline — 5 min (still in airplane mode)
- [ ] **Thử với ảnh mẫu** → tap 3 different leaves → each shows a title, a 4-part card (Thấy gì · Vì sao · Cần đạt · Làm gì), safety footer, sources.
- [ ] Tap **🔊 Nghe** → Vietnamese voice plays (offline).
- [ ] Open **Chi tiết** → top-3 percentages + model version + inference time (ms). Note the time: ______ ms (target ≤ 1500 ms).
- [ ] **Abstain**: tap the **4th** sample image (`03_rust.jpg`; also the 6th, `05_red_spider_mite.jpg`) → title **"Chưa chắc — hỏi cán bộ"**, "Có thể là A hoặc B", big **Hỏi cán bộ** button.
- [ ] **Retake**: **Chụp lá** → photograph something very blurry or in the dark → "Ảnh chưa rõ — chụp lại nhé".
- [ ] **Real leaf** (any plant): **Chụp lá → Mở máy ảnh** → photo → **Kiểm tra** → a card or "Chưa chắc" (never a crash).
- [ ] **Lưu vào sổ rẫy** on two results.

## C. Field log & escalation — 3 min
- [ ] **Sổ rẫy** → entries with thumbnail, date, result, "Chờ gửi" badge. Type a note.
- [ ] Reload the app (still offline) → entries and note persist.
- [ ] **Hỏi người** → pick an entry → type an officer number → **Gửi SMS** opens the SMS app with "[Ami Ama] Rẫy của tôi: …" pre-filled.
- [ ] Back online: **Chia sẻ (Zalo…)** opens the Android share sheet (with the leaf photo if consented). Entry badge becomes "Đã gửi".
- [ ] **Tải JSON** downloads `so-ray-YYYY-MM-DD.json`.
- [ ] **Giới thiệu → Xóa toàn bộ dữ liệu** → log empty, onboarding shows again.

## D. Evidence & content — 3 min
- [ ] **Bằng chứng** shows field (RoCoLe) vs studio (JMuBEN) numbers matching README → "Evidence" table, the "KHÔNG nhận ra" list and datasets with licenses.
- [ ] **Giá cà phê** shows the snapshot date, the "Không phải AI" banner, the staleness warning (snapshot 15/09/2026), and a difference when you type a trader price.
- [ ] Every advice text on screen is from `content/advice.vi.json` (no other agronomy text exists in the app).

## Sizes (from `node scripts/sizes.mjs` after `npm run build`)
| item | size | budget |
|---|---|---|
| Vision model `leaf_v1.int8.onnx` (int8 weights) | **4.40 MB** | ≤ 6 MB |
| Whole precache (51 files) | **19.99 MB** (≈ 8.7 MB gzip over the wire) | ≤ 25 MB |
| — onnxruntime-web WASM | 14.26 MB | |
| — audio (11 clips × Opus + MP3) | **0.65 MB** | ≤ 3 MB |
| — app JS + CSS | 0.33 MB | |
| — samples + icons | 0.34 MB | |

Automated evidence: Playwright 3/3 green (offline e2e, offline reload + installability, offline-badge retry); JS↔Python parity 10/10 top-1, max |Δp| 4.8e-5; Lighthouse mobile — Performance 99, Accessibility 100, Best Practices 100 (`docs/lighthouse.json`); `ml/verify_onnx.py` PASS.

## Docs
[README](../README.md) · [DATA_CARD](DATA_CARD.md) · [MODEL_CARD](MODEL_CARD.md) · [RESPONSIBLE_AI](RESPONSIBLE_AI.md) · [LANGUAGE](LANGUAGE.md) · [PROGRESS](PROGRESS.md) · [PLAN](PLAN.md) · [SPEC](SPEC.md)

## Not done / known limitations
- **Real Android test not done by me** (no device in the container) → sections A–C above. Note the "Chi tiết" inference time on your phone (headless desktop Chromium: 55–93 ms).
- **No Vietnamese leaf photos** in training or test. Headline field metrics are on Ecuadorian robusta (RoCoLe): 83.7% accuracy, answers 80.1% of photos at 89.6% accuracy. Real Tây Nguyên performance is unknown.
- Leaf miner / cercospora / phoma learnt only from arabica studio crops (JMuBEN, 128 px) — their 98–99% studio numbers are optimistic; cards say "cần cán bộ xác nhận".
- **Quantization**: SPEC's static int8 lost 8.7/33 pts → shipped int8 **weight-only** (fp32 compute), −1.3/−0.2 pts. Documented in MODEL_CARD.
- Calibration (temperature) was fitted on all-source validation; it did **not** improve ECE on the field split (0.071 → 0.075).
- Bundled sample images skip the camera blur gate (JMuBEN images are 128 px and would read as blurry); camera/gallery photos always go through it.
- Advice library is a hackathon draft — needs plant-protection officer review before real use (stated in-app).
- Price snapshot is from 15/09/2026 → the staleness warning shows; TODO(human): update `content/prices.vi.json` before filming if you want a fresh number.
- Not built (P1/P2 stretch): rust severity hint (accuracy reported in MODEL_CARD only), Bahnar pack content (slot only — needs a native speaker), voice question input.
- RoCoLe split is grouped by plant (stricter than SPEC's per-image split).
- Vercel preview deployments are behind Vercel login (deployment protection); production URL is public.
