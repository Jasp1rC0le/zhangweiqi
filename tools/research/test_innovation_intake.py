"""Checks for reviewed source boundaries, not a substitute for source reading."""
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / 'docs/research'


class InnovationIntakeTests(unittest.TestCase):
    def setUp(self):
        self.pack = json.loads((ROOT / 'innovation-intake-2026-10-10.json').read_text())
        self.docs = {row['key']: row for row in self.pack['documents']}

    def test_each_published_source_has_body_evidence(self):
        evidence = json.loads((ROOT / 'official-intake-evidence-2026-10-10.json').read_text())
        read = {p['url'] for p in evidence['pages'] if p['textWindowComplete'] and p['status'] == 'text_returned'}
        self.assertFalse(evidence['allSiteLinksExhausted'])
        self.assertEqual(44, len(evidence['pages']))
        self.assertEqual(10, len(read))
        for doc in self.docs.values():
            self.assertIn(doc['sourceUrl'], read)
            self.assertIn(doc['sourceUrl'], doc['content'])

    def test_contacts_not_fabricated_and_no_personal_mobile(self):
        text = self.docs['innovation-help']['content']
        for term in ['K3-202', '022-28776088', 'cxcyfzzx@tsguas.edu.cn', '2025年9月23日', '没有给出当前截止日期']:
            self.assertIn(term, text)
        for doc in self.docs.values():
            self.assertNotRegex(doc['content'], r'(?<!\d)1[3-9]\d{9}(?!\d)')
            self.assertNotIn('/Users/', doc['content'])

    def test_project_years_and_conditional_reimbursement_remain_explicit(self):
        text = self.docs['innovation-project-2025-closeout']['content']
        for term in ['仅适用2025年', '2025年11月3日12:00', '已经结束', '2026年9月30日',
                     '2025年12月以后', '3、2、1项', '2026年10月至12月', '未能结项不能', '不是自动发奖金']:
            self.assertIn(term, text)

    def test_score_review_history_is_not_current_or_another_exam(self):
        text = self.docs['upgrade-score-review-2026-history']['content']
        for term in ['不是目前开放的申请窗口', '不适用于普通高考', '2026年1月30日12:00',
                     '2026年3月11日至13日', '均已结束', '附件申请表本次未读取', '并非已知精确时刻']:
            self.assertIn(term, text)
        self.assertEqual(len(self.docs), len({d['sourceUrl'] for d in self.docs.values()}))
        for doc in self.docs.values():
            self.assertIn('本站复核期限不等于学校制度有效期', doc['content'])


if __name__ == '__main__':
    unittest.main()
