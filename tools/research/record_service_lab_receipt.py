"""Assemble observed UI evidence only; no database writes or model calls."""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / '.local/research/service-lab-2026-10-10'
OUT = ROOT / 'docs/research'

def read(name):
    return json.loads((LOCAL / name).read_text())

def save(name, data):
    (OUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')

previews = read('source-change-previews.json')
results = read('dismiss-results.json')
old = read('existing-reviewed.json')
reasons = {
    'https://www.tsguas.edu.cn/': (70, '新闻、导航变化不覆盖整理后的联系方式；#70已明确采用招生官网28776099/28776655，本批重读招生官网仍一致。'),
    'https://www.tsguas.edu.cn/xxgk.htm': (6, '简介正文仍统计截至2025年9月；已存#6注明版本，推荐新闻变化不视为学校数据更新。'),
    'https://www.tsguas.edu.cn/info/1004/3340.htm': (9, '仍是2026-09-16已结束双选会，175家/1700余岗位等核心事实与原条目一致；纯活动及推荐新闻不新增。'),
    'https://www.tsguas.edu.cn/info/1004/3110.htm': (8, '仍是2026-03-17已结束双选会，170家/近3000岗位等核心事实与原条目一致；不伪装新招聘。'),
}
audit = []
for row, result in zip(previews, results, strict=True):
    assert row['url'] == result['url']
    docid, reason = reasons[row['url']]
    assert old[str(docid)]['sourceUrl'] == row['url']
    audit.append(dict(sourceUrl=row['url'], detectedAtLabel=row['date'], reviewedAgainstDocumentId=docid,
        previewSha256=hashlib.sha256(row['text'].encode()).hexdigest(),
        reviewedDocumentSha256=hashlib.sha256(old[str(docid)]['content'].encode()).hexdigest(),
        action='dismissed_via_normal_admin_ui', reason=reason,
        remainingBefore=result['before'], remainingAfter=result['after']))
save('service-lab-source-changes-2026-10-10.json', dict(checkedAt='2026-10-10', reviewed=8,
    uniqueSources=4, pendingAfter=0, deletedDocuments=0, replacementsPublished=0,
    note='历史招聘会记录未删除；仍有历史刷新失败，此审核不代表刷新系统已修复。', items=audit))

evaluation = (LOCAL / 'evaluation-dom.txt').read_text()
overview = (LOCAL / 'overview-dom.txt').read_text()
listing = (LOCAL / 'published-list-dom.txt').read_text()
score = re.search(r'命中 (\d+)/(\d+) · Recall@5 ([\d.]+)% · MRR ([\d.]+)', evaluation)
assert score and '当前可检索资料\n    - strong: "74"' in overview
assert '当前列表 87 份' in listing and '官网资料有变化' not in listing
save('service-lab-import-receipt-2026-10-10.json', dict(
    completedOn='2026-10-10', environment='local_only', productionDeployed=False,
    normalAdminSession=True, credentialOrRoleChange=False,
    documents=read('readbacks.json'), publishedCount=6, newTopics=5, revisedTopics=1,
    revisionChain=[19,85,92], oldVersionsRetained=True,
    totalRecordsBefore=81, totalRecordsAfter=87, eligibleBefore=69, eligibleAfter=74,
    sourceChangeReview=dict(reviewed=8, uniqueSources=4, pendingAfter=0, newDocumentsFromNoise=0),
    fixedEvaluation=dict(total=int(score[2]), hitsAtFive=int(score[1]), recallAtFive=score[3],
        displayedMrr=score[4], firstRankCount=evaluation.count('generic: 第 1 位'),
        secondRankCount=evaluation.count('generic: 第 2 位'), originalCasesUnchanged=True,
        doesNotValidateNewTopics=True),
    answerAttempt=dict(question='毕业证遗失，办理毕业证明书要什么材料，可以委托别人办吗，多久答复？2002年当年适用哪套材料？',
        result='blocked_by_quota_or_rate_limit', displayedError='当前额度或请求频率受限，请检查额度后稍后重试',
        dailyRemainingTokens=1989, answerVerified=False, quotaRaised=False),
    tests=dict(research=10, frontier=9, timeoutSecondsPerCommand=60, passed=True),
    applicationBuild='subsequent_admin_quota_change_built_and_tested_see_followup',
    followup='docs/research/admin-quota-acceptance-2026-10-10.json',
    render=dict(pagesProduced=3, visualPass=False,
        reason='CJK glyphs missing in bundled render; full OOXML paragraphs and tables reviewed'),
    limitations=['全站分母未知，未全站收齐', '财务/办公表单多数只核目录，未逐份核读附件',
        '退役士兵免试专升本附件正文未取得', '40项旧刷新失败未处理', '初次回答被额度拦截，保留失败记录；随后用户授权管理员不限额，两个Word主题重测见followup。其他新主题未另做真实模型抽查'],
    screenshot='docs/research/assets/service-lab-published-2026-10-10.png'))
print('Recorded 8 source decisions, 6 exact readbacks and observed evaluation; no publishing performed')
