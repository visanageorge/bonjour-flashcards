"""Fail closed until every catalog card has source, meaning and Romanian back reviewed."""

from collections import Counter
from pathlib import Path
from zipfile import ZipFile
import hashlib
import csv
import json
import re
import sys
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
CONTENT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "tmp/catalog-content-review.json"
PLAN = ROOT / "tmp/catalog-migration-plan.json"
ARCHIVE = Path(r"C:\Users\vladu\Downloads\franceza_audit_final_3_carti_codex.zip")
EXPECTED_HASH = "b4b9614f66b65296e84cbbc4740bbdadd69a0c86cbb09201db2a0a15957de5ad"
EXPECTED_MONTHS = {1: 445, 2: 450, 3: 449, 4: 450, 5: 450, 6: 484}


def comparable(value):
    value = unicodedata.normalize("NFKC", value).casefold()
    value = value.replace("’", "'").replace("‘", "'").replace("œ", "oe")
    return re.sub(r"[.!?]+$", "", " ".join(value.split())).strip()


content = json.loads(CONTENT.read_text(encoding="utf-8"))
cards = content["cards"]
errors = []
with ZipFile(ARCHIVE) as archive:
    actual_hash = hashlib.sha256(archive.read("Franceza_MASTER_revizuit.json")).hexdigest()
if actual_hash != EXPECTED_HASH:
    errors.append("Canonical archive has changed")
if content.get("catalog_sha256") != EXPECTED_HASH:
    errors.append("Catalog hash mismatch")
if len(cards) != 2728:
    errors.append(f"Expected 2728 cards, got {len(cards)}")
months = Counter(card["month"] for card in cards)
if dict(months) != EXPECTED_MONTHS:
    errors.append(f"Month counts mismatch: {dict(months)}")
ids = [card["catalog_id"] for card in cards]
if len(set(ids)) != len(ids):
    errors.append("Duplicate catalog IDs")
fronts = [comparable(card["front"]) for card in cards]
if len(set(fronts)) != len(fronts):
    errors.append("Duplicate French fronts")
if any(card["month"] not in EXPECTED_MONTHS for card in cards):
    errors.append("Invalid month")
planned = json.loads(PLAN.read_text(encoding="utf-8"))["cards"]
front_corrections = {}
with (ROOT / "content/franceza-front-corrections.tsv").open(encoding="utf-8", newline="") as source:
    for row in csv.DictReader(source, delimiter="\t"):
        if row["catalog_id"] in front_corrections or not all(row.values()):
            errors.append(f"Invalid front correction: {row['catalog_id']}")
        front_corrections[row["catalog_id"]] = row
for item in planned:
    correction = front_corrections.get(item["catalog_id"])
    if correction and correction["original_front"] != item["front"]:
        errors.append(f"Front correction does not match source: {item['catalog_id']}")
if len(front_corrections) != sum(item["catalog_id"] in front_corrections for item in planned):
    errors.append("Unknown front correction ID")
if [
    (card["catalog_id"], card["front"], card["month"], card["position"])
    for card in cards
] != [
    (card["catalog_id"], front_corrections.get(card["catalog_id"], {}).get("corrected_front", card["front"]), card["month"], card["position"])
    for card in planned
]:
    errors.append("Content rows do not match the canonical plan")

missing_form = [card["catalog_id"] for card in cards if card.get("form_reviewed") is not True]
source_evidence = {
    item["catalog_id"]: {hit["pdf_page"] for hit in item["vocab_evidence"]}
    for item in json.loads((ROOT / "tmp/source-evidence.json").read_text(encoding="utf-8"))["entries"]
}
source_pages = {
    "vocabulaire": json.loads((ROOT / "tmp/audit-vocab-ocr.json").read_text(encoding="utf-8")),
    "grammaire": json.loads((ROOT / "tmp/audit-grammar-ocr.json").read_text(encoding="utf-8")),
}
def source_letters(value):
    return "".join(c for c in unicodedata.normalize("NFKD", value.lower().replace("œ", "oe")) if "a" <= c <= "z")
