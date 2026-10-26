"""Policy ingestion checks. Offline; never logs in or writes application data."""
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class PolicyCompletionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pack = json.loads((ROOT / 'docs/research/policy-completion-2026-10-09.json').read_text())
        cls.docs = {d['key']: d for d in cls.pack['documents']}
        cls.card = cls.docs['campus-card-complete']['content']
        cls.book = cls.docs['student-handbook-services-2025']

    def test_card_covers_every_identity_owner(self):
        for term in ['网络安全与信息化办公室', '财务处', '学生服务中心', '党委教师工作部',
                     '主办部门', '后勤基建处', '教务处（招生办公室）', '科技与研究生处', '应用外国语学院']:
            self.assertIn(term, self.card)

    def test_card_types_application_and_validity(self):
        for term in ['教师卡', '学生卡', '其他人员卡', '未参加批量制卡', '劳务派遣', '二维码消费',
                     '工作合同期限一致', '按学制设定', '一般不超过一年']:
            self.assertIn(term, self.card)

    def test_card_all_seven_services_and_conditions(self):
        for term in ['办卡与换卡', '一个月以内非人为损坏', '特殊情况', '现金充值', '挂失前',
                     '账号不变', '原卡作废', '清偿款额', '二维码同步失效', '代办注销',
                     '不再提供账务查询', '不能再次开通使用', '以班级为单位', '实体卡不收回',
                     '初始密码由系统生成', '超过50元', '不是一天只能消费50元']:
            self.assertIn(term, self.card)

    def test_merchant_settlement_and_safe_unknowns(self):
        for term in ['对公结算账户', '营业额报表', '水电燃气', '分管校领导批准', '没有设备处置权',
                     '不扩大到所有校外商家', '未列具体金额', '没有公布统一默认密码', '未指定具体应用名称']:
            self.assertIn(term, self.card)

    def test_sources_unique_and_no_secret_or_payment_values(self):
        docs = list(self.docs.values())
        self.assertEqual(len(docs), len({d['sourceUrl'] for d in docs}))
        for d in docs:
            self.assertIn(d['sourceUrl'], d['content'])
            self.assertIn('本站复核期限不等于学校制度有效期', d['content'])
            self.assertNotIn('/Users/', d['content'])
            self.assertNotRegex(d['content'], r'\b\d{18,}\b')

    def test_pdf_coverage_is_not_claimed_as_full_review(self):
        self.assertEqual(226, self.book['pageCount'])
        self.assertEqual(64, len(self.book['pdfSha256']))
        reviewed = {p for lo, hi in self.book['reviewedPageRanges'] for p in range(lo, hi + 1)}
        self.assertTrue(set(self.book['visualCheckedPages']) <= reviewed)
        self.assertLess(len(reviewed), self.book['pageCount'])
        self.assertIn('不是全书逐条入库', self.book['content'])
        self.assertIsNone(self.book['publishedAt'])

    def test_old_policy_not_promoted_to_current_entitlement(self):
        text = self.book['content']
        for term in ['不等于2026年最新规定', '不同学历规则不能混用', '不低于2.0', '2.0并非唯一条件',
                     '不能据此保证个人获得学位', '退宿附件署2017年', '不能把其中每月100元',
                     '10个工作日', '不是10个自然日', '专项办法单独附件尚未核验']:
            self.assertIn(term, text)

    def test_private_documents_stay_out_of_public_ingestion(self):
        self.assertIn('不上传公共问答或校园墙', self.book['content'])
        self.assertIn('不在聊天中收集校园卡密码', self.card)
        self.assertEqual(54, self.docs['campus-card-complete']['supersedesDocumentId'])


if __name__ == '__main__':
    unittest.main()
