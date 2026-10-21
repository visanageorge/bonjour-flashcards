"""Print possible grammar-book matches for unreviewed Luna 01 additions."""
from pathlib import Path
from zipfile import ZipFile
import json
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = Path(r"C:\Users\vladu\Downloads\franceza_audit_final_3_carti_codex.zip")


def letters(value):
    folded = unicodedata.normalize("NFKD", value.casefold().replace("œ", "oe").replace("’", "'"))
    return "".join(char for char in folded if "a" <= char <= "z")


with ZipFile(ARCHIVE) as archive:
    entries = {entry["id"]: entry for entry in json.loads(archive.read("Franceza_MASTER_revizuit.json"))["entries"]}
cards = json.loads((ROOT / "tmp/catalog-content-review.json").read_text(encoding="utf-8"))["cards"]
ocr = json.loads((ROOT / "tmp/audit-grammar-ocr.json").read_text(encoding="utf-8"))
for card in cards:
    if card["month"] != 1 or card["form_reviewed"]:
        continue
    term = letters(card["front"])
    all_hits = [int(page) for page, content in ocr.items() if term and term in letters(content)]
    cited = set(entries[card["catalog_id"]].get("pagini_grammaire", []))
    print(json.dumps({"id": card["catalog_id"], "front": card["front"], "cited_hits": [page for page in all_hits if page in cited], "other_hits": [page for page in all_hits if page not in cited][:8]}, ensure_ascii=False))
