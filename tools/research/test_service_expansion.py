"""Offline evidence checks for the Oct 9 public service collection; no network or DB writes."""
import json
import unittest
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'docs/research'


class ServiceExpansionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pack = json.loads((DATA / 'official-service-expansion-2026-10-09.json').read_text())
        cls.inventory = json.loads((DATA / 'official-site-inventory-2026-10-09.json').read_text())
        cls.docs = {d['key']: d for d in cls.pack['documents']}

    def test_unique_public_sources_and_bounded_summaries(self):
        docs = list(self.docs.values())
        self.assertEqual(9, len(docs))
        self.assertEqual(9, len({d['title'] for d in docs}))
        self.assertEqual(9, len({d['sourceUrl'] for d in docs}))
        prior_urls = set()
        for name in ['knowledge', 'map', 'sports']:
            receipt = json.loads((DATA / f'{name}-import-receipt-2026-10-09.json').read_text())
            prior_urls.update(d.get('sourceUrl') for d in receipt['documents'])
        for d in docs:
            parsed = urlparse(d['sourceUrl'])
            self.assertEqual('https', parsed.scheme)
            self.assertTrue(parsed.hostname.endswith('.tsguas.edu.cn'))
            self.assertFalse(parsed.username or parsed.password or parsed.query)
            self.assertNotIn(d['sourceUrl'], prior_urls)
            self.assertLess(len(d['content']), 800)
            self.assertIn(d['sourceUrl'], d['content'])
            self.assertNotIn('/Users/', d['content'])

    def test_every_published_source_has_readable_text_evidence(self):
        urls = {p['url']: p for p in self.inventory['pages']}
        for d in self.docs.values():
            self.assertEqual('text_returned', urls[d['sourceUrl']]['status'])
            self.assertTrue(urls[d['sourceUrl']]['textWindowComplete'])
            self.assertNotEqual('image_unread', urls[d['sourceUrl']].get('contentEvidence'))

    def test_dates_remain_unknown_when_absent_and_review_is_not_policy_expiry(self):
        self.assertIsNone(self.docs['library-reference']['publishedAt'])
        for d in self.docs.values():
            if d['publishedAt']:
                self.assertLessEqual(d['publishedAt'], self.pack['checkedAt'])
            self.assertGreater(datetime.fromisoformat(d['expiresAt']).date().isoformat(), self.pack['checkedAt'])
            self.assertIn('本站复核期限不等于学校制度有效期', d['content'])

    def test_campus_card_requirement_is_not_a_hard_spending_cap(self):
        text = self.docs['campus-card']['content']
        for fragment in ['不受理代办', '未列具体金额', '超过50元需输入消费密码', '不是一天只能消费50元']:
            self.assertIn(fragment, text)

    def test_exam_year_and_actual_calendar_year_are_distinct(self):
        entry = self.docs['graduate-exam-2027']
        self.assertIn('2027', entry['title'])
        self.assertIn('日期均为2026年北京时间', entry['content'])
        self.assertIn('10月31日12:00', entry['content'])
        self.assertEqual('2026-11-01T00:00', entry['expiresAt'])
        self.assertIn('2026年12月19—20日', self.docs['graduate-admissions-2027']['content'])

    def test_restricted_resources_and_service_boundaries_remain_explicit(self):
        self.assertIn('不提供下载', self.docs['library-digitized']['content'])
        self.assertIn('没有获取个人课表', self.docs['graduate-system']['content'])
        self.assertIn('不能等同于论文重复率检测', self.docs['library-reference']['content'])
        self.assertIn('不是组委会完整竞赛规则', self.docs['modeling-contest-ai']['content'])
        self.assertIn('本站使用提醒（不是官网原文或组委会条款）', self.docs['modeling-contest-ai']['content'])
        self.assertIn('未实地复核2026年', self.docs['foundation-lab-rooms']['content'])

    def test_inventory_does_not_claim_exhaustion_or_attachment_verification(self):
        self.assertFalse(self.inventory['allSiteLinksExhausted'])
        pages = self.inventory['pages']
        self.assertEqual(len(pages), len({p['url'] for p in pages}))
        statuses = {p['status'] for p in pages}
        self.assertTrue({'text_returned', 'fetch_failed', 'captcha_required', 'metadata_only'} <= statuses)
        self.assertEqual(6, sum(p['status'] == 'captcha_required' for p in pages))
        self.assertTrue(all(not p['attachmentContentsVerified'] for p in pages))
        for p in pages:
            for link in p['discoveredLinks']:
                self.assertEqual(bool(link.get('url')), link['state'] == 'visited')
        self.assertTrue(any(p.get('contentEvidence') == 'image_unread' for p in pages))


if __name__ == '__main__':
    unittest.main()
