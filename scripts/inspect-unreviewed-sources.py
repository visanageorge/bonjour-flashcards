"""Print contexts, never approve or import a candidate automatically."""
from pathlib import Path
import json
import re
import unicodedata
import pymupdf

ROOT = Path(__file__).resolve().parents[1]
def folded(text):
    return ''.join(c for c in unicodedata.normalize('NFKD', text.lower().replace('œ', 'oe')) if 'a' <= c <= 'z')

books = {
    'vocabulaire': json.loads((ROOT/'tmp/audit-vocab-ocr.json').read_text(encoding='utf-8')),
    'grammaire': json.loads((ROOT/'tmp/audit-grammar-ocr.json').read_text(encoding='utf-8')),
}
with pymupdf.open(r'E:\Materiale franceza\Carti franceza\assimil_french_2020.pdf') as doc:
    books['assimil'] = {str(i+1): page.get_text() for i, page in enumerate(doc)}

cards = json.loads((ROOT/'tmp/catalog-content-review.json').read_text(encoding='utf-8'))['cards']
results = []
for card in cards:
    if card['form_reviewed']:
        continue
    term = re.sub(r'\([^)]*\)', '', card['front'].split('/')[0]).strip()
    term = re.sub(r"^(?:de la |de l[’']|une |un |les |le |la |des |du |l[’'])", '', term)
    term = re.sub(r'^(?:être |avoir |se |faire )', '', term)
    needle = folded(term)
    matches = []
    for book, pages in books.items():
        for page, content in pages.items():
            normalized = folded(content)
            position = normalized.find(needle) if needle else -1
            if position < 0:
                continue
            # Map collapsed OCR letters back to the original text.
            offsets = []
            for i, char in enumerate(content):
                offsets.extend([i]*len(folded(char)))
            start = offsets[max(0, position-85)]
            end = offsets[min(len(offsets)-1, position+len(needle)+140)]
            matches.append({'book': book, 'pdf_page': int(page), 'excerpt': ' '.join(content[start:end+1].split())})
    results.append({'catalog_id': card['catalog_id'], 'front': card['front'], 'search_term': term, 'matches': matches})

(ROOT/'tmp/unreviewed-source-contexts.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'remaining': len(results), 'with_context': sum(bool(x['matches']) for x in results), 'without_context': [x['catalog_id'] for x in results if not x['matches']]}, ensure_ascii=False))
