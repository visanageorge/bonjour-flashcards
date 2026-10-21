"""Recheck OCR misses using individual adjective forms and gender annotations."""

from pathlib import Path
from zipfile import ZipFile
import json
import re
import unicodedata

import pymupdf

ARCHIVE = Path(r"C:\Users\vladu\Downloads\franceza_audit_final_3_carti_codex.zip")
ASSIMIL = Path(r"E:\Materiale franceza\Carti franceza\assimil_french_2020.pdf")


def letters(value):
    value = unicodedata.normalize("NFKD", value.casefold().replace("œ", "oe"))
    return "".join(char for char in value if "a" <= char <= "z")


grammar_report = json.loads(Path("tmp/audit-grammar-match-report.json").read_text(encoding="utf-8"))
remaining = [item for item in grammar_report["matches"] if not item["matched_pages"]]
vocab_pages = json.loads(Path("tmp/audit-vocab-ocr.json").read_text(encoding="utf-8"))
grammar_pages = json.loads(Path("tmp/audit-grammar-ocr.json").read_text(encoding="utf-8"))
assimil_pages = [page.get_text() for page in pymupdf.open(ASSIMIL)]
sources = {
    "vocabulaire": [letters(value) for value in vocab_pages.values()],
    "grammaire": [letters(value) for value in grammar_pages.values()],
    "assimil": [letters(value) for value in assimil_pages],
}

checks = []
for item in remaining:
    value = re.sub(r"\s*\((?:m|f)\.\)\s*$", "", item["franceza"])
    variants = [letters(part.strip()) for part in value.split("/")]
    hits = [
        [source for source, pages in sources.items() if variant and any(variant in page for page in pages)]
        for variant in variants
    ]
    checks.append({"id": item["id"], "franceza": item["franceza"], "variants": variants, "source_hits": hits})

report = {
    "previously_unconfirmed": len(remaining),
    "some_variant_found": sum(any(item["source_hits"]) for item in checks),
    "all_variants_found": sum(all(item["source_hits"]) for item in checks),
    "still_unconfirmed": [item for item in checks if not any(item["source_hits"])],
    "checks": checks,
}
Path("tmp/audit-remaining-term-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({key: len(value) if isinstance(value, list) else value for key, value in report.items() if key != "checks"}, ensure_ascii=False))
