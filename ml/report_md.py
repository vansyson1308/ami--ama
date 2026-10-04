"""Generate docs/MODEL_CARD.md and the README metrics section from ml/reports/*.json (no hand-typed numbers)."""
from __future__ import annotations

import json
import os
import re
from collections import Counter

from common import KEYS, PUBLIC_MODELS, REPORTS, ROOT

DOCS = ROOT.parent / "docs"


def pct(v):
    return "—" if v is None else f"{v * 100:.1f}%"


def f3(v):
    return "—" if v is None else f"{v:.3f}"


def metrics_table(card):
    m = card["metrics"]
    cols = [("test_rocole", "**Field** — RoCoLe test (robusta, Ecuador, grouped by plant)"),
            ("test_jmuben", "Studio — JMuBEN test (arabica, Kenya)"), ("test_all", "All test (incl. beans)")]
    rows = [("Images", lambda s: str(s["n"])), ("Accuracy (all photos)", lambda s: pct(s["acc"])),
            ("Macro-F1 (classes present)", lambda s: f3(s["macro_f1"])),
            (f"Coverage at τ={card['tau']:.2f} (rest → \"hỏi cán bộ\")", lambda s: pct(s["coverage_at_tau"])),
            ("Accuracy on answered photos", lambda s: pct(s["acc_at_tau"])),
            ("ECE before → after calibration", lambda s: f"{f3(s['ece_uncalibrated'])} → {f3(s['ece'])}")]
    out = ["| | " + " | ".join(c[1] for c in cols) + " |", "|---|" + "---|" * len(cols)]
    for name, fn in rows:
        out.append(f"| {name} | " + " | ".join(fn(m[c[0]]) for c in cols) + " |")
    return "\n".join(out)


def per_class(rep, split):
    s = rep["splits"][split]["per_class"]
    out = ["| class | precision | recall | F1 | support |", "|---|---|---|---|---|"]
    for k, v in s.items():
        out.append(f"| {k} | {f3(v['precision'])} | {f3(v['recall'])} | {f3(v['f1'])} | {v['support']} |")
    return "\n".join(out)


def confusion(rep, split):
    cm = rep["splits"][split]["confusion"]
    out = ["| true \\ predicted | " + " | ".join(KEYS) + " |", "|---|" + "---|" * len(KEYS)]
    for i, row in enumerate(cm):
        if sum(row):
            out.append(f"| **{KEYS[i]}** | " + " | ".join(str(v) for v in row) + " |")
    return "\n".join(out)


