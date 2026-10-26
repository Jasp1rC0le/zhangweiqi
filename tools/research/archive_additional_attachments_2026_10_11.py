"""Receive exact user-supplied public files. Receipt is not extraction or publication."""
from pathlib import Path
import hashlib
import json
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.local/research/additional-2026-10-11'
FILES = [
    ('defence-2025', '关于开展2025届本科毕业论文（设计）答辩工作的通知+OK.zip', 'jwc',1178850125,3940108,'1887/5237'),
    ('exam-review-2026','2-附件：天津中德应用技术大学高职升本科专业课考试成绩复核申请表.pdf','zs',2036629888,3945738,'1008/1821'),
    ('exam-score-2026','1-天津中德应用技术大学2026年高职升本科专业课考试成绩查询的通知.pdf','zs',2036629888,3945737,'1008/1821'),
    ('new-student-hukou','新生户口常见问题及解答20260907.pdf','aqbw',1703757346,15087443,'1008/1720'),
    ('hukou-counsellors','附件2.+各学院负责学生户籍辅导员信息表.xlsx','aqbw',1703757346,15087396,'1004/1719'),
    ('hukou-guide','附件1.++“中德安全”小程序在校生落户功能使用手册.docx','aqbw',1703757346,15087395,'1004/1719'),
    ('hukou-notice','关于在校生户口迁移工作的通知+20260915.docx','aqbw',1703757346,15087394,'1004/1719'),
    ('fees-2026','收费公示（2026.4.29）.xlsx','cwsj',1178325157,3946860,'1098/1766'),
]
OUT.mkdir(exist_ok=True)
receipt_path = ROOT/'docs/research/additional-attachments-received-2026-10-11.json'
previous = json.loads(receipt_path.read_text()) if receipt_path.exists() else {}
previous_files = {row['sha256']: row for row in previous.get('files', [])}
rows=[]
for key,name,host,owner,file_id,parent in FILES:
    source=Path('/Users/zhangweiqi/Downloads')/name
    size=source.stat().st_size
    if size<=0 or size>50*1024*1024: raise ValueError('Unexpected received file size')
    digest=hashlib.sha256(source.read_bytes()).hexdigest()
    target=OUT/(key+source.suffix.lower())
    if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest()!=digest: raise ValueError('Different archived original; preserve both')
    if not target.exists(): shutil.copy2(source,target)
    row={'key':key,'name':name,'bytes':size,'sha256':digest,'archive':str(target.relative_to(ROOT)),
         'sourceUrl':f'https://{host}.tsguas.edu.cn/info/{parent}.htm',
         'downloadUrl':f'https://{host}.tsguas.edu.cn/system/_content/download.jsp?owner={owner}&urltype=news.DownloadAttachUrl&wbfileid={file_id}',
         'received':True,'extracted':False,'humanReviewed':False,'published':False}
    if target.suffix=='.zip':
        with zipfile.ZipFile(target) as archive:
            entries=archive.infolist()
            if len(entries)>50 or sum(e.file_size for e in entries)>100*1024*1024: raise ValueError('Unexpected ZIP size')
            for e in entries:
                path=Path(e.filename)
                if path.is_absolute() or '..' in path.parts or (e.external_attr>>16)&0o170000==0o120000: raise ValueError('Unsafe ZIP entry')
            row['zipMembers']=[{'name':e.filename,'bytes':e.file_size} for e in entries]
            row['note']='同时提供的解压文件夹不另算新资料；待内容哈希去重后核读，不自动解压或执行'
    # Receipt reruns must not erase extraction, human review or publication evidence.
    retained = previous_files.get(digest, {})
    row = {**row, **retained, 'received': True}
    rows.append(row)
published_ids = {r['documentId'] for r in rows if r.get('published') and r.get('documentId')}
receipt={**previous,'checkedAt':'2026-10-11','receivedOriginalCount':len(rows),'publicationCount':len(published_ids),'files':rows,
         'note':'此前8个验证码待交文件已由用户补齐原件；归档不等于全文核读或上线。纯活动不入库；年度办理窗口不得冒充当前期限；辅导员私人联系方式不直接公开。'}
receipt_path.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'received':len(rows),'published':receipt['publicationCount'],'totalBytes':sum(r['bytes'] for r in rows)},ensure_ascii=False))
