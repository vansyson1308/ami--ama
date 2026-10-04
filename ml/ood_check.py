"""Out-of-distribution check: what does the shipped model do on things that are NOT coffee leaves?

Two sets:
  synthetic — generated here (solid colours, noise, gradients, checkerboard, soil-like texture, blurred coffee leaves)
  commons   — openly licensed photos from Wikimedia Commons (sky, soil, hands, grass, leaves of other Tây Nguyên
              crops). Only CC0 / public domain / CC BY / CC BY-SA files are used; author + license are recorded in
              reports/ood_sources.json. Images are cached in data/ood/ and NOT committed.

For each image we report the camera quality gate (Python mirror of src/ml/quality.ts) and the model decision
(same rule as the app, incl. the per-class gate). Output: reports/ood.json (+ a table printed to stdout).
"""
from __future__ import annotations

import io
import json
import re
import urllib.parse
import urllib.request
from collections import Counter, defaultdict

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageFilter

from common import DATA, KEY2ID, KEYS, PUBLIC_MODELS, REPORTS, ROOT, decide, preprocess_pil, softmax

OOD = DATA / "ood"
UA = {"User-Agent": "AmiAma-hackathon-OOD-check/1.0 (https://github.com/vansyson1308/ami--ama)"}
CATEGORIES = {
    "sky": ["Category:Cumulus clouds", "Category:Blue sky"],
    "soil": ["Category:Soil", "Category:Red soils", "Category:Soil samples", "Category:Basalt soils"],
    "hands": ["Category:Human hands"],
    "grass": ["Category:Grass"],
    "pepper_leaves": ["Category:Piper nigrum (leaves)", "Category:Piper nigrum"],
    "durian_leaves": ["Category:Durio zibethinus (leaves)", "Category:Durio zibethinus"],
    "banana_leaves": ["Category:Banana leaves"],
    "cashew_leaves": ["Category:Anacardium occidentale (leaves)", "Category:Anacardium occidentale"],
}
PER_GROUP = 8
OK_LICENSE = re.compile(r"^(CC0|Public domain|CC BY(-SA)? [0-9.]+|CC BY(-SA)?)", re.I)


def quality(img: Image.Image):
    w, h = img.size
    r = 256 / max(w, h)
    g = np.asarray(img.convert("RGB").resize((max(8, round(w * r)), max(8, round(h * r))), Image.BILINEAR), np.float32)
    g = 0.299 * g[..., 0] + 0.587 * g[..., 1] + 0.114 * g[..., 2]
    lap = g[1:-1, :-2] + g[1:-1, 2:] + g[:-2, 1:-1] + g[2:, 1:-1] - 4 * g[1:-1, 1:-1]
    lum, sharp = float(g.mean()), float(lap.var())
    if lum < 40:
        return "dark", lum, sharp
    if lum > 230:
        return "bright", lum, sharp
    if sharp < 60:
        return "blur", lum, sharp
    return "ok", lum, sharp


