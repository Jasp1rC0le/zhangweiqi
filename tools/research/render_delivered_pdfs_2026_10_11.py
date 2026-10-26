"""Render exact received PDFs for inspection; never infer a human review."""
import json
from pathlib import Path
import pypdfium2 as pdfium

ROOT = Path(__file__).resolve().parents[2]
manifest_path = ROOT / '.local/research/delivered-2026-10-11/extraction.json'
manifest = json.loads(manifest_path.read_text())
for row in manifest['files']:
    original = ROOT / row['archive']
    if original.suffix.lower() != '.pdf':
        continue
    paths = []
    with pdfium.PdfDocument(original) as document:
        if len(document) > 40:
            raise ValueError('Unexpected received PDF page count')
        for index in range(len(document)):
            output = original.with_name(f'{original.stem}-page-{index + 1}.png')
            if not output.exists():
                document[index].render(scale=1.5).to_pil().save(output)
            paths.append(str(output.relative_to(ROOT)))
    row['renderedPages'] = paths
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print(json.dumps([{'key': row['key'], 'renderedPages': len(row['renderedPages'])}
                  for row in manifest['files'] if row.get('renderedPages')]))
