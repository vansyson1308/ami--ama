"""Build a resized image cache + split manifests (ml/splits/*.csv).

- RoCoLe: 60/20/20 stratified split, **grouped by plant** (C<x>P<y>) so leaves of the same plant never
  leak across train/test. Stricter than a per-image split; documented in DATA_CARD.md.
- JMuBEN: stratified subsample <= 1,200 images per class (seed 42), then 70/15/15.
- beans: all classes pooled -> not_coffee_leaf, 70/15/15.
"""
from __future__ import annotations

import csv
import io
import json
import re
from collections import Counter
from pathlib import Path

import numpy as np
import pyarrow.parquet as pq
from PIL import Image, ImageOps
from sklearn.model_selection import StratifiedGroupKFold, train_test_split

from common import CACHE, KEY2ID, RAW, SEED, SPLITS, seed_everything

CACHE_SHORT = 288
JMUBEN_PER_CLASS = 1200
JMUBEN_NAMES = {0: "cercospora", 1: "healthy", 2: "rust", 3: "leaf_miner", 4: "phoma"}  # HF class ids -> our keys


def save_cached(img: Image.Image, dest: Path) -> None:
    img = ImageOps.exif_transpose(img).convert("RGB")
    w, h = img.size
    s = min(w, h)
    if s > CACHE_SHORT:
        r = CACHE_SHORT / s
        img = img.resize((round(w * r), round(h * r)), Image.BILINEAR)
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest, quality=93)


def rocole_rows() -> list[dict]:
    src = RAW / "rocole"
    rows = []
    for r in csv.DictReader(open(src / "RoCoLE-csv.csv")):
        name = r["External ID"]
        cls = json.loads(r["Label"])["classification"]
        m = re.match(r"C(\d+)P(\d+)", name)
        group = f"C{m.group(1)}P{m.group(2)}"
        level = int(cls.split("_")[-1]) if cls.startswith("rust_level") else 0
        key = "rust" if cls.startswith("rust") else cls
        rows.append({"source": "rocole", "orig": name, "key": key, "fine": cls, "level": level, "group": group,
                     "_load": src / "img" / name})
    return rows


def split_rocole(rows: list[dict]) -> None:
    y = np.array([r["fine"] for r in rows])
    g = np.array([r["group"] for r in rows])
    sgkf = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=SEED)
    folds = np.zeros(len(rows), dtype=int)
    for k, (_, te) in enumerate(sgkf.split(np.zeros(len(rows)), y, g)):
        folds[te] = k
    for r, f in zip(rows, folds):
        r["split"] = "test" if f == 0 else "val" if f == 1 else "train"


def parquet_rows(name: str, files: list[Path], label_col: str, mapper, per_class: int | None) -> list[dict]:
    meta = []
    for fi, f in enumerate(files):
        labels = pq.read_table(f, columns=[label_col]).column(label_col).to_pylist()
        meta += [(fi, i, l) for i, l in enumerate(labels)]
    rng = np.random.default_rng(SEED)
    if per_class:
        keep = []
        by = {}
        for m in meta:
            by.setdefault(m[2], []).append(m)
        for l, lst in sorted(by.items()):
            idx = rng.permutation(len(lst))[:per_class]
            keep += [lst[i] for i in sorted(idx)]
        meta = keep
    rows = []
    want = {}
    for fi, i, l in meta:
        want.setdefault(fi, []).append((i, l))
    for fi, lst in want.items():
        t = pq.read_table(files[fi], columns=["image"]).column("image")
        for i, l in lst:
            cell = t[i].as_py()
            rows.append({"source": name, "orig": f"{files[fi].name}#{i}:{cell.get('path')}", "key": mapper(l),
                         "fine": str(l), "level": 0, "group": "", "_bytes": cell["bytes"]})
    return rows


def split_simple(rows: list[dict], fracs=(0.7, 0.15, 0.15)) -> None:
    idx = np.arange(len(rows))
    y = [r["key"] + r["fine"] for r in rows]
    tr, rest = train_test_split(idx, train_size=fracs[0], stratify=y, random_state=SEED)
    va, te = train_test_split(rest, test_size=fracs[2] / (fracs[1] + fracs[2]),
                              stratify=[y[i] for i in rest], random_state=SEED)
    for s, ids in (("train", tr), ("val", va), ("test", te)):
        for i in ids:
            rows[i]["split"] = s


def main() -> None:
    seed_everything()
    SPLITS.mkdir(parents=True, exist_ok=True)
    roc = rocole_rows()
    split_rocole(roc)
    jm = parquet_rows("jmuben", sorted((RAW / "jmuben").glob("train-*.parquet")), "label",
                      lambda l: JMUBEN_NAMES[l], JMUBEN_PER_CLASS)
    split_simple(jm)
    be = parquet_rows("beans", [RAW / "beans" / f"{s}.parquet" for s in ("train", "validation", "test")], "labels",
                      lambda l: "not_coffee_leaf", None)
    split_simple(be)
    # v2: openly licensed Wikimedia Commons negatives (ml/collect_negatives.py), if present. Split 70/15/15 by group.
    ng = [{"source": "negatives", "orig": f.name, "key": "not_coffee_leaf", "fine": f.name.rsplit("_", 1)[0], "level": 0,
           "group": "", "_load": f} for f in sorted((RAW / "negatives").glob("*.jpg"))]
    if ng:
        split_simple(ng)

    all_rows = []
    for ds, rows in (("rocole", roc), ("jmuben", jm), ("beans", be), ("negatives", ng)):
        if not rows:
            continue
        for k, r in enumerate(rows):
            rel = f"{ds}/{k:05d}.jpg"
            dest = CACHE / rel
            if not dest.exists():
                img = Image.open(r["_load"]) if "_load" in r else Image.open(io.BytesIO(r["_bytes"]))
                save_cached(img, dest)
            all_rows.append({"path": rel, "source": ds, "orig": r["orig"], "label": KEY2ID[r["key"]], "key": r["key"],
                             "fine": r["fine"], "rocole_level": r["level"], "group": r["group"], "split": r["split"]})
        print(ds, len(rows), Counter((r["split"], r["key"]) for r in rows))

    cols = list(all_rows[0].keys())
    for s in ("train", "val", "test"):
        with open(SPLITS / f"{s}.csv", "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=cols)
            w.writeheader()
            w.writerows([r for r in all_rows if r["split"] == s])
    summary = Counter((r["split"], r["source"], r["key"]) for r in all_rows)
    with open(SPLITS / "summary.json", "w") as f:
        json.dump({"|".join(k): v for k, v in sorted(summary.items())}, f, indent=1)


if __name__ == "__main__":
    main()
