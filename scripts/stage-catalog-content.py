"""Prepare an offline editorial worklist. Never connects to Supabase."""

import csv
import json
from pathlib import Path
from catalog_conjugations import add_conjugation

ROOT = Path(__file__).resolve().parents[1]
PLAN = ROOT / "tmp/catalog-migration-plan.json"
BACKUP = ROOT / "supabase/vlad-before-catalog-replacement-app.json"
OUTPUT = ROOT / "tmp/catalog-content-review.json"
REVIEWED = ROOT / "content/franceza-reviewed.json"
REUSED = ROOT / "content/franceza-reused-approved.txt"
SOURCES = ROOT / "content/franceza-source-reviewed.tsv"
OTHER_SOURCES = ROOT / "content/franceza-source-reviewed-other.tsv"
APPROVED_EXCEPTIONS = ROOT / "content/franceza-source-exceptions-approved.json"
FRONT_CORRECTIONS = ROOT / "content/franceza-front-corrections.tsv"

plan = json.loads(PLAN.read_text(encoding="utf-8"))
backup = json.loads(BACKUP.read_text(encoding="utf-8"))
old_cards = {card["id"]: card for card in backup["cards"]}
reviewed = {card["catalog_id"]: card for card in json.loads(REVIEWED.read_text(encoding="utf-8"))["cards"]} if REVIEWED.exists() else {}
source_reviewed = {}
source_exceptions = json.loads(APPROVED_EXCEPTIONS.read_text(encoding="utf-8"))
assert source_exceptions["approval"] and len(source_exceptions["entries"]) == 17
exceptions = {row["catalog_id"]: row for row in source_exceptions["entries"]}
assert len(exceptions) == 17
front_corrections = {}
if FRONT_CORRECTIONS.exists():
    with FRONT_CORRECTIONS.open(encoding="utf-8", newline="") as source:
        for row in csv.DictReader(source, delimiter="\t"):
            catalog_id = row["catalog_id"]
            assert catalog_id not in front_corrections and all(row.values()), catalog_id
            original = next((item for item in plan["cards"] if item["catalog_id"] == catalog_id), None)
            assert original and original["front"] == row["original_front"], catalog_id
            front_corrections[catalog_id] = row
if SOURCES.exists():
    with SOURCES.open(encoding="utf-8", newline="") as source:
        for row in csv.DictReader(source, delimiter="\t"):
            catalog_id = row["catalog_id"]
            assert catalog_id.startswith("FINAL-ADD-") and catalog_id not in source_reviewed, catalog_id
            assert row["pdf_page"].isdigit() and row["sense"].strip(), catalog_id
            source_reviewed[catalog_id] = row
if OTHER_SOURCES.exists():
    with OTHER_SOURCES.open(encoding="utf-8", newline="") as source:
        for row in csv.DictReader(source, delimiter="\t"):
            catalog_id = row["catalog_id"]
            assert catalog_id.startswith("FINAL-ADD-") and catalog_id not in source_reviewed, catalog_id
            assert row["book"] in {"vocabulaire", "grammaire", "assimil"}, catalog_id
            assert row["pdf_page"].isdigit() and row["passage"].strip() and row["sense"].strip(), catalog_id
            source_reviewed[catalog_id] = row
for reviewed_tsv in sorted((ROOT / "content").glob("franceza-reviewed-batch-*.tsv")):
    with reviewed_tsv.open(encoding="utf-8", newline="") as source:
        for row in csv.DictReader(source, delimiter="\t"):
            catalog_id = row["catalog_id"]
            assert catalog_id not in reviewed, f"Duplicate curated ID: {catalog_id}"
            assert all(row[key].strip() for key in ("translation", "fr1", "ro1", "fr2", "ro2")), catalog_id
            reviewed[catalog_id] = {
                "catalog_id": catalog_id,
                "back": f"Traducere: {row['translation']}\n\nExemple:\n• {row['fr1']}\n  {row['ro1']}\n• {row['fr2']}\n  {row['ro2']}",
                "review_notes": row.get("review_notes", ""),
            }
if REUSED.exists():
    for catalog_id in REUSED.read_text(encoding="utf-8").splitlines():
        catalog_id = catalog_id.strip()
        if not catalog_id or catalog_id.startswith("#"):
            continue
        assert catalog_id.startswith("FR-") and catalog_id not in reviewed, catalog_id
        item = next((item for item in plan["cards"] if item["catalog_id"] == catalog_id), None)
        assert item and item["old_card_id"] in old_cards, catalog_id
        reviewed[catalog_id] = {
            "catalog_id": catalog_id,
            "back": old_cards[item["old_card_id"]]["back"],
            "review_notes": "Text reutilizat din backup după revizie semantică.",
        }

cards = []
for item in plan["cards"]:
    old = old_cards.get(item["old_card_id"])
    addition = item["catalog_id"].startswith("FINAL-ADD-")
    curated = reviewed.get(item["catalog_id"])
    if curated:
        curated["back"] = add_conjugation(item["catalog_id"], item["front"], curated["back"])
    source = source_reviewed.get(item["catalog_id"])
    exception = exceptions.get(item["catalog_id"])
    assert not (source and exception), item["catalog_id"]
    cards.append(
        {
            "catalog_id": item["catalog_id"],
            "front": front_corrections.get(item["catalog_id"], {}).get("corrected_front", item["front"]),
            "month": item["month"],
            "position": item["position"],
            "old_card_id": item["old_card_id"],
            "candidate_back_from_backup": old["back"] if old else None,
            "back": curated["back"] if curated else None,
            "form_reviewed": bool(source or exception) if addition else True,
            "source_pdf_page": int(source["pdf_page"]) if source else None,
            "source_book": source.get("book", "vocabulaire") if source else "approved_supplement" if exception else None,
            "source_supplement": exception,
            "source_approval": source_exceptions["approval"] if exception else None,
            "source_passage": source.get("passage", "") if source else "",
            "source_review_notes": source["sense"] if source else exception["sense"] if exception else "",
            "meaning_reviewed": bool(curated),
            "back_reviewed": bool(curated),
            "review_notes": curated.get("review_notes", "") if curated else "",
        }
    )

assert len(cards) == 2728
assert len([card for card in cards if card["candidate_back_from_backup"]]) == 269
assert len(reviewed) == len([card for card in cards if card["meaning_reviewed"]]), "Unknown or duplicate curated catalog ID"
assert len(source_reviewed) == len([card for card in cards if card["source_pdf_page"]]), "Unknown reviewed source ID"
assert len(exceptions) == len([card for card in cards if card["source_supplement"]]), "Unknown approved source ID"
assert len(front_corrections) == len([card for card in cards if card["catalog_id"] in front_corrections]), "Unknown corrected front ID"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(
    json.dumps({"catalog_sha256": "b4b9614f66b65296e84cbbc4740bbdadd69a0c86cbb09201db2a0a15957de5ad", "cards": cards}, ensure_ascii=False, indent=2),
    encoding="utf-8",
)
print(f"Worklist: {OUTPUT}")
print(f"2728 cards; {sum(not card['form_reviewed'] for card in cards)} forms need source review; "
      f"{len(reviewed)} cards curated; {sum(not card['back_reviewed'] for card in cards)} backs remain; "
      "269 old backs are candidates only.")
