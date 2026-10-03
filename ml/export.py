"""Export the trained checkpoint to ONNX (opset 17) and quantize to int8.

Produces in ml/checkpoints/:
  leaf_fp32.onnx            float32 reference
  leaf_int8_static.onnx     static QDQ, per-channel, 200 calibration images from train (SPEC §5.6)
  leaf_int8_dynamic.onnx    dynamic quantization (fallback)
"""
from __future__ import annotations

import csv
import random

import numpy as np
import onnx
import timm
import torch
from onnxruntime.quantization import (CalibrationDataReader, CalibrationMethod, QuantFormat, QuantType, quantize_dynamic,
                                      quantize_static)
from onnxruntime.quantization.shape_inference import quant_pre_process
from PIL import Image

from common import CACHE, CKPT, IMG_SIZE, SEED, SPLITS, preprocess_pil


class Reader(CalibrationDataReader):
    def __init__(self, n=200):
        rows = list(csv.DictReader(open(SPLITS / "train.csv")))
        random.Random(SEED).shuffle(rows)
        # stratify roughly: take from every source/class
        by = {}
        for r in rows:
            by.setdefault((r["source"], r["label"]), []).append(r)
        pick, i = [], 0
        while len(pick) < n:
            for lst in by.values():
                if i < len(lst) and len(pick) < n:
                    pick.append(lst[i])
            i += 1
        self.it = iter([{"input": preprocess_pil(Image.open(CACHE / r["path"]))[None]} for r in pick])

    def get_next(self):
        return next(self.it, None)


def main():
    ck = torch.load(CKPT / "best.pt", map_location="cpu", weights_only=False)
    m = timm.create_model(ck["arch"], pretrained=False, num_classes=7, exportable=True)
    m.load_state_dict(ck["state_dict"])
    m.eval()
    x = torch.randn(1, 3, IMG_SIZE, IMG_SIZE)
    fp32 = CKPT / "leaf_fp32.onnx"
    kw = dict(input_names=["input"], output_names=["logits"], opset_version=17, do_constant_folding=True)
    try:
        torch.onnx.export(m, x, str(fp32), dynamo=False, **kw)
    except TypeError:
        torch.onnx.export(m, x, str(fp32), **kw)
    onnx.checker.check_model(onnx.load(str(fp32)))
    print("fp32", fp32.stat().st_size / 1e6, "MB")

    pre = CKPT / "leaf_fp32_pre.onnx"
    quant_pre_process(str(fp32), str(pre), skip_symbolic_shape=True)

    try:
        quantize_static(str(pre), str(CKPT / "leaf_int8_static.onnx"), Reader(200), quant_format=QuantFormat.QDQ,
                        per_channel=True, activation_type=QuantType.QUInt8, weight_type=QuantType.QInt8,
                        calibrate_method=CalibrationMethod.MinMax)
        print("static int8", (CKPT / "leaf_int8_static.onnx").stat().st_size / 1e6, "MB")
    except Exception as e:  # noqa: BLE001 — documented fallback
        print("static quantization failed:", e)

    try:
        quantize_static(str(pre), str(CKPT / "leaf_int8_static_pct.onnx"), Reader(200), quant_format=QuantFormat.QDQ,
                        per_channel=True, activation_type=QuantType.QUInt8, weight_type=QuantType.QInt8,
                        calibrate_method=CalibrationMethod.Percentile, extra_options={"CalibPercentile": 99.99})
        print("static int8 (percentile)", (CKPT / "leaf_int8_static_pct.onnx").stat().st_size / 1e6, "MB")
    except Exception as e:  # noqa: BLE001
        print("static percentile quantization failed:", e)

    quantize_dynamic(str(pre), str(CKPT / "leaf_int8_dynamic.onnx"), weight_type=QuantType.QUInt8, per_channel=False)
    print("dynamic int8", (CKPT / "leaf_int8_dynamic.onnx").stat().st_size / 1e6, "MB")

    weight_only_int8(fp32, CKPT / "leaf_int8_weights.onnx")
    print("weight-only int8", (CKPT / "leaf_int8_weights.onnx").stat().st_size / 1e6, "MB")


def weight_only_int8(src, dst):
    """Per-output-channel symmetric int8 weights + DequantizeLinear; activations and compute stay fp32.

    File size ~= int8 model, accuracy ~= fp32, and identical float kernels in onnxruntime CPU and WASM."""
    from onnx import helper, numpy_helper

    m = onnx.load(str(src))
    g = m.graph
    inits = {i.name: i for i in g.initializer}
    consumers = {}
    for n in g.node:
        for k, name in enumerate(n.input):
            consumers.setdefault(name, []).append((n, k))
    new_nodes = []
    for name, init in list(inits.items()):
        uses = consumers.get(name, [])
        if not uses or not all(n.op_type in ("Conv", "Gemm") and k == 1 for n, k in uses):
            continue
        w = numpy_helper.to_array(init).astype(np.float32)
        if w.size < 512:
            continue
        axis = 0  # Conv: [out, in, kh, kw]; Gemm (transB=1): [out, in]
        flat = np.abs(w.reshape(w.shape[0], -1)).max(1)
        scale = np.where(flat > 0, flat / 127.0, 1.0).astype(np.float32)
        q = np.clip(np.round(w / scale.reshape([-1] + [1] * (w.ndim - 1))), -127, 127).astype(np.int8)
        g.initializer.remove(init)
        g.initializer.extend([numpy_helper.from_array(q, name + "_q"), numpy_helper.from_array(scale, name + "_scale"),
                              numpy_helper.from_array(np.zeros_like(scale, dtype=np.int8), name + "_zp")])
        new_nodes.append(helper.make_node("DequantizeLinear", [name + "_q", name + "_scale", name + "_zp"], [name],
                                          axis=axis, name=name + "_dq"))
    for n in reversed(new_nodes):
        g.node.insert(0, n)
    onnx.checker.check_model(m)
    onnx.save(m, str(dst))


if __name__ == "__main__":
    np.random.seed(SEED)
    main()
