"""Pick the shipped ONNX model, copy it to public/models/, write model_card.json + reports/metrics.json.

Rule (SPEC §5.6): ship the first variant, in order static -> static(percentile) -> dynamic -> weight-only int8 -> fp32,
whose accuracy drop vs fp32 ONNX is <= 2 pts on BOTH test sets and whose size is <= 6 MB.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import shutil

from common import CKPT, LABELS, MARGIN, PUBLIC_MODELS, REPORTS

MAX_BYTES = 6 * 1024 * 1024
NOT_COVERED = ["Ảnh lá cà phê ở Việt Nam (chưa có trong dữ liệu học)", "Rệp sáp, mọt đục quả (sâu hại quả)",
               "Mọt đục cành", "Tuyến trùng (bệnh rễ)", "Thiếu dinh dưỡng", "Bệnh nấm hồng", "Thán thư / khô cành"]
NOT_COVERED_EN = ["Vietnamese field photos", "fruit/cherry pests (rệp sáp, mọt đục quả)", "stem borers (mọt đục cành)",
                  "root problems (tuyến trùng)", "nutrient deficiencies", "pink disease (nấm hồng)", "anthracnose/khô cành"]
DATASETS = [
    {"name": "RoCoLe", "license": "CC BY 4.0", "n": "1.560 ảnh robusta, Ecuador",
     "note": "Ảnh vườn thật bằng điện thoại. Chỉ có lá khỏe, rỉ sắt, nhện đỏ."},
    {"name": "JMuBEN (AgML)", "license": "CC BY 4.0", "n": "6.000/58.549 ảnh arabica, Kenya",
     "note": "Ảnh 128 px, gần như chụp chuẩn. Nguồn duy nhất cho sâu đục lá, đốm mắt cua, Phoma."},
    {"name": "iBean (Makerere)", "license": "MIT", "n": "1.295 ảnh lá đậu, Uganda",
     "note": "Chỉ dùng làm lớp 'không phải lá cà phê'."},
]


def load(tag):
    p = REPORTS / f"metrics_{tag}.json"
    return json.load(open(p)) if p.exists() else None


def pick(m, k):
    s = m["splits"][k]
    return {"n": s["n"], "acc": round(s["acc"], 4), "macro_f1": round(s["macro_f1"], 4),
            "coverage_at_tau": round(s["coverage_at_tau"], 4),
            "acc_at_tau": round(s["acc_at_tau"], 4) if s["acc_at_tau"] is not None else None,
            "ece": round(s["ece"], 4), "ece_uncalibrated": round(s["ece_uncalibrated"], 4)}


def main():
    fp = load("onnx_fp32")
    cands = [("onnx_int8_static", "leaf_int8_static.onnx", "int8 static QDQ per-channel (MinMax)"),
             ("onnx_int8_static_pct", "leaf_int8_static_pct.onnx", "int8 static QDQ per-channel (percentile 99.99)"),
             ("onnx_int8_dynamic", "leaf_int8_dynamic.onnx", "int8 dynamic"),
             ("onnx_int8_weights", "leaf_int8_weights.onnx", "int8 weight-only per-channel (fp32 activations/compute)"),
             ("onnx_fp32", "leaf_fp32.onnx", "fp32")]
    comparison, chosen = {}, None
    for tag, f, desc in cands:
        m = load(tag)
        if not m or not (CKPT / f).exists():
            continue
        drop = {k: fp["splits"][k]["acc"] - m["splits"][k]["acc"] for k in ("test_rocole", "test_jmuben")}
        size = (CKPT / f).stat().st_size
        ok = max(drop.values()) <= 0.02 and size <= MAX_BYTES
        comparison[tag] = {"file": f, "size_bytes": size, "acc_drop_vs_fp32": drop, "eligible": ok,
                           "test_rocole_acc": m["splits"]["test_rocole"]["acc"], "test_jmuben_acc": m["splits"]["test_jmuben"]["acc"]}
        if ok and chosen is None:
            chosen = (tag, f, desc, m)
    if chosen is None:  # nothing within 2 pts: ship the smallest <= 6 MB and say so
        tag = min((t for t in comparison if comparison[t]["size_bytes"] <= MAX_BYTES), key=lambda t: comparison[t]["size_bytes"])
        f, desc = comparison[tag]["file"], [c[2] for c in cands if c[0] == tag][0]
        chosen = (tag, f, desc + " (accuracy drop > 2 pts — see MODEL_CARD)", load(tag))
    tag, f, desc, m = chosen
    PUBLIC_MODELS.mkdir(parents=True, exist_ok=True)
    dest = PUBLIC_MODELS / "leaf_v1.int8.onnx"
    shutil.copy(CKPT / f, dest)
    data = dest.read_bytes()
    train = json.load(open(REPORTS / "train_log.json"))
    card = {
        "version": "leaf_v1", "arch": train["args"]["arch"], "file": "leaf_v1.int8.onnx", "quantization": desc,
        "input": {"name": "input", "size": 224, "layout": "NCHW", "mean": [0.485, 0.456, 0.406], "std": [0.229, 0.224, 0.225],
                  "preprocess": "center square crop -> bilinear resize 224 -> /255 -> ImageNet normalisation"},
        "output": "logits", "temperature": round(m["temperature"], 4), "tau": m["tau"], "margin": MARGIN,
        "tau_rule": m["rule"], "tau_target_acc": m["target_acc"],
        "labels": "labels.json", "size_bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
        "metrics": {"test_rocole": pick(m, "test_rocole"), "test_jmuben": pick(m, "test_jmuben"),
                    "test_beans": pick(m, "test_beans"), "test_all": pick(m, "test_all"),
                    "val_rocole": pick(m, "val_rocole")},
        "rust_recall_by_rocole_level_test": m["splits"]["test_rocole_rust_recall_by_level"],
        "trained_on": ["rocole", "jmuben(subsampled 1,200/class)", "beans"],
        "split": "RoCoLe 60/20/20 grouped by plant; JMuBEN & beans 70/15/15 stratified; seed 42",
        "date": dt.date(2026, 10, 4).isoformat(), "not_covered": NOT_COVERED, "not_covered_en": NOT_COVERED_EN,
        "datasets": DATASETS, "labels_list": LABELS,
    }
    json.dump(card, open(PUBLIC_MODELS / "model_card.json", "w"), ensure_ascii=False, indent=1)
    json.dump(LABELS, open(PUBLIC_MODELS / "labels.json", "w"), ensure_ascii=False, indent=1)
    summary = {"shipped": tag, "quantization_comparison": comparison,
               "fp32_onnx": {k: pick(fp, k) for k in ("test_rocole", "test_jmuben", "test_all")},
               "shipped_metrics": card["metrics"], "temperature": card["temperature"], "tau": card["tau"],
               "train_log": train["log"]}
    json.dump(summary, open(REPORTS / "metrics.json", "w"), indent=1)
    print(json.dumps({"shipped": tag, "size_mb": len(data) / 1e6, "comparison": comparison}, indent=1))


if __name__ == "__main__":
    main()
