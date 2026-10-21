"""Render proposals for human review; does not approve or stage them."""
from pathlib import Path
import csv
import json
from catalog_conjugations import add_conjugation

root=Path(__file__).resolve().parents[1]
cards=json.loads((root/'tmp/catalog-content-review.json').read_text(encoding='utf-8'))['cards']
with (root/'content/franceza-pending-decisions.tsv').open(encoding='utf-8',newline='') as source:
    pending=list(csv.DictReader(source,delimiter='\t'))
by_id={x['catalog_id']:x for x in cards}
approved=all(by_id[x['catalog_id']]['form_reviewed'] and by_id[x['catalog_id']]['back_reviewed'] for x in pending)
if not approved:
    assert {x['catalog_id'] for x in pending}=={x['catalog_id'] for x in cards if not x['form_reviewed']}
parts=['# Cele 18 carduri cu decizie de sursă','Stare: aprobate explicit, integrate și importate; vezi catalog-final-result.md.' if approved else 'Stare: propuneri pentru decizie; nu sunt aprobate pentru import.']
for row in pending:
    back=f"Traducere: {row['translation']}\n\nExemple:\n• {row['fr1']}\n  {row['ro1']}\n• {row['fr2']}\n  {row['ro2']}"
    back=add_conjugation(row['catalog_id'],row['proposed_front'],back)
    if approved:
        back=by_id[row['catalog_id']]['back']
    parts.extend([f"## {row['catalog_id']} — {row['proposed_front']}",back,row['review_notes']])
(root/'reports/catalog-pending-cards.md').write_text('\n\n'.join(parts)+'\n',encoding='utf-8')
print(f'{len(pending)} proposals rendered; no approval flags or database rows changed.')
