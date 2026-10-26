"""Read a bounded set of observed official pages; no authentication or publication."""
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
import json
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError
from html.parser import HTMLParser
from capture_incubator_articles import ArticleBody

class PublicPage(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts, self.title_parts, self.links = [], [], []
        self.ignored, self.in_title, self.current_link = 0, False, None
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        if tag in ('script','style','noscript'): self.ignored+=1
        if tag=='title': self.in_title=True
        if tag=='a' and attrs.get('href'):
            self.current_link=dict(label='',href=attrs['href'])
            self.links.append(self.current_link)
    def handle_endtag(self, tag):
        if tag in ('script','style','noscript'): self.ignored=max(0,self.ignored-1)
        if tag=='title': self.in_title=False
        if tag=='a': self.current_link=None
    def handle_data(self,data):
        if not self.ignored and data.strip():
            self.parts.append(data.strip())
            if self.in_title: self.title_parts.append(data.strip())
            if self.current_link is not None: self.current_link['label']+=data.strip()

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.local/research/safety-delivered-2026-10-10/public-followup'
TARGETS = [
    ('hq-notices', 'https://hqjj.tsguas.edu.cn/tzgg.htm'),
    ('hq-organization', 'https://hqjj.tsguas.edu.cn/bmgk/jgsz.htm'),
    ('hq-service', 'https://hqjj.tsguas.edu.cn/info/1007/2986.htm'),
    ('card-notices', 'https://cwsj.tsguas.edu.cn/ykt/tzgg.htm'),
    ('student-service', 'https://www.tsguas.edu.cn/info/1158/2546.htm'),
    ('archive-faq', 'https://zhda.tsguas.edu.cn/nwwd/nwwd.htm'),
    ('library-8411', 'https://tsg.tsguas.edu.cn/info/5602/8411.htm'),
    ('library-8414', 'https://tsg.tsguas.edu.cn/info/5602/8414.htm'),
    ('teacher-overseas', 'https://jwc.tsguas.edu.cn/info/1887/5348.htm'),
]

def read(target):
    key, url = target
    item=dict(url=url,key=key,checkedAt='2026-10-10',textWindowComplete=False)
    try:
        with urlopen(Request(url, headers={'User-Agent':'Campthink-Public-Source-Review/1.0'}),timeout=12) as response:
            final_url=response.url
            if final_url.split('/')[2].split(':')[0].endswith('.tsguas.edu.cn') is False:
                raise ValueError('Redirected outside school; not read')
            data=response.read(3*1024*1024+1)
            if len(data)>3*1024*1024: raise ValueError('Page over size limit')
            media=response.headers.get_content_type()
        if media not in ('text/html','application/xhtml+xml'): raise ValueError('Not a public HTML page')
        html=data.decode('utf-8',errors='replace')
        parser=PublicPage()
        parser.feed(html)
        title=' '.join(parser.title_parts)
        if '验证码' in title or '统一身份认证' in title:
            item.update(status='normal_access_required',title=title)
            return item
        # Preserve the full page text and separately identify common university article bodies.
        article=ArticleBody()
        article.feed(html)
        body=article.text() if article.found else '\n'.join(parser.parts)
        target_path=OUT/f'{key}.html'
        if target_path.exists() and sha256(target_path.read_bytes()).digest()!=sha256(data).digest():
            raise ValueError('Different local archive exists; preserve it')
        target_path.write_bytes(data)
        (OUT/f'{key}.txt').write_text(body)
        links=parser.links
        item.update(status='downloaded_pending_review',title=title,finalUrl=final_url,
                    sha256=sha256(data).hexdigest(),archive=str(target_path.relative_to(ROOT)),
                    bodyArchive=str((OUT/f'{key}.txt').relative_to(ROOT)),chars=len(body),links=links)
    except (HTTPError,URLError,TimeoutError,ValueError) as exc:
        item.update(status='read_failed',error=type(exc).__name__,detail=str(exc)[:240])
    return item

if __name__=='__main__':
    OUT.mkdir(parents=True,exist_ok=True)
    with ThreadPoolExecutor(max_workers=3) as pool:
        rows=list(pool.map(read,TARGETS))
    (OUT/'fetch-evidence.json').write_text(json.dumps(dict(pages=rows),ensure_ascii=False,indent=2)+'\n')
    print(json.dumps([{k:v for k,v in row.items() if k!='links'} for row in rows],ensure_ascii=False,indent=2))
