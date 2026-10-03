# Progress log

Times are Asia/Saigon, Sun 4 Oct 2026.

## M1 — PWA shell + offline (00:20 → 00:45) ✅
- Vite 8 + React 19 + TS, vite-plugin-pwa (generateSW). Precache: app, `/models/**`, `/ort/**` (onnxruntime-web 1.30 WASM, served locally — copied by `scripts/copy-assets.mjs`), `/audio/**`, `/samples/**`, icons.
- ORT is aliased to its external-wasm build so Vite does not bundle a second 14 MB copy of the WASM (precache went 28.3 MB → 14.3 MB before model/audio).
- All screens scaffolded (Onboarding, Home, Capture, Samples, Result, Sổ rẫy, Hỏi người, Giá cà phê, Bằng chứng, Giới thiệu); strings in `src/i18n/vi.json`; `bdq.json` stub.
- `vercel.json` (build `npm run build`, output `dist`, cache headers, SPA rewrite, no COOP/COEP since WASM is single-threaded).
- **Acceptance** (`npx playwright test tests/m1-offline.spec.ts`, production build via `vite preview`, Pixel 5 emulation):
  load → "Sẵn sàng dùng offline ✓" → `context.setOffline(true)` → reload → app renders, badge still ✓ → **pass**.
  Chrome `Page.getInstallabilityErrors` = only `in-incognito` (inherent to Playwright contexts); `Page.getAppManifest` errors = [] → installable.
  Screenshot: `docs/screenshots/m1-offline.png`. (Model/audio were placeholders at this point.)
- Deployed by the human: **https://ami-ama.vercel.app** (production = `main`, PR #1 merged as `e52badf`). Human-verified: SW active, 36 files precached, audio OK; header stuck at 86% because the model was not shipped yet (fixed below).

## M2 — data + training (00:20 → 01:45) ✅
- RoCoLe fetched programmatically from the Mendeley public API (1,560 images + annotations, no human download needed).
- JMuBEN (HF parquet, 58,549 images @128 px) subsampled to 1,200/class; beans 1,295 images.
- RoCoLe split 60/20/20 **grouped by plant** (390 plants, StratifiedGroupKFold) — stricter than per-image.
- First run (12 epochs) aborted after 2 epochs: unfrozen epochs took ~9 min on 4 CPUs, so the 75-min cap would have cut the one-cycle LR schedule mid-way. Restarted with 9 epochs (1 frozen) so the schedule completes.
- `mobilenetv3_large_100`, CPU only, 9 epochs, ~55 min. Per-epoch validation (macro-F1 all / RoCoLe-val):
  e0 0.398/0.250 (frozen) · e1 0.838/0.645 · e2 0.870/0.722 · e3 0.900/0.747 · e4 0.904/0.743 · e5 0.894/0.719 · e6 0.903/0.744 · **e7 0.907/0.751 (best, selected)** · e8 0.903/0.736.
- Weights pushed: `ml/checkpoints/best.pt` (17 MB, sha256 `4de65698…`), log `ml/reports/train_log.json` + `train_stdout.log`.
- That run only saved the best weights. `train.py` now also writes `checkpoints/last.pt` (full optimizer/scheduler state) and `epoch_NN.pt` every epoch, with `--resume`.
- Test-set metrics: see M3 (evaluated with calibration on the shipped ONNX model).

## Fixes after the first production deploy (02:00)
- **Offline badge**: was polling forever at 86% when an asset was not in the precache (model missing on `main`). Now: ready / loading N% / **"⚠️ Chưa tải đủ để dùng offline — Thử lại"** (button) / "Cần mạng để tải lần đầu". It reads the service-worker install state (done or failed) plus a 45-s stall timer. Retry fetches the missing files into an `ami-runtime` cache, which a new Workbox `CacheFirst` route serves offline, then calls `registration.update()`. Test: `tests/offline-badge.spec.ts` (404 on the model → retry state → unblock + retry → ✓ → file served offline).
- **Vercel build warnings**: reproduced locally with a clean `npm ci && npm run build` on `main` — one warning, `npm warn deprecated glob@11.1.0` (build-time only, via vite-plugin-pwa → workbox-build; never shipped). Fixed with `"overrides": {"glob": "^13.0.6"}` (workbox-build only uses `globSync`, same API; same 40 precache entries). Also pinned `"engines": {"node": "22.x"}` to match the tested Node. The second Vercel warning did not reproduce locally — TODO(human): paste it if it is still there after this deploy.
