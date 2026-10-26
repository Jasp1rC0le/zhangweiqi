"""Reconcile manually inspected sources, not an automatic publication or crawler."""
import hashlib
import json
from pathlib import Path
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'docs/research'
LOCAL = ROOT/'.local/research/safety-delivered-2026-10-10'
PUBLIC = LOCAL/'public-followup'

def load(path):
    return json.loads(path.read_text())

pages=[]
for name in ['fetch-evidence.json','card-fetch-evidence.json','service-catalog-fetch.json']:
    for row in load(PUBLIC/name)['pages']:
        reviewed=row['status']=='downloaded_pending_review'
        note='文字窗口已核读；只记录实际公开导航，不据此宣称子站完成'
        if row['key']=='student-service':
            reviewed=False
            note='包含大量旧学生应急联络个人手机号，停止逐人读取，不发布名单；不把下载成功算全文核读'
        elif row['key']=='teacher-overseas':
            reviewed=False
            note='正常直读HTML与浏览结果一致，官网正文自身止于不完整邮箱jwc@，不猜补、不发布该流程'
        elif row['key']=='hq-organization':
            note='正文组织图已目视核对；4科室名称可见，但旧处名不推断为当前改组信息'
        elif row['key']=='hq-service':
            note='两张正文菜谱/膳食建议图已目视核读，仅2026-10-08至10-10教工食堂，不当作学生食堂现售菜单，不新增短期噪声'
        elif row['key']=='library-8414':
            note='内嵌PDF10页全部文字与逐页图像核读，2026-07-21试用已结束，合并修订旧#23为#117'
        elif row['key']=='library-8411':
            note='AI知数试用同样至2026-07-21已结束，与CNKI AI一并修订#117'
        elif row['key'] in ['card-guide','archive-rules']:
            note='内容已有#64校园卡/#75归档说明，复核去重，不重复发布'
        entry=dict(url=row['url'],title=row.get('title'),status='text_verified' if reviewed else 'partial_or_excluded',
            textWindowComplete=reviewed,evidence='archived_public_html_sha256:'+row.get('sha256',''),note=note)
        # Store only observed public links, no guessed pagination or personal fields.
        entry['discoveredLinks']=[dict(url=urljoin(row['url'],link['href']),label=link['label'])
            for link in row.get('links',[]) if link.get('href','').strip()
            and not link['href'].startswith(('#','javascript:','mailto:','tel:'))]
        pages.append(entry)

media=load(PUBLIC/'media-evidence.json')
media_rows=media if isinstance(media,list) else media.get('files',media.get('media',[]))
for row in media_rows:
    path=ROOT/row.get('archive',row.get('path',''))
    if not path.is_file():
        path=PUBLIC/row['key'] if 'key' in row else path
    # Evidence schema is validated separately below; never fabricate a missing file hash.
    url=row.get('url')
    if url:
        pages.append(dict(url=url,status='media_visually_reviewed',textWindowComplete=True,
            evidence='public_media_sha256:'+row.get('sha256',''),
            note='3张后勤正文图或CNKI AI 10页PDF；已逐图核对，不含网站装饰图'))

for number in [2049,2050,2051,2052,2053,2018,2054,2055]:
    pages.append(dict(url=f'https://htxy.tsguas.edu.cn/info/1086/{number}.htm',
        status='text_verified',textWindowComplete=True,evidence='web_tool_complete_text_window',
        note='航空实验室8篇正文已核读并合并#116；设备介绍不是安全操作手册，配图未逐张核读'))
pages.append(dict(url='https://htxy.tsguas.edu.cn/rcpy/sy_j_s.htm',status='text_verified',textWindowComplete=True,
    evidence='web_tool_complete_text_window',note='当前8条1页，8篇文字已读；不代表学院其他栏目完成'))
for url in ['https://cwsj.tsguas.edu.cn/info/1014/1810.htm',
            'https://cwsj.tsguas.edu.cn/info/1014/1847.htm',
            'https://tsg.tsguas.edu.cn/info/5601/8362.htm',
            'https://tsg.tsguas.edu.cn/info/5601/8361.htm',
            'https://tsg.tsguas.edu.cn/info/5601/8164.htm',
            'https://tsg.tsguas.edu.cn/info/5605/8220.htm',
            'https://zhda.tsguas.edu.cn/info/1051/1383.htm',
            'https://cwsj.tsguas.edu.cn/info/1098/1766.htm',
            'https://jwc.tsguas.edu.cn/info/2035/5164.htm']:
    pages.append(dict(url=url,status='text_verified',textWindowComplete=True,
        evidence='web_tool_complete_text_window',note='完整文字核读；已列未取得附件边界，不复制宣传资源量、私人数据或作资格承诺'))

