"""Collect OCR excerpts for manual source review; excerpts do not validate entries."""

from pathlib import Path
from zipfile import ZipFile
import json
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = Path(r"C:\Users\vladu\Downloads\franceza_audit_final_3_carti_codex.zip")
VOCAB_OCR = ROOT / "tmp/audit-vocab-ocr.json"
OUTPUT = ROOT / "tmp/source-evidence.json"


def flat_with_offsets(value):
    letters, offsets = [], []
    for index, char in enumerate(value):
        folded = unicodedata.normalize("NFKD", char.casefold().replace("œ", "oe").replace("æ", "ae"))
        for piece in folded:
            if "a" <= piece <= "z":
                letters.append(piece)
                offsets.append(index)
    return "".join(letters), offsets


def search(page, term):
    text, folded, offsets = page
    needle, _ = flat_with_offsets(term)
    if not needle:
        return None
    found = folded.find(needle)
    if found < 0:
        return None
    start = offsets[found]
    end = offsets[found + len(needle) - 1] + 1
    return " ".join(text[max(0, start - 90):min(len(text), end + 120)].split())


with ZipFile(ARCHIVE) as archive:
    entries = json.loads(archive.read("Franceza_MASTER_revizuit.json"))["entries"]
ocr = json.loads(VOCAB_OCR.read_text(encoding="utf-8"))
prepared_pages = {int(number): (value, *flat_with_offsets(value)) for number, value in ocr.items()}
results = []
for entry in entries:
    if not entry["id"].startswith("FINAL-ADD-"):
        continue
    front = entry["franceza"]
    bare = re.sub(r"^(?:de la |de l['’]|une |un |les |le |la |des |du |l['’])", "", front, flags=re.I)
    variants = [part.strip() for part in bare.split("/")]
    cited = set(entry.get("pagini_vocabulaire", []))
    evidence = []
    for page_number, page in prepared_pages.items():
        full = search(page, front)
        fragment = full or next((hit for term in variants if (hit := search(page, term))), None)
        if fragment:
            evidence.append({
                "pdf_page": page_number,
                "page_cited_in_catalog": page_number in cited,
                "full_form_found": bool(full),
                "excerpt": fragment,
            })
    evidence.sort(key=lambda item: (not item["page_cited_in_catalog"], not item["full_form_found"], item["pdf_page"]))
    results.append({
        "catalog_id": entry["id"],
        "front": front,
        "catalog_vocab_pages": sorted(cited),
        "vocab_evidence": evidence[:10],
        "vocab_hit_count": len(evidence),
        "status": "unreviewed_ocr_only",
    })

OUTPUT.write_text(json.dumps({"entries": results}, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({
    "additions": len(results),
    "vocab_hits": sum(bool(item["vocab_evidence"]) for item in results),
    "vocab_misses": sum(not item["vocab_evidence"] for item in results),
    "output": str(OUTPUT),
}, ensure_ascii=False))
