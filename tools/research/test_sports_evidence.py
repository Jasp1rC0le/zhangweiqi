"""Offline provenance and factual-boundary checks; no app/database writes."""
import hashlib
import json
import unittest
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class SportsEvidenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pack = json.loads((ROOT / 'docs/research/sports-academic-evidence-2026-10-09.json').read_text())

    def test_screenshot_integrity_and_unknown_publication_dates(self):
        screenshots = self.pack['sources'][:6]
        self.assertEqual(6, len(screenshots))
        for source in screenshots:
            self.assertEqual(source['sha256'], hashlib.sha256((ROOT / source['file']).read_bytes()).hexdigest())
            self.assertIsNone(source['publishedAt'])
            self.assertEqual('user_supplied_screenshot', source['type'])

    def test_seven_reviewed_documents_have_provenance_without_fake_urls(self):
        docs = self.pack['documents']
        self.assertEqual(7, len(docs))
        self.assertEqual(7, len({d['title'] for d in docs}))
        known_sources = {s['id'] for s in self.pack['sources']}
        for d in docs:
            self.assertEqual(1, d['schoolId'])
            self.assertIsNone(d['publishedAt'])
            self.assertTrue(set(d['sourceIds']).issubset(known_sources))
            self.assertIn('2026-10-09', d['content'])
            self.assertLess(len(d['content']), 3000)
            self.assertNotIn('/Users/', d['content'])
            if d['key'].startswith('sports-'):
                self.assertIsNone(d['sourceUrl'])
                self.assertIn('发布日期不明', d['content'])

    def test_evening_queue_and_success_are_not_morning_or_submission(self):
        booking = self.pack['booking']
        self.assertEqual(['20:59', '21:00', '21:01', '21:02'],
                         [booking[k] for k in ['prepare', 'queueStarts', 'queueEnds', 'processingEnds']])
        self.assertEqual('Asia/Shanghai', booking['timezone'])
        self.assertEqual('21:30', booking['specialReopening'])
        self.assertIsNone(booking['specialPrepareTime'])
        self.assertFalse(self.pack['miniProgram']['bookingApiConnected'])
        self.assertIsNone(self.pack['miniProgram']['deepLink'])
        self.assertEqual('zdtiyuguanyuyue', self.pack['miniProgram']['displayName'])
        self.assertIn('排队成功不等于预约成功', self.pack['documents'][0]['content'])

    def test_three_sports_have_sixty_six_weekly_slots(self):
        self.assertEqual({'羽毛球', '乒乓球', '健身房'}, {s['sport'] for s in self.pack['schedules']})
        count = 0
        for schedule in self.pack['schedules']:
            self.assertEqual(['18:20–19:30', '19:40–20:50'], schedule['weekdays'])
            self.assertEqual(6, len(schedule['weekends']))
            count += len(schedule['weekdays']) * 5 + len(schedule['weekends']) * 2
            for group in ['weekdays', 'weekends']:
                last_end = None
                for slot in schedule[group]:
                    start, end = [datetime.strptime(t, '%H:%M') for t in slot.split('–')]
                    self.assertEqual(70 * 60, (end - start).total_seconds())
                    if last_end:
                        self.assertEqual(10 * 60, (start - last_end).total_seconds())
                    last_end = end
                    self.assertIn(slot.replace('–', '—'), self.pack['documents'][2]['content'])
        self.assertEqual(66, count)

    def test_uncertain_rules_and_academic_access_remain_explicit(self):
        cancel = next(d['content'] for d in self.pack['documents'] if d['key'] == 'sports-cancellation')
        self.assertIn('存在歧义', cancel)
        self.assertIn('不能据此', cancel)
        self.assertIn('拉黑7天', cancel)
        checkin = next(d['content'] for d in self.pack['documents'] if d['key'] == 'sports-checkin')
        self.assertIn('未说明健身房人数上限', checkin)
        self.assertIn('不是一定30天', checkin)
        academic = self.pack['documents'][-1]
        self.assertEqual('https://zdjw.tsguas.edu.cn/app-web/#/tabs/home', academic['sourceUrl'])
        self.assertIn('未同步个人课表成绩', academic['content'])
        self.assertIn('访问条件', academic['content'])


if __name__ == '__main__':
    unittest.main()
