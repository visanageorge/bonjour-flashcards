"""OCR cited Vocabulaire pages and report candidate source matches (read-only PDF)."""

from pathlib import Path
from zipfile import ZipFile
import json
import re
import unicodedata

import numpy as np
import pymupdf
from rapidocr_onnxruntime import RapidOCR


BOOK = Path(r"E:\Materiale franceza\Carti franceza\2017-vocabulaire-progressif-du-francais-a1.pdf")
ARCHIVE = Path(r"C:\Users\vladu\Downloads\franceza_audit_final_3_carti_codex.zip")
CACHE = Path("tmp/audit-vocab-ocr.json")


def letters(value):
    value = unicodedata.normalize("NFKD", value.casefold().replace("œ", "oe"))
    return "".join(char for char in value if "a" <= char <= "z")


with ZipFile(ARCHIVE) as archive:
    entries = json.loads(archive.read("Franceza_MASTER_revizuit.json"))["entries"]
additions = [entry for entry in entries if entry["id"].startswith("FINAL-ADD-")]
pages = sorted({page for entry in additions for page in entry.get("pagini_vocabulaire", []) if 1 <= page <= 177})
cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
document = pymupdf.open(BOOK)
ocr = RapidOCR()
for index, page in enumerate(pages, 1):
    if str(page) in cache:
        continue
    pixmap = document[page - 1].get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5))
    pixels = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width, pixmap.n)
    result, _ = ocr(pixels)
    cache[str(page)] = " ".join(item[1] for item in (result or []))
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    if index % 10 == 0 or index == len(pages):
        print(f"OCR {index}/{len(pages)} cited pages", flush=True)

matches = []
for entry in additions:
    french = re.sub(r"^(?:de la |de l[’']|une |un |les |le |la |des |du |l[’'])", "", entry["franceza"].casefold()).strip()
    term = letters(french)
    complete_form = letters(entry["franceza"])
    cited = entry.get("pagini_vocabulaire", [])
    found = [page for page in cited if term and term in letters(cache.get(str(page), ""))]
    with_article = [page for page in cited if complete_form and complete_form in letters(cache.get(str(page), ""))]
    any_page = [int(page) for page, text in cache.items() if term and term in letters(text)]
    matches.append({"id": entry["id"], "franceza": entry["franceza"], "cited_pages": cited, "matched_pages": found, "matched_full_form_pages": with_article, "any_vocab_page": any_page})

counts = {
    "cited_pages_ocr": len(cache),
    "additions": len(additions),
    "vocab_cited": sum(bool(item["cited_pages"]) for item in matches),
    "vocab_text_match": sum(bool(item["matched_pages"]) for item in matches),
    "vocab_full_form_match": sum(bool(item["matched_full_form_pages"]) for item in matches),
    "vocab_any_page_match": sum(bool(item["any_vocab_page"]) for item in matches),
    "vocab_text_unmatched": [item for item in matches if item["cited_pages"] and not item["matched_pages"]],
    "matches": matches,
}
Path("tmp/audit-vocab-match-report.json").write_text(json.dumps(counts, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({key: len(value) if isinstance(value, list) else value for key, value in counts.items()}, ensure_ascii=False), flush=True)
