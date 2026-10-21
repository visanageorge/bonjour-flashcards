"""Read-only source search for inflected forms; outputs require manual review."""
from pathlib import Path
import json
import unicodedata
import pymupdf

ROOT = Path(__file__).resolve().parents[1]
def fold(text):
    return ''.join(c for c in unicodedata.normalize('NFKD',text.lower().replace('œ','oe')) if 'a'<=c<='z')
variants = {
'0203':['fais attention','fait attention','faites attention','faire attention'],
'0054':['fruits secs'], '0077':['olives','olive (n.f.)'], '0107':['des skis','les skis','ski (n.m.)'],
'0152':['éteins la lumière','éteint la lumière','éteignez la lumière','éteindre'],
'0155':['change de vêtements','changer de vêtements','se change'],
'0158':['allergique'], '0181':['mouillé','mouillee'], '0182':['mûre','mûr'],
'0207':['au lieu de'], '0209':['la grippe','une grippe'], '0210':['prendre froid','pris froid','prends froid'],
'0212':['est grave','ce grave'], '0215':['mal aux dents'], '0216':['une promenade'],
'0219':['lève tôt','lever tôt'], '0220':['couche tard','coucher tard'], '0223':['la prochaine'],
'0402':['la manche','manche (n.f.)'], '0409':['homme âgé','homme age','personne âgée'],
'0248':['cotte','cocotte'], '0255':['éducation'], '0257':['entretien'], '0289':['paysage'],
'0304':['rapport qualité','rapport (n.m.)','un rapport'], '0317':['la technique','technique (n.f.)','techniques'],
'0329':['assiste à','assister à','assistons à'], '0332':['fiers de','fier de'], '0333':['satisfaits de','satisfait de'],
'0338':['loue une chambre','louer une chambre','louer la chambre'], '0339':['marque un but','marquer un but'],
'0340':['remarier','remarie'], '0341':['réchauffer','réchauffe'], '0343':['roule à vélo','rouler à vélo','à vélo'],
'0344':['se servir de','me sers de','sert de','servir (se'], '0345':['souvenir de','souviens de'],
'0346':['en équipe'], '0429':['génération'], '0432':['héritage'], '0433':['un historique','historique (m'],
'0440':['progrès'], '0441':['réparation'], '0446':['tarif'], '0462':['ravi','ravie'], '0464':['honteux','honteuse'],
'0468':['faire confiance','fais confiance','fait confiance'], '0469':['prends des notes','prendre des notes','notes'],
'0352':['conséquence'], '0354':['un conseil','des conseils','conseil (n.m.)'], '0355':['décision'],
'0358':['amélioration'], '0361':['même si'], '0362':['en train de'], '0363':['fait partie de','faire partie de'],
'0364':['capable de'], '0365':['du mal à'],
}
pages=[]
for book,file in [('vocabulaire','audit-vocab-ocr.json'),('grammaire','audit-grammar-ocr.json')]:
    for page,text in json.loads((ROOT/'tmp'/file).read_text(encoding='utf-8')).items():
        pages.append((book,int(page),text,fold(text)))
with pymupdf.open(r'E:\Materiale franceza\Carti franceza\assimil_french_2020.pdf') as doc:
    for i,page in enumerate(doc):
        text=page.get_text()
        pages.append(('assimil',i+1,text,fold(text)))
results=[]
remaining={card['catalog_id'] for card in json.loads((ROOT/'tmp/catalog-content-review.json').read_text(encoding='utf-8'))['cards'] if not card['form_reviewed']}
for suffix,terms in variants.items():
    if 'FINAL-ADD-'+suffix not in remaining:
        continue
    matches=[]
    for term in terms:
        needle=fold(term)
        for book,page,text,normalized in pages:
            pos=normalized.find(needle)
            if pos<0: continue
            offsets=[]
            for i,char in enumerate(text): offsets.extend([i]*len(fold(char)))
            start=offsets[max(0,pos-55)]
            end=offsets[min(len(offsets)-1,pos+len(needle)+110)]
            matches.append({'book':book,'pdf_page':page,'term':term,'excerpt':' '.join(text[start:end+1].split())})
    results.append({'catalog_id':'FINAL-ADD-'+suffix,'matches':matches})
(ROOT/'tmp/source-variant-contexts.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'searched':len(results),'without_match':[x['catalog_id'] for x in results if not x['matches']]}))
