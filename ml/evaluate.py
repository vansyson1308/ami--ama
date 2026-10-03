"""Evaluate a model (PyTorch checkpoint or ONNX file) on val/test, calibrate, choose tau, write reports.

Usage:
  python evaluate.py --backend torch --model checkpoints/best.pt --tag torch_fp32
  python evaluate.py --backend onnx  --model checkpoints/leaf_v1.int8.onnx --tag onnx_int8

Calibration (temperature + tau) is fitted on the *val* split of the same model, then applied to *test*.
Outputs: reports/metrics_<tag>.json, reports/confusion_<tag>_<split>.png, reports/risk_coverage_<tag>.png,
reports/logits_<tag>.npz
"""
from __future__ import annotations

import argparse
import csv
import json

import numpy as np
from PIL import Image

from common import CACHE, MARGIN, REPORTS, SPLITS, preprocess_pil, softmax
from metrics import choose_tau, fit_temperature, plot_confusion, plot_risk_coverage, risk_coverage, summarize


def read_split(name):
    with open(SPLITS / f"{name}.csv") as f:
        return list(csv.DictReader(f))


def torch_runner(path):
    import timm
    import torch

    ck = torch.load(path, map_location="cpu", weights_only=False)
    m = timm.create_model(ck["arch"], pretrained=False, num_classes=7)
    m.load_state_dict(ck["state_dict"])
    m.eval()
    torch.set_num_threads(4)

    def run(x):
        with torch.no_grad():
            return m(torch.from_numpy(x)).numpy()

    return run


def onnx_runner(path):
    import onnxruntime as ort

    so = ort.SessionOptions()
    so.intra_op_num_threads = 4
    s = ort.InferenceSession(str(path), so, providers=["CPUExecutionProvider"])
    fixed = s.get_inputs()[0].shape[0] == 1

    def run(x):
        if fixed:
            return np.concatenate([s.run(["logits"], {"input": x[i:i + 1]})[0] for i in range(len(x))])
        return s.run(["logits"], {"input": x})[0]

    return run


def logits_for(rows, run, bs=64):
    out = []
    for i in range(0, len(rows), bs):
        x = np.stack([preprocess_pil(Image.open(CACHE / r["path"])) for r in rows[i:i + bs]])
        out.append(run(x))
    return np.concatenate(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--backend", choices=["torch", "onnx"], required=True)
    ap.add_argument("--model", required=True)
    ap.add_argument("--tag", required=True)
    a = ap.parse_args()
    run = torch_runner(a.model) if a.backend == "torch" else onnx_runner(a.model)

    data = {}
    for split in ("val", "test"):
        rows = read_split(split)
        data[split] = (rows, logits_for(rows, run), np.array([int(r["label"]) for r in rows]),
                       np.array([r["source"] for r in rows]))
    np.savez_compressed(REPORTS / f"logits_{a.tag}.npz", **{f"{s}_logits": d[1] for s, d in data.items()},
                        **{f"{s}_y": d[2] for s, d in data.items()})

    _, lv, yv, sv = data["val"]
    T = fit_temperature(lv, yv)
    field = sv == "rocole"
    tau_info = choose_tau(softmax(lv[field], T), yv[field])
    tau = tau_info["tau"]

    rep = {"tag": a.tag, "model": a.model, "temperature": T, "margin": MARGIN, **tau_info, "splits": {}}
    curves = {}
    for split, (rows, lg, y, src) in data.items():
        groups = {"all": np.ones(len(y), bool), "rocole": src == "rocole", "jmuben": src == "jmuben", "beans": src == "beans"}
        for g, m in groups.items():
            p, pu = softmax(lg[m], T), softmax(lg[m], 1.0)
            s = summarize(p, y[m], tau, MARGIN, pu)
            rep["splits"][f"{split}_{g}"] = s
            if split == "test" and g in ("rocole", "jmuben", "all"):
                curves[f"test_{g}"] = risk_coverage(p, y[m])
                plot_confusion(s["confusion"], f"{a.tag} — {split} {g} (n={s['n']})", REPORTS / f"confusion_{a.tag}_{split}_{g}.png")
        # P1 severity metadata: recall of 'rust' by RoCoLe rust level on this split
        lv_ = np.array([int(r["rocole_level"]) for r in rows])
        pred = lg.argmax(1)
        rep["splits"][f"{split}_rocole_rust_recall_by_level"] = {
            str(k): {"n": int(((lv_ == k) & (src == "rocole")).sum()),
                     "recall": float((pred[(lv_ == k) & (src == "rocole")] == 1).mean()) if ((lv_ == k) & (src == "rocole")).any() else None}
            for k in (1, 2, 3, 4)}
    rep["risk_coverage_test"] = curves
    plot_risk_coverage(curves, tau, REPORTS / f"risk_coverage_{a.tag}.png")
    json.dump(rep, open(REPORTS / f"metrics_{a.tag}.json", "w"), indent=1)
    for k in ("test_rocole", "test_jmuben", "test_beans", "test_all"):
        s = rep["splits"][k]
        print(f"{a.tag:12s} {k:12s} n={s['n']:4d} acc={s['acc']:.3f} macroF1={s['macro_f1']:.3f} "
              f"cov@tau={s['coverage_at_tau']:.3f} acc@tau={s['acc_at_tau']} ece={s['ece']:.3f} (uncal {s['ece_uncalibrated']:.3f})")
    print(f"T={T:.3f} tau={tau} {tau_info['rule']}")


if __name__ == "__main__":
    main()
