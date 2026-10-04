"""Collect openly licensed NEGATIVE images ("not a coffee leaf") from Wikimedia Commons for training.

- Only CC0 / public domain / CC BY / CC BY-SA files; author + license + URL logged to reports/negatives_sources.json
  (and summarised in docs/DATA_CARD.md).
- Every file used in the held-out OOD test (reports/ood_sources.json) is excluded by title, so the 58-image OOD test
  stays a clean held-out evaluation. Searches use different query terms than the OOD test's categories.
Images go to data/raw/negatives/ (not committed).
"""
from __future__ import annotations

import io
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image

from common import RAW, REPORTS

OUT = RAW / "negatives"
UA = {"User-Agent": "AmiAma-hackathon-negatives/1.0 (https://github.com/vansyson1308/ami--ama)"}
OK_LICENSE = re.compile(r"^(CC0|Public domain|CC BY(-SA)? [0-9.]+|CC BY(-SA)?)$", re.I)
GROUPS = {  # group: (queries, target count)
    "grass": (["lawn grass closeup", "grass field meadow", "weeds ground cover"], 45),
    "banana_leaves": (["banana leaf", "banana plantation leaves"], 40),
    "cashew_leaves": (["cashew tree leaves", "cashew plant"], 35),
    "other_crop_leaves": (["cassava leaves", "rubber tree leaves", "maize leaves field", "mango tree leaves",
                           "avocado tree leaves", "tea plant leaves", "black pepper vine", "durian tree leaves",
                           "cacao tree leaves", "jackfruit tree leaves"], 120),
    "sky": (["cloudy sky", "blue sky clouds", "overcast sky"], 40),
    "soil": (["soil closeup", "red soil", "plowed field soil", "mud ground"], 45),
    "hands": (["human hand", "hands holding", "palm of hand"], 40),
}


def fetch(url: str, tries: int = 6) -> bytes:
    for i in range(tries):
        time.sleep(0.7)
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
        except urllib.error.HTTPError as e:
            if e.code != 429 or i == tries - 1:
                raise
            time.sleep(5 * 2 ** i)
    raise RuntimeError("unreachable")


def search(q: str, offset: int = 0) -> dict:
    params = {"action": "query", "format": "json", "generator": "search", "gsrsearch": f"filetype:bitmap {q}",
              "gsrnamespace": 6, "gsrlimit": 50, "gsroffset": offset, "prop": "imageinfo",
              "iiprop": "url|extmetadata|mime", "iiurlwidth": 330}  # a standard Wikimedia thumbnail size (non-standard sizes are throttled)
    return json.loads(fetch("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    held_out = {s["title"] for s in json.load(open(REPORTS / "ood_sources.json"))}
    prev = REPORTS / "negatives_sources.json"
    log = [e for e in json.load(open(prev)) if (OUT / e["file"]).exists()] if prev.exists() else []  # resume
    seen: set[str] = {e["title"] for e in log}
    for group, (queries, target) in GROUPS.items():
        per_query = -(-target // len(queries))
        got = sum(e["group"] == group for e in log)
        for q in queries:
            took = sum(e["group"] == group and e["query"] == q for e in log)
            for offset in (0, 50):
                if took >= per_query:
                    break
                try:
                    pages = search(q, offset).get("query", {}).get("pages", {})
                except Exception as e:  # noqa: BLE001
                    print("search failed", q, e)
                    break
                for p in sorted(pages.values(), key=lambda p: p.get("index", 0)):
                    if took >= per_query:
                        break
                    title = p["title"]
                    if title in held_out or title in seen:
                        continue
                    ii = (p.get("imageinfo") or [{}])[0]
                    if ii.get("mime") not in ("image/jpeg", "image/png") or "thumburl" not in ii:
                        continue
                    md = ii.get("extmetadata", {})
                    lic = md.get("LicenseShortName", {}).get("value", "").strip()
                    if not OK_LICENSE.match(lic):
                        continue
                    dest = OUT / f"{group}_{got:03d}.jpg"
                    try:
                        img = Image.open(io.BytesIO(fetch(ii["thumburl"]))).convert("RGB")
                    except Exception as e:  # noqa: BLE001
                        print("download failed", title, e)
                        continue
                    if min(img.size) < 120:
                        continue
                    img.save(dest, quality=92)
                    seen.add(title)
                    artist = re.sub("<[^>]+>", "", md.get("Artist", {}).get("value", "")).strip()
                    log.append({"file": dest.name, "group": group, "query": q, "title": title, "license": lic,
                                "author": artist[:120], "url": ii.get("descriptionurl")})
                    got += 1
                    took += 1
                    json.dump(log, open(REPORTS / "negatives_sources.json", "w"), ensure_ascii=False, indent=1)
        print(f"{group}: {got}", flush=True)
        json.dump(log, open(REPORTS / "negatives_sources.json", "w"), ensure_ascii=False, indent=1)
    assert not ({e["title"] for e in log} & held_out), "held-out OOD image leaked into training negatives"
    print("total", len(log))


if __name__ == "__main__":
    main()
