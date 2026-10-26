"""Build the reviewed late service batch. Does not write to the knowledge database."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/research'
LOCAL=ROOT/'.local/research/safety-delivered-2026-10-10'

documents=[dict(title='报销发票开错、遗失或只有电子打印件怎么办',category='财务办事版本资料',
    publisher='财务处（2025公开制度解读与通知）',sourceUrl='https://cwsj.tsguas.edu.cn/info/1014/1810.htm',
    publishedAt='2025-04-15T15:40',expiresAt='2026-11-10T00:00',content='''学校报销原始凭证准备（2025公开解读，2026-10-10核读）
凭证应有完整业务、日期、金额和必要签章，大小写金额一致；开错应找开具方重开或按规定更正，不能自己涂改。外部票据丢失，先索取原开具单位盖章存根；无法取得时走丢失票据报销申请及审批，不是截图即可报销。电子票据打印后仍应按要求保留电子原件；拍照影像不等同于电子凭证原件。材料不全会被退回补正，是否受理由财务审核，不保证报销成功。该解读正文咨询电话022-28771118，与网页通用页脚号码不是同一字段。
另有2025-10-17网页转载的专票通知，落款2025-06-30，适用起点2025-07-01：1万元以下零星采购可普通或专用发票；1万元及以上业务原则要求专票，已签合同约定普票的按合同。通知要求报销专票提供两份分别用于入账、抵扣。以上限该校通知，不当作普遍税务建议或擅自改变已签合同，当前采购先问财务具体执行要求。
原文：https://cwsj.tsguas.edu.cn/info/1014/1810.htm ；https://cwsj.tsguas.edu.cn/info/1014/1847.htm 。后者另列DOCX附件未读，不说已下载。本站只解释公开规则，不上传发票税号、银行卡、签名或报销人个人信息，不代审批。'''),
dict(title='本科论文抽检是不是只看查重率，毕业后还会抽检吗',category='论文与学术规范历史制度',
    publisher='教务处转载教育部教督〔2020〕5号',sourceUrl='https://jwc.tsguas.edu.cn/info/2035/5164.htm',
    publishedAt='2024-09-25T09:57',expiresAt='2026-11-10T00:00',content='''本科毕业论文抽检与论文查重不是同一件事
教务处2024-09-25转载教督〔2020〕5号，制度落款2020-12-24、2021-01-01施行，不能说是2024年新制定。该版规定每年抽检上一学年度授予学士学位的论文，比例原则上不低于2%，不是毕业后不会再查。考察选题、写作、逻辑、专业能力和学术规范，重复率检测只是专家评审参考，不能用低查重率保证通过。
该版程序为3位专家评议；至少2位不合格认定存在问题，1位不合格则另送2位复评，复评至少1位不合格也认定存在问题。该网页没有给出本校当前统一查重率或AI生成率红线，不编造“低于多少必过”。学校当年提交模板、平台和截止日另向导师/学院核对。本站不代写论文、不出官方查重报告、不替学校作学位处分或个人资格裁决。
来源：https://jwc.tsguas.edu.cn/info/2035/5164.htm 。2026-10-10全文核读，按原版本解释；不推定最新地方细则也已核完。''')]
old=json.loads((LOCAL/'before-57.json').read_text())
extra='''

图书馆2025-10-09公开资源介绍补充（2026-10-10核读）
读秀：从图书章节或句子检索，结果可查看试读和本馆馆藏链接，再看纸书地点、册数、流通状态；文献传递按所需局部页码申请，不等于整书任意下载。官网给出 https://www.duxiu.com/ ，具体权限与传递范围按官方页面及图书馆确认。原文 https://tsg.tsguas.edu.cn/info/5601/8362.htm 。
百链：面向多库文献检索及文献传递补缺，适合继续寻找本馆未直接提供的文献。原文 https://tsg.tsguas.edu.cn/info/5601/8361.htm 给出 http://www.blyun.com/ 。历史宣传的覆盖量和满足率不当作今天每篇都能获得的保证；使用手册仅见标题，未取得附件，不虚构登录教程。
读者之星：阅读资源与活动入口 https://hdm.readerstar.com/tsguas/home ，学校介绍可用微信或浏览器，无须另装APP，采用本人手机号验证码；不是本站账号联通，也不是任意活动现在开放。原文 https://tsg.tsguas.edu.cn/info/5601/8164.htm 。
以上没有进行第三方真实账号联调，不保证校外权限、收费、传递时限或永久订购；不要把学校账号交给本站，不批量抓取或转售受版权保护的全文。
'''
documents.append(dict(title=old['资料标题'],category=old['资料分类'],publisher=old['发布部门'],
    sourceUrl=old['原始链接'],publishedAt=old['发布时间'],expiresAt='2026-11-10T00:00',
    supersedesDocumentId=57,content=(old['content']+extra).strip()))
(OUT/'service-closeout-pack-2026-10-10.json').write_text(json.dumps(dict(documents=documents),ensure_ascii=False,indent=2)+'\n')
print('3 reviewed service topics prepared; 2 new, 1 revision')
