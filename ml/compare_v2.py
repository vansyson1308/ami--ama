"""Merge decision for the v2 candidate (fixed before seeing v2 numbers).

Ship v2 only if, versus the shipped v1 (both with their own calibration, tau and per-class gate):
  - field (RoCoLe test) accuracy on answered photos drops by <= 1 pt, AND
  - field coverage drops by <= 1 pt, AND
  - the confident-wrong rate on the 58 held-out OOD photos improves (strictly fewer wrong assertions).
Writes reports/v2/decision.json and prints it.
"""
import json
from pathlib import Path

R = Path(__file__).resolve().parent / "reports"



def main():
    v1_card = json.load(open(R.parent.parent / "public" / "models" / "model_card.json"))
    v1_ood = json.load(open(R / "ood.json"))
    v2_card = json.load(open(R / "v2" / "public" / "model_card.json"))
    v2_ood = json.load(open(R / "v2" / "ood.json"))

    def field(c):
        m = c["metrics"]["test_rocole"]
        return m["acc_at_tau"], m["coverage_at_tau"]

    def wrong(o):
        rows = [r for r in o["rows"] if r["set"] == "commons"]
        return sum(r["outcome_camera"].startswith("WRONG") for r in rows), len(rows)

    a1, c1 = field(v1_card)
    a2, c2 = field(v2_card)
    w1, n1 = wrong(v1_ood)
    w2, n2 = wrong(v2_ood)
    checks = {
        "field_acc_at_tau_drop_le_1pt": (a1 - a2) <= 0.01,
        "field_coverage_drop_le_1pt": (c1 - c2) <= 0.01,
        "ood_confident_wrong_improves": n1 == n2 and w2 < w1,
    }
    out = {"v1": {"field_acc_at_tau": a1, "field_coverage": c1, "ood_wrong": w1, "ood_n": n1,
                  "never_assert": v1_card.get("never_assert"), "tau": v1_card["tau"], "T": v1_card["temperature"],
                  "test_rocole": v1_card["metrics"]["test_rocole"], "test_jmuben": v1_card["metrics"]["test_jmuben"]},
           "v2": {"field_acc_at_tau": a2, "field_coverage": c2, "ood_wrong": w2, "ood_n": n2,
                  "never_assert": v2_card.get("never_assert"), "tau": v2_card["tau"], "T": v2_card["temperature"],
                  "test_rocole": v2_card["metrics"]["test_rocole"], "test_jmuben": v2_card["metrics"]["test_jmuben"]},
           "checks": checks, "ship_v2": all(checks.values())}
    json.dump(out, open(R / "v2" / "decision.json", "w"), indent=1)
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
