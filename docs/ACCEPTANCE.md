# Acceptance checklist (≈ 15 minutes)

Live URL: **https://ami-ama.vercel.app** (Vercel, production = `main`)
Release: tag `v1.0` · PR: https://github.com/vansyson1308/ami--ama/pull/1

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
- [ ] **Abstain**: tap sample __ (see `docs/e2e-parity.json`, an entry with `js_kind: "abstain"`) → title **"Chưa chắc — hỏi cán bộ"**, "Có thể là A hoặc B", big **Hỏi cán bộ** button.
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
SIZES_PLACEHOLDER

## Docs
[README](../README.md) · [DATA_CARD](DATA_CARD.md) · [MODEL_CARD](MODEL_CARD.md) · [RESPONSIBLE_AI](RESPONSIBLE_AI.md) · [LANGUAGE](LANGUAGE.md) · [PROGRESS](PROGRESS.md) · [PLAN](PLAN.md) · [SPEC](SPEC.md)

## Not done / known limitations
NOT_DONE_PLACEHOLDER
