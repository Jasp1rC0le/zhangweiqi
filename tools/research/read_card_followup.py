"""Read only links observed in the finance and archives navigation."""
import json
from read_remaining_public_pages import read, OUT

targets = [
    ('card-guide', 'https://cwsj.tsguas.edu.cn/fwzn/xykjszxfwzn.htm'),
    ('card-rules', 'https://cwsj.tsguas.edu.cn/ykt/glzd.htm'),
    ('archive-rules', 'https://zhda.tsguas.edu.cn/info/1054/1233.htm'),
]
rows = [read(target) for target in targets]
(OUT/'card-fetch-evidence.json').write_text(json.dumps(dict(pages=rows), ensure_ascii=False, indent=2)+'\n')
for row in rows:
    print(row['key'], row['status'], row.get('chars'), row.get('title'))
