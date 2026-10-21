"""OCR grammar pages cited by additions not matched in Vocabulaire or Assimil."""

from pathlib import Path
from zipfile import ZipFile
import json
import re
import unicodedata

import numpy as np
import pymupdf
from rapidocr_onnxruntime import RapidOCR

BOOK = Path(r"E:\Materiale franceza\Carti franceza\grammaire-progressive-du-francais.pdf")
ARCHIVE = Path(r"C:\Users\vladu\Downloads\franceza_audit_final_3_carti_codex.zip")
CACHE = Path("tmp/audit-grammar-ocr.json")


def letters(value):
    value = unicodedata.normalize("NFKD", value.casefold().replace("œ", "oe"))
    return "".join(char for char in value if "a" <= char <= "z")


with ZipFile(ARCHIVE) as archive:
    entries = json.loads(archive.read("Franceza_MASTER_revizuit.json"))["entries"]
vocab = json.loads(Path("tmp/audit-vocab-match-report.json").read_text(encoding="utf-8"))
assimil = json.loads(Path("tmp/audit-assimil-match-report.json").read_text(encoding="utf-8"))
vocab_by_id = {entry["id"]: entry for entry in vocab["matches"]}
assimil_by_id = {entry["id"]: entry for entry in assimil["matches"]}
additions = [entry for entry in entries if entry["id"].startswith("FINAL-ADD-")]
remaining = [entry for entry in additions if not vocab_by_id[entry["id"]]["any_vocab_page"] and not assimil_by_id[entry["id"]]["pages"]]
pages = sorted({page for entry in remaining for page in entry.get("pagini_grammaire", []) if 1 <= page <= 176})
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
        print(f"Grammar OCR {index}/{len(pages)} cited pages", flush=True)

matches = []
for entry in remaining:
    french = re.sub(r"^(?:de la |de l[’']|une |un |les |le |la |des |du |l[’'])", "", entry["franceza"].casefold()).strip()
    term = letters(french)
    cited = entry.get("pagini_grammaire", [])
    found = [page for page in cited if term and term in letters(cache.get(str(page), ""))]
    matches.append({"id": entry["id"], "franceza": entry["franceza"], "matched_pages": found})

report = {"remaining": len(remaining), "grammar_pages_ocr": len(cache), "grammar_cited_match": sum(bool(item["matched_pages"]) for item in matches), "matches": matches}
Path("tmp/audit-grammar-match-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({key: len(value) if isinstance(value, list) else value for key, value in report.items()}, ensure_ascii=False), flush=True)