for filename,url,note in [
    ('library-hours-recheck.jpg','https://tsg.tsguas.edu.cn/__local/D/54/5C/F3700A5AAD50435B4EEBA41B3B5_6CD905DE_3D2FD.jpg','逐项重新目视核对，与#32时段一致，不能用仅含标题的抓取正文覆盖'),
    ('library-borrow-recheck.jpg','https://tsg.tsguas.edu.cn/__local/C/C9/35/E7C7470F4C3F46DCFF0B9AE147E_F1368D55_496B16.jpg','十条借阅规则逐项目视核对，与#33核心事实一致，保留封顶范围未明'),
    ('library-contact-recheck.jpg','https://tsg.tsguas.edu.cn/images/gokr/contract_03.jpg','仅有邮箱和公众号，无电话；修订#35为#123，不将原号码说成错误或停用')]:
    pages.append(dict(url=url,status='media_visually_reviewed',textWindowComplete=True,
        evidence='public_media_sha256:'+hashlib.sha256((LOCAL/filename).read_bytes()).hexdigest(),note=note))
pages.append(dict(url='https://zhda.tsguas.edu.cn/info/1051/1382.htm',status='fetch_failed',
    textWindowComplete=False,evidence='web_tool_error',note='未获取正文，保留缺口，不推断办理规则'))

handbook=load(OUT/'policy-final-review-2026-10-10.json')['handbook']
assert handbook['reviewedPagesTotal']==handbook['pageCount']==226
assert hashlib.sha256((ROOT/handbook['pdfPath']).read_bytes()).hexdigest()==handbook['sha256']
pages.append(dict(url='https://xsgz.tsguas.edu.cn/__local/5/5B/29/FFA266AA8175242C2F0B0E5FE8A_253DA1B3_431056.pdf',
    status='full_text_reviewed',textWindowComplete=True,
    evidence='previous_review_receipt_and_current_sha256:'+handbook['sha256'],
    note='对账既往226页全文核读回执与当前归档哈希，不是本次重新读226页；此前48页状态仅为历史进度'))

payload=dict(schemaVersion=1,checkedAt='2026-10-10',allSiteLinksExhausted=False,wholeSiteDenominatorKnown=False,
    pages=pages,privacyExcluded=['旧应急联络学生名单及个人手机号','手册示例账号与身份证、人脸、访客码','内部安保细节'],
    priorEvidenceReconciled=['policy-final-review-2026-10-10.json'],
    limitations=['官网导航仍有未解析链接、附件和部分院系分页','15个新验证码下载未取得','正常网页读取不等于服务登录联调'])
(OUT/'public-followup-evidence-2026-10-10.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n')

old=load(LOCAL/'before-30.json')
addition='''

2026-10-10复核官网英文站的校园道路说明
官网该页同时列有旧道路命名说明，未标明修订日期；以下是地标顺序参考，不是当前实测路径或卫星导航。
韵林路：官网写自百川西路经G1、G2至博文路，为东西向；可作为找体育中心周边道路的线索。
易慕道：自博文路经B、A、厚德路、H6、E7、M1至百川东路，为东西向；可作为图书馆与行政会议中心南侧周边路线的参考，但图纸及现场标牌可能有历史编号差异。
厚德路：官网写经F3、E1、E2、E3、雅馨路、A、易慕道、L、H1、H3，为南北向步行路；不据此承诺整段目前通行或无障碍。
博识路：鸿翔路经H2到百川南路；笃行路：鸿翔路经H2、H3到百川南路，两条均写为南北向。H2/H3附近问路先核对所在路牌，再确认要去的楼栋入口。
旧说明称H5为培训公寓，不据此否定用户反映H5-101有社区服务窗口，也不能证明该窗口当前办公时间。官网未标注图书馆或服务中心的即时开关门状态，具体开放时间使用对应部门通知。
原文：https://ev.tsguas.edu.cn/About_us/Maps_and_Travel.htm 。未经核实的楼号用途、施工绕行、校门开放与步行分钟数仍不编造。
'''
doc=dict(title=old['资料标题'],category=old['资料分类'],publisher=old['发布部门'],sourceUrl=old['原始链接'],
    publishedAt=old['发布时间'],effectiveAt=old['生效时间'],expiresAt='2026-11-10T00:00',
    supersedesDocumentId=30,content=(old['content']+addition).strip())
(OUT/'map-road-revision-2026-10-10.json').write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n')
print(f'{len(pages)} reconciled source observations; map revision prepared only')
