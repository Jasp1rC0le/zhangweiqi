"""Capture the explicitly requested public-source gaps, never log in or import.

Bounded requests, no credentials, no CAPTCHA handling, no guessed download URLs.
Generated evidence is separate from manually reviewed publication content.
"""
import hashlib
import json
import re
import subprocess
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.local/research/policy-final-2026-10-10'
ATTACHMENTS = [
    ('学士学位授予工作细则', '2035/5252', '3944679'),
    ('高职学生学籍管理规定修订', '2035/5251', '3944678'),
    ('退役复学部分课程免修办法', '2034/5194', '3930715'),
    ('复学申请表', '2034/5190', '3930683'),
    ('休学申请表', '2034/5183', '3930676'),
    ('退学申请表', '2034/5192', '3930684'),
]


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.current = None
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            self.current = [dict(attrs).get('href', ''), '']

    def handle_data(self, data):
        if self.current is not None:
            self.current[1] += data

    def handle_endtag(self, tag):
        if tag == 'a' and self.current is not None:
            self.links.append(tuple(self.current))
            self.current = None


def fetch(url, target):
    result = subprocess.run(
        ['curl', '--max-time', '12', '--connect-timeout', '5', '-sS', '-L',
         '--max-redirs', '3', '-o', str(target), '-w', '%{http_code}|%{content_type}', url],
        capture_output=True, timeout=16, text=True,
    )
    data = target.read_bytes() if target.exists() else b''
    status = result.stdout.split('|')[0]
    content_type = result.stdout.split('|')[-1]
    text = data.decode('utf-8', errors='replace')
    if result.returncode:
        state = 'fetch_failed'
    elif status in ('401', '403'):
        state = 'access_blocked'
    elif '验证码' in text or '请输入校验码' in text:
        state = 'captcha_required'
    elif status != '200':
        state = 'http_error'
    elif data.startswith(b'%PDF') or data.startswith(b'PK') or data.startswith(bytes.fromhex('d0cf11e0')):
        state = 'downloaded_unreviewed'
    else:
        state = 'html_not_attachment'
    return {'url': url, 'state': state, 'httpStatus': status,
            'contentType': content_type, 'bytes': len(data),
            'sha256': hashlib.sha256(data).hexdigest(), 'curlExit': result.returncode}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    attachments = []
    for title, page, file_id in ATTACHMENTS:
        url = ('https://jwc.tsguas.edu.cn/system/_content/download.jsp?'
               'owner=1178850125&urltype=news.DownloadAttachUrl&wbfileid=' + file_id)
        row = fetch(url, OUT / ('attachment-' + file_id + '.response'))
        row.update(title=title, pageUrl='https://jwc.tsguas.edu.cn/info/' + page + '.htm',
                   reviewed=False, imported=False)
        attachments.append(row)
        print(title, row['state'], row['httpStatus'], row['contentType'], flush=True)
    pages = []
    articles = {}
    for i, suffix in [(1, '.htm'), (2, '/2.htm'), (3, '/1.htm')]:
        url = 'https://cxcyzx.tsguas.edu.cn/cyfh/zckj' + suffix
        path = Path('/tmp/campthink-incubator-page' + str(i) + '.html')
        raw = path.read_bytes()
        parser = Links()
        parser.feed(raw.decode('utf-8'))
        links = [{'url': urljoin(url, h), 'title': t.strip()} for h, t in parser.links if '/info/' in h]
        for link in links:
            articles.setdefault(link['url'], link)
        pages.append({'url': url, 'listedLinks': len(links), 'sha256': hashlib.sha256(raw).hexdigest()})
        (OUT / ('incubator-page' + str(i) + '.html')).write_bytes(raw)
    evidence = {'checkedAt': '2026-10-10', 'attachments': attachments, 'pagination': {
        'pages': pages, 'uniqueArticleCount': len(articles), 'articles': list(articles.values()),
        'boundary': '全部3个目录页已读；列表高度重叠，去重后计数，不等于每篇正文和附件已读'
    }}
    (OUT / 'capture.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n')
    print('pagination', len(articles), 'unique articles')


if __name__ == '__main__':
    main()
