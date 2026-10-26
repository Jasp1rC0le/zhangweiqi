"""Review pack for six user-delivered public PDFs; no knowledge API writes."""
import hashlib
import json
import re
import shutil
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
RESEARCH = ROOT / 'docs/research'
ARCHIVE = ROOT / '.local/research/jwc-delivered-2026-10-10'
FILES = [
    ('degree', '学士学位授予工作实施细则.pdf', 4, '2035/5252', '3944679', [4]),
    ('vocational', '天津中德应用技术大学高职学生学籍管理规定（修订）.pdf', 16, '2035/5251', '3944678', [5, 16]),
    ('veteran', '【教务处、武装部、体育教学部文件】关于参军入伍学生退役复学后部分课程免修管理办法.pdf', 2, '2034/5194', '3930715', [1, 2]),
    ('return', '学生复学申请表.pdf', 1, '2034/5190', '3930683', [1]),
    ('suspend', '学生休学申请表.pdf', 1, '2034/5183', '3930676', [1]),
    ('withdraw', '学生退学申请表.pdf', 1, '2034/5192', '3930684', [1]),
]


def normalized_body(pages):
    # Preserve all meaningful numbers; only page-number-only lines are removed.
    text = ''.join(re.sub(r'(?m)^\s*[-—]?\s*\d+\s*[-—]?\s*$', '', p.extract_text()) for p in pages)
    text = re.sub(r'\s+', '', text).replace('（', '(').replace('）', ')').replace('〔', '[').replace('〕', ']')
    return text[text.index('第一章'):]


