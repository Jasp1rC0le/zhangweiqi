"""Archive observed public URLs with bounded requests; never authenticate or publish."""
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen
from urllib.error import URLError
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.local/research/library-lab-2026-10-10'
FILES = [
    ('search-notice.pdf', 'https://tsg.tsguas.edu.cn/__local/F/B9/76/19990A34014BA512DC5C1DF1ED8_0D6D207E_155DF.pdf', 'https://tsg.tsguas.edu.cn/info/5601/8360.htm'),
    ('search-manual.pdf', 'https://tsg.tsguas.edu.cn/__local/7/AC/CF/9982BFB8383CAFFF7EE1C04E6BF_56BFA0E8_354E95.pdf', 'https://tsg.tsguas.edu.cn/info/5601/8360.htm'),
    ('career-library.pdf', 'https://tsg.tsguas.edu.cn/__local/B/DF/50/DBAC02FAFBA90263C19DF9AAA8C_AC3EA91F_358A2.pdf', 'https://tsg.tsguas.edu.cn/info/5601/6863.htm'),
]

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    entries = []
    for name, url, parent in FILES:
        row = dict(url=url, parentUrl=parent, checkedAt='2026-10-10', textWindowComplete=False)
        try:
            with urlopen(url, timeout=25) as response:
                content = response.read(20 * 1024 * 1024 + 1)
            if not content.startswith(b'%PDF-'):
                raise ValueError('Not a PDF; no alternate download route attempted')
            if len(content) > 20 * 1024 * 1024:
                raise ValueError('Download size limit exceeded')
            target = OUT / name
            sha = hashlib.sha256(content).hexdigest()
            if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() != sha:
                raise ValueError('Existing archive differs; preserve for review')
            target.write_bytes(content)
            reader = PdfReader(target)
            pages = [p.extract_text(extraction_mode='layout') for p in reader.pages]
            (OUT / f'{name}.txt').write_text('\n\n'.join(f'PAGE {i+1}\n{text}' for i, text in enumerate(pages)))
            row.update(status='downloaded_pending_review', sha256=sha, pageCount=len(pages),
                       archive=str(target.relative_to(ROOT)), bytes=len(content))
        except (URLError, TimeoutError, ValueError) as error:
            row.update(status='fetch_failed', note=str(error)[:400])
        entries.append(row)
        print(json.dumps(row, ensure_ascii=False))
    (OUT / 'download-evidence.json').write_text(json.dumps(dict(entries=entries), ensure_ascii=False, indent=2)+'\n')

if __name__ == '__main__':
    main()
