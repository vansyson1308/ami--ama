"""Download raw datasets into ml/data/raw (not committed).

- RoCoLe (CC BY 4.0) via the Mendeley Data public API (file list + per-file download URLs).
  If this fails, place the 'Download All' zip at ml/data/raw/rocole.zip and run with --rocole-zip.
- JMuBEN arabica leaves (CC BY 4.0) via Hugging Face parquet (Project-AgML).
- iBean / beans (MIT) via Hugging Face parquet (AI-Lab-Makerere/beans) — used only as "not a coffee leaf".
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import json
import urllib.request
import zipfile
from pathlib import Path

from common import RAW

MENDELEY = "https://data.mendeley.com/public-api/datasets/c5yvn32dzg"
JMUBEN = "https://huggingface.co/datasets/Project-AgML/arabica_coffee_leaf_disease_classification/resolve/main/data/train-0000{i}-of-00004.parquet"
BEANS = "https://huggingface.co/api/datasets/AI-Lab-Makerere/beans/parquet/default/{s}/0.parquet"


def fetch(url: str, dest: Path) -> None:
    if dest.exists() and dest.stat().st_size > 0:
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(url, timeout=600) as r, open(tmp, "wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)
    tmp.rename(dest)


def rocole(zip_path: Path | None) -> None:
    out = RAW / "rocole"
    if zip_path:
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(out)
        return
    meta = json.loads(urllib.request.urlopen(MENDELEY, timeout=120).read())
    (out).mkdir(parents=True, exist_ok=True)
    (out / "meta.json").write_text(json.dumps(meta))
    jobs = []
    for f in meta["files"]:
        name = f["filename"]
        dest = out / ("img" if name.endswith(".jpg") else ".") / name
        jobs.append((f["content_details"]["download_url"], dest))
    with cf.ThreadPoolExecutor(16) as ex:
        list(ex.map(lambda j: fetch(*j), jobs))
    print("rocole files:", len(jobs))


def hf() -> None:
    for i in range(4):
        fetch(JMUBEN.format(i=i), RAW / "jmuben" / f"train-{i}.parquet")
    for s in ["train", "validation", "test"]:
        fetch(BEANS.format(s=s), RAW / "beans" / f"{s}.parquet")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--rocole-zip", type=Path, default=None)
    a = ap.parse_args()
    z = a.rocole_zip or (RAW / "rocole.zip" if (RAW / "rocole.zip").exists() else None)
    rocole(z)
    hf()
