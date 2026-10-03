"""Train the leaf classifier (timm MobileNetV3) on CPU or GPU.

Usage: python train.py [--arch mobilenetv3_large_100] [--epochs 12] [--freeze-epochs 2]
Writes ml/checkpoints/best.pt and ml/reports/train_log.json.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import random
import time
from collections import Counter

import numpy as np
import timm
import torch
import torch.nn as nn
from PIL import Image
from sklearn.metrics import f1_score
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler
from torchvision.transforms import v2 as T

from common import CACHE, CKPT, IMG_SIZE, KEYS, MEAN, REPORTS, STD, SEED, SPLITS, preprocess_pil, seed_everything


def read_split(name: str) -> list[dict]:
    with open(SPLITS / f"{name}.csv") as f:
        return list(csv.DictReader(f))


class RandomJpeg:
    """Re-encode with random JPEG quality (simulates cheap phone cameras)."""

    def __init__(self, lo=40, hi=95, p=0.5):
        self.lo, self.hi, self.p = lo, hi, p

    def __call__(self, img: Image.Image) -> Image.Image:
        if random.random() > self.p:
            return img
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=random.randint(self.lo, self.hi))
        buf.seek(0)
        return Image.open(buf).convert("RGB")


class RandomDownUp:
    """Down-sample then up-sample, so low resolution is not a shortcut for the (128 px) JMuBEN classes."""

    def __init__(self, lo=96, hi=176, p=0.35):
        self.lo, self.hi, self.p = lo, hi, p

    def __call__(self, img: Image.Image) -> Image.Image:
        if random.random() > self.p:
            return img
        s = random.randint(self.lo, self.hi)
        w, h = img.size
        r = s / min(w, h)
        if r >= 1:
            return img
        return img.resize((max(1, round(w * r)), max(1, round(h * r))), Image.BILINEAR).resize((w, h), Image.BILINEAR)


def train_tf():
    return T.Compose([
        RandomDownUp(),
        T.RandomResizedCrop(IMG_SIZE, scale=(0.6, 1.0)),
        T.RandomHorizontalFlip(),
        T.RandomVerticalFlip(),
        T.RandomRotation(25),
        T.ColorJitter(0.3, 0.3, 0.3, 0.05),
        T.RandomApply([T.GaussianBlur(9, sigma=(0.1, 2.5))], p=0.2),
        T.RandomGrayscale(p=0.05),
        RandomJpeg(),
        T.PILToTensor(),
        T.ToDtype(torch.float32, scale=True),
        T.Normalize(MEAN, STD),
    ])


class LeafDS(Dataset):
    def __init__(self, rows, train: bool):
        self.rows, self.train = rows, train
        self.tf = train_tf() if train else None

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, i):
        r = self.rows[i]
        img = Image.open(CACHE / r["path"]).convert("RGB")
        x = self.tf(img) if self.train else torch.from_numpy(preprocess_pil(img))
        return x, int(r["label"])


def sample_weights(rows):
    """Balance classes, and balance sources within a class (up-weights RoCoLe field photos)."""
    cnt = Counter((r["label"], r["source"]) for r in rows)
    per_cls_sources = Counter(l for (l, _s) in cnt)
    return [1.0 / (per_cls_sources[r["label"]] * cnt[(r["label"], r["source"])]) for r in rows]


DEV = torch.device("cuda" if torch.cuda.is_available() else "cpu")


@torch.no_grad()
def predict(model, loader):
    model.eval()
    out, ys = [], []
    for x, y in loader:
        out.append(model(x.to(DEV)).cpu())
        ys.append(y)
    return torch.cat(out).numpy(), torch.cat(ys).numpy()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--arch", default="mobilenetv3_large_100")
    ap.add_argument("--epochs", type=int, default=12)
    ap.add_argument("--freeze-epochs", type=int, default=2)
    ap.add_argument("--bs", type=int, default=48)
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--patience", type=int, default=4)
    ap.add_argument("--max-minutes", type=float, default=75)
    a = ap.parse_args()
    seed_everything(SEED)
    torch.set_num_threads(4)
    CKPT.mkdir(exist_ok=True)
    REPORTS.mkdir(exist_ok=True)

    tr, va = read_split("train"), read_split("val")
    dl_tr = DataLoader(LeafDS(tr, True), batch_size=a.bs, num_workers=a.workers, persistent_workers=True,
                       sampler=WeightedRandomSampler(sample_weights(tr), num_samples=len(tr), replacement=True,
                                                     generator=torch.Generator().manual_seed(SEED)))
    dl_va = DataLoader(LeafDS(va, False), batch_size=64, num_workers=a.workers)
    va_roc = np.array([r["source"] == "rocole" for r in va])

    model = timm.create_model(a.arch, pretrained=True, num_classes=len(KEYS)).to(DEV)
    head = set(id(p) for p in model.get_classifier().parameters())
    backbone = [p for p in model.parameters() if id(p) not in head]
    opt = torch.optim.AdamW([{"params": backbone, "lr": 3e-4}, {"params": list(model.get_classifier().parameters()), "lr": 1e-3}],
                            weight_decay=0.02)
    steps = a.epochs * len(dl_tr)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=[3e-4, 1e-3], total_steps=steps, pct_start=0.1,
                                                anneal_strategy="cos")
    crit = nn.CrossEntropyLoss(label_smoothing=0.1)

    log, best, bad, t0 = [], -1.0, 0, time.time()
    for ep in range(a.epochs):
        frozen = ep < a.freeze_epochs
        for p in backbone:
            p.requires_grad = not frozen
        model.train()
        te, tl, n = time.time(), 0.0, 0
        for x, y in dl_tr:
            x, y = x.to(DEV), y.to(DEV)
            loss = crit(model(x), y)
            opt.zero_grad()
            loss.backward()
            opt.step()
            sched.step()
            tl += loss.item() * len(y)
            n += len(y)
            if n // len(y) % 40 == 0:
                print(f"  ep{ep} {n}/{len(tr)} loss {tl / n:.3f} {(time.time() - te) / 60:.1f} min", flush=True)
        logits, ys = predict(model, dl_va)
        pred = logits.argmax(1)
        f1_all = f1_score(ys, pred, average="macro")
        roc_labels = sorted(set(ys[va_roc]))
        f1_roc = f1_score(ys[va_roc], pred[va_roc], labels=roc_labels, average="macro")
        score = (f1_all + f1_roc) / 2
        rec = {"epoch": ep, "frozen": frozen, "train_loss": tl / n, "val_macro_f1": f1_all, "val_rocole_macro_f1": f1_roc,
               "val_acc": float((pred == ys).mean()), "select_score": score, "epoch_min": (time.time() - te) / 60}
        log.append(rec)
        print(json.dumps(rec), flush=True)
        if score > best:
            best, bad = score, 0
            torch.save({"arch": a.arch, "state_dict": {k: v.cpu() for k, v in model.state_dict().items()}, "epoch": ep, "score": score}, CKPT / "best.pt")
        else:
            bad += 1
        json.dump({"args": vars(a), "log": log, "best_select_score": best}, open(REPORTS / "train_log.json", "w"), indent=1)
        if bad >= a.patience:
            print("early stop", flush=True)
            break
        if (time.time() - t0) / 60 > a.max_minutes:
            print("time budget reached", flush=True)
            break


if __name__ == "__main__":
    main()