def synthetic():
    rng = np.random.default_rng(0)
    out = []
    for name, c in [("black", (0, 0, 0)), ("white", (255, 255, 255)), ("gray", (128, 128, 128)), ("red", (200, 30, 30)),
                    ("green", (40, 140, 60)), ("brown", (120, 80, 40))]:
        out.append((f"solid_{name}", Image.new("RGB", (480, 480), c)))
    out.append(("noise_uniform", Image.fromarray(rng.integers(0, 256, (480, 480, 3), dtype=np.uint8))))
    out.append(("noise_gauss", Image.fromarray(np.clip(rng.normal(128, 50, (480, 480, 3)), 0, 255).astype(np.uint8))))
    out.append(("noise_green", Image.fromarray(np.clip(rng.normal(0, 40, (480, 480, 3)) + [60, 140, 70], 0, 255).astype(np.uint8))))
    x = np.linspace(0, 255, 480)
    out.append(("gradient_h", Image.fromarray(np.stack([np.tile(x, (480, 1))] * 3, -1).astype(np.uint8))))
    out.append(("gradient_sky", Image.fromarray(np.stack([np.tile(x[:, None] * 0.3 + 80, (1, 480)),
                                                          np.tile(x[:, None] * 0.3 + 140, (1, 480)),
                                                          np.full((480, 480), 235.0)], -1).astype(np.uint8))))
    cb = ((np.indices((480, 480)) // 40).sum(0) % 2 * 255).astype(np.uint8)
    out.append(("checkerboard", Image.fromarray(np.stack([cb] * 3, -1))))
    out.append(("soil_texture", Image.open(ROOT.parent / "tests" / "fixtures" / "odd.jpg").convert("RGB")))
    for f in ("00_healthy.jpg", "02_rust.jpg", "04_red_spider_mite.jpg"):
        im = Image.open(ROOT.parent / "public" / "samples" / f).convert("RGB").resize((480, 480))
        out.append((f"blurred_{f[:-4]}", im.filter(ImageFilter.GaussianBlur(10))))
    return out


def fetch(url, tries=5):
    """GET with pacing + exponential backoff on HTTP 429 (Wikimedia rate limit)."""
    import time
    import urllib.error

    for i in range(tries):
        time.sleep(1.5)
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
        except urllib.error.HTTPError as e:
            if e.code != 429 or i == tries - 1:
                raise
            time.sleep(5 * 2 ** i)


def commons_api(params):
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({"format": "json", **params})
    return json.loads(fetch(url))


def commons():
    OOD.mkdir(parents=True, exist_ok=True)
    # Reuse the frozen held-out set when it is complete (same 58 images for every model version; no network).
    frozen = ROOT / "reports" / "ood_sources.json"
    if frozen.exists():
        src = json.load(open(frozen))
        if src and all((OOD / s["file"]).exists() for s in src):
            if REPORTS != ROOT / "reports":
                json.dump(src, open(REPORTS / "ood_sources.json", "w"), ensure_ascii=False, indent=1)
            print(f"commons: reusing {len(src)} held-out images")
            return [((OOD / s["file"]).stem, Image.open(OOD / s["file"]).convert("RGB")) for s in src]
    sources, out = [], []
    for group, cats in CATEGORIES.items():
        got = 0
        for cat in cats:
            if got >= PER_GROUP:
                break
            try:
                d = commons_api({"action": "query", "generator": "categorymembers", "gcmtitle": cat, "gcmtype": "file",
                                 "gcmlimit": 40, "prop": "imageinfo", "iiprop": "url|extmetadata|mime", "iiurlwidth": 480})
            except Exception as e:  # noqa: BLE001
                print("commons query failed", cat, e)
                continue
            for page in sorted(d.get("query", {}).get("pages", {}).values(), key=lambda p: p["title"]):
                if got >= PER_GROUP:
                    break
                ii = page.get("imageinfo", [{}])[0]
                if ii.get("mime") not in ("image/jpeg", "image/png"):
                    continue
                md = ii.get("extmetadata", {})
                lic = md.get("LicenseShortName", {}).get("value", "")
                if not OK_LICENSE.match(lic):
                    continue
                fname = OOD / f"{group}_{got:02d}.jpg"
                try:
                    if not fname.exists():
                        raw = fetch(ii["thumburl"])
                        Image.open(io.BytesIO(raw)).convert("RGB").save(fname, quality=92)
                except Exception as e:  # noqa: BLE001
                    print("download failed", page["title"], e)
                    continue
                artist = re.sub("<[^>]+>", "", md.get("Artist", {}).get("value", "")).strip()
                sources.append({"file": fname.name, "group": group, "title": page["title"], "license": lic,
                                "author": artist[:120], "url": ii.get("descriptionurl")})
                out.append((fname.stem, Image.open(fname).convert("RGB")))
                got += 1
        print(f"commons {group}: {got} images")
    json.dump(sources, open(REPORTS / "ood_sources.json", "w"), ensure_ascii=False, indent=1)
    return out


def main():
    card = json.load(open(PUBLIC_MODELS / "model_card.json"))
    gate = tuple(KEY2ID[k] for k in card.get("never_assert", []))
    s = ort.InferenceSession(str(PUBLIC_MODELS / card["file"]), providers=["CPUExecutionProvider"])
    rows = []
    for setname, items in (("synthetic", synthetic()), ("commons", commons())):
        for name, img in items:
            q, lum, sharp = quality(img)
            p = softmax(s.run(["logits"], {"input": preprocess_pil(img)[None]})[0][0], card["temperature"])
            kind, c = decide(p, card["tau"], card["margin"], gate)
            group = name.rsplit("_", 1)[0] if setname == "commons" else name.split("_")[0]
            rows.append({"set": setname, "group": group, "image": name, "quality_gate": q, "lum": round(lum, 1),
                         "sharpness": round(sharp, 1), "decision": kind, "top1": KEYS[int(p.argmax())],
                         "p_top1": round(float(p.max()), 3)})
    # outcome as the farmer would see it for a camera photo: gate first, then the model
    def outcome(r):
        if r["quality_gate"] != "ok":
            return "retake (quality gate)"
        if r["decision"] == "predict":
            return f"WRONG: asserted {r['top1']}"
        return {"not_coffee": "not a coffee leaf", "abstain": "abstain (hỏi cán bộ)"}[r["decision"]]

    summary = defaultdict(Counter)
    model_only = defaultdict(Counter)
    for r in rows:
        r["outcome_camera"] = outcome(r)
        summary[r["set"] + "/" + r["group"]][r["outcome_camera"]] += 1
        model_only[r["set"]]["asserted a coffee problem" if r["decision"] == "predict" else r["decision"]] += 1
    rep = {"n": len(rows), "by_group": {k: dict(v) for k, v in summary.items()},
           "model_only_by_set": {k: dict(v) for k, v in model_only.items()}, "rows": rows}
    json.dump(rep, open(REPORTS / "ood.json", "w"), ensure_ascii=False, indent=1)
    # Summary for the Evidence screen / MODEL_CARD (camera path: quality gate, then model).
    for setname in ("synthetic", "commons"):
        rs = [r for r in rows if r["set"] == setname]
        card.setdefault("ood", {})[setname] = {
            "n": len(rs),
            "wrong_assertion": sum(r["outcome_camera"].startswith("WRONG") for r in rs),
            "abstain": sum(r["outcome_camera"].startswith("abstain") for r in rs),
            "not_coffee": sum(r["outcome_camera"] == "not a coffee leaf" for r in rs),
            "retake": sum(r["outcome_camera"].startswith("retake") for r in rs),
            "groups": sorted({r["group"] for r in rs})}
    json.dump(card, open(PUBLIC_MODELS / "model_card.json", "w"), ensure_ascii=False, indent=1)
    for k, v in summary.items():
        print(f"{k:28s} {dict(v)}")
    print("model only (no quality gate):", {k: dict(v) for k, v in model_only.items()})


if __name__ == "__main__":
    main()