def build():
    base = json.loads((RESEARCH / 'policy-final-import-pack-2026-10-10.json').read_text())['documents'][0]
    revised = {k: base[k] for k in ('title', 'category', 'publisher', 'sourceUrl', 'publishedAt', 'expiresAt')}
    revised.update(key='handbook-jwc-reconciled', supersedesDocumentId=77)
    body = base['content']
    replacements = {
        '专项办法单独附件尚未核验。': '专项附件已于2026-10-10核验，为2021年3月19日办法；具体申请、认定和附表见“退役复学免修”专门条目。',
        '上述为2025版制度内容；空白申请表的具体字段、2026年办理日历未核验，勿杜撰。': '上述为2025版制度内容；复学、休学、退学3张空白表已于2026-10-10核验，具体填写字段见教务表格条目。2026年具体办理日历未核验，不推算或虚构日期。',
        '重要版本边界：这里只能证明2025年汇编收录的2023版内容；尚未确认是否有2026年替代细则，不能据此保证个人获得学位或代替学校审核。': '版本核对：2026-10-10收到教务处独立学位附件，去除空白、页码和排版括号差别后，其第一章至末尾的正文与本汇编2023版完全一致，未发现新增条款。附件本身没有日期，不将它重标为2026新规；是否另有后续替代文件尚未确认，不能保证个人获得学位或代替学校审核。',
        '不要将此算法不加核对用于高职或其他学校。': '本科与高职适用范围仍须分开；已收到的高职附件第十八条亦采用同一公式和排除项，详见本条末尾高职补充，不用于其他学校。',
        '教务处6份独立附件仍受下载验证码阻挡，本汇编不替代那些未读取附件的版本核验。': '2026-10-10用户补交6份教务附件，25页正文均已核读；学位、高职学籍同文合并在本条，3张表格合并修订原表格条目，退役免修新增专门条目，不重复导入相同制度。',
    }
    for old, new in replacements.items():
        if body.count(old) != 1:
            raise ValueError('Base revision changed: ' + old)
        body = body.replace(old, new)
    body += '''

教务独立附件交叉核对与增补（2026-10-10收到原件）
来源页为学校教务处，文件由用户正常下载后提供；本站未通过验证码直接下载。学位PDF4页、高职PDF16页正文均与2025汇编对应章节一致，没有把同文当作新制度重复发布。学位附件对应津中德政〔2023〕37号，高职对应津中德政〔2024〕111号；对应文号来自汇编标题，不是附件另标了日期。以下附件页码为各独立PDF物理页码。

本科申请学位的审核与异议（学位附件第2—4页，2023版同文）
总平均学分绩点达到2.0不是唯一条件，仍须满足培养方案、全部规定学分、毕业设计论文答辩和准予毕业等要求。审核由学院学位评定分委员会逐人审核并提出名单，校学位评定委员会办公室汇总，校委员会审议批准后颁证，不是在本站自测通过就获学位。
该版第十条列学位决定公布之日起10日内向学校学位评定委员会书面申请复核；第十一条列受理后15日内做出复核决定并书面通知。这里起点是“决定公布”，不是高职退学的“接到决定书”；也不是旧申诉办法的10个工作日。涉及实际期限立即向学位评定委员会办公室核对最新规则及决定书告知，本站不替个人算最后期限。原件：https://jwc.tsguas.edu.cn/info/2035/5252.htm

高职学制、绩点、补考与重考（高职附件第3—8页，2024修订版同文）
适用普通高等学历教育高职学生。三年制高职标准3年、最长5年；三二分段高职标准2年、最长4年。一般保留学籍和休学计入学习年限，应征入伍除外，不与本科4年/6年、升本2年/3年混用。
高职课程60分及以上获得学分；达到60分时绩点=课程考核成绩÷10－5，60分以下绩点0。GPA按课程学分加权，保留小数点后两位、第三位四舍五入；第二课堂、公共选修合格计入学分、不计入GPA。
补考通常在下一学期初，具有补考资格的不合格课程一次机会；补考不计算过程成绩，考试70分及以上按70分记载，低于70分按实际分数。取消考核资格、缺考无补考资格，可参加重考；违纪作弊无补考资格，经教育表现良好可以给予重考机会。公共选修不合格不安排补考，可重新选修。独立实验实训实践实习不合格，能重做的以重做形式补考，无法重做须重新修读。
学期补考后仍不合格，可参加学校统一组织的一次重考，时间由学校和课程开设单位告知，不能拿本科“低于70分可重修”当作高职重考申请条件。身体原因无法正常上体育课，须按校方程序申请适当保健活动，不是自行免修。

高职休复学、留级、结业（高职附件第10—16页，2024修订版同文）
病事假一学期累计超过6周等情形可按规定申请休学；一般休学1年、最长学制内累计不超过2次，提交书面申请及证明，学院同意后学校审批。办完休学手续后一周内离校。复学在拟复学学期第1周书面申请；病休需二甲及以上医院康复证明并经校医院复查合格。逾期2周不办理复学或续休且无不可抗力等正当事由，存在按自动退学处理风险，应及时联系学院，不由本站判定个人学籍。
非毕业学年，经补考后累计不及格考试课程折算门数达到5门但不足7门，规定作留级处理；达到7门及以上列为学校可予退学情形。两门考查课折算一门考试课，不能直接把成绩单原始不及格门数当结论。在校只能留级一次；原及格课程承认成绩、可不参加考试但仍须跟班听课，原不及格课程须参加正常考核。具体折算和处理由学院及学校审核。
退学决定作出前有告知、陈述申辩与合法性审查程序；该版第四十五条写接到退学决定书之日起10日内向学校学生申诉处理委员会书面申诉，第四十七条写接到复查决定书之日起15日内向天津市教育主管部门书面申诉。不要与学位复核的起算事件、旧校内申诉办法“工作日”混用；实际事项立即核对最新书面告知与正式收件渠道，不等待本站计算期限。
高职结业学生在下学期开学后第1周申请一次补考；通过后换发毕业证，毕业时间按换发日期。学历证遗失或损坏经申请核实出具相应证明书，不保证补发原证。高职原件：https://jwc.tsguas.edu.cn/info/2035/5251.htm
以上只提供所核读版本信息，不构成对个人毕业、学位、留级、退学或申诉结果的决定；无需在公开AI里提交成绩单、处分决定、疾病证明或身份证明。
'''
    revised['content'] = body.strip()
    forms = {
        'key': 'academic-blank-forms', 'supersedesDocumentId': 19,
        'title': '休学复学退学申请表怎么填、谁签字及证明书下载入口',
        'category': '教务表格与办事', 'publisher': '教务处（用户提供公开空白PDF）',
        'sourceUrl': 'https://jwc.tsguas.edu.cn/zlxz.htm', 'publishedAt': '', 'expiresAt': '2026-11-10T00:00',
        'content': '''休学、复学、退学3张教务空白表填写指引（2026-10-10核读）
只整理用户从教务处下载并提供的3份单页空白PDF；没有个人填写内容。表内没有版本日期，不声称是2026新表。填写前向辅导员、学院确认当前要求；表格填写完成不等于学校已经批准。以下签字栏顺序按表面布局说明，不代替学校完整审批流程。

学生复学申请表怎么填、谁签字
原文：https://jwc.tsguas.edu.cn/info/2034/5190.htm
字段：姓名、性别、培养层次、学号；学院、专业、年级；申请休学时间、申请复学时间；休学前班级、复学后班级。学生填写复学原因（可附页）并签字、填日期。复学后班级尚未确定时先问学院，不自行猜填。
底部意见栏依次为家长签字、辅导员签字、学院专职副书记签字盖章，并填日期。空白表本身没有医院证明、提交份数或网上提交入口，不凭表格虚构这些要求。病休康复证明与申请时点需另按相应学历学籍制度及学院通知核对，不能说这张表列出了全部材料。

学生休学申请表怎么填，起止日期如何填写
原文：https://jwc.tsguas.edu.cn/info/2034/5183.htm
字段：姓名、性别、学号；学院、专业；年级、班级、培养层次；申请休学起止年月日；家庭住址、联系方式。学生填写休学原因（可附页）并签字、填日期。家长、辅导员、学院专职副书记意见栏分别由对应人员填写，最后一栏需要签字盖章。
表下注明确：休学起始日期应为实际停止参与教学活动之日；截止日期为休学下一学年对应学期开学报到日期。不是一律填写今天，也不能简单按365天推算。具体报到日查当期校历并由学院确认，本站不替学生选择日期。表格没有给出统一审批天数、收费、份数或盖章房间。

学生退学申请表怎么填、谁签字
原文：https://jwc.tsguas.edu.cn/info/2034/5192.htm
字段：姓名、性别、学号；学院、专业；年级、班级、培养层次；家庭住址、联系方式；学生退学原因（可附页）、本人签字和日期。底部是家长、辅导员、学院专职副书记意见栏；副书记栏签字盖章。此为本人申请用空白表，不等于学校作出的退学决定书，也不是线上提交就自动退学；学籍处理、离校及其他手续须经学校正式办理。不要把退学表同休学表互换，退学表未列休学起止日期。

毕业证明书等其他表格去哪找
教务处资料下载目录：https://jwc.tsguas.edu.cn/zlxz.htm 。本次只补齐上述3张申请表；毕业证明书等其他附件内容仍未在本批核验，不能凭目录臆造字段、材料和盖章流程。

隐私与材料边界（Campthink提示，不是学校新增要求）
空白表可以查询；填好的表会含姓名、学号、住址、电话、签名、健康或家庭原因。只向学校指定渠道提交，不上传公共知识库、校园墙或公开AI对话。本网站不收集或代填这些个人字段、不代签盖章、不自动提交学籍申请。可以询问如何理解空白栏位，不必提供真实身份、病历或家庭资料。
核验2026-10-10；本站复核日期不等于学校表格失效日期。''',
    }
    veteran = {
        'key': 'veteran-course-exemption-2021',
        'title': '退役复学如何申请体育军事课免修：期限、90分认定与申请表',
        'category': '退役复学教务办事', 'publisher': '教务处、武装部、体育教学部（2021-03-19）',
        'sourceUrl': 'https://jwc.tsguas.edu.cn/info/2034/5194.htm', 'publishedAt': '', 'expiresAt': '2026-11-10T00:00',
        'content': '''参军入伍学生退役复学后部分课程免修（2021年3月19日办法及附表）
2026-10-10核读用户提供的2页公开PDF，第1页为办法，第2页为配套空白申请表。制度署教务处、武装部、体育教学部2021年3月19日；这是所核读版本，不将收到文件时间当成发布日期，是否有后续调整应向学院和武装部核对。

谁可以申请、哪些课可以免修
对象为正式被本校录取为全日制学生后参军入伍的退役复学学生。可自愿申请免修公共体育、军事技能、军事理论；不是所有退伍人员自动适用，不包括全部专业课程，也不是不申请就可以不去上课。

何时申请、怎么办理
填写《参军入伍学生退役复学部分课程免修申请表》，在课程开设学期前两周内向所在学院申请，该版写逾期不予补办。这里是开课学期前两周的办理窗口，不要改写为开学前必须提前两周；具体本学期起止日请学院确认，本站不推算最后一天。
学院审核士兵退役证原件、复印件；符合条件报学校人民武装部审批，再交教务处教学运行科及开课部门教学办公室备案。附表还列学院、武装部、教务处意见签字盖章栏。应按学校要求完成全部审核，不以本站说明或填表代替批准。

免修后成绩多少、何时录入
完成课程免修申请手续的，相应课程成绩认定为90分，由开课部门教学办公室通知任课教师，随所在班级课程考核录入，不承诺批准后即时显示，也不称所有课程自动90分。

申请表填哪些字段、交几份
学年、学期；学号、姓名、所在学院、专业、班级、联系电话；课程代码、课程名称、学分、开课部门。学生写个人申请、签字日期并附退役证复印件；学院审核原件并在复印件盖章确认；学院、武装部、教务处填写意见并签字盖章。
附表说明为一式三份，含退役证复印件，由教务处、武装部、开课部门分别存档；学院将表交开课部门通知任课教师录入。原件第2页可作空白模板，学校若更新模板以当前要求为准。
原文入口：https://jwc.tsguas.edu.cn/info/2034/5194.htm
隐私提示：退役证、学号、电话及签字材料只交学校指定渠道，不上传公共问答或校园墙。Campthink不代审免修资格、不代改成绩、不代交材料。''',
    }
    docs = [revised, forms, veteran]
    for d in docs:
        d['sha256'] = hashlib.sha256(d['content'].encode()).hexdigest()
    return {'schemaVersion': 1, 'reviewedAt': '2026-10-10', 'environment': 'local-only',
            'publicationStatus': 'prepared-not-proof-of-published',
            'strategy': '学位高职同文修订77，3表修订19，退役免修1新主题；不把6文件强制拆成6个重复条目',
            'documents': docs}


