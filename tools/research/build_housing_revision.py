"""Append reviewed 2026 housing facts to the saved current document, never publish."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
old = (ROOT / '.local/research/library-lab-2026-10-10/old-housing.txt').read_text()
addition = '''

2026级住宿补充（网页2026-06-12发布，信件落款2026-06-09）
照明赠电按人计，每月1日每人7度，当月余量不结转；空调无赠电，两表分开充值。
直饮水0.3元/升，洗漱热水0.06元/升；支持现场支付宝扫码或水卡，水卡业务咨询H5一楼AB厅。不向本站提交付款码或账号凭据。
公共吹风机免费，每次300秒，之后强制冷却30秒；开放6:30—12:00、14:00—24:00，不能把宿舍断电例外推定为吹风机全天开放。
房间由学院安排，不自选；六人间1000元/人/年，H5女生四人间1200元/人/年，均不含假期。空调按全寝协商自愿租用，480元/间/学年、无押金，电费另算；原9月30日办理窗口已过，补办请咨询，不保证仍可线上下单。
上述是2026级指南中的价格和规则，不保证往届或未来学年一致。原文配有设备和付款示意图，本次只核文字，不复制收款码。
本次复核2026-10-10；下次复核2026-11-10，仅为本站安排，不是学校制度失效日。
'''
body = old + addition
assert body.startswith(old)
payload = dict(previousDocumentId=26, title='2026级新生住宿指南公开事实问答',
    sourceUrl='https://zs.tsguas.edu.cn/info/1006/1847.htm', publishedAt='2026-06-12T00:00',
    publishedDatePrecision='day', expiresAt='2026-11-10T00:00', content=body,
    previousSha256=hashlib.sha256(old.encode()).hexdigest(),
    sha256=hashlib.sha256(body.encode()).hexdigest(), publicationStatus='prepared_not_published')
(ROOT / 'docs/research/housing-revision-2026-10-10.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2)+'\n')
print('Housing revision prepared; original three answers preserved')
