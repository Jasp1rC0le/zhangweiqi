"""Offline receipt from saved public HTML; never fetches, logs in or publishes."""
from hashlib import sha256
from html.parser import HTMLParser
import json
from pathlib import Path
from urllib.parse import parse_qs, urljoin, urlsplit

ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = ROOT / '.local/research/noon-2026-10-13'
CATALOGS = [
    ('scores-2025-undergraduate-directory.html', '1825', '2025普通高考本科', '3946585'),
    ('scores-2025-vocational-directory.html', '1824', '2025普通高考高职', '3946563'),
    ('scores-2024-undergraduate-directory.html', '1740', '2024普通高考本科', '3939084'),
    ('scores-2024-vocational-directory.html', '1739', '2024普通高考高职', '3939064'),
    ('scores-2023-directory.html', '1736', '2023秋季高考及2024选考要求', '3939033'),
    ('scores-2022-directory.html', '1733', '2022普通高考', '3939010'),
    ('scores-2021-directory.html', '1730', '2021普通高考', '3938989'),
]
INDEXES = [
    ('scores-index.html', 'https://zs.tsguas.edu.cn/lnfscx.htm'),
    ('scores-page2.html', 'https://zs.tsguas.edu.cn/lnfscx/2.htm'),
    ('scores-page3.html', 'https://zs.tsguas.edu.cn/lnfscx/1.htm'),
]


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.current = None

    def handle_starttag(self, tag, attributes):
        if tag == 'a':
            attrs = dict(attributes)
            self.current = {'href': attrs.get('href', ''), 'parts': []}
            self.links.append(self.current)

    def handle_endtag(self, tag):
        if tag == 'a':
            self.current = None

    def handle_data(self, value):
        if self.current is not None:
            self.current['parts'].append(value)


def read_snapshot(filename):
    path = ARCHIVE / filename
    data = path.read_bytes()
    if len(data) > 2 * 1024 * 1024:
        raise ValueError('Snapshot exceeds bounded HTML size')
    parser = Links()
    parser.feed(data.decode('utf-8'))
    return parser.links, {'archive': str(path.relative_to(ROOT)), 'sha256': sha256(data).hexdigest()}


def download_rows(links, source, sample_id):
    rows, seen = [], set()
    for link in links:
        absolute = urljoin(source, link['href'])
        url = urlsplit(absolute)
        if url.scheme != 'https' or url.hostname != 'zs.tsguas.edu.cn' or url.username or url.password:
            continue
        if url.path != '/system/_content/download.jsp':
            continue
        params = parse_qs(url.query)
        identifier = params.get('wbfileid', [''])[0]
        owner = params.get('owner', [''])[0]
        if not identifier.isdigit() or owner != '2036629888' or identifier in seen:
            continue
        label = ''.join(link['parts']).strip()
        if not label.endswith('.xlsx'):
            continue
        seen.add(identifier)
        rows.append({'file': label, 'url': absolute, 'fileId': identifier,
                     'downloaded': False, 'valuesReviewed': False,
                     'observedAccess': 'captcha_required' if identifier == sample_id else 'not_opened'})
    return rows


def inventory():
    catalogs, index_rows = [], []
    for filename, article, label, sample in CATALOGS:
        source = f'https://zs.tsguas.edu.cn/info/1015/{article}.htm'
        links, archive = read_snapshot(filename)
        files = download_rows(links, source, sample)
        if not files or not any(row['fileId'] == sample for row in files):
            raise ValueError('Expected observed sample link missing')
        catalogs.append({'label': label, 'sourceUrl': source, **archive, 'files': files})
    unique_articles = {}
    for filename, source in INDEXES:
        links, archive = read_snapshot(filename)
        articles = {}
        for link in links:
            target = urljoin(source, link['href'])
            url = urlsplit(target)
            if url.scheme == 'https' and url.hostname == 'zs.tsguas.edu.cn' and url.path.startswith('/info/1015/'):
                articles[target] = ' '.join(''.join(link['parts']).split())
        unique_articles.update(articles)
        index_rows.append({'url': source, **archive, 'observedArticleLinks': len(articles)})
    return {'checkedAt': '2026-10-13', 'scope': '公开网页原始快照与下载入口台账，不等附件正文已收齐',
            'currentIndexSnapshots': index_rows, 'uniqueObservedIndexArticles': len(unique_articles),
            'articles': [{'url': url, 'label': label} for url, label in unique_articles.items()],
            'attachmentLinks': sum(len(c['files']) for c in catalogs), 'captchaSamples': len(catalogs),
            'catalogs': catalogs, 'allAttachmentsDownloaded': False, 'publicKnowledgeWrittenByScript': False}


def markdown(result):
    lines = ['# 招生分省附件待补原件', '',
             f"实际原始网页提取到 {result['attachmentLinks']} 个不同附件入口；7个天津样本要求验证码。其余入口尚未逐个打开，不把它们冒称全部验证过。",
             '优先补2025天津本科、高职原件；旧年份可后续补。只需正常下载后上传，不需要提供学校账号、密码或验证码图片。', '',
             '此清单只记录学校公开统计文件，不录考生名单。文件未取得，不填分数、不从咨询估计值冒充正式录取数据。', '']
    for catalog in result['catalogs']:
        lines.extend([f"## {catalog['label']}（{len(catalog['files'])}份）", '',
                      f"[官方原文目录]({catalog['sourceUrl']})", ''])
        rows = sorted(catalog['files'], key=lambda row: ('天津' not in row['file'], row['file']))
        lines.extend(f"- [{row['file']}]({row['url']})" for row in rows)
        lines.append('')
    return '\n'.join(lines) + '\n'


def write_generated(path, value):
    if path.exists() and path.read_text() != value:
        raise FileExistsError(f'Preserve existing receipt: {path}')
    if not path.exists():
        path.write_text(value)


if __name__ == '__main__':
    result = inventory()
    json_path = ROOT / 'docs/research/admission-attachment-inventory-2026-10-13.json'
    markdown_path = ROOT / 'docs/research/admission-pending-attachments-2026-10-13.md'
    write_generated(json_path, json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    write_generated(markdown_path, markdown(result))
    print(json.dumps({'indexArticles': result['uniqueObservedIndexArticles'],
                      'attachmentLinks': result['attachmentLinks'],
                      'catalogCounts': [len(c['files']) for c in result['catalogs']],
                      'samples': result['captchaSamples'], 'valuesImported': False,
                      'json': str(json_path), 'links': str(markdown_path)}, ensure_ascii=False))