def evidence():
    book = PdfReader(ROOT / '.local/research/official-2026-10-09/student-handbook-2025.pdf')
    rows = []
    ARCHIVE.mkdir(parents=True, exist_ok=True)
    for key, name, count, slug, fid, visual in FILES:
        p = Path('/Users/zhangweiqi/Downloads') / name
        raw = p.read_bytes()
        reader = PdfReader(p)
        assert len(reader.pages) == count
        assert not reader.get_fields()
        archive = ARCHIVE / name
        if archive.exists() and archive.read_bytes() != raw:
            raise ValueError('Different archived file already exists: ' + name)
        shutil.copyfile(p, archive)
        text_pages = [page.extract_text() for page in reader.pages]
        (ARCHIVE / (key + '-text.json')).write_text(json.dumps(text_pages, ensure_ascii=False, indent=2) + '\n')
        row = {'key': key, 'name': name, 'archive': str(archive.relative_to(ROOT)),
               'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw), 'pageCount': count,
               'textPagesReviewed': list(range(1, count + 1)), 'visuallyReviewedPages': visual,
               'sourceUrl': 'https://jwc.tsguas.edu.cn/info/' + slug + '.htm',
               'downloadUrl': 'https://jwc.tsguas.edu.cn/system/_content/download.jsp?owner=1178850125&urltype=news.DownloadAttachUrl&wbfileid=' + fid,
               'acquisition': 'user_supplied_public_pdf', 'captchaSolvedByAgent': False,
               'containsFilledPersonalData': False}
        if key in ('degree', 'vocational'):
            lo, hi = (67, 70) if key == 'degree' else (51, 66)
            same = normalized_body(reader.pages) == normalized_body(book.pages[lo - 1:hi])
            assert same
            row['handbookComparison'] = {'pages': [lo, hi], 'bodyFromChapterOneExact': same,
                'normalization': '去页码独占行、空白、全半角括号；保留正文所有数字；比较第一章至结尾',
                'handbookVersion': '津中德政〔2023〕37号' if key == 'degree' else '津中德政〔2024〕111号',
                'newerVersionConfirmed': False}
        rows.append(row)
    return {'schemaVersion': 1, 'reviewedAt': '2026-10-10', 'files': rows,
            'pages': [{'url': row['downloadUrl'], 'parentUrl': row['sourceUrl'],
                       'checkedAt': '2026-10-10', 'status': 'attachment_reviewed_from_user_copy',
                       'textWindowComplete': True,
                       'evidence': 'public_pdf_reviewed_sha256:' + row['sha256'],
                       'note': '用户提供公开PDF已全文核读并存档；不代表远端验证码已完成或下载入口当前可达'}
                      for row in rows],
            'totalFiles': 6, 'totalPages': 25, 'received': 6, 'fullyRead': 6,
            'uniqueness': '6个不同文件哈希；学位高职与旧汇编相同正文合并，不新建同文主题',
            'newsIntakeRule': '纯活动报道、合影、获奖宣传不入库；仅提取实际办事、课程、服务、可核验报名信息，并注明日期去重',
            'limits': ['附件收到不证明线上已发布', '未确认是否存在更新制度', '3张申请表不能代表完整审批及材料清单', '非全站收齐']}


if __name__ == '__main__':
    pack = build()
    ev = evidence()
    (RESEARCH / 'jwc-delivered-pack-2026-10-10.json').write_text(json.dumps(pack, ensure_ascii=False, indent=2) + '\n')
    (RESEARCH / 'jwc-delivered-evidence-2026-10-10.json').write_text(json.dumps(ev, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'files': len(ev['files']), 'pages': ev['totalPages'], 'documents': [
        {'key': d['key'], 'characters': len(d['content']), 'supersedes': d.get('supersedesDocumentId')}
        for d in pack['documents']]}, ensure_ascii=False))
