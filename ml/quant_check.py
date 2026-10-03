"""Quick quantization sanity check: agreement + max prob diff of each ONNX variant vs fp32 on N test images."""
import csv
import sys

import numpy as np
import onnxruntime as ort
from PIL import Image

from common import CACHE, CKPT, SPLITS, preprocess_pil, softmax

n = int(sys.argv[1]) if len(sys.argv) > 1 else 200
rows = list(csv.DictReader(open(SPLITS / "test.csv")))
rows = rows[:: max(1, len(rows) // n)][:n]
x = np.stack([preprocess_pil(Image.open(CACHE / r["path"])) for r in rows])
y = np.array([int(r["label"]) for r in rows])


def run(p):
    s = ort.InferenceSession(str(p), providers=["CPUExecutionProvider"])
    return np.concatenate([s.run(["logits"], {"input": x[i:i + 1]})[0] for i in range(len(x))])


ref = run(CKPT / "leaf_fp32.onnx")
pr = softmax(ref, 1.5)
print(f"fp32 acc={(ref.argmax(1) == y).mean():.3f}")
for v in ("leaf_int8_static", "leaf_int8_static_pct", "leaf_int8_dynamic", "leaf_int8_weights"):
    p = CKPT / f"{v}.onnx"
    if not p.exists():
        continue
    lg = run(p)
    q = softmax(lg, 1.5)
    print(f"{v:22s} {p.stat().st_size / 1e6:.2f}MB acc={(lg.argmax(1) == y).mean():.3f} "
          f"top1-agree={(lg.argmax(1) == ref.argmax(1)).mean():.3f} maxdp={np.abs(q - pr).max():.3f} meandp={np.abs(q - pr).mean():.4f}")
