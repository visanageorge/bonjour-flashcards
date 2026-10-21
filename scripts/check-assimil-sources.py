"""Search the text layer of the supplied Assimil PDF for proposed catalog entries."""

from pathlib import Path
from zipfile import ZipFile
import json
import re
import unicodedata

import pymupdf

BOOK = Path(r"E:\Materiale franceza\Carti franceza\assimil_french_2020.pdf")
ARCHIVE = Path(r"C:\Users\vladu\Downloads\franceza_audit_final_3_carti_codex.zip")


def letters(value):
    value = unicodedata.normalize("NFKD", value.casefold().replace("œ", "oe"))
    return "".join(char for char in value if "a" <= char <= "z")


with ZipFile(ARCHIVE) as archive:
    entries = json.loads(archive.read("Franceza_MASTER_revizuit.json"))["entries"]
additions = [entry for entry in entries if entry["id"].startswith("FINAL-ADD-")]
document = pymupdf.open(BOOK)
pages = [letters(page.get_text()) for page in document]
results = []
for entry in additions:
    french = re.sub(r"^(?:de la |de l[’']|une |un |les |le |la |des |du |l[’'])", "", entry["franceza"].casefold()).strip()
    term = letters(french)
    full_form = letters(entry["franceza"])
    found = [index + 1 for index, text in enumerate(pages) if term and term in text]
    form_found = [index + 1 for index, text in enumerate(pages) if full_form and full_form in text]
    results.append({"id": entry["id"], "franceza": entry["franceza"], "lexicon_flag": entry.get("in_lexicon_assimil"), "pages": found, "full_form_pages": form_found})

report = {
    "total": len(results),
    "lemma_match": sum(bool(item["pages"]) for item in results),
    "full_form_match": sum(bool(item["full_form_pages"]) for item in results),
    "lexicon_flag_true": sum(bool(item["lexicon_flag"]) for item in results),
    "lexicon_flag_true_without_text_match": [item for item in results if item["lexicon_flag"] and not item["pages"]],
    "without_text_match": [item for item in results if not item["pages"]],
    "matches": results,
}
Path("tmp/audit-assimil-match-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({key: len(value) if isinstance(value, list) else value for key, value in report.items()}, ensure_ascii=False))
