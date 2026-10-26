"""Assemble observed admin/UI/test evidence. No authentication or DB access."""
import hashlib
import json
import re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/research'
LOCAL=ROOT/'.local/research/safety-delivered-2026-10-10'
def load(path):
    return json.loads(path.read_text())
def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

documents=[]
for number in range(101,108):
    row=load(LOCAL/f'readback-{number}.json')
    assert all(row['check'][k] for k in ['contentMatches','titleMatches','sourceMatches'])
    documents.append(dict(id=number,title=row['title'],sourceUrl=row['source'],body=row['body']))
row=load(LOCAL/'readback-108.json')
assert row['contentMatches']
documents.append(dict(id=108,body=row['body']))
for row in load(LOCAL/'teaching-readbacks.json'):
    assert row['bodyMatch'] and row['titleMatch'] and row['sourceMatch']
    documents.append(dict(id=row['id'],title=row['title'],sourceUrl=row['source'],body=row['body']))
for number in [112,115,116]:
    row=load(LOCAL/f'readback-{number}.json')
    assert row['verified']
    documents.append(dict(id=number,title=row['title'],body=row['content']))
for row in load(LOCAL/'teaching-more-readbacks.json'):
    assert row['verified']
    documents.append(dict(id=row['id'],title=row['title'],body=row['content']))
for number,name in [(117,'readback-117.json'),(118,'readback-118-normalized.json')]:
    row=load(LOCAL/name)
    assert row['bodyMatches']
    documents.append(dict(id=number,body=row['content']))
for row in load(LOCAL/'closeout-readbacks.json'):
    assert row['bodyMatches']
    doc=load(OUT/'service-closeout-pack-2026-10-10.json')['documents'][row['index']]
    documents.append(dict(id=row['id'],title=doc['title'],sourceUrl=doc['sourceUrl'],body=row['content']))
row=load(LOCAL/'readback-122.json')
assert row['bodyMatches']
documents.append(dict(id=122,body=row['content']))
row=load(LOCAL/'readback-123.json')
assert row['bodyMatches']
documents.append(dict(id=123,body=row['content'],title=row['title'],sourceUrl=row['sourceUrl']))
assert sorted(r['id'] for r in documents)==list(range(101,124))
supersedes={101:90,102:89,108:28,112:29,113:111,115:114,116:39,117:23,118:30,119:57,122:110,123:35}
for doc in documents:
    doc['bodySha256']=hashlib.sha256(doc.pop('body').encode()).hexdigest()
    doc['supersedesDocumentId']=supersedes.get(doc['id'])
    doc['currentInThisBatch']=doc['id'] not in [110,111,114]

evaluation=(LOCAL/'evaluation-final.txt').read_text()
assert '命中 30/30' in evaluation and 'MRR 0.97' in evaluation
assert '标准资料 #30 → 当前版本 #118' in evaluation
assert '标准资料 #39 → 当前版本 #116' in evaluation
overview=(LOCAL/'overview-final.txt').read_text()
listing=(LOCAL/'list-final.txt').read_text()
assert '当前列表 118 份' in listing
assert re.search(r'当前可检索资料\s*92',overview)
failure_match=re.search(r'另有 (\d+) 项失败',overview)
pending_match=re.search(r'(\d+) 项待核对',listing)
answers=[]
failed={'health-stopped':'same_month_version_inference_retested',
        'textbook':'incorrect_eligibility_scope_revised_and_retested',
        'library-scope':'overbroad_no_download_claim_retested',
        'graduation-photo-retest':'unknown_mistaken_for_prohibition_revised_and_retested'}
for path in sorted(LOCAL.glob('answer-*.txt')):
    key=path.stem.removeprefix('answer-')
    result=failed.get(key,'reviewed_real_model_response')
    if key=='graduation-photo': result='core_facts_correct_opening_too_absolute_later_retested'
    answers.append(dict(key=key,result=result,evidence=str(path.relative_to(ROOT)),sha256=digest(path)))

