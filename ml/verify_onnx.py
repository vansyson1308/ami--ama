"""Verify the exported models (SPEC §5.6): PyTorch vs ONNX fp32 parity, and int8 vs PyTorch on 20 test images,
plus whole-test-set accuracy drop int8 vs fp32 (<= 2 pts) from the evaluation reports. Exit code 1 on failure."""
from __future__ import annotations

import csv
import json
import sys

import numpy as np
import onnxruntime as ort
from PIL import Image

from common import CACHE, CKPT, PUBLIC_MODELS, REPORTS, SPLITS, preprocess_pil, softmax
from evaluate import torch_runner


def main():
    card = json.load(open(PUBLIC_MODELS / "model_card.json"))
    T = card["temperature"]
    rows = list(csv.DictReader(open(SPLITS / "test.csv")))
    pick = [r for r in rows if r["source"] == "rocole"][:10] + [r for r in rows if r["source"] == "jmuben"][:10]
    x = np.stack([preprocess_pil(Image.open(CACHE / r["path"])) for r in pick])
    pt = torch_runner(CKPT / "best.pt")(x)
    res, ok = {}, True
    for name, path in (("onnx_fp32", CKPT / "leaf_fp32.onnx"), ("shipped", PUBLIC_MODELS / "leaf_v1.int8.onnx")):
        s = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        lg = np.concatenate([s.run(["logits"], {"input": x[i:i + 1]})[0] for i in range(len(x))])
        p, q = softmax(pt, T), softmax(lg, T)
        res[name] = {"max_abs_logit_diff": float(np.abs(lg - pt).max()),
                     "max_abs_prob_diff": float(np.abs(p - q).max()),
                     "mean_abs_prob_diff": float(np.abs(p - q).mean()),
                     "top1_agreement": float((lg.argmax(1) == pt.argmax(1)).mean())}
    if res["onnx_fp32"]["max_abs_logit_diff"] > 1e-3:
        ok = False
    if res["shipped"]["top1_agreement"] < 0.9:
        ok = False
    m = json.load(open(REPORTS / "metrics.json"))
    drop = m["quantization_comparison"][m["shipped"]]["acc_drop_vs_fp32"]
    res["shipped_acc_drop_vs_fp32_full_test"] = drop
    if max(drop.values()) > 0.02:
        ok = False
    size = (PUBLIC_MODELS / "leaf_v1.int8.onnx").stat().st_size
    res["shipped_size_mb"] = size / 1e6
    if size > 6 * 1024 * 1024:
        ok = False
    res["pass"] = ok
    json.dump(res, open(REPORTS / "verify_onnx.json", "w"), indent=1)
    print(json.dumps(res, indent=1))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
