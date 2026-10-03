# Data card — Ami Ama leaf model (`leaf_v1`)

Every number below was read from the downloaded files or the dataset's own API/card (scripts: `ml/download.py`, `ml/prepare.py`; split counts in `ml/splits/summary.json`). Raw images are **not** committed; split manifests are (`ml/splits/{train,val,test}.csv`).

## Datasets

| Key | Dataset | Source | License | Size used | Content | What it does NOT cover |
|---|---|---|---|---|---|---|
| `rocole` | **RoCoLe** — Robusta Coffee Leaf images (Parraga-Alava, Cusme, Loor, Santander; *Data in Brief*, 2019) | Mendeley Data, DOI [10.17632/c5yvn32dzg.2](https://data.mendeley.com/datasets/c5yvn32dzg/2), fetched via the Mendeley public API | CC BY 4.0 | **all 1,560** images (2048×1152 smartphone photos) | **Robusta**, real field, Ecuador. Labels (from `RoCoLE-csv.csv`): healthy 791, red spider mite 167, rust level 1: 344, level 2: 166, level 3: 62, level 4: 30 | Only 3 conditions (healthy / rust / red spider mite). No Vietnamese plants, varieties, soils, light. No leaf miner, cercospora, phoma. 390 plants only. |
| `jmuben` | **JMuBEN** arabica leaves (Jepkoech, Mugo, Kenduiywo, Chebet; *Data in Brief* 36, 2021; Mendeley DOIs 10.17632/t2r6rszp5c.1, 10.17632/tgv3zb82nd.1) | Hugging Face [`Project-AgML/arabica_coffee_leaf_disease_classification`](https://huggingface.co/datasets/Project-AgML/arabica_coffee_leaf_disease_classification) (parquet) | CC BY 4.0 | **6,000** of 58,549 (stratified seeded subsample, 1,200 per class) | **Arabica**, Kenya, 128×128 crops, near-studio. Full counts: Cerscospora 7,681 · Healthy 18,983 · Leaf_rust 8,336 · Miner 16,978 · Phoma 6,571 | Not robusta. Low resolution, cropped, uniform look; filenames suggest many augmented near-duplicates (e.g. `9(1447).jpg`), so its test score is optimistic. |
| `beans` | **iBean** (Makerere AI Lab) | Hugging Face [`AI-Lab-Makerere/beans`](https://huggingface.co/datasets/AI-Lab-Makerere/beans) | MIT (dataset card) | **all 1,295** (500×500) | Bean leaves (angular leaf spot, bean rust, healthy), Uganda. Used **only** as the negative class `not_coffee_leaf`. | Only bean leaves — not soil, hands, sky, other crops. "Not coffee" detection for other objects is untested. |

No synthetic images were added. No Vietnamese images exist in the training data.

## Label taxonomy (`public/models/labels.json`)

| id | key | Vietnamese | from |
|---|---|---|---|
| 0 | healthy | Lá khỏe | rocole:healthy + jmuben:Healthy |
| 1 | rust | Bệnh rỉ sắt | rocole:rust_level_1..4 + jmuben:Leaf_rust (RoCoLe level kept as metadata `rocole_level`) |
| 2 | red_spider_mite | Nhện đỏ | rocole:red_spider_mite |
| 3 | leaf_miner | Sâu đục lá (sâu vẽ bùa) | jmuben:Miner |
| 4 | cercospora | Bệnh đốm mắt cua | jmuben:Cerscospora |
| 5 | phoma | Bệnh đốm lá do nấm Phoma | jmuben:Phoma |
| 6 | not_coffee_leaf | Không phải lá cà phê | beans (all classes) |

Consequence: classes 3–5 are learnt **only from arabica studio-like crops**; their advice cards carry a safety line saying so, and the model's answer for them must be confirmed by an officer.

## Splits (seed 42)

| | train | val | test |
|---|---|---|---|
| RoCoLe (healthy / rust / mite) | 476 / 360 / 100 | 158 / 120 / 34 | 157 / 122 / 33 |
| JMuBEN (each of 5 classes) | 840 | 180 | 180 |
| beans (not coffee) | 906 | 194 | 195 |

- **RoCoLe is split 60/20/20 grouped by plant** (`C<x>P<y>` in the file name; 390 plants; `StratifiedGroupKFold`, stratified on the fine label incl. rust level). This is stricter than the per-image split in the spec: leaves of the same plant never appear in both train and test, so the field number is not inflated by near-identical photos.
- JMuBEN and beans: stratified 70/15/15.
- RoCoLe test is reported **separately** as the "field" number; JMuBEN test as the "studio" number.

## Pre-processing
- Cache: EXIF-rotated, resized so the short side is ≤ 288 px, JPEG q93 (`ml/data/cache`, not committed). JMuBEN stays at its native 128 px.
- Train-time augmentation: RandomResizedCrop(224, 0.6–1.0), h/v flips, rotation ±25°, ColorJitter(0.3,0.3,0.3,0.05), Gaussian blur p=0.2, grayscale p=0.05, random JPEG q40–95, and a random down/up-sample (96–176 px, p=0.35) so "low resolution" is not a shortcut for the 128-px JMuBEN classes.
- Sampling: `WeightedRandomSampler` that balances classes **and** balances sources within a class (up-weights RoCoLe field photos in healthy/rust).
- Eval / app: center square crop → bilinear 224×224 → ImageNet mean/std (identical in `ml/common.py` and `src/ml/preprocess.ts`).

## Demo sample images (`public/samples/`)
10 images drawn with a fixed seed from the **test** splits (2 healthy, 2 rust, 2 red spider mite from RoCoLe; 1 each leaf miner / cercospora / phoma from JMuBEN; 1 bean leaf). They are **not** filtered by whether the model gets them right. Center-cropped and resized to 224 px; credits in `public/samples/CREDITS.md` (CC BY 4.0 attribution: changes = crop + resize).

## Audio
Voice: Piper `vi_VN-vais1000-medium` from [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices/tree/main/vi/vi_VN/vais1000/medium). Its model card lists the training corpus VAIS-1000 ([IEEE DataPort](https://ieee-dataport.org/documents/vais-1000-vietnamese-speech-synthesis-corpus)) under **CC BY 4.0**. Audio text is exactly `audio_text` / `ui_prompts` from `content/advice.vi.json`.

## Known gaps & risks
- **Domain shift**: Ecuador robusta (RoCoLe) and Kenya arabica (JMuBEN) ≠ Tây Nguyên robusta (varieties TR4/TR9…, red basalt soil, shade trees, phone cameras, lighting).
- **Source confound**: classes 3–5 come from one source with a distinctive look; the model could partly learn "looks like JMuBEN" rather than the symptom. Field photos of those problems will likely score lower than the studio test suggests.
- **Missing problems**: rệp sáp (mealybugs), mọt đục quả/cành (berry & twig borers), tuyến trùng (nematodes), nutrient deficiencies, nấm hồng (pink disease), thán thư/khô cành (anthracnose/dieback). These fall to "Chưa chắc — hỏi cán bộ" at best, or may be mislabelled.
- RoCoLe rust levels 3–4 are tiny (62/30 images): severity is reported as metadata only, not shown to farmers.

## Feedback loop (plan)
Consented photos in the Sổ rẫy can be exported (JSON) and labelled by extension officers → added as a Vietnamese field split → `make -C ml all` retrains, re-calibrates and re-exports. Field metrics on Vietnamese photos must then replace RoCoLe as the headline number.
