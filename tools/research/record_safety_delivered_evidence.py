"""Reconcile reviewed public attachments with the prior queue, without publishing."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
LOCAL=ROOT/'.local/research/safety-delivered-2026-10-10'
rows=json.loads((LOCAL/'extraction.json').read_text())
previous=json.loads((ROOT/'docs/research/library-lab-evidence-2026-10-10.json').read_text())
assert len(rows)==len(previous['accessBlockers'])==7
pages=[]
for file,blocker in zip(rows,previous['accessBlockers']):
    suffix=Path(file['archive']).suffix.lstrip('.')
    pages.append(dict(url=blocker['url'],status='attachment_reviewed_from_user_copy',
        textWindowComplete=True,evidence=f"public_{suffix}_reviewed_sha256:{file['sha256']}",
        archive=file['archive'],title=file['file'],physicalPages=file['pages'],
        note='用户提供的公开空白原件，全文核读；保留此前验证码历史，不声称自动下载成功'))
    file['reviewed']=True
    file['reviewNote']='全文已核读；PDF全页已渲染并抽查25页，4份Word转换渲染共7页已核对'
payload=dict(schemaVersion=1,checkedAt='2026-10-10',allSiteLinksExhausted=False,
    wholeSiteDenominatorKnown=False,pages=pages,
    qualityBoundaries=['手册封面2026年01月优先于含250110的文件名',
      '健康驿站在2026功能模块手册明确停用；不发布旧隔离流程',
      '教职工监控查询章节疑似复制其他业务文字，不据此生成规则',
      '2024届户籍表只作历史字段参考；不替换年份冒充现行政策',
      '手册示例身份、人员名单及内部安保细节不进入公共摘要'],
    visualReview=dict(pdfPhysicalPages=212,pdfPagesRendered=212,pdfPagesInspected=25,
       wordFiles=4,wordRenderedPages=7,legacyDocBlankLastPage=True,
       renderer='PDFium; LibreOffice with macOS CJK fonts',
       caveat='不是212页逐页视觉验收；全文文本核读和抽样图像复核分开记录'))
(LOCAL/'reviewed-extraction.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
(ROOT/'docs/research/safety-delivered-evidence-2026-10-10.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n')
print('7 reviewed originals reconciled; remote access history retained')
