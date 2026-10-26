"""Bounded ordinary reads of previously observed service navigation URLs."""
import json
from concurrent.futures import ThreadPoolExecutor
from read_remaining_public_pages import read, OUT

targets=[
    ('finance-cashier','https://cwsj.tsguas.edu.cn/fwzn/cnjskfwzn1.htm'),
    ('finance-accounting','https://cwsj.tsguas.edu.cn/fwzn/hjsjkfwzn.htm'),
    ('finance-fees','https://cwsj.tsguas.edu.cn/fwzn/sfgs.htm'),
    ('finance-downloads','https://cwsj.tsguas.edu.cn/xzzx.htm'),
    ('library-trials','https://tsg.tsguas.edu.cn/szzy/cyzy.htm'),
    ('archive-instructions','https://zhda.tsguas.edu.cn/gdfw/gdf.htm'),
    ('library-resources','https://tsg.tsguas.edu.cn/szzy.htm'),
]
with ThreadPoolExecutor(max_workers=3) as pool:
    rows=list(pool.map(read,targets))
(OUT/'service-catalog-fetch.json').write_text(json.dumps(dict(pages=rows),ensure_ascii=False,indent=2)+'\n')
for row in rows:
    print(row['key'],row['status'],row.get('chars'),row.get('title'))
