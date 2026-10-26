import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/research'
old=next(d for d in json.loads((OUT/'teaching-next-pack-2026-10-10.json').read_text())['documents']
         if d['key']=='graduation-photo-2027')
doc={**old,'supersedesDocumentId':110}
doc['content']='''2027届毕业图像采集与核对
能否现在去E1：已知的是2026年5月22日E1工业中心一楼的集体拍摄已经结束，且学校不再组织集中补拍；这份通知未给出当前E1是否还有其他拍摄服务或个别补采安排。因此不能直接回答“现在不能去E1补拍”，也不能承诺可以直接去拍。应先向学院教学办或教务处确认个别补采的方式、地点和时间。这是本站针对缺失信息的建议，不是原通知公布了一个新的补采流程。
官网2026年5月11日通知面向2027届预计毕业生，含研究生、留学生。16元是上述一次集体采集的现场费用，不是现在的预约报价。通知要求使用本人学信网采集码；图像用于毕业证、学位证及学信网相应照片，不能借用他人采集码。
原通知要求拍摄4个月后登录学信网核对本人照片和个人信息，但本篇未列具体校对截止年月日，不自行生成“9月22日截止”或新的最后期限。发现错误及时联系学校处理。
本站提醒：是否可在其他机构自行拍摄、照片提交标准和补采费用，这篇通知没有明确；不要擅自保证任意照相馆可用，也不要把本站的谨慎建议说成原通知明确禁止某照相馆。分组表和采集码操作附件正文未取得，不编造附件字段或补拍按钮。
采集码、付款码、证件照片只交学校指定渠道，不上传本网站；本站未登录学信网或核验任何个人照片。
来源：https://jwc.tsguas.edu.cn/info/1887/5346.htm 。网页与通知均为2026-05-11；2026-10-10再次全文核读。'''
(OUT/'graduation-photo-clarification-2026-10-10.json').write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n')
