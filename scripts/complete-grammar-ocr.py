"""Read uncached grammar pages to resolve the final source questions."""
from pathlib import Path
import json
import numpy as np
import pymupdf
from rapidocr_onnxruntime import RapidOCR

cache_path=Path('tmp/audit-grammar-ocr.json')
cache=json.loads(cache_path.read_text(encoding='utf-8'))
document=pymupdf.open(r'E:\Materiale franceza\Carti franceza\grammaire-progressive-du-francais.pdf')
pending=[i for i in range(1,len(document)+1) if str(i) not in cache]
print(f'{len(cache)} cached; {len(pending)} pages remain',flush=True)
ocr=RapidOCR()
for index,number in enumerate(pending,1):
    pixmap=document[number-1].get_pixmap(matrix=pymupdf.Matrix(1.5,1.5))
    pixels=np.frombuffer(pixmap.samples,dtype=np.uint8).reshape(pixmap.height,pixmap.width,pixmap.n)
    result,_=ocr(pixels)
    cache[str(number)]=' '.join(item[1] for item in (result or []))
    cache_path.write_text(json.dumps(cache,ensure_ascii=False),encoding='utf-8')
    print(f'Grammar page {number}: {index}/{len(pending)}',flush=True)