def passage_present(card):
    passage = source_letters(card.get("source_passage", ""))
    if len(passage) < 12:
        return False
    book = card.get("source_book")
    page = card.get("source_pdf_page")
    if book == "assimil":
        import pymupdf
        with pymupdf.open(r"E:\Materiale franceza\Carti franceza\assimil_french_2020.pdf") as document:
            text = document[page - 1].get_text() if isinstance(page, int) and 1 <= page <= len(document) else ""
    else:
        text = source_pages.get(book, {}).get(str(page), "")
    return passage in source_letters(text)
approved_sources = json.loads((ROOT / "content/franceza-source-exceptions-approved.json").read_text(encoding="utf-8"))
approved_exceptions = {row["catalog_id"]: row for row in approved_sources["entries"]}
expected_exceptions = {f"FINAL-ADD-{number:04d}" for number in (54,158,220,223,304,317,333,338,343,344,346,429,433,441,469,352,358)}
if set(approved_exceptions) != expected_exceptions or not approved_sources.get("approval"):
    errors.append("Invalid scope or missing user approval for supplementary sources")
for card in cards:
    if card["catalog_id"].startswith("FINAL-ADD-") and card.get("form_reviewed") is True:
        if card["catalog_id"] in approved_exceptions:
            if (card.get("source_book") != "approved_supplement"
                or card.get("source_supplement") != approved_exceptions[card["catalog_id"]]
                or card.get("source_approval") != approved_sources["approval"]
                or not card.get("source_review_notes", "").strip()):
                errors.append(f"Invalid approved source exception for {card['catalog_id']}")
            continue
        if (
            (not passage_present(card) if card.get("source_passage") else
             card.get("source_pdf_page") not in source_evidence.get(card["catalog_id"], set()))
            or not card.get("source_review_notes", "").strip()
        ):
            errors.append(f"Missing source evidence for {card['catalog_id']}")
missing_meaning = [card["catalog_id"] for card in cards if card.get("meaning_reviewed") is not True]
missing_back = [card["catalog_id"] for card in cards if card.get("back_reviewed") is not True]
malformed_back = []
missing_conjugations = []
for card in cards:
    back = card.get("back")
    if isinstance(back, str) and card['catalog_id'] != 'FR-01887' and re.match(r'Traducere: a(?: |-)', back):
        if 'Conjugare la prezent' not in back:
            missing_conjugations.append(card['catalog_id'])
        elif not any(verb in card['front'] for verb in ('falloir','pleuvoir','neiger','frire')):
            section=back.split('Conjugare la prezent',1)[1].split('Exemple:',1)[0]
            if len(re.findall(r"^(?:je |j'|tu |il/elle/on |nous |vous |ils/elles )",section,re.M)) != 6:
                missing_conjugations.append(card['catalog_id'])
    if (
        not isinstance(back, str)
        or not re.search(r"^Traducere:\s*\S+", back, re.M)
        or "Exemple:" not in back
        or len(re.findall(r"^\s*[•\-]\s+\S+", back, re.M)) < 2
        or re.search(r"TODO|TBD|placeholder|needs_review", back, re.I)
    ):
        malformed_back.append(card["catalog_id"])
    elif any(
        not re.search(r"^\s+\S+", back.splitlines()[index + 1])
        for index, line in enumerate(back.splitlines()[:-1])
        if re.match(r"^\s*[•\-]\s+\S+", line)
    ):
        malformed_back.append(card["catalog_id"])

print(json.dumps({
    "cards": len(cards),
    "months": dict(sorted(months.items())),
    "unreviewed_forms": len(missing_form),
    "unreviewed_meanings": len(missing_meaning),
    "unreviewed_backs": len(missing_back),
    "missing_or_malformed_backs": len(malformed_back),
    "missing_conjugations": missing_conjugations,
    "structural_errors": errors,
    "first_unreviewed_forms": missing_form[:10],
}, ensure_ascii=False, indent=2))

if errors or missing_form or missing_meaning or missing_back or malformed_back or missing_conjugations:
    sys.exit(1)
