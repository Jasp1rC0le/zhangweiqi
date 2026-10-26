"""Build a reviewable import pack. This never contacts the knowledge API."""
import hashlib
import json
import shutil
from pathlib import Path
from urllib.parse import urljoin
from complete_policy_sources import Links

ROOT = Path(__file__).resolve().parents[2]
RESEARCH = ROOT / 'docs/research'
ASSETS = [
    ('campthink-aero-contact.png', 'https://htxy.tsguas.edu.cn/__local/0/BA/5E/701B7A75B4B05F44421B39654E9_815774EF_19D60.png', '学院办公室与公开联系方式，新增入库'),
    ('campthink-art-elective.png', 'https://ysx.tsguas.edu.cn/__local/B/F2/FC/B7FF9C214B9CE182020594B8611_88CBA5DD_10F93.png', '本学期选修课通知封面'),
    ('campthink-elective-2.png', 'https://ysx.tsguas.edu.cn/__local/9/64/B8/E139B34E49E57F13AB76EC306ED_E0CF4FE4_18A6F.png', '对象与三轮时间、退课保护、每学期上限'),
    ('campthink-elective-3.png', 'https://ysx.tsguas.edu.cn/__local/1/2B/D0/392249813F7FB7F522F2453580A_0CD20808_237E2.png', '分学历模块学分、系统入口、补选限制'),
    ('campthink-elective-4.png', 'https://ysx.tsguas.edu.cn/__local/D/60/43/FC5C5E92991676420B490A675B9_96C83768_138AC.png', '学院选课联系方式和线上线下学习方式'),
    ('campthink-calendar.jpg', 'https://www.tsguas.edu.cn/__local/E/D3/31/D87E1105C0E387676FDC61A668A_1ACCF7A6_200B5.jpg', '已看图，2025—2026第二学期历史校历；不覆盖2026秋季资料'),
    ('campthink-innovation-intro.png', 'https://cxcyzx.tsguas.edu.cn/__local/1/A5/ED/15D81A9DB8E8DB670B2E350FD65_1DB4D7B9_C7DAC.png', '已看图，机构宣传简介，不重复发布咨询条目'),
]


def build():
    review = json.loads((RESEARCH / 'policy-final-review-2026-10-10.json').read_text())
    revision = review['revision']
    base = json.loads((ROOT / revision['baseFile']).read_text())
    prior = next(d for d in base['documents'] if d['key'] == revision['baseKey'])
    revised = {k: prior[k] for k in ('category', 'publisher', 'sourceUrl', 'publishedAt', 'expiresAt')}
    revised.update(key='student-handbook-complete-review-2025', title=revision['title'],
                   supersedesDocumentId=revision['supersedesDocumentId'],
                   content=prior['content'] + revision['appendContent'])
    docs = [revised, *review['documents'], review['additionalDocument']]
    for doc in docs:
        doc['sha256'] = hashlib.sha256(doc['content'].encode()).hexdigest()
    return {'schemaVersion': 1, 'checkedAt': '2026-10-10', 'environment': 'local-only',
            'publicationStatus': 'prepared-not-proof-of-published', 'documents': docs}


