"""Synthetic media for OCR acceptance only. No user documents or recordings."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import sys

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
image = Image.new('RGB', (1400, 700), 'white')
draw = ImageDraw.Draw(image)
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 52)
for i, text in enumerate(['CAMPTHINK SYNTHETIC TEST', 'Library renewal: 15 days', 'Room A101 - Monday 08:30', 'Not an official school policy']):
    draw.text((80, 80 + i * 135), text, fill='black', font=font)
image.save(out / 'synthetic-ocr.png')
image.save(out / 'synthetic-scan.pdf', 'PDF', resolution=140)
print('Created two synthetic OCR fixtures.')
