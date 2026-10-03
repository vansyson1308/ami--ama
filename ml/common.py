"""Shared constants and helpers for the Ami Ama ML pipeline.

The decision rule here MUST stay identical to src/ml/decide.ts.
"""
from __future__ import annotations

import os
import random
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get("AMI_DATA", ROOT / "data"))
RAW = DATA / "raw"
CACHE = DATA / "cache"
SPLITS = ROOT / "splits"
REPORTS = ROOT / "reports"
CKPT = ROOT / "checkpoints"
PUBLIC_MODELS = ROOT.parent / "public" / "models"

SEED = 42
IMG_SIZE = 224
MEAN = [0.485, 0.456, 0.406]
STD = [0.229, 0.224, 0.225]
MARGIN = 0.15

# Final label taxonomy (SPEC §5.2). card_id must exist in content/advice.vi.json.
LABELS = [
    {"id": 0, "key": "healthy", "vi_name": "Lá khỏe", "card_id": "healthy"},
    {"id": 1, "key": "rust", "vi_name": "Bệnh rỉ sắt", "card_id": "rust"},
    {"id": 2, "key": "red_spider_mite", "vi_name": "Nhện đỏ", "card_id": "red_spider_mite"},
    {"id": 3, "key": "leaf_miner", "vi_name": "Sâu đục lá (sâu vẽ bùa)", "card_id": "leaf_miner"},
    {"id": 4, "key": "cercospora", "vi_name": "Bệnh đốm mắt cua", "card_id": "cercospora"},
    {"id": 5, "key": "phoma", "vi_name": "Bệnh đốm lá do nấm Phoma", "card_id": "phoma"},
    {"id": 6, "key": "not_coffee_leaf", "vi_name": "Không phải lá cà phê", "card_id": "not_coffee_leaf"},
]
KEYS = [l["key"] for l in LABELS]
KEY2ID = {k: i for i, k in enumerate(KEYS)}
NOT_COFFEE = KEY2ID["not_coffee_leaf"]


def seed_everything(seed: int = SEED) -> None:
    random.seed(seed)
    np.random.seed(seed)
    try:
        import torch

        torch.manual_seed(seed)
    except ImportError:
        pass


def softmax(logits: np.ndarray, temperature: float = 1.0) -> np.ndarray:
    z = logits / temperature
    z = z - z.max(axis=-1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=-1, keepdims=True)


def decide(probs: np.ndarray, tau: float, margin: float = MARGIN) -> tuple[str, int]:
    """Runtime decision rule (quality gate is applied before this, in the app).

    Returns (kind, class_id) where kind is 'not_coffee' | 'abstain' | 'predict'.
    """
    order = np.argsort(-probs)
    top1, top2 = int(order[0]), int(order[1])
    p1, p2 = float(probs[top1]), float(probs[top2])
    if top1 == NOT_COFFEE and p1 >= tau:
        return "not_coffee", top1
    if p1 < tau or (p1 - p2) < margin:
        return "abstain", top1
    return "predict", top1


def preprocess_pil(img, size: int = IMG_SIZE) -> np.ndarray:
    """Eval/inference preprocessing — mirrored in src/ml/preprocess.ts.

    Center square crop (short side) -> bilinear resize to size x size -> [0,1] -> ImageNet norm. CHW float32.
    """
    from PIL import Image

    img = img.convert("RGB")
    w, h = img.size
    s = min(w, h)
    left, top = (w - s) // 2, (h - s) // 2
    img = img.crop((left, top, left + s, top + s))
    if s != size:
        img = img.resize((size, size), Image.BILINEAR)
    x = np.asarray(img, dtype=np.float32) / 255.0
    x = (x - np.array(MEAN, dtype=np.float32)) / np.array(STD, dtype=np.float32)
    return x.transpose(2, 0, 1).copy()
