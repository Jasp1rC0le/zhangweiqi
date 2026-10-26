"""Record inspected public pages and normal-access blockers, never crawl or publish."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PAGES = [
    ('https://www.tsguas.edu.cn/', '学校首页', '导航核读，不把活动新闻录入'),
    ('https://www.tsguas.edu.cn/xxgk/jgsz.htm', '机构设置', '机构导航核读，未证明每个子站已穷尽'),
    ('https://www.tsguas.edu.cn/xsgz/yzssq.htm', '一站式社区栏目', '文字列表已读，纯活动排除'),
    ('https://www.tsguas.edu.cn/xsgz/yzssq/1.htm', '社区历史分页', '5条活动条目按标题筛除，不冒充读过每篇活动正文'),
    ('https://www.tsguas.edu.cn/info/1158/2542.htm', '社区办事服务', '复核已入库学生证来源，不重复建文档'),
    ('https://zhda.tsguas.edu.cn/', '综合档案室首页', '公共服务导航'),
    ('https://zhda.tsguas.edu.cn/fwly/fwly.htm', '档案服务利用', '复核已有资料#71的地点时间联系方式'),
    ('https://zhda.tsguas.edu.cn/info/1054/1086.htm', '档案利用FAQ', '复核已有#75，不重复录入'),
    ('https://zhda.tsguas.edu.cn/xzzx/xzzx.htm', '档案下载中心', '当前1条1页，不外推到全站'),
    ('https://zhda.tsguas.edu.cn/info/1047/1386.htm', '校友档案查询申请表', '网页目录已读，附件受验证码限制'),
    ('https://jwc.tsguas.edu.cn/', '教务首页', '当前公开通知导航'),
    ('https://jwc.tsguas.edu.cn/zlxz.htm', '教务资料下载', '9条1页；不等于9个入口下全部附件已读'),
    ('https://jwc.tsguas.edu.cn/index/tzgg.htm', '通知公告首页', '本轮不同缓存返回49/50/51条、5/6页，不能计算可靠全站百分比'),
    ('https://jwc.tsguas.edu.cn/index/tzgg/5.htm', '通知公告分页5', '本轮早先完整读过；稍后复读失败，保留两种证据'),
    ('https://jwc.tsguas.edu.cn/index/tzgg/4.htm', '通知公告分页4', '列表核读，不等于所列所有正文已读'),
    ('https://jwc.tsguas.edu.cn/index/tzgg/3.htm', '通知公告分页3', '列表核读，不等于所列所有正文已读'),
    ('https://jwc.tsguas.edu.cn/index/tzgg/2.htm', '通知公告分页2', '完整窗口为旧缓存；后续复读失败'),
    ('https://jwc.tsguas.edu.cn/index/tzgg/1.htm', '通知公告最早分页', '历史考试、活动与撤稿分开，旧临时入口不当现行入口'),
    ('https://jwc.tsguas.edu.cn/info/1887/5285.htm', '实验安全融入课程', '复核已有#24，2023—2026级、教材教师安排，不重复建文档'),
    ('https://jwc.tsguas.edu.cn/info/1887/5349.htm', '2026秋开学教学事务', '复核已有#17，历史补缓考窗口不当现行申请'),
    ('https://jwc.tsguas.edu.cn/info/1887/5264.htm', '2026转专业', '摘要已发布#109；RAR内6项未读取'),
    ('https://jwc.tsguas.edu.cn/info/1887/5346.htm', '2027届毕业图像', '摘要已发布#110；操作及分组附件未取得'),
    ('https://jwc.tsguas.edu.cn/info/2034/5181.htm', '教改立项表目录', '1个表格入口已核读，文件需验证码'),
    ('https://jwc.tsguas.edu.cn/info/2034/5182.htm', '教改结题表目录', '7个表格入口已核读，文件需验证码'),
    ('https://jwc.tsguas.edu.cn/info/1887/4994.htm', '2023课程考试制度入口', '正文仅附件名，不据标题编造制度条款'),
    ('https://jwc.tsguas.edu.cn/info/1887/4993.htm', '2023本科实习办法入口', '正文仅附件名，不据标题编造制度条款'),
    ('https://jwc.tsguas.edu.cn/info/1887/5006.htm', '2024外聘教师办法入口', '正文仅附件名，不据标题编造制度条款'),
    ('https://jwc.tsguas.edu.cn/info/1887/5237.htm', '2025毕业答辩', '历史教师流程已读；附件ZIP未读，学生名单不收集'),
    ('https://jwc.tsguas.edu.cn/info/1887/5280.htm', '2025毕业论文抽检', '全文已读；不采集个人论文名单，旧截止不当2026规定'),
    ('https://jwc.tsguas.edu.cn/info/1887/5023.htm', '2021学籍异动OA通知', '正文显示撤稿，不能作为现行办理依据'),
    ('https://jwc.tsguas.edu.cn/info/1887/5279.htm', '2025课程建设验收', '网页4月14日与落款4月30日冲突；过期窗口未新增发布'),
    ('https://jwc.tsguas.edu.cn/info/1887/5284.htm', '2026校级教改结题', '合并已有表格目录修订为#113，不新增同源重复主题'),
    ('https://jwc.tsguas.edu.cn/info/1887/5351.htm', '2026新形态教材', '申请表和标准直接列在正文，完整核读并摘要#114'),
    ('https://jwc.tsguas.edu.cn/zdzc.htm', '教务制度政策首页', '当前12条2页；仍分别核对正文及附件'),
    ('https://jwc.tsguas.edu.cn/zdzc/1.htm', '教务制度政策尾页', '含本科生学籍入口；已有汇编不算独立附件已下载'),
    ('https://jwc.tsguas.edu.cn/info/2035/5164.htm', '本科论文抽检办法转载', '2020文号、2021施行、2024转载，三个日期不混同'),
    ('https://jwc.tsguas.edu.cn/info/1887/4880.htm', '2021耳机试音通知', '官网显示已撤销，不能据标题生成当前安排'),
]
pages = [dict(url=url, title=title, status='text_verified', textWindowComplete=True,
              evidence='web_tool_complete_text_window', note=note) for url,title,note in PAGES]
pages.extend([
    dict(url='https://aqbw.tsguas.edu.cn/info/1004/1719.htm', status='text_verified', textWindowComplete=True,
         evidence='normal_admin_source_change_preview', note='核对后#28修订#108，保留年度时间边界；附件未读'),
    dict(url='https://aqbw.tsguas.edu.cn/info/1008/1720.htm', status='text_verified', textWindowComplete=True,
         evidence='normal_admin_source_change_preview', note='核对后#29修订#112，原文迁移证有效期歧义不解释成统一宽限'),
    dict(url='https://jwc.tsguas.edu.cn/info/1887/5348.htm', status='partial', textWindowComplete=False,
         evidence='web_tool_truncated_at_email', note='职教出海通知止于jwc@，不拼接猜测邮箱，不发布不完整办理要求'),
    dict(url='https://www.tsguas.edu.cn/index/xxgk/gzzd.htm', status='timeout', textWindowComplete=False,
         evidence='web_tool_read_failed', note='既往已读证据不被本次失败抹去'),
    dict(url='https://www.tsguas.edu.cn/info/1158/2546.htm', status='timeout', textWindowComplete=False,
         evidence='web_tool_read_failed', note='本次学生服务正文未成功读取'),
    dict(url='https://jwc.tsguas.edu.cn/info/1887/5022.htm', status='read_failed', textWindowComplete=False,
         evidence='web_tool_robots_check_failed', note='历史临时教务外网通知正文未读取，不据旧标题更改当前入口'),
])
BLOCKERS = [
    ('jwc',1178850125,3930668,'教改立项申报书','https://jwc.tsguas.edu.cn/info/2034/5181.htm'),
    ('jwc',1178850125,3930669,'教改结题佐证材料','https://jwc.tsguas.edu.cn/info/2034/5182.htm'),
    ('jwc',1178850125,3930670,'项目结题情况汇总表','https://jwc.tsguas.edu.cn/info/2034/5182.htm'),
    ('jwc',1178850125,3930671,'教改结题书','https://jwc.tsguas.edu.cn/info/2034/5182.htm'),
    ('jwc',1178850125,3930672,'成果获得称号统计','https://jwc.tsguas.edu.cn/info/2034/5182.htm'),
    ('jwc',1178850125,3930673,'历年暂缓通过项目汇总','https://jwc.tsguas.edu.cn/info/2034/5182.htm'),
    ('jwc',1178850125,3930674,'教改成果统计','https://jwc.tsguas.edu.cn/info/2034/5182.htm'),
    ('jwc',1178850125,3930675,'校级项目事项变更申请','https://jwc.tsguas.edu.cn/info/2034/5182.htm'),
    ('jwc',1178850125,3927554,'2023课程考试管理规定','https://jwc.tsguas.edu.cn/info/1887/4994.htm'),
    ('jwc',1178850125,3927553,'2023本科实习管理办法','https://jwc.tsguas.edu.cn/info/1887/4993.htm'),
    ('jwc',1178850125,3927567,'2024外聘教师聘任管理办法','https://jwc.tsguas.edu.cn/info/1887/5006.htm'),
    ('jwc',1178850125,3947269,'2026转专业附件包RAR（内含6项）','https://jwc.tsguas.edu.cn/info/1887/5264.htm'),
    ('zhda',1182472388,15085966,'校友档案查询申请表','https://zhda.tsguas.edu.cn/info/1047/1386.htm'),
    ('cwsj',1178325157,3946860,'收费公示（2026.4.29）XLSX','https://cwsj.tsguas.edu.cn/info/1098/1766.htm'),
    ('zhda',1182472388,3927319,'档案分类归档范围及保管期限三合一表XLSX','https://zhda.tsguas.edu.cn/info/1051/1383.htm'),
]
blockers=[]
for host,owner,fileid,title,parent in BLOCKERS:
    url=f'https://{host}.tsguas.edu.cn/system/_content/download.jsp?owner={owner}&urltype=news.DownloadAttachUrl&wbfileid={fileid}'
    blockers.append(dict(url=url, parentUrl=parent, title=title, status='captcha',
        note='按正常下载返回验证码页；未解题、未猜直链，等待用户提供公开空白文件'))
    pages.append(dict(url=url,parentUrl=parent,title=title,status='captcha',textWindowComplete=False,
        evidence='normal_download_captcha_page',note='目录已读不等于附件已读'))
payload=dict(schemaVersion=1,checkedAt='2026-10-10',allSiteLinksExhausted=False,
    wholeSiteDenominatorKnown=False,pages=pages,accessBlockers=blockers,
    excludedContent=['纯活动新闻和合影','学生个人成绩或论文名单','已撤稿流程','过时防疫和临时外网入口'],
    incompleteAttachments=['2027届照片分组及采集码操作附件','2025答辩ZIP','2026户籍通知附件及FAQ PDF'],
    limitations=['不同时间缓存页码总数冲突，不宣称穷尽教务全站',
      '新形态教材资料时间已临近，10月11日到期等待复核', '部分网页复读失败；已读与失败历史分开'])
out=ROOT/'docs/research/teaching-followup-evidence-2026-10-10.json'
out.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n')
print(f'{len(pages)} URL observations, {len(blockers)} CAPTCHA downloads recorded')
