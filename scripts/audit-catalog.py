"""Read-only preflight for the audited French catalog and Vlad's local backup."""

from collections import Counter, defaultdict
from hashlib import sha256
from pathlib import Path
import json
import re
import sys
import unicodedata
import zipfile


ARCHIVE = Path(r"C:\Users\vladu\Downloads\franceza_audit_final_3_carti_codex.zip")
BACKUP = Path("supabase/vlad-before-catalog-replacement.json")


def comparable(value):
    value = unicodedata.normalize("NFKC", value).casefold()
    value = value.replace("’", "'").replace("‘", "'").replace("œ", "oe")
    value = re.sub(r"\s+", " ", value).strip()
    return re.sub(r"[.!?]+$", "", value).strip()


def without_article(value):
    return re.sub(r"^(?:de la |de l'|une |un |les |le |la |des |du |l')", "", value)


with zipfile.ZipFile(ARCHIVE) as archive:
    raw_catalog = archive.read("Franceza_MASTER_revizuit.json")
    catalog = json.loads(raw_catalog)
backup = json.loads(BACKUP.read_text(encoding="utf-8"))
entries = catalog["entries"]
cards = backup["cards"]

assert len(entries) == catalog["metadata"]["total"] == 2734
assert len({entry["id"] for entry in entries}) == len(entries)
assert all(1 <= entry["luna"] <= 6 for entry in entries)
assert all(entry["franceza"].strip() for entry in entries)

by_form = defaultdict(list)
by_lemma = defaultdict(list)
for entry in entries:
    form = comparable(entry["franceza"])
    by_form[form].append(entry)
    by_lemma[without_article(form)].append(entry)

old_by_form = defaultdict(list)
old_by_lemma = defaultdict(list)
for card in cards:
    form = comparable(card["front"])
    old_by_form[form].append(card)
    old_by_lemma[without_article(form)].append(card)

exact_old = [card for card in cards if comparable(card["front"]) in by_form]
plausible_old = [card for card in cards if comparable(card["front"]) not in by_form and without_article(comparable(card["front"])) in by_lemma]
unmatched_old = [card for card in cards if card not in exact_old and card not in plausible_old]
exact_catalog = [entry for entry in entries if comparable(entry["franceza"]) in old_by_form]

duplicates = [group for group in by_form.values() if len(group) > 1]
additions = [entry for entry in entries if entry["id"].startswith("FINAL-ADD-")]
assert len(additions) == 489

monthly = Counter(entry["luna"] for entry in entries)
positions = {month: [entry["pozitia_in_luna"] for entry in entries if entry["luna"] == month] for month in range(1, 7)}
position_valid = all(sorted(values) == list(range(1, len(values) + 1)) for values in positions.values())

deck_ids = {deck["id"] for deck in backup["decks"]}
card_ids = {card["id"] for card in cards}
review_ids = {review["id"] for review in backup["reviews"]}
backup_restorable = (
    len(deck_ids) == len(backup["decks"])
    and len(card_ids) == len(cards)
    and len(review_ids) == len(backup["reviews"])
    and all(card["deck_id"] in deck_ids and card["front"] and card["back"] and card["schedule"] for card in cards)
    and all(review["card_id"] in card_ids and review["deck_id"] in deck_ids for review in backup["reviews"])
    and len(backup["settings"]) == 1
)
assert backup_restorable, "Backup has invalid references or duplicate identifiers"

source_patterns = Counter((tuple(entry.get("pagini_vocabulaire", [])), tuple(entry.get("pagini_grammaire", []))) for entry in additions)
repeated_sources = [(count, pattern) for pattern, count in source_patterns.items() if count >= 3]

result = {
    "catalog_sha256": sha256(raw_catalog).hexdigest(),
    "catalog_rows": len(entries),
    "normalized_unique_forms": len(by_form),
    "monthly_rows": dict(sorted(monthly.items())),
    "monthly_positions_valid": position_valid,
    "duplicates": [
        {"form": group[0]["franceza"], "entries": [{"id": entry["id"], "month": entry["luna"]} for entry in group]}
        for group in duplicates
    ],
    "additions": len(additions),
    "addition_statuses": dict(Counter(entry["status_verificare"] for entry in additions)),
    "additions_with_index_flag": sum(bool(entry.get("index_vocabulaire")) for entry in additions),
    "additions_without_page_reference": sum(not entry.get("pagini_vocabulaire") and not entry.get("pagini_grammaire") and not entry.get("in_lexicon_assimil") for entry in additions),
    "repeated_source_patterns": sorted([{"count": count, "vocab_pages": list(pattern[0]), "grammar_pages": list(pattern[1])} for count, pattern in repeated_sources], key=lambda item: -item["count"])[:5],
    "old_cards": len(cards),
    "old_reviews": len(backup["reviews"]),
    "old_exact_form_matches": len(exact_old),
    "old_possible_article_matches": len(plausible_old),
    "old_unmatched": len(unmatched_old),
    "old_unmatched_fronts": [card["front"] for card in unmatched_old],
    "old_possible_article_fronts": [card["front"] for card in plausible_old],
    "catalog_rows_with_old_exact_match": len(exact_catalog),
    "old_back_format_complete": sum("Traducere:" in card["back"] and "Exemple:" in card["back"] for card in cards),
    "backup_restorable_structurally": backup_restorable,
}
json.dump(result, sys.stdout, ensure_ascii=False, indent=2)
print()