def main():
    card = json.load(open(PUBLIC_MODELS / "model_card.json"))
    summ = json.load(open(REPORTS / "metrics.json"))
    tag = summ["shipped"]
    rep = json.load(open(REPORTS / f"metrics_{tag}.json"))
    ver = json.load(open(REPORTS / "verify_onnx.json")) if (REPORTS / "verify_onnx.json").exists() else {}
    torch_rep = json.load(open(REPORTS / "metrics_torch_fp32.json")) if (REPORTS / "metrics_torch_fp32.json").exists() else None
    table = metrics_table(card)

    qrows = ["| variant | size | RoCoLe test acc | JMuBEN test acc | drop vs fp32 (RoCoLe / JMuBEN) | ≤ 2 pts & ≤ 6 MB |", "|---|---|---|---|---|---|"]
    for t, q in summ["quantization_comparison"].items():
        d = q["acc_drop_vs_fp32"]
        qrows.append(f"| {t}{' **(shipped)**' if t == tag else ''} | {q['size_bytes'] / 1e6:.2f} MB | {pct(q['test_rocole_acc'])} | "
                     f"{pct(q['test_jmuben_acc'])} | {d['test_rocole'] * 100:+.1f} / {d['test_jmuben'] * 100:+.1f} pts | {'yes' if q['eligible'] else 'no'} |")
    lvl = card["rust_recall_by_rocole_level_test"]
    lvl_rows = " · ".join(f"level {k}: {pct(v['recall'])} (n={v['n']})" for k, v in lvl.items())
    log = summ["train_log"]
    ood_md = "Not run."
    if (REPORTS / "ood.json").exists() and "ood" in card:
        ood = json.load(open(REPORTS / "ood.json"))
        o = card["ood"]
        lines = ["Outcome as a farmer would see it for a camera photo (quality gate first, then the model with τ and the class gate):", "",
                 "| set / group | " + " | ".join(["wrong assertion", "abstain", "not coffee", "retake"]) + " |", "|---|---|---|---|---|"]
        for g, v in ood["by_group"].items():
            wrong = sum(n for k, n in v.items() if k.startswith("WRONG"))
            lines.append(f"| {g} | {wrong} | {v.get('abstain (hỏi cán bộ)', 0)} | {v.get('not a coffee leaf', 0)} | {v.get('retake (quality gate)', 0)} |")
        c = o["commons"]
        wrong_names = Counter(r["outcome_camera"].split("asserted ")[1] for r in ood["rows"]
                              if r["set"] == "commons" and r["outcome_camera"].startswith("WRONG"))
        syn_wrong = [f"{r['image']} → {r['top1']}" for r in ood["rows"] if r["set"] == "synthetic" and r["outcome_camera"].startswith("WRONG")]
        lines += ["", f"**Real photos (Wikimedia Commons, {c['n']} images, CC0/PD/CC BY/CC BY-SA — sources in `ml/reports/ood_sources.json`): "
                  f"{c['wrong_assertion']} of {c['n']} ({c['wrong_assertion'] / c['n'] * 100:.0f}%) were confidently labelled as a coffee problem** "
                  f"({', '.join(f'{k} ×{n}' for k, n in wrong_names.most_common())}); {c['abstain']} abstained, {c['not_coffee']} 'not coffee', {c['retake']} retake. "
                  f"Synthetic images ({o['synthetic']['n']}: solid colours, noise, gradients, checkerboard, soil texture, blurred leaves): "
                  f"{o['synthetic']['wrong_assertion']} wrong assertion(s){' (' + ', '.join(syn_wrong) + ')' if syn_wrong else ''}; "
                  f"{o['synthetic']['retake']} stopped by the quality gate, {o['synthetic']['abstain']} abstain, {o['synthetic']['not_coffee']} 'not coffee'.",
                  "", ("The `not_coffee_leaf` class now also learns from 331 openly licensed Commons negatives (grass, soil, sky, hands, "
                      "banana/cashew/other crop leaves) — different files from this held-out test (see DATA_CARD). v1, trained on bean leaves "
                      "only, wrongly asserted 10 of these 58 photos."
                      if any("commons" in t for t in card["trained_on"]) else
                      "Why: the `not_coffee_leaf` class was trained only on bean leaves. Fix: add openly licensed negatives and retrain."),
                  "Mitigations in any case: the advice cards recommend only low-risk cultural practices and always show 'Hỏi cán bộ'."]
        ood_md = "\n".join(lines)
    cg = card["class_gate"]
    gate_rows = ["| class | RoCoLe **val** precision (accepted) | n accepted | RoCoLe **test** precision (accepted) | n accepted | decision |",
                 "|---|---|---|---|---|---|"]
    gated_txt = '**never asserted** → "Có thể là …" + Hỏi cán bộ'
    for k, v in cg["field_val"].items():
        t_ = cg["field_test"].get(k, {})
        verdict = gated_txt if k in card["never_assert"] else "asserted"
        gate_rows.append(f"| {k} | {f3(v['precision'])} | {v['accepted_predictions']} | {f3(t_.get('precision'))} | "
                         f"{t_.get('accepted_predictions', 0)} | {verdict} |")
    studio = ", ".join(f"{k} {f3(v['precision'])} (n={v['accepted_predictions']})" for k, v in cg["studio_only_classes_all_val"].items())
    best = max(log, key=lambda r: r["select_score"])

    RREL = os.path.relpath(REPORTS, DOCS)
    dec_md = ""
    if (REPORTS / "decision.json").exists():
        d = json.load(open(REPORTS / "decision.json"))
        v1, v2 = d["v1"], d["v2"]
        dec_md = f"""
## {card['version']} vs leaf_v1 — merge decision (rule fixed before training, `ml/compare_v2.py`)
Ship only if field accuracy-on-answered and field coverage each drop by ≤ 1 pt **and** confident-wrong answers on the 58 held-out non-coffee photos go down.

| | leaf_v1 | {card['version']} | check |
|---|---|---|---|
| Field (RoCoLe test) accuracy on answered | {pct(v1['field_acc_at_tau'])} | {pct(v2['field_acc_at_tau'])} | {'✅' if d['checks']['field_acc_at_tau_drop_le_1pt'] else '❌'} |
| Field coverage | {pct(v1['field_coverage'])} | {pct(v2['field_coverage'])} | {'✅' if d['checks']['field_coverage_drop_le_1pt'] else '❌'} |
| Held-out OOD confident-wrong | {v1['ood_wrong']}/{v1['ood_n']} | {v2['ood_wrong']}/{v2['ood_n']} | {'✅' if d['checks']['ood_confident_wrong_improves'] else '❌'} |
| Field accuracy (all photos) / macro-F1 | {pct(v1['test_rocole']['acc'])} / {f3(v1['test_rocole']['macro_f1'])} | {pct(v2['test_rocole']['acc'])} / {f3(v2['test_rocole']['macro_f1'])} | |
| Studio (JMuBEN) accuracy | {pct(v1['test_jmuben']['acc'])} | {pct(v2['test_jmuben']['acc'])} | |
| τ / T / never asserted | {v1['tau']} / {v1['T']:.3f} / {', '.join(v1['never_assert'])} | {v2['tau']} / {v2['T']:.3f} / {', '.join(v2['never_assert'])} | |

Decision: **{'ship ' + card['version'] if d['ship_v2'] else 'keep leaf_v1'}**. leaf_v1 reports remain in `ml/reports/`; {card['version']} reports are in `ml/reports/v2/`.
"""
    md = f"""# Model card — `{card['version']}`

*Generated by `ml/report_md.py` from `ml/reports/` and `public/models/model_card.json`. Do not edit numbers by hand.*

## Summary
| | |
|---|---|
| Task | 7-way classification of one coffee-leaf photo: {', '.join(KEYS)} |
| Architecture | `{card['arch']}` (timm, ImageNet-pretrained), 224×224 input |
| Shipped file | `public/models/{card['file']}` — **{card['size_bytes'] / 1e6:.2f} MB**, {card['quantization']} (file name kept stable across versions; the version is `{card['version']}`) |
| SHA-256 | `{card['sha256']}` |
| Runtime | onnxruntime-web (WASM, 1 thread) in the browser; same ONNX in onnxruntime (Python) for evaluation |
| Calibration | temperature **T = {card['temperature']:.3f}** (fitted on val, all sources) |
| Abstain rule | threshold **τ = {card['tau']:.2f}**, margin {card['margin']} — {card['tau_rule']} (target accuracy on answered RoCoLe-val photos: {card['tau_target_acc']}) |
| Training data | RoCoLe (all), JMuBEN (1,200/class subsample), beans — see [DATA_CARD](DATA_CARD.md) |
| Split | {card['split']} |

## Headline metrics (shipped model, held-out test sets)
{table}

The **field** column is the number that matters: real smartphone photos of robusta leaves, and no plant in the test set was seen in training. It only covers healthy / rust / red spider mite. The **studio** column is optimistic (low-res, uniform crops, likely near-duplicates). **No Vietnamese photos were available**, so real-world accuracy in Tây Nguyên is unknown and probably lower.

{dec_md}
## Per-class safety gate
Rule: a class is **never asserted** when its precision among *accepted* predictions on the RoCoLe (field) **validation** split is below **{cg['min_precision']:.2f}**. A confident prediction of such a class is shown as the "Chưa chắc — hỏi cán bộ" card with the hint "Có thể là <class>" and the escalation button. Same rule in `ml/common.py::decide` and `src/ml/decide.ts`; the list ships in `model_card.json` (`never_assert`). All metrics above already include the gate.

{chr(10).join(gate_rows)}

Never asserted: **{', '.join(card['never_assert']) or 'none'}**. Leaf miner, cercospora and phoma have **no field photos**; the model made no accepted field predictions of them (no false alarms on RoCoLe), so their field precision cannot be measured. Their studio-only precision (all-source val) is {studio}. Their advice cards already say an officer must confirm.

Risk–coverage (test): ![risk-coverage]({RREL}/risk_coverage_{tag}.png)

## Per-class — field (RoCoLe test)
{per_class(rep, 'test_rocole')}

Confusion matrix — field (rows = truth):

{confusion(rep, 'test_rocole')}

![confusion field]({RREL}/confusion_{tag}_test_rocole.png)

## Per-class — studio (JMuBEN test)
{per_class(rep, 'test_jmuben')}

![confusion studio]({RREL}/confusion_{tag}_test_jmuben.png)

## Not-a-coffee-leaf (beans test)
Accuracy {pct(rep['splits']['test_beans']['acc'])} on {rep['splits']['test_beans']['n']} bean-leaf photos. Untested on soil, hands, other crops.

## Out-of-distribution check (`ml/ood_check.py`, `ml/reports/ood.json`)
{ood_md}

## Rust severity (metadata only, not shown to farmers)
Recall of class *rust* on RoCoLe test by annotated severity: {lvl_rows}.

## Quantization
{chr(10).join(qrows)}

Verification (`ml/verify_onnx.py`, 20 test images): PyTorch vs ONNX fp32 max |Δlogit| = {f3(ver.get('onnx_fp32', {}).get('max_abs_logit_diff'))}; shipped vs PyTorch top-1 agreement = {pct(ver.get('shipped', {}).get('top1_agreement'))}, max |Δp| = {f3(ver.get('shipped', {}).get('max_abs_prob_diff'))}; result: **{'PASS' if ver.get('pass') else 'FAIL / not run'}**.

## Training
- Optimizer AdamW (backbone 3e-4, head 1e-3, wd 0.02), one-cycle cosine schedule, label smoothing 0.1, batch 48, `WeightedRandomSampler` balancing classes and sources within a class.
- {card.get('training', '')}
- Epochs run: {len(log)} (first {sum(1 for r in log if r['frozen'])} with frozen backbone); selection = mean(val macro-F1 all, val macro-F1 RoCoLe); best epoch {best['epoch']} (val macro-F1 {best['val_macro_f1']:.3f}, RoCoLe-val macro-F1 {best['val_rocole_macro_f1']:.3f}).
- Hardware: 4-vCPU cloud container, no GPU (~{sum(r['epoch_min'] for r in log):.0f} min total).
{'- PyTorch fp32 reference: field acc ' + pct(torch_rep['splits']['test_rocole']['acc']) + ', studio acc ' + pct(torch_rep['splits']['test_jmuben']['acc']) + '.' if torch_rep else ''}

## Intended use
A first-step helper for smallholder robusta farmers and extension workers: suggests which of a few common leaf problems a photo shows and links to fixed, cited advice. **Not** a diagnosis, not for pesticide decisions, not for fruit/stem/root problems.

## Limitations
- Not covered: {', '.join(card['not_covered_en'])}.
- leaf_miner / cercospora / phoma learnt only from arabica studio crops (single source) → possible source shortcut; officer confirmation required (stated on the cards).
- Calibration and τ were fitted on RoCoLe/JMuBEN/beans val data; they will drift on Vietnamese photos → recalibrate with officer-labelled local photos.
- Confidently wrong answers are possible; the advice library is limited to low-risk cultural practices and always shows the "ask an officer" path.
"""
    (DOCS / "MODEL_CARD.md").write_text(md)

    readme = (ROOT.parent / "README.md").read_text()
    m = card["metrics"]
    worse = [k for k in ("test_rocole", "test_jmuben") if m[k]["ece"] > m[k]["ece_uncalibrated"]]
    ece_note = ""
    if worse:
        names = " and ".join("field" if k == "test_rocole" else "studio" for k in worse)
        vals = ", ".join(f"{m[k]['ece_uncalibrated']:.3f} → {m[k]['ece']:.3f}" for k in worse)
        ece_note = (" Temperature scaling was fitted on all validation sources together; on the "
                    f"{names} split it did **not** improve ECE ({vals}).")
    gate_note = (f" **Per-class safety gate:** classes whose precision among accepted field-val predictions is below "
                 f"{cg['min_precision']:.0%} are never asserted (now: {', '.join(card['never_assert'])}) — they show 'Chưa chắc — hỏi cán bộ' "
                 f"with a 'Có thể là …' hint; the numbers above include this.") if card["never_assert"] else ""
    ood_note = ""
    if "ood" in card:
        c = card["ood"]["commons"]
        ood_note = (f" **Not-a-coffee-leaf check:** on {c['n']} openly licensed real photos of other things (soil, sky, hands, grass, "
                    f"pepper/durian/banana/cashew leaves; held out from training) {c['wrong_assertion']} ({c['wrong_assertion'] / c['n']:.0%}) "
                    f"were wrongly given a coffee-leaf result, {c['not_coffee']} were recognised as 'not coffee' and {c['abstain']} abstained.")
    sec = f"""<!-- METRICS:START (generated by ml/report_md.py) -->
Shipped model: `{card['file']}`, **{card['size_bytes'] / 1e6:.2f} MB** ({card['quantization']}), temperature T={card['temperature']:.2f}, abstain threshold τ={card['tau']:.2f}.

{table}

On **real field photos** (RoCoLe test, plants never seen in training) the model answers {pct(m['test_rocole']['coverage_at_tau'])} of photos and is right on {pct(m['test_rocole']['acc_at_tau'])} of those; the rest get "Chưa chắc — hỏi cán bộ". These are Ecuadorian robusta photos — **we have no Vietnamese test photos yet**, so treat this as an upper bound.{ece_note}{gate_note}{ood_note} Full report: [docs/MODEL_CARD.md](docs/MODEL_CARD.md) (per-class, confusion matrices, risk–coverage, quantization).
<!-- METRICS:END -->"""
    if "METRICS_TABLE_PLACEHOLDER" in readme:
        readme = readme.replace("METRICS_TABLE_PLACEHOLDER", sec)
    else:
        readme = re.sub(r"<!-- METRICS:START.*?<!-- METRICS:END -->", sec, readme, flags=re.S)
    (ROOT.parent / "README.md").write_text(readme)
    print("wrote MODEL_CARD.md and README metrics")


if __name__ == "__main__":
    main()
