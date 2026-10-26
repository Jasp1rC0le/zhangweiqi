"""Render outstanding public attachments from reviewed evidence, no network calls."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'docs/research'
data=json.loads((OUT/'teaching-followup-evidence-2026-10-10.json').read_text())
rows=data['accessBlockers']
lines=['# 官网附件待办 · 2026-10-10 13:50 批次','',
    '之前的7份安全/户籍附件已由用户提供并全部核读：2份DOCX、3份PDF共212页、2份DOC。它们不再是待下载项；此前6份教务PDF及2份Word也已完成。正常发布及逐字回读见本批回执。','',
    f'## 新发现的{len(rows)}个验证码下载入口','',
    '以下目录或网页已核读，但文件本身尚未取得。转专业RAR是一个下载包，网页列有6项附件，入口数不能误算成文件数。请只提供公开空白表格或制度文件，不发已填个人资料。','',
    '| 资料 | 原文 | 正常下载入口 |','| --- | --- | --- |']
for row in rows:
    lines.append(f"| {row['title']} | [原文]({row['parentUrl']}) | [下载]({row['url']}) |")
lines += ['', '## 其他尚未完成的内容', '',
    '- 2027届图像采集的分组及采集码操作附件、2025答辩ZIP、2026户籍通知附件及FAQ PDF：正文或目录已读，不代表这些附件已读',
    '- H5-101“7月15日18点结束本学期工作”：缺完整通知与年份，不当作每年固定关闭时间',
    '- Beta社区服务平台当前表单字段和办证联调尚未验证，不收取教务账号或个人证件',
    '- 学院历史分页、部分正文图片和未解析导航线索仍存在，不能宣称全站收齐',
    '', '## 本轮明确排除', '',
    '纯活动、获奖名单和合影不逐篇入库；旧学生应急联系人私人手机号、手册示例身份信息及内部安保细节不进入公共知识库。已结束试用或报名只作为注明年份的历史资料，不作为当前可用承诺。', '']
(OUT/'pending-attachments-2026-10-10.md').write_text('\n'.join(lines))
print(f'Pending list refreshed: {len(rows)} new download endpoints; previous 7 resolved')
