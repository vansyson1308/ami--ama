"""Metrics, calibration and abstain-threshold selection (SPEC §5.5)."""
from __future__ import annotations

import numpy as np
from sklearn.metrics import confusion_matrix, f1_score, precision_recall_fscore_support

from common import KEYS, MARGIN, decide, softmax


def fit_temperature(logits: np.ndarray, y: np.ndarray) -> float:
    """Temperature scaling: minimise NLL on the validation set (grid + golden-section refine)."""
    def nll(t):
        p = softmax(logits, t)
        return -np.log(np.clip(p[np.arange(len(y)), y], 1e-12, 1)).mean()

    grid = np.exp(np.linspace(np.log(0.2), np.log(10), 200))
    t = grid[np.argmin([nll(g) for g in grid])]
    lo, hi = t / 1.1, t * 1.1
    for _ in range(40):
        a, b = lo + (hi - lo) / 3, hi - (hi - lo) / 3
        lo, hi = (lo, b) if nll(a) < nll(b) else (a, hi)
    return float((lo + hi) / 2)


def ece(probs: np.ndarray, y: np.ndarray, bins: int = 15) -> float:
    conf = probs.max(1)
    correct = probs.argmax(1) == y
    edges = np.linspace(0, 1, bins + 1)
    e = 0.0
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (conf > lo) & (conf <= hi)
        if m.any():
            e += m.mean() * abs(correct[m].mean() - conf[m].mean())
    return float(e)


MIN_CLASS_PRECISION = 0.80


def accepted(probs: np.ndarray, tau: float, margin: float = MARGIN, never_assert=()):
    """Apply the runtime decision rule. Returns (accepted_mask, predicted_class)."""
    acc_mask, pred = [], []
    for p in probs:
        kind, c = decide(p, tau, margin, never_assert)
        acc_mask.append(kind != "abstain")
        pred.append(c)
    return np.array(acc_mask), np.array(pred)


def risk_coverage(probs: np.ndarray, y: np.ndarray, margin: float = MARGIN, taus=None):
    taus = np.round(np.arange(0.30, 0.991, 0.01), 2) if taus is None else taus
    out = []
    for t in taus:
        m, pred = accepted(probs, t, margin)
        cov = m.mean()
        acc = (pred[m] == y[m]).mean() if m.any() else float("nan")
        out.append((float(t), float(cov), float(acc)))
    return out


def choose_tau(probs_val_field: np.ndarray, y: np.ndarray, margin: float = MARGIN) -> dict:
    """Lowest tau whose accepted-accuracy >= 90% on RoCoLe val with coverage >= 50%; else the 85% target (SPEC §5.5)."""
    rc = risk_coverage(probs_val_field, y, margin, np.round(np.arange(0.40, 0.991, 0.01), 2))
    for target in (0.90, 0.85):
        ok = [r for r in rc if r[2] >= target and r[1] >= 0.5]
        if ok:
            t = ok[0]
            return {"tau": t[0], "target_acc": target, "val_field_coverage": t[1], "val_field_acc_at_tau": t[2], "rule": "target met"}
    # Neither target reachable with >=50% coverage: honest fallback — best accuracy with coverage >= 30%.
    ok = [r for r in rc if r[1] >= 0.3 and not np.isnan(r[2])] or rc
    t = max(ok, key=lambda r: (r[2], r[1]))
    return {"tau": t[0], "target_acc": None, "val_field_coverage": t[1], "val_field_acc_at_tau": t[2],
            "rule": "targets not reachable at >=50% coverage; max accuracy with coverage >=30%"}


def class_precision_at_tau(probs: np.ndarray, y: np.ndarray, tau: float, margin: float = MARGIN) -> dict:
    """Precision of each class among ACCEPTED predictions (before any class gate)."""
    m, pred = accepted(probs, tau, margin)
    out = {}
    for c, k in enumerate(KEYS):
        sel = m & (pred == c)
        out[k] = {"accepted_predictions": int(sel.sum()), "correct": int((y[sel] == c).sum()),
                  "precision": float((y[sel] == c).mean()) if sel.any() else None, "support": int((y == c).sum())}
    return out


def choose_class_gate(field_val_prec: dict, min_precision: float = MIN_CLASS_PRECISION) -> list[str]:
    """Classes never asserted: measured field precision on accepted predictions < min_precision.
    Classes with no accepted field predictions (no field evidence) are not gated here; see MODEL_CARD."""
    return [k for k, v in field_val_prec.items() if v["precision"] is not None and v["precision"] < min_precision]


def summarize(probs: np.ndarray, y: np.ndarray, tau: float, margin: float = MARGIN, probs_uncal=None,
              never_assert=()) -> dict:
    pred = probs.argmax(1)
    present = sorted(set(y.tolist()))
    p, r, f, s = precision_recall_fscore_support(y, pred, labels=present, zero_division=0)
    m, dpred = accepted(probs, tau, margin, never_assert)
    res = {
        "n": int(len(y)),
        "acc": float((pred == y).mean()),
        "macro_f1": float(f1_score(y, pred, labels=present, average="macro", zero_division=0)),
        "per_class": {KEYS[c]: {"precision": float(p[i]), "recall": float(r[i]), "f1": float(f[i]), "support": int(s[i])}
                      for i, c in enumerate(present)},
        "confusion": confusion_matrix(y, pred, labels=list(range(len(KEYS)))).tolist(),
        "coverage_at_tau": float(m.mean()),
        "acc_at_tau": float((dpred[m] == y[m]).mean()) if m.any() else None,
        "macro_f1_at_tau": float(f1_score(y[m], dpred[m], labels=present, average="macro", zero_division=0)) if m.any() else None,
        "ece": ece(probs, y),
    }
    if probs_uncal is not None:
        res["ece_uncalibrated"] = ece(probs_uncal, y)
    return res


def plot_confusion(cm, title: str, path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    cm = np.array(cm)
    rows = [i for i in range(len(KEYS)) if cm[i].sum() > 0]
    sub = cm[rows]
    fig, ax = plt.subplots(figsize=(8, 0.6 * len(rows) + 2))
    ax.imshow(sub / np.maximum(sub.sum(1, keepdims=True), 1), cmap="Greens", vmin=0, vmax=1)
    for i in range(sub.shape[0]):
        for j in range(sub.shape[1]):
            if sub[i, j]:
                ax.text(j, i, int(sub[i, j]), ha="center", va="center", fontsize=9)
    ax.set_xticks(range(len(KEYS)), KEYS, rotation=35, ha="right")
    ax.set_yticks(range(len(rows)), [KEYS[r] for r in rows])
    ax.set_xlabel("predicted")
    ax.set_ylabel("true")
    ax.set_title(title)
    fig.tight_layout()
    fig.savefig(path, dpi=120)
    plt.close(fig)


def plot_risk_coverage(curves: dict, tau: float, path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(6, 4.5))
    for name, rc in curves.items():
        rc = [r for r in rc if not np.isnan(r[2])]
        ax.plot([r[1] for r in rc], [1 - r[2] for r in rc], label=name)
        at = min(rc, key=lambda r: abs(r[0] - tau))
        ax.scatter([at[1]], [1 - at[2]], zorder=3)
    ax.set_xlabel("coverage (share of photos answered)")
    ax.set_ylabel("risk (error rate on answered photos)")
    ax.set_title(f"Risk–coverage (dots: tau={tau:.2f}, margin={MARGIN})")
    ax.grid(alpha=0.3)
    ax.legend()
    fig.tight_layout()
    fig.savefig(path, dpi=120)
    plt.close(fig)
