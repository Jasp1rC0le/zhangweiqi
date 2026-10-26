"""Download only media URLs visibly embedded in reviewed official public pages."""
import hashlib,json
from pathlib import Path
from urllib.request import urlopen
from pypdf import PdfReader
import pypdfium2 as pdfium

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'.local/research/safety-delivered-2026-10-10/public-followup'
FILES=[
 ('hq-organization.png','https://hqjj.tsguas.edu.cn/__local/F/68/20/00F7D8C07B2C7BC9DE66B135AC1_8F3802E4_366F.png','https://hqjj.tsguas.edu.cn/bmgk/jgsz.htm'),
 ('hq-menu-1.png','https://hqjj.tsguas.edu.cn/__local/7/FC/90/B29BBE98ABD779E23DE14199445_4F82FFD7_11F36.png','https://hqjj.tsguas.edu.cn/info/1007/2986.htm'),
 ('hq-menu-2.png','https://hqjj.tsguas.edu.cn/__local/A/D2/F4/BE36564912759C6706EFF879B20_6DA1202E_C2DC.png','https://hqjj.tsguas.edu.cn/info/1007/2986.htm'),
 ('cnki-ai.pdf','https://tsg.tsguas.edu.cn/__local/5/A9/D8/EA7445FCAF5388D99B69E29C3E2_BA9D2FB6_153E89.pdf','https://tsg.tsguas.edu.cn/info/5602/8414.htm'),
]
rows=[]
for name,url,parent in FILES:
    row=dict(url=url,parentUrl=parent,archive=str((OUT/name).relative_to(ROOT)),reviewed=False)
    try:
        with urlopen(url,timeout=15) as r: data=r.read(8*1024*1024+1)
        assert len(data)<=8*1024*1024
        assert data.startswith(b'%PDF-') if name.endswith('.pdf') else data.startswith(b'\x89PNG\r\n\x1a\n')
        path=OUT/name
        if path.exists(): assert path.read_bytes()==data,'Different previous archive'
        else: path.write_bytes(data)
        row.update(status='downloaded_pending_review',sha256=hashlib.sha256(data).hexdigest(),bytes=len(data))
        if name.endswith('.pdf'):
            reader=PdfReader(path); row['pages']=len(reader.pages)
            (OUT/(name+'.txt')).write_text('\n\n'.join(f'PAGE {i+1}\n{p.extract_text()}' for i,p in enumerate(reader.pages)))
            pdf=pdfium.PdfDocument(str(path))
            for i in range(len(pdf)):
                page=pdf[i]; bm=page.render(scale=1600/max(page.get_size()))
                bm.to_pil().save(OUT/f'cnki-ai-{i+1:02}.png'); bm.close(); page.close()
            pdf.close()
    except Exception as exc: row.update(status='failed',detail=type(exc).__name__)
    rows.append(row)
(OUT/'media-evidence.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(rows,ensure_ascii=False,indent=2))
