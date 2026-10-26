"""Separate dated official facts, user-supplied screenshot and unverified timing."""
import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCAL = ROOT / '.local/research/library-lab-2026-10-10'
image = Path('/var/folders/wq/9g3k68xx7_b2mfd3tzfx5d8m0000gn/T/codex-clipboard-43540bdd-54c2-4c14-9414-a65cae9e43d5.jpg')
shutil.copyfile(image, LOCAL/'student-community-user-screenshot.jpg')
rows = [dict(key='student-card', title='学生证遗失怎样线上申请补领，社区服务中心在哪里',
    category='学生证与社区办事', publisher='学校官网2024流程；用户补充线上平台截图',
    sourceUrl='https://www.tsguas.edu.cn/info/1158/2542.htm', publishedAt='2024-11-08T00:00', content='''学生证补领与一站式社区服务
官网2024-11-08流程：在学生综合管理系统发起申请，经辅导员、学院领导审核，进度到学生处审核后到学生事务与发展中心办理审核、领证及盖章。官网列服务点为商业街一楼、H5一楼AB厅；这是该版流程，不保证当前每个窗口均营业。
学生证不是消费用校园一卡通。只补学生证，不需要走补购、写入及粘贴火车优惠卡的环节。2024页面的7元/张、支付宝缴费仅针对补办火车票学生优惠卡，不能当学生证统一费用；变更乘车区间的材料及现在收费向窗口确认。
2026-10-10用户提供的截图显示：“中德应大一站式学生社区线上服务平台（Beta版）”支持学生证补办、非标家具申请、维修报修、借用物品等，用微信或企业微信扫码填写。二维码本地解码结果为 https://doc.weixin.qq.com/smartsheet/form/1_wpg6zYXwAAmCa0o_HFmNjzoT4Tq4-4Uw_0e183f 。仅识别出地址，未验证表单当前可用、运营主体或最新审批字段；不是完成扫码就已补证，也未验证全程线上领证。先由辅导员或社区工作人员确认仍在使用该入口，证件照片、学号等只填学校确认的表单，不交本站聊天或校园墙。
用户还补充H5-101社区服务中心在某学期7月15日18:00结束当学期工作，但未提供年份和完整通知。这只能存为待核实的历史线索，不能据此判断2026年10月仍停办、每天18点关门或每年同日停办；当前地点、值班与领证安排先问学院辅导员、H5社区服务中心。
核验2026-10-10；11月10日为本站复核节点，不是学校服务停止日期。'''),
    dict(key='exam-proof',title='学生证丢了能凭在读证明参加考试吗：四六级历史要求与确认步骤',
    category='考试证件与历史通知',publisher='教务处（2026年6月四六级考前提醒）',
    sourceUrl='https://jwc.tsguas.edu.cn/info/1887/5347.htm',publishedAt='2026-06-02T16:24',content='''证件遗失与参加考试
教务处2026-06-02发布的2026年6月四六级考前提醒，要求带准考证、学生证、身份证原件；身份证或学生证丢失，应提前补办，或向所在学院开具贴有本人近期免冠照片的证明。电子证件、口头解释不能直接替代要求的证件。这里说的是已经结束的2026年6月考次，不是所有考试的通行规则。
用户提出“有在读证明应该也可以，和监考老师说明情况”。应将它理解为待确认建议：普通在读证明不一定等于考点要求的带照片身份证明，不保证一张在读证明就能入场。
本站办理建议：先说明要参加的考试名称和考次，提前联系学院辅导员、教学办或该考试考务部门，问清可接受的证明内容、照片、签章和原件要求；按该场考试安排开具证明，携带其余必需证件，入场时主动向监考说明情况并配合核验。是否准入由考务规则及现场核验决定，不能替学生承诺。
学工部职责页 https://xsgz.tsguas.edu.cn/xgbjj.htm 将学生证、在学证明事务列入学生事务管理科职责，可由辅导员协助联系；该页没有说明所有考试均接受在学证明，也没有给统一开具时限。没有考次信息时应先追问，不把6月通知套到12月四六级、期末考或其他资格考试。
核验2026-10-10；仅公开办理指引，不收身份证、在读证明或已填申请材料。''')]
for row in rows:
    row['expiresAt']='2026-11-10T00:00'
    row['sha256']=hashlib.sha256(row['content'].encode()).hexdigest()
payload=dict(checkedAt='2026-10-10',publicationStatus='prepared_not_published',documents=rows,
    screenshot=dict(archive=str((LOCAL/'student-community-user-screenshot.jpg').relative_to(ROOT)),
        sha256=hashlib.sha256(image.read_bytes()).hexdigest(),
        qrDecoded=True,formAvailabilityVerified=False,dateAndOperatorNotIndependentlyVerified=True),
    unverifiedClaim='H5-101于某年7月15日18时学期停办，年份未知，不作为当前营业时间')
(ROOT/'docs/research/student-card-pack-2026-10-10.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n')
print('Prepared 2 student-card/proof topics; no publishing performed')
