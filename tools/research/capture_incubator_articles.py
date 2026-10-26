"""Capture only previously observed public article URLs; never publish or log in."""
import hashlib
import json
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from threading import Event
from urllib.parse import urljoin, urlsplit

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.local/research/policy-final-2026-10-10/articles'
STOP = Event()


class ArticleBody(HTMLParser):
    def __init__(self):
        super().__init__()
        self.depth = 0
        self.target_depth = None
        self.ignore_depth = None
        self.parts = []
        self.images = []
        self.links = []
        self.found = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        void = tag in ('br', 'img', 'hr', 'meta', 'input', 'link', 'source', 'wbr')
        if not void:
            self.depth += 1
        marker = attrs.get('id', '') + ' ' + attrs.get('class', '')
        if self.target_depth is None and ('v_news_content' in marker or 'vsb_content' in marker):
            self.target_depth = self.depth
            self.found = True
        if self.target_depth is not None:
            if tag in ('script', 'style'):
                self.ignore_depth = self.depth
            if tag == 'img' and attrs.get('src'):
                self.images.append(attrs['src'])
            if tag == 'a' and attrs.get('href'):
                self.links.append(attrs['href'])
            if tag in ('p', 'br', 'tr', 'div'):
                self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in ('br', 'img', 'hr', 'meta', 'input', 'link', 'source', 'wbr'):
            return
        if self.ignore_depth == self.depth:
            self.ignore_depth = None
        if self.target_depth == self.depth:
            self.target_depth = None
        self.depth = max(0, self.depth - 1)

    def handle_data(self, data):
        if self.target_depth is not None and self.ignore_depth is None:
            self.parts.append(data)

    def text(self):
        return '\n'.join(line.strip() for line in ''.join(self.parts).splitlines() if line.strip())


def capture(row):
    url = row['url']
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.hostname != 'cxcyzx.tsguas.edu.cn' or not re.fullmatch(r'/info/1010/\d+\.htm', parsed.path):
        raise ValueError('Not an observed in-scope public article: ' + url)
    item = dict(row, reviewed=False)
    if STOP.is_set():
        return dict(item, status='not_attempted_after_access_block')
    name = parsed.path.rsplit('/', 1)[-1]
    path = OUT / name
    result = subprocess.run(['curl', '--max-time', '12', '--connect-timeout', '5',
                             '-sS', '--max-filesize', '2000000', '-o', str(path),
                             '-w', '%{http_code}|%{content_type}', url],
                            capture_output=True, text=True, timeout=16)
    status = result.stdout.split('|')[0]
    raw = path.read_bytes() if path.exists() else b''
    html = raw.decode('utf-8', errors='replace')
    item.update(httpStatus=status, bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest(),
                localPath=str(path.relative_to(ROOT)))
    if status in ('401', '403') or '请输入验证码' in html:
        STOP.set()
        return dict(item, status='access_blocked')
    if result.returncode or status != '200':
        return dict(item, status='fetch_failed')
    parser = ArticleBody()
    parser.feed(html)
    body = parser.text()
    item.update(status='text_captured_unreviewed' if parser.found and body else 'body_not_found',
                text=body, images=[urljoin(url, x) for x in parser.images],
                bodyLinks=[urljoin(url, x) for x in parser.links])
    print(name, item['status'], len(body), flush=True)
    return item


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    evidence = json.loads((ROOT / 'docs/research/policy-final-evidence-2026-10-10.json').read_text())
    done = {r['url'] for r in evidence['articleChecks'] if r['status'] == 'full_text_reviewed'}
    rows = [r for r in evidence['pagination']['articles'] if r['url'] not in done]
    with ThreadPoolExecutor(max_workers=2) as executor:
        captured = list(executor.map(capture, rows))
    payload = {'capturedAt': datetime.now().astimezone().isoformat(), 'rows': captured,
               'boundary': '下载和抽取成功不等于人工核读；图片和链接附件另核，不能据此自动发布'}
    (OUT / 'capture.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
    print('Captured', len(captured), 'articles; characters', sum(len(r.get('text', '')) for r in captured))


if __name__ == '__main__':
    main()
