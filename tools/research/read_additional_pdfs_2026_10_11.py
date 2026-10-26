"""Extract and render received PDFs for review, never infer review/publication from extraction."""
from pathlib import Path
import json
from pypdf import PdfReader
import pypdfium2 as pdfium
ROOT=Path(__file__).resolve().parents[2]
receipt_path=ROOT/'docs/research/additional-attachments-received-2026-10-11.json'
receipt=json.loads(receipt_path.read_text())
rows = [row for original in receipt['files'] for row in [original, *original.get('members', [])]]
for row in rows:
    path=ROOT/row['archive']
    if path.suffix!='.pdf': continue
    document=PdfReader(path)
    text='\n'.join(f'=== PAGE {i+1} ===\n{page.extract_text() or ""}' for i,page in enumerate(document.pages))
    if not text.strip() or len(text)>200000: raise ValueError('Unbounded or empty PDF extraction')
    path.with_suffix('.txt').write_text(text)
    images=[]
    with pdfium.PdfDocument(path) as rendered:
        if len(rendered)>40: raise ValueError('Unexpected page count')
        for i in range(len(rendered)):
            output=path.with_name(f'{path.stem}-page-{i+1}.png')
            rendered[i].render(scale=1.5).to_pil().save(output)
            images.append(str(output.relative_to(ROOT)))
    row.update({'extracted':True,'pages':len(document.pages),'chars':len(text),'textArchive':str(path.with_suffix('.txt').relative_to(ROOT)),'renderedPages':images})
for original in receipt['files']:
    if original.get('members'):
        original['extracted'] = all(member.get('extracted') for member in original['members'])
receipt_path.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
print(json.dumps([{'file':r['name'],'pages':r['pages'],'chars':r['chars']} for r in rows if r.get('pages')],ensure_ascii=False))
