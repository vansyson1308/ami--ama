# Responsible AI

Ami Ama is a **first-step helper**, not a diagnosis. A person — the farmer and the extension officer — makes the final call. This page maps each guardrail to where it lives in the code, so it can be checked.

## SPEC §8 checklist

| Guardrail | How | Where |
|---|---|---|
| **Fixed answer library; no free-text generation** | The model only outputs one of 7 class ids. The app maps the id to a card in `content/advice.vi.json` and renders that text verbatim. There is no language model anywhere in the app. | `src/lib/content.ts`, `src/screens/Result.tsx`, `public/models/labels.json` (`card_id`) |
| **Calibrated threshold + ABSTAIN** | Temperature scaling fitted on val; threshold τ chosen on the RoCoLe (field) val split for ≥ 90 % accuracy on answered photos (85 % fallback). Rule: quality gate → `not_coffee` if p ≥ τ → **ABSTAIN if p < τ or top1−top2 < 0.15** → else card. Same rule in Python and TS. | `ml/metrics.py`, `ml/common.py::decide`, `src/ml/decide.ts`, `public/models/model_card.json` |
| **Abstain path tested** | Playwright e2e opens a sample the model abstains on and asserts the "Chưa chắc — hỏi cán bộ" card; a blurred photo must give the "chụp lại" card; a non-leaf texture must not get a disease card. | `tests/e2e.spec.ts` |
| **"Hỏi người" always one tap away** | Home tile "Hỏi người"; on every result a "Hỏi cán bộ" button (primary, top of the card when abstaining); in every Sổ rẫy entry. Pre-filled SMS (`sms:` — works to any phone number, incl. basic phones) and Web Share (Zalo/Messenger) with the photo when consented. | `src/screens/Ask.tsx`, `src/lib/message.ts` |
| **No pesticide brands or doses** | The advice library contains none; every card's `safety` line + `global_safety` say: don't spray on a seller's word, only registered products, follow the label, ask an officer. | `content/advice.vi.json` |
| **Confidence shown in words, not raw %** | "Khá chắc chắn" (p ≥ 0.9), "Có thể" (p ≥ τ), "Chưa chắc" (abstain). Percentages only inside the collapsed "Chi tiết". | `src/ml/decide.ts::confLevel`, `Result.tsx` |
| **On-device only, no analytics** | Inference runs in the browser (onnxruntime-web WASM served from our own origin). No backend, no API keys, no telemetry, no third-party scripts, no CDN; Vercel serves static files only. `Referrer-Policy: no-referrer`, microphone disabled via `Permissions-Policy`. | `src/ml/model.ts`, `vercel.json` |
| **Explicit consent** | First-run screen with two toggles, both **off** by default: "save a small photo in the log", "record GPS when saving". Changeable any time in Giới thiệu. Without consent the log stores only the result text. | `src/screens/Onboarding.tsx`, `About.tsx`, `Result.tsx` |
| **Delete-all works** | "Xóa toàn bộ dữ liệu" (About) clears the IndexedDB store; "Xóa hết sổ rẫy" and per-entry delete in the log. | `src/lib/store.ts` |
| **Shared / lost phone** | Stated in-app: the log lives in this browser on this phone; anyone with the phone can open it; delete when needed. Nothing is ever uploaded unless the farmer presses SMS/Share. | About screen, `vi.json` `about_private_3` |
| **Limitations visible** | Evidence screen lists what the model does **not** detect, the robusta/arabica and no-Vietnamese-photos gaps, and shows field vs studio numbers side by side. | `src/screens/Evidence.tsx` |
| **Content review status** | The advice library is marked "Bản nháp hackathon … cần cán bộ BVTV/khuyến nông duyệt" and the result screen repeats that it needs officer review. | `content/advice.vi.json` `review_status` |

## Bias & fairness
- Trained on **Ecuador robusta** (RoCoLe) and **Kenya arabica** (JMuBEN). It has never seen a Vietnamese leaf. Expect lower accuracy on Tây Nguyên varieties, light, and phone cameras than the numbers on the Evidence screen.
- Leaf miner, cercospora and phoma are learnt only from arabica studio crops → their cards carry an extra "needs officer confirmation" safety line.
- The "not a coffee leaf" class only saw bean leaves.
- Mitigations: abstain threshold chosen on **field** data, grouped-by-plant split, source-balanced sampling, honest field-vs-studio reporting, and the feedback loop below.

## Failure modes and what the farmer sees
| Situation | Behaviour |
|---|---|
| Blurry / too dark / too bright photo | "Ảnh chưa rõ — chụp lại nhé" (no prediction) |
| Not a leaf / not coffee | "Có vẻ không phải lá cà phê" or abstain |
| Disease the model never learnt (mealybug, borers, nematodes, deficiency, pink disease, dieback) | Ideally abstain → "Chưa chắc — hỏi cán bộ" (the uncertain card names these explicitly). It **can** be confidently wrong; the safety lines and "Hỏi cán bộ" remain visible on every card. |
| Confident but wrong | Advice cards only recommend low-risk cultural practices (pruning, sanitation, balanced fertiliser, watering, monitoring, asking an officer), so a wrong card should not lead to harmful action. |

## Feedback loop (how it gets better, safely)
1. Farmer saves observations (with photo only if consented) and shares them with an officer (SMS/Zalo/JSON export).
2. Officer confirms or corrects the label.
3. Confirmed photos become a Vietnamese field split → `make -C ml all` → retrain, recalibrate τ on Vietnamese val photos, re-verify, redeploy. The Evidence screen headline switches to Vietnamese field metrics.
4. Advice cards change only through officer review of `content/advice.vi.json`.

## Privacy summary
Stored on the phone (IndexedDB, origin-scoped): settings, officer phone number, log entries (date, result, confidence words, top-3 probabilities, model version, note, optional 160-px thumbnail, optional rounded GPS). Nothing else is stored, nothing is sent automatically.
