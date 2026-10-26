"""Render public library PDFs to contact sheets for visual reading."""
import subprocess
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw

folder = Path(__file__).resolve().parents[2] / '.local/research/library-lab-2026-10-10'
files = []
for name in ['search-manual', 'career-library', 'search-notice']:
    subprocess.run(['pdftoppm', '-scale-to', '1200', '-png', str(folder/f'{name}.pdf'), str(folder/name)], check=True, timeout=75)
    files.extend(sorted(folder.glob(f'{name}-*.png')))
for offset in range(0, len(files), 6):
    sheet = Image.new('RGB', (1260, 1240), 'white')
    for index, file in enumerate(files[offset:offset+6]):
        x, y = index % 3 * 420, index // 3 * 620
        sheet.paste(ImageOps.contain(Image.open(file), (410, 590)), (x, y+24))
        ImageDraw.Draw(sheet).text((x, y), file.stem, fill='black')
    sheet.save(folder / f'review-sheet-{offset//6+1}.png')
print(f'Rendered {len(files)} pages to {(len(files)+5)//6} sheets')
