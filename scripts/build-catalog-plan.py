"""Build a read-only, deduplicated migration plan; never writes to Supabase."""

from collections import Counter, defaultdict
from pathlib import Path
from zipfile import ZipFile
import json
import re
import unicodedata

ARCHIVE = Path(r"C:\Users\vladu\Downloads\franceza_audit_final_3_carti_codex.zip")
BACKUP = Path("supabase/vlad-before-catalog-replacement.json")
OUTPUT = Path("tmp/catalog-migration-plan.json")


def comparable(value):
    value = unicodedata.normalize("NFKC", value).casefold()
    value = value.replace("’", "'").replace("‘", "'").replace("œ", "oe")
    value = re.sub(r"\s+", " ", value).strip()
    return re.sub(r"[.!?]+$", "", value).strip()


with ZipFile(ARCHIVE) as archive:
    catalog = json.loads(archive.read("Franceza_MASTER_revizuit.json"))
backup = json.loads(BACKUP.read_text(encoding="utf-8"))
groups = defaultdict(list)
for entry in catalog["entries"]:
    groups[comparable(entry["franceza"])].append(entry)

review_counts = Counter(review["card_id"] for review in backup["reviews"])
old_cards = defaultdict(list)
for card in backup["cards"]:
    old_cards[comparable(card["front"])].append(card)

plan = []
merged = []
for form, entries in groups.items():
    # The older audited entry wins when a proposed addition repeats it.
    canonical = min(entries, key=lambda entry: (entry["id"].startswith("FINAL-ADD-"), entry["luna"], entry["pozitia_in_luna"]))
    if len(entries) > 1:
        merged.append({"kept": canonical["id"], "discarded": [entry["id"] for entry in entries if entry is not canonical]})
    candidates = old_cards[form]
    reused = min(candidates, key=lambda card: (-review_counts[card["id"]], card["created_at"])) if candidates else None
    plan.append({
        "catalog_id": canonical["id"],
        "front": canonical["franceza"],
        "month": canonical["luna"],
        "position": canonical["pozitia_in_luna"],
        "catalog_status": canonical["status_verificare"],
        "review_status": "needs_review" if canonical["id"].startswith("FINAL-ADD-") else "previous_audit_semantic_check",
        "old_card_id": reused["id"] if reused else None,
        "back_status": "existing_requires_semantic_check" if reused else "romanian_back_required",
    })

plan.sort(key=lambda entry: (entry["month"], entry["position"]))
assert len(plan) == 2728
assert len({comparable(entry["front"]) for entry in plan}) == len(plan)
assert len(merged) == 6
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps({"cards": plan, "duplicates_merged": merged}, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({
    "planned_unique_cards": len(plan),
    "monthly_counts": dict(sorted(Counter(entry["month"] for entry in plan).items())),
    "existing_exact_ids_candidate_for_reuse": sum(bool(entry["old_card_id"]) for entry in plan),
    "romanian_backs_to_create_or_match_semantically": sum(not entry["old_card_id"] for entry in plan),
    "duplicates_merged": len(merged),
    "plan": str(OUTPUT),
}, ensure_ascii=False))