def evidence():
    target = ROOT / '.local/research/policy-final-2026-10-10'
    captured = json.loads((target / 'capture.json').read_text())
    captured['normalDownloadFlow'] = {
        'userAuthorizedCaptcha': True,
        'authorizationScope': '仅6份公开教务附件，正常验证码下载，不登录教务账号',
        'observedAt': '2026-10-10T09:47:00+08:00',
        'result': 'browser_timeout_before_captcha_input',
        'captchaCompleted': False,
        'filesDownloaded': 0,
        'note': '普通下载页已有标签，但页面状态读取持续超时；授权不等于已完成下载。未绕过验证，未输入教务凭据。',
    }
    review = json.loads((RESEARCH / 'policy-final-review-2026-10-10.json').read_text())
    article_capture = json.loads((target / 'articles/capture.json').read_text())
    approved = set(review['paginationAdditionalReview']['bodyTextReviewedIds'])
    selected = set(review['paginationAdditionalReview']['newKnowledgeSourceIds'])
    captured['additionalArticleChecks'] = []
    for row in article_capture['rows']:
        article_id = int(row['url'].rsplit('/', 1)[-1].split('.')[0])
        if article_id not in approved or row['status'] != 'text_captured_unreviewed':
            raise ValueError('Article needs manual review: ' + row['url'])
        captured['additionalArticleChecks'].append({
            'url': row['url'], 'title': row['title'], 'status': 'full_text_reviewed',
            'sha256': row['sha256'], 'characters': len(row['text']),
            'localPath': row['localPath'], 'bodyImageUrls': row['images'],
            'bodyImagesReviewed': False, 'bodyLinks': row['bodyLinks'],
            'disposition': '跨专业历史实践主题来源' if article_id in selected else '历史新闻/宣传/与已有咨询重复，保留证据，不单篇新增',
        })
    assets = []
    for name, url, disposition in ASSETS:
        source = Path('/tmp') / name
        raw = source.read_bytes()
        shutil.copyfile(source, target / name)
        assets.append({'url': url, 'localPath': str((target / name).relative_to(ROOT)),
                       'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
                       'visuallyReviewed': True, 'disposition': disposition})
    captured['images'] = assets
    captured['articleChecks'] = [
        {'url': 'https://cxcyzx.tsguas.edu.cn/info/1010/3233.htm', 'status': 'full_text_reviewed', 'disposition': '新增本届历史检查流程，附件一二未取得'},
        {'url': 'https://cxcyzx.tsguas.edu.cn/info/1010/3021.htm', 'status': 'full_text_reviewed', 'disposition': '历史讲座报道，不是官方评分细则'},
        {'url': 'https://cxcyzx.tsguas.edu.cn/info/1010/2986.htm', 'status': 'full_text_reviewed', 'disposition': '已有#67覆盖咨询功能，不重复导入'},
        {'url': 'https://cxcyzx.tsguas.edu.cn/info/1010/2850.htm', 'status': 'partial_text_reviewed', 'disposition': '2024启动报道，不将当时扶持承诺当作当前权益'},
        {'url': 'https://jxjy.tsguas.edu.cn/info/1029/1332.htm', 'status': 'full_text_reviewed', 'disposition': '新增缴费票据摘要，不公开初始密码规则'},
        {'url': 'https://ysx.tsguas.edu.cn/info/1147/3176.htm', 'status': 'all_four_body_images_reviewed', 'disposition': '新增本学期选修课规则'},
    ]
    captured['boundaries'] = [
        '6份教务附件均HTTP200但返回验证码HTML，不是附件下载成功；不绕过验证码，不用旧汇编代替',
        '众创空间目录3页共79个链接出现次数，47个唯一正文URL；3篇此前已读、44篇本批补读，文字正文47篇均核读，新闻配图及关联附件不能因此算完成',
        '7张正文图片已看，新闻配图未因此全部核读；全校其他栏目和下载附件仍有待处理内容',
        '旧校历、宣传简介、重复新闻保留证据但不增加知识库噪声',
    ]
    pages = []
    for row in captured['attachments']:
        pages.append({'url': row['url'], 'status': row['state'], 'textWindowComplete': False,
                      'note': '正常下载返回验证码HTML，未解决验证码，未读正文'})
    for i, page in enumerate(captured['pagination']['pages'], 1):
        parser = Links()
        parser.feed((target / ('incubator-page' + str(i) + '.html')).read_text())
        pages.append({'url': page['url'], 'status': 'text_verified', 'textWindowComplete': True,
                      'note': '仅目录文本核验，不代表全部子文章或附件已读',
                      'discoveredLinks': [{'url': urljoin(page['url'], h), 'label': t.strip()}
                                          for h, t in parser.links if '/info/' in h]})
    for image in assets:
        pages.append({'url': image['url'], 'status': 'image_verified', 'note': image['disposition']})
    for row in captured['articleChecks']:
        pages.append({'url': row['url'], 'status': row['status'],
                      'textWindowComplete': row['status'] == 'full_text_reviewed', 'note': row['disposition']})
    for row in captured['additionalArticleChecks']:
        pages.append({'url': row['url'], 'status': 'full_text_reviewed',
                      'textWindowComplete': True, 'note': row['disposition'] + '；配图未逐图审阅'})
    pages.append({'url': 'https://xsgz.tsguas.edu.cn/info/1013/2629.htm', 'status': 'text_verified',
                  'textWindowComplete': True, 'note': '公开PDF226页全部核读，旧年条款按版本保留；6份教务独立附件不因此算完成'})
    captured['pages'] = pages
    return captured


if __name__ == '__main__':
    pack = build()
    path = RESEARCH / 'policy-final-import-pack-2026-10-10.json'
    path.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + '\n')
    (RESEARCH / 'policy-final-evidence-2026-10-10.json').write_text(json.dumps(evidence(), ensure_ascii=False, indent=2) + '\n')
    print(json.dumps([{'key': d['key'], 'characters': len(d['content']),
                       'supersedes': d.get('supersedesDocumentId')} for d in pack['documents']], ensure_ascii=False))
