"""Write demo sample images to public/samples/ (SPEC §10) + Python reference outputs for the JS parity test.

Samples are drawn with a fixed seed from the TEST splits (never seen in training), one or two per class — not
filtered by whether the model gets them right. Each is center-cropped to a 224x224 JPEG, so browser and Python
decode the same pixels. tests/fixtures/expected.json holds onnxruntime (Python) probabilities for each file.
"""
from __future__ import annotations

import csv
import json
import random
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image

from common import CACHE, KEY2ID, KEYS, PUBLIC_MODELS, ROOT, SEED, SPLITS, decide, preprocess_pil, softmax

OUT = ROOT.parent / "public" / "samples"
FIX = ROOT.parent / "tests" / "fixtures"
PLAN = [("rocole", "healthy", 2), ("rocole", "rust", 2), ("rocole", "red_spider_mite", 2), ("jmuben", "leaf_miner", 1),
        ("jmuben", "cercospora", 1), ("jmuben", "phoma", 1), ("beans", "not_coffee_leaf", 1)]
CREDIT = {"rocole": "RoCoLe — Parraga-Alava et al. 2019, CC BY 4.0 (cropped/resized)",
          "jmuben": "JMuBEN via AgML — CC BY 4.0 (resized)", "beans": "iBean — Makerere AI Lab, MIT (resized)"}


def main():
    rows = list(csv.DictReader(open(SPLITS / "test.csv")))
    rng = random.Random(SEED)
    OUT.mkdir(parents=True, exist_ok=True)
    FIX.mkdir(parents=True, exist_ok=True)
    for f in OUT.glob("*.jpg"):
        f.unlink()
    card = json.load(open(PUBLIC_MODELS / "model_card.json"))
    sess = ort.InferenceSession(str(PUBLIC_MODELS / "leaf_v1.int8.onnx"), providers=["CPUExecutionProvider"])
    samples, expected = [], {}
    for src, key, n in PLAN:
        cand = [r for r in rows if r["source"] == src and r["key"] == key]
        for r in rng.sample(cand, n):
            img = Image.open(CACHE / r["path"]).convert("RGB")
            w, h = img.size
            s = min(w, h)
            img = img.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((224, 224), Image.BILINEAR)
            name = f"{len(samples):02d}_{key}.jpg"
            img.save(OUT / name, quality=92)
            x = preprocess_pil(Image.open(OUT / name))[None]
            lg = sess.run(["logits"], {"input": x})[0][0]
            p = softmax(lg, card["temperature"])
            kind, c = decide(p, card["tau"], card["margin"], tuple(KEY2ID[k] for k in card.get("never_assert", [])))
            samples.append({"file": name, "source": src, "credit": CREDIT[src], "true": key, "orig": r["orig"]})
            expected[name] = {"true": key, "probs": [float(v) for v in p], "top1": KEYS[int(p.argmax())], "decision": kind}
            print(name, "true", key, "->", KEYS[int(p.argmax())], f"{p.max():.3f}", kind)
    json.dump(samples, open(OUT / "samples.json", "w"), ensure_ascii=False, indent=1)
    json.dump(expected, open(FIX / "expected.json", "w"), indent=1)
    (OUT / "CREDITS.md").write_text("# Sample image credits\n\n" + "\n".join(
        f"- `{s['file']}` — {s['credit']}; original `{s['orig']}`; label `{s['true']}`" for s in samples) + "\n")


if __name__ == "__main__":
    main()
