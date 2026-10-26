"""Assemble this batch's observed publication evidence; never publishes data."""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / '.local/research/library-lab-2026-10-10'


def read_json(path):
    return json.loads(path.read_text())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


base = read_json(ROOT / 'docs/research/library-lab-pack-2026-10-10.json')
cards = read_json(ROOT / 'docs/research/student-card-pack-2026-10-10.json')
published = read_json(LOCAL / 'published.json')
readbacks = read_json(LOCAL / 'readbacks.json')
housing = read_json(LOCAL / 'housing-readback.json')
card_readbacks = read_json(LOCAL / 'card-readbacks.json')
assert all(r['bodyMatch'] and r['sourceMatch'] for r in readbacks + card_readbacks)
assert housing['bodyMatch']
assert [r['id'] for r in published] == list(range(93, 98))
assert [r['id'] for r in card_readbacks] == [99, 100]
evaluation = (LOCAL / 'evaluation.txt').read_text()
assert '命中 30/30' in evaluation and 'MRR 0.97' in evaluation
assert '标准资料 #26 → 当前版本 #98' in evaluation
final_list = (LOCAL / 'list-final.txt').read_text()
overview = (LOCAL / 'overview-final.txt').read_text()
assert '当前列表 95 份' in final_list
assert '当前可检索资料\n81' in overview
assert '另有 41 项失败' in overview

answers = []
for path in sorted(LOCAL.glob('answer-*.txt')):
    key = path.stem.removeprefix('answer-')
    answers.append(dict(key=key, evidence=str(path.relative_to(ROOT)), sha256=digest(path),
        result='failed_clock_shortcut_retested_after_fix' if key == 'date-before' else 'reviewed_real_model_response'))
assert len(answers) == 11

receipt = dict(
    schemaVersion=1, checkedAt='2026-10-10', destination='local_admin_knowledge_database',
    productionDeployed=False, credentialsOrRolesChanged=False, gitCommitted=False,
    publication=dict(newTopics=7, revisedTopics=1, currentDocumentIds=list(range(93, 101)),
        effectiveBefore=74, effectiveAfter=81, totalBefore=87, totalAfter=95,
        normalAdminSession=True, oldVersionsPreserved=True,
        documents=[dict(id=r['id'], title=d['title'], sourceUrl=d['sourceUrl'],
                        publishedAt=d['publishedAt'], bodySha256=d['sha256'])
                   for r, d in zip(published, base['documents'])] +
                  [dict(id=98, previousId=26, title='2026级新生住宿指南公开事实问答',
                        evidence='housing-revision-2026-10-10.json')] +
                  [dict(id=r['id'], title=d['title'], sourceUrl=d['sourceUrl'],
                        publishedAt=d['publishedAt'], bodySha256=d['sha256'])
                   for r, d in zip(card_readbacks, cards['documents'])],
        readbacks=readbacks + [housing] + card_readbacks,
        dateCorrections=read_json(LOCAL / 'date-results.json')),
    sourceChanges=dict(reviewedAndClosed=2,
        decisions=[dict(source='https://aqbw.tsguas.edu.cn/', documentId=27,
                        action='ignore', reason='办公室电话与邮箱一致；新闻导航变化不覆盖摘要，附件单列待办'),
                   dict(source='https://zs.tsguas.edu.cn/info/1006/1847.htm', documentId=98,
                        action='reviewed_revision_then_ignore_old_change', reason='保留原三问并补电水与设备价格，旧#26归档')],
        newlyDetectedRemaining=1, remainingUrl='https://aqbw.tsguas.edu.cn/info/1004/1719.htm',
        remainingState='preview_read_but_not_compared_to_stored_document_or_published',
        failedRefreshTasks=41),
    liveAnswers=answers,
    retrievalEvaluation=dict(fixedQuestions=30, hitTop5=30, recallAt5=1.0, displayedMrr=0.97,
        firstRank=len(re.findall('第 1 位', evaluation)), secondRank=len(re.findall('第 2 位', evaluation)),
        originalQuestionsUnchanged=True, evidence='evaluation.txt',
        caveat='检索命中不等于全部生成答案正确；首次点击停在确认框，确认后才取得本轮结果'),
    repairs=[dict(key='date-only-revision', detail='同内容仅日期变更正常原位更新，学校/状态/版本CAS约束、事务审计与索引事件；#93—#97保持ID，无重复入库'),
             dict(key='system-time-intent', detail='宽泛“今天+日期”被误当报时，改成完整独立时间问题匹配；含资料发布日期的问题走检索模型，原失败问法已复测')],
    verification=dict(backend=dict(command='mvn -q -Dtest=*,!CampusAiApplicationTests,!UserMapperTest,!UserServiceTest package',
        timeoutSeconds=150, suites=67, tests=262, failures=0, errors=0, skipped=0,
        exclusions=['CampusAiApplicationTests', 'UserMapperTest', 'UserServiceTest']),
        frontend=dict(tests=230, failures=0, targetedLintPassed=True, productionBuildPassed=True),
        research=dict(pythonChecks=12, frontierNodeChecks=9, timeoutSeconds=60),
        localReadyHttp=200, mobileNotVerifiedThisBatch=True,
        screenshot='assets/library-lab-published-2026-10-10.png'),
    studentCardBoundaries=dict(officialProcessYear=2024, qrDecoded=True, formAvailabilityVerified=False,
        studentCardNotCampusPaymentCard=True, july15ClosureYearKnown=False,
        ordinaryEnrollmentProofNotGuaranteedExamAdmission=True,
        examSourceScope='2026年6月四六级，学院出具带近期免冠照片证明；不得直接套用其他考次'),
    limitations=['官网尚未收齐，全站分母未知；302个已知学校网址、3376条未解析导航线索并非完成率',
        '新发现7份附件仍需验证码，正文未下载；用户此前提供的6份教务PDF和2份Word不是本次缺口',
        '后台41项刷新失败尚未处理；结束前新增1项户籍来源变化保留待核',
        '10次真实模型回答加1次报时失败，共11次尝试；保留失败，不宣称任意回答均正确',
        '耗材问答中一处电话引用编号不够精确，已知电话来自其他检索资料；引用对齐仍可强化',
        '模型服务商金额账单、第三方平台账号权限、扫码表单当前可用性均未核验',
        '仅本地发布与重启，未部署公网、修改正式主体或法律声明'],
)
output = ROOT / 'docs/research/library-lab-import-receipt-2026-10-10.json'
output.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
print('Receipt verified: 8 documents, 11 answer attempts, 30/30 retrieval, local only')
