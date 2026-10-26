"""Read-only source render/contact sheets; never changes source documents."""
from pathlib import Path
import subprocess
import tempfile
import os
import pypdfium2 as pdfium
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.local/research/safety-delivered-2026-10-10'
OFFICE = '/Users/zhangweiqi/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/libreoffice-headless/libreoffice/LibreOfficeDev.app/Contents/MacOS/soffice'
with tempfile.TemporaryDirectory(prefix='campthink-source-render-') as profile:
    files = [OUT / f for f in ['lab-check.docx', 'maintenance.docx', 'household-extend.doc', 'household-return.doc']]
    result = subprocess.run([OFFICE, f'-env:UserInstallation={Path(profile).as_uri()}', '--headless', '--convert-to', 'pdf', '--outdir', str(OUT), *map(str, files)], capture_output=True, text=True, timeout=60, env={**os.environ, 'FONTCONFIG_FILE':str(ROOT/'tools/research/macos-source-fonts.conf')})
    (OUT / 'forms-render.log').write_text(result.stdout + result.stderr)
    if result.returncode: raise RuntimeError('Form conversion failed; inspect log')
    for path in files:
        doc = pdfium.PdfDocument(str(path.with_suffix('.pdf')))
        for i, page in enumerate(doc):
            bitmap = page.render(scale=1600 / max(page.get_size()))
            bitmap.to_pil().save(OUT / f'{path.stem}-review-{i+1:03}.png')
            bitmap.close(); page.close()
        doc.close()

groups = {
    'forms': [('lab-check',1),('maintenance',1),('household-extend',1),('household-return',1)],
    'lab': [('lab-platform',1),('lab-platform',13),('lab-platform',14),('lab-platform',15)],
    'entry': [('basics',24),('basics',26),('basics',27),('basics',28)],
    'visit': [('basics',33),('basics',34),('basics',35),('basics',36)],
    'household': [('modules',82),('modules',84),('modules',85),('modules',87)],
    'services': [('modules',107),('modules',108),('modules',113),('modules',114)],
    'feedback': [('modules',115),('modules',116),('modules',120),('modules',139)],
}
for name, items in groups.items():
    canvas = Image.new('RGB', (1700,2440), 'white'); draw = ImageDraw.Draw(canvas)
    for i,(key,p) in enumerate(items):
        img = Image.open(OUT/f'{key}-review-{p:03}.png').convert('RGB')
        img.thumbnail((830,1180))
        x,y=(i%2)*850,(i//2)*1220
        draw.text((x+8,y+5),f'{key} PDF page {p}',fill='black')
        canvas.paste(img,(x+8,y+25))
    canvas.save(OUT/f'review-sheet-{name}.jpg')
print('Rendered four forms and seven focused review sheets')
