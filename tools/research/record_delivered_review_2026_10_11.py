"""Record this turn's manual review; no network or knowledge write APIs."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
manifest_path = ROOT / '.local/research/delivered-2026-10-11/extraction.json'
manifest = json.loads(manifest_path.read_text())
exams_summary = (ROOT / '.local/research/delivered-2026-10-11/course-exams-summary.txt').read_text().strip()
if hashlib.sha256(exams_summary.encode()).hexdigest() != '8049452187c9e17c3d98ed54f7fd4e514f3cfa14b8c705612bfd39c00806fe2a':
    raise ValueError('Course exams saved-body evidence does not match the reviewed summary')
for key, expected in {
    'external-teachers': 'd495d2f5b9e72420ebd6af5d87b556cfee442aed8b07011ab6899345fec3bdd5',
    'project-forms': '15c648ef7504294e61e4b1e6d6568407d507fc70aae1e946679b781cac1fba02',
    'archive-retention': '4aef7a365d5316e107d0b0c68f9725d58567c0c5074737b5e0f957954d5da0e6',
}.items():
    summary = (ROOT / f'.local/research/delivered-2026-10-11/{key}-summary.txt').read_text().strip()
    if hashlib.sha256(summary.encode()).hexdigest() != expected:
        raise ValueError(f'{key} saved-body evidence does not match the reviewed summary')
reviewed_hashes = {
    'alumni-query': '36d64d26b9bcfc7c3c0fc4f9c3c373a2e42901b5f9962f8467079ef8a28c32b6',
    'enterprise-internship': '323eb83811b8a8e6af8e78d4c92a1fac4f362a7ac5d6c6159e4bb13ff1331d7f',
    'major-transfer': 'a8a5be6725e077621823e35b27beeab3a074b1d5dec834cf8ece1f1cfaceee9b',
    'course-exams': '6f92b3f91bd0b567addb27c93be644105d02d2e04fa4a090e59f77df3f52af2a',
    'external-teachers': '164754a222abacff245e51d74341a925226f673450313a56af77e4b1ad6645e5',
    'project-change': 'a31420513316e3e2ac666519619ad03b9e678a330cddc89921ca555afbc656d9',
    'project-awards': '1204dc61861d1086119c66bd6419e15385cdeff13fce22b3fc72ceb9ff55a620',
    'project-results': '1cccf9033688f1de7d3cb4f5a1f925cae5c19eda6fb3bab37fb5acba1e84435a',
    'deferred-projects': 'f3174460efd0da6f396d67762033d8cd048f58b8d4ae0e18e4b2c8b7416e1128',
    'project-summary': '87e32aa20d4f305cc31fdff212f82dbafd42c88666932906d6a8da627d3d6672',
    'project-application': '058dea150b990f0d96c7a7139bdb66a68a0269a8fba6e606129a3e0f389918ef',
    'project-evidence': '75b7596cc0adbd020d468ac1402f800cef104d182585b0efefd29d7ff8d9e7bf',
    'project-completion': '7fbcbeb3be1609fa84567e2a0d6da09fecf330aaaf113d412a8038472208568e',
    'archive-retention': 'f819a5942365173677724066f42eb54f7294c9c09cac4dabe6111dcf6e6439ce',
}
project_form_keys = {
    'project-change', 'project-awards', 'project-results', 'deferred-projects',
    'project-summary', 'project-application', 'project-evidence', 'project-completion',
}
evidence = []
for row in manifest['files']:
    if row['key'] not in reviewed_hashes:
        continue
    if row['sha256'] != reviewed_hashes[row['key']] or hashlib.sha256((ROOT / row['archive']).read_bytes()).hexdigest() != row['sha256']:
        raise ValueError('Reviewed original hash mismatch')
    row.update(humanReviewed=True, reviewedOn='2026-10-11')
    if row['key'] == 'major-transfer':
        for member in row['members']:
            if hashlib.sha256((ROOT / member['archive']).read_bytes()).hexdigest() != member['sha256']:
                raise ValueError('Reviewed archive member hash mismatch')
            member.update(humanReviewed=True, publishedInSummaryDocumentId=129)
        row.update(published=True, documentId=129,
                   reviewNote='通知及6附件全部正文和表格核读；132拟接收名额求和一致；空白模板不是实际学生名单。Word版式未声明通过。')
    elif row['key'] == 'enterprise-internship':
        row.update(published=True, documentId=131,
                   reviewNote='4/4页文本及4/4原件渲染图片核读；正常ADMIN去重新增#131 v1，1187字回读一致。仅2023本科规范，毕业实习三份材料及60/40不套用普通企业实习课程；11项附件目录不等于取得11原件。')
    elif row['key'] == 'course-exams':
        row.update(published=True, documentId=132,
                   reviewNote='26/26页全文核读，PDF物理页1/7/12/16/23/25/26原图对照。正常ADMIN全部状态查重后新增#132 v1、3片段；1996字提交，服务器去首尾空白后1995字全文回读一致。2023试行规范仅用于课程考试；不是四六级/招生/论文查重规则。10模板目录不等于10原件，未公开试卷和真实成绩不入公共库。本轮原文页面访问失败，依据哈希匹配用户原件。')
    elif row['key'] == 'external-teachers':
        row.update(published=True, documentId=133,
                   reviewNote='8/8页全文及8/8原件渲染图核读，2024-05-07通知。正常ADMIN全状态外聘查重0后新增#133 v1、3片段；提交1617字，去首尾空白后1616字回读一致。不保证受聘、不编造课时价格、不套用学生或普通教职工；具体原文链接本轮访问失败。2组真实问答核心核验，追问区分单项学历职称技能要求与完整聘任条件。')
    elif row['key'] in project_form_keys:
        row.update(published=True, documentId=135,
                   reviewNote='8份空白教改原件的全部文本和表格字段核读，非实际成员名单。合并修订现有#113至#134 v3、4片段；真实问答遗漏成员排序签字，修正同主题检索表述再修订#135 v4，2759字去首尾空白后回读一致并原问题复测正确。各旧版本保留下架，不另建重复主题。混合年份、附件号不一致和元/万元不静默修改，成员顺序变更前后全体签字。DOCX变更表和DOC申报书渲染缺中文字体，版式未验证通过；2026通知仅保留已有记录，3个教务原文链接本轮访问失败。')
    elif row['key'] == 'archive-retention':
        row.update(published=True, documentId=136,
                   reviewNote='附件657行8列全部文本及选定原始单元格核读，104个合并范围计数并核对教学责任E530:E595；0公式、0外部链接。原件只读，摘要仅公开教学与设备规则，未发布个人档案。正常ADMIN全状态检视档案6条目录并核读#75，三合一0后新增#136 v1、3片段；1650字回读一致。官网2024-05-24试行制度本轮可读，D30/D10例号及人事长短期行疑点保留，未推断当前无修订。')
    else:
        row.update(published=True, documentId=130,
                   reviewNote='空白DOC全文核读；标题毕业生档案查询，路径名校友档案查询。正常ADMIN修订#71为#130 v3，1048字回读一致。只总结字段，证明照片应提交学校官方邮箱，不发本站；原件年份与Word版式未确认。')
    evidence.append({key: row[key] for key in ['key', 'file', 'sha256', 'humanReviewed', 'published', 'reviewNote']})
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
receipt = {'checkedOn': '2026-10-11', 'files': evidence,
           'normalAdminPublication': {'documentId': 129, 'revisionOf': 109, 'version': 2,
              'chunkCount': 3, 'savedBodyReadBackMatches': True, 'chars': 1753,
              'inventoryTotalObservedAfter': 124},
           'normalAdminPublications': [
               {'documentId': 129, 'revisionOf': 109, 'version': 2,
                'chunkCount': 3, 'savedBodyReadBackMatches': True, 'chars': 1753},
               {'documentId': 130, 'revisionOf': 71, 'version': 3,
                'chunkCount': 2, 'savedBodyReadBackMatches': True, 'chars': 1048,
                'savedBodySha256': '916c0cb5a2ab1da939a310a868c130c2e1c88d7432007a36f8ec5eb658211736'},
               {'documentId': 131, 'version': 1, 'chunkCount': 2,
                'savedBodyReadBackMatches': True, 'chars': 1187,
                'savedBodySha256': '8ccbbf6d9f3c93c7e5f28b6529a166dda31bd7ae8df71ebb6e6e390d06712bd8'},
               {'documentId': 132, 'version': 1, 'chunkCount': 3,
                'savedBodyReadBackMatchesAfterOuterWhitespaceTrim': True,
                'submittedChars': 1996, 'chars': 1995,
                'savedBodySha256': '8049452187c9e17c3d98ed54f7fd4e514f3cfa14b8c705612bfd39c00806fe2a',
                'normalUiDuplicateCheck': '课程考试全状态0份；考试全状态5份，无此原件主题。发布后课程考试只有#132一份，未改不同考试资料。',
                'screenshot': '.local/research/course-exams-publication-2026-10-11.jpg'},
               {'documentId': 133, 'version': 1, 'chunkCount': 3,
                'savedBodyReadBackMatchesAfterOuterWhitespaceTrim': True,
                'submittedChars': 1617, 'chars': 1616,
                'savedBodySha256': 'd495d2f5b9e72420ebd6af5d87b556cfee442aed8b07011ab6899345fec3bdd5',
                'screenshot': '.local/research/external-teachers-publication-2026-10-11.jpg'},
               {'documentId': 134, 'revisionOf': 113, 'version': 3, 'chunkCount': 4,
                'savedBodyReadBackMatchesAfterOuterWhitespaceTrim': True,
                'submittedChars': 2521, 'chars': 2520,
                'savedBodySha256': '6a0624c17e1765781169487f70f72dbff4a1d577d51e1dd9334c782c603da409',
                'subsequentlyArchivedByRevision': 135,
                'screenshot': '.local/research/project-forms-publication-2026-10-11.jpg'},
               {'documentId': 135, 'revisionOf': 134, 'version': 4, 'chunkCount': 4,
                'savedBodyReadBackMatchesAfterOuterWhitespaceTrim': True,
                'submittedChars': 2760, 'chars': 2759,
                'savedBodySha256': '15c648ef7504294e61e4b1e6d6568407d507fc70aae1e946679b781cac1fba02',
                'regressionCorrection': '成员排序签字漏答，原问题复测正确；已下架#134仍保留历史'},
               {'documentId': 136, 'version': 1, 'chunkCount': 3,
                'savedBodyReadBackMatchesAfterOuterWhitespaceTrim': True,
                'submittedChars': 1651, 'chars': 1650,
                'savedBodySha256': '4aef7a365d5316e107d0b0c68f9725d58567c0c5074737b5e0f957954d5da0e6',
                'screenshot': '.local/research/archive-retention-publication-2026-10-11.jpg'}],
           'normalAdminInventorySnapshot': {
               'observedAtChina': '2026-10-11 12:40', 'totalRecords': 126,
               'effectiveRecords': 94, 'pendingSourceChanges': 71,
               'failedBackgroundJobs': 44,
               'screenshot': '.local/research/service-publications-admin-2026-10-11.jpg',
               'boundary': '正常管理员界面当时快照，包含历史版本，既非全站全集也不是已经核读71项变化'},
           'latestNormalAdminInventorySnapshot': {
               'observedAtChina': '2026-10-11 14:07', 'totalRecords': 131,
               'effectiveRecords': 97, 'last24HourModelCalls': 17,
               'last24HourProviderReturnedTokens': 64442,
               'pendingSourceChanges': 79, 'failedBackgroundJobs': 44,
               'boundary': '原12:40的71项已变为79项待核对；本轮不自动采用、不停止用户运行的后台进程。当前数量不是全站覆盖率。'},
           'sourceReadBoundary': {
               'currentGuideRead': 'https://zhda.tsguas.edu.cn/fwly/fwly.htm',
               'specificParentsNotReadThisBatch': ['https://zhda.tsguas.edu.cn/info/1047/1386.htm',
                                                  'https://jwc.tsguas.edu.cn/info/1887/4993.htm',
                                                  'https://jwc.tsguas.edu.cn/info/1887/5006.htm',
                                                  'https://jwc.tsguas.edu.cn/info/1887/5284.htm',
                                                  'https://jwc.tsguas.edu.cn/info/2034/5181.htm',
                                                  'https://jwc.tsguas.edu.cn/info/2034/5182.htm'],
               'currentArchiveRuleRead': 'https://zhda.tsguas.edu.cn/info/1051/1383.htm',
               'note': '当前办事指南与档案三合一制度可读，所列教务/校友具体原文页面本批访问失败；附件正文来自用户提供且哈希匹配的原件，未绕过下载限制'},
           'additionalRealModelTests': [
               {'question': '校友档案查询申请表可以勾选哪些材料？要把身份证发给你吗？不填另外的收件邮箱，结果发到哪里？',
                'observedAnswerSummary': '四种勾选材料正确；明确身份证不要发AI或公开论坛，只交学校；无特殊要求默认以发件邮箱接收。',
                'coreFactsReviewed': True, 'normalChatUi': True},
               {'question': '我上的是普通企业实习课程，不是毕业实习，是不是也必须交毕业实习申请表、承诺书和接收函？实习报告至少写什么？所有实习成绩都按企业60%、学校40%吗？',
                'observedAnswerSummary': '该条三份材料仅自行选定毕业实习单位，不直接套企业实习课程；报告时间、单位、内容、体会为非穷尽列举并填写实习记录；60/40只在毕业实习考核，当前学院要求仍需确认。',
                'coreFactsReviewed': True, 'normalChatUi': True,
                'screenshot': '.local/research/service-attachments-qa-2026-10-11.jpg'},
               {'question': '根据2023课程考试规范，校内期末考试学生证丢了，普通在读证明加口头说明就一定能入场吗？缺一种证件具体怎样替代？成绩复核是10个自然日还是学校工作日？这个规则能直接套到四六级或2026专升本招生考试吗？',
                'observedAnswerSummary': '不保证普通在读证明加口头说明入场；缺一种证件由学院开具带近期免冠照片的证明；10个学校工作日而非自然日；不直接套到四六级或招生考试。提及六月四六级另有历史要求并明确不是通行规则。',
                'coreFactsReviewed': True, 'normalChatUi': True,
                'screenshot': '.local/research/course-exams-qa-2026-10-11.jpg'},
               {'question': '根据2023课程考试规范，教师成绩提交后多久整理课程考试档案？需要哪些材料，考生签到表从哪里导出？文件里提到10种模板是否代表你已经有10份可下载原件？30%的重复率是学生论文查重要求吗？能把真实学生成绩册和未公开试卷发给AI整理吗？',
                'observedAnswerSummary': '成绩提交后1周内；完整11种归档材料顺序；教学办考试管理→考务报表→考生签到表。10种模板只有目录不伪造下载，30%是命题重复率非论文阈值；真实成绩及未公开试卷留学校授权系统，不发AI或公共库。来源卡显示2023年10月18日及注意时效。',
                'coreFactsReviewed': True, 'normalChatUi': True,
                'screenshot': '.local/research/course-exams-teacher-qa-2026-10-11.jpg'},
               {'question': '按2024外聘教师办法，本科、中级职称、高级职业技能等级必须三项同时满足吗？28学时是每门课还是合计？能自己调课、下学年自动续聘吗？现在每学时多少钱，把身份证和协议发给你审核可以吗？',
                'observedAnswerSummary': '三项可替代不是同时要求；28学时为合计；调整须部门和教务审批，次年可续非自动；未编造课时费，不收身份证协议。结尾选一即可易歧义，追加真实追问确认其只限该单项条件。',
                'coreFactsReviewed': True, 'normalChatUi': True,
                'screenshot': '.local/research/external-teachers-qa-2026-10-11.jpg'},
               {'question': '你的“选一即可”只限学历或职称或技能这一项吧？我只有高级职业技能证，是否就能保证符合外聘条件并直接受聘？',
                'observedAnswerSummary': '明确只能可能满足其中一项，仍有思想职业道德、教学经验、能力及年龄健康要求；不保证整体符合或直接受聘，须面试试讲、准入信用、教务审批、校领导、OA不少于3天公示及协议流程。',
                'coreFactsReviewed': True, 'normalChatUi': True,
                'screenshot': '.local/research/external-teachers-eligibility-qa-2026-10-11.jpg'},
               {'question': '教师教改项目申报书的2024年9月、A2301和2023至2025预算年份，我2026年申请能不能直接改成2026年9月和A2601？申报研究目标、研究内容、工作方案各多少字？结题书资助经费能照搬申报预算的数字吗？现阶段还能按2026年6月18日的通知交吗？',
                'observedAnswerSummary': '不自动改混合年份或编号；600/800/500及其他栏目正确；元与万元、预算与资助不同不能原数字照搬；历史截止已结束，不推断2027日期，不拿外校网络资料替代本校。',
                'coreFactsReviewed': True, 'normalChatUi': True,
                'screenshot': '.local/research/project-forms-years-qa-2026-10-11.jpg'},
               {'question': '教改项目只调整成员排序，需要谁签字？项目结题书的标志性成果和主要成果都只打勾行不行，成果统计能填有无吗？被推荐参评市级奖能按市级获奖填吗？研究报告最低多少字，佐证材料只交结题书够不够？可否把成员私人电话、已签章扫描件直接发AI整理？',
                'observedAnswerSummary': '首测错误称资料未明确成员排序签字，尽管正文已有原件规则。其他勾选/数量、推荐不等获奖、没有字数下限、不只交结题书等正确。该次不能计为通过，修订#135并原问题复测。',
                'coreFactsReviewed': False, 'normalChatUi': True,
                'failedDocumentVersion': 134, 'correctedByDocumentVersion': 135,
                'screenshot': '.local/research/project-forms-fields-qa-2026-10-11.jpg'},
               {'question': '同一成员排序、成果字段与隐私问题在#135发布后用新对话原样复测',
                'observedAnswerSummary': '只调整成员排序也需变动前后全体成员签字、部门意见和盖章日期；其他填写规则正确，不编造字数下限。私人电话签章只交学校，明确这是本站隐私规则而非学校新增条款。',
                'coreFactsReviewed': True, 'normalChatUi': True,
                'regressionOf': 'project-forms-fields-first-answer',
                'screenshot': '.local/research/project-forms-regression-qa-2026-10-11.jpg'},
               {'question': '档案三合一表是让我填写三种证明吗？学校各专业培养方案和专业课程教学大纲都保存30年吗？设备说明书是买来5年后销毁还是报废后保存5年？既然学生名册永久归档，我能把真实成绩册和学籍资料上传你这里公开查阅吗？这个年限是不是也代表网站聊天和私人课表永久保存？',
                'observedAnswerSummary': '三合一是目录非三种证明；培养方案永久、大纲30年；说明书与设备共存、报废后5年，不是购入5年；永久归档不授权公开成绩身份、不套本站聊天课表年限，保留2024试行及当前修订未证实。',
                'coreFactsReviewed': True, 'normalChatUi': True,
                'screenshot': '.local/research/archive-retention-qa-2026-10-11.jpg'}],
           'realModelTest': {
               'question': '2026年转专业信息安全拟接收几人，审批表要家长签字吗？中职生源能转到高中生源的软件工程吗？9月剩空位还能二次申请吗？',
               'observedAnswerExcerpt': '信息安全四年制本科高中生源拟接收1人，是当年计划而非当前空位；要学生及家长签字；不同生源不能互转；空余名额不二次申请，2026年9月申请期已结束。',
               'coreFactsReviewed': True,
               'normalChatUi': True,
               'screenshot': '.local/research/timetable-knowledge-qa-2026-10-11.jpg',
               'boundary': '一个多意图问题的核心事实核验，不代表所有答案或个人资格可被本站保证'},
           'limitations': ['本次14个原件已核读并整理为7个去重主题摘要；不是全站收齐，也不等于全部原始文件公开可下载',
                          '真实问答核心事实核验不是全场景正确率或个人资格保证，教改成员排序首测漏答已记录失败并修订复测',
                          '课程考试PDF仅7个关键页原图对照，未宣称26页排版验收；具体原文页面仍未成功读取',
                          '实习PDF列出的11项附件未单独取得，不把目录当作原件已收齐',
                          '未取得转专业Word版式验收，公开正文仍来自全部文本与表格核读',
                          '教改DOCX变更表与DOC申报书渲染缺中文字体，不能将渲染退出0当版式通过',
                          '档案表只读内容核验，没有改写或导出工作簿；原文两处疑点不自动纠正',
                          '79项来源变化与44项历史失败任务尚未全部核对，不自动覆盖公开资料']}
(ROOT / 'docs/research/delivered-attachments-review-2026-10-11.json').write_text(
    json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'reviewed': len(evidence), 'publishedSummaryDocuments': [129, 130, 131, 132, 133, 135, 136], 'otherOriginalsPending': 14 - len(evidence)}))
