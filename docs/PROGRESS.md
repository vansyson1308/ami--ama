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
- TODO(human): Vercel deploy — no Vercel credentials in this container. Steps:
  1. vercel.com → Add New… → Project → Import Git Repository → `vansyson1308/ami--ama`.
  2. Framework preset: **Vite** (auto). Build command `npm run build`, Output `dist` (already in `vercel.json`). No env vars.
  3. Production branch: `main` (merge the PR first) — or pick branch `claude/serene-faraday-4i1tw4` for a preview deploy.
  4. Deploy, then paste the URL into README.md ("Live demo") and docs/ACCEPTANCE.md.

## M2 — data + training (in progress)
- RoCoLe fetched programmatically from the Mendeley public API (1,560 images + annotations, no human download needed).
- JMuBEN (HF parquet, 58,549 images @128 px) subsampled to 1,200/class; beans 1,295 images.
- RoCoLe split 60/20/20 **grouped by plant** (390 plants, StratifiedGroupKFold) — stricter than per-image.