backend=load(LOCAL/'backend-verification.json')
assert backend['failures']==backend['errors']==backend['skipped']==0
front=load(LOCAL/'frontend-verification.json')
assert all(r.get('exitCode')==0 for r in front)
assert 'pass 239' in (LOCAL/'frontend-tests.log').read_text()
assert 'Ran 110 tests' in (LOCAL/'all-research-tests.log').read_text()
frontier=load(OUT/'official-frontier-2026-10-10.json')
receipt=dict(schemaVersion=1,checkedAt=datetime.now(ZoneInfo('Asia/Shanghai')).isoformat(),
    environment='local_admin_knowledge_database',productionDeployed=False,gitCommitted=False,
    credentialsSaved=False,rolesChanged=False,allSiteComplete=False,
    publication=dict(normalAdminSession=True,newTopics=11,revisedExistingTopics=9,createdVersionRows=23,
        currentTopics=20,currentDocumentIds=sorted(d['id'] for d in documents if d['currentInThisBatch']),
        effectiveBefore=81,effectiveAfter=92,totalBefore=95,totalAfter=118,
        oldVersionsPreserved=True,documents=sorted(documents,key=lambda d:d['id']),
        readbackCount=23,readbacksMatched=True,normalizations=['#118仅服务端去除末尾换行，无正文差异']),
    sourceFiles=dict(userProvidedFiles=7,userPdfPages=212,allUserTextReviewed=True,
        userPdfVisualSamplePages=25,userWordRenderedPages=7,additionalPublicPdfPages=10,
        additionalPublicPdfAllPagesVisuallyReviewed=True,privacyExcluded=True,
        evidence='safety-delivered-evidence-2026-10-10.json'),
    sourceChanges=dict(reviewedAndClosed=9,urls=['https://aqbw.tsguas.edu.cn/info/1004/1719.htm',
        'https://aqbw.tsguas.edu.cn/info/1008/1720.htm','https://ev.tsguas.edu.cn/About_us/Maps_and_Travel.htm'],
        additionalReviewEvidence='source-changes-closed-final.json',
        actualPendingAtSnapshot=int(pending_match.group(1)) if pending_match else 0,
        failedRefreshJobs=int(failure_match.group(1)) if failure_match else None),
    liveAnswers=answers,
    fixedRetrieval=dict(questions=30,hitTop5=30,mrr=0.97,firstRank=evaluation.count('第 1 位'),
        secondRank=evaluation.count('第 2 位'),questionsUnchanged=True,
        evidence=str((LOCAL/'evaluation-final.txt').relative_to(ROOT))),
    verification=dict(backend=backend,backendExcludedRealDatabaseClasses=['CampusAiApplicationTests','UserMapperTest','UserServiceTest'],
        frontendTests=239,frontendLintPassed=True,frontendBuildPassed=True,
        researchPythonTests=110,frontierNodeTests=10,testTimeoutsSeconds=[60,90,150],
        mobileVisualChecked=False,providerCurrencyBillReconciled=False),
    repairs=['管理员资料超过100条被截断：本校鉴权游标扫描、会话固定和有界超时',
        'Tika核心标题元数据读取，避免官网导入只得到数字文件名',
        '回答区分同月版本、停用状态、历史窗口、特定人群条件以及未知与禁止',
        '资料刷新队列按最近检查轮转并跳过当日已排队、未生效、过期和旧版本',
        '本地改为运行独立哈希副本JAR，避免打包覆盖运行文件导致类加载失败'],
    coverage=frontier['counts'],
    remaining=['15个新验证码下载入口文件未取得，另有已列尚未下载附件',
        '官网大量历史分页、正文图片和导航线索尚未穷尽',
        '后台历史刷新失败保留；修复轮询不代表失败网页已恢复',
        'H5-101停办通知缺年份，Beta表单及第三方资源账号未联调',
        '新轮转检测到的其他来源变化仍待逐项核对，不能直接用原始HTML覆盖整理资料',
        '本轮仅本地发布、非公网部署；不承诺全站收齐或全部回答准确'])
(OUT/'safety-delivered-import-receipt-2026-10-10.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(dict(publishedVersions=23,currentTopics=20,newTopics=11,revisedTopics=9,liveAnswers=len(answers),
    backendTests=backend['tests'],effective=92,pendingSources=receipt['sourceChanges']['actualPendingAtSnapshot']),ensure_ascii=False))
