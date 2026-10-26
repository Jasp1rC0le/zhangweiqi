"""Regression checks for reviewed map data and publication packs; no network or DB writes."""
import hashlib
import json
import unittest
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse
from admissions_library import admissions_records, load_admissions

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'docs/research'


class MapExpansionTests(unittest.TestCase):
    def setUp(self):
        self.pack = json.loads((DATA / 'campus-map-expansion-2026-10-09.json').read_text())
        self.archive = json.loads((DATA / 'admissions-public-archive-2026-10-09.json').read_text())
        self.docs = self.pack['documents'] + self.archive['documents']

    def test_unique_bounded_publications(self):
        self.assertEqual(17, len(self.docs))
        self.assertEqual(len(self.docs), len({d['title'] for d in self.docs}))
        urls = [d['sourceUrl'] for d in self.docs if d['sourceUrl']]
        self.assertEqual(len(urls), len(set(urls)))
        for d in self.docs:
            self.assertEqual(1, d['schoolId'])
            self.assertLess(len(d['content']), 3000)
            self.assertIn('2026', d['content'])
            self.assertNotIn('/Users/', d['content'])
            if d['sourceUrl']:
                url = urlparse(d['sourceUrl'])
                self.assertEqual('https', url.scheme)
                self.assertTrue(url.hostname.endswith('.tsguas.edu.cn'))
                self.assertFalse(url.username or url.password)
            if d['expiresAt']:
                self.assertGreater(datetime.fromisoformat(d['expiresAt']).date().isoformat(), d['checkedAt'])

    def test_all_fourteen_prior_public_candidates_are_covered_once(self):
        ids = [i for d in self.archive['documents'] for i in d['recordIds']]
        rows = admissions_records(load_admissions())
        expected = {r[0] for r in rows if r[7] in ('A03', 'A04')}
        self.assertEqual(14, len(expected))
        self.assertEqual(expected, set(ids))
        self.assertEqual(14, len(ids))
        for d in self.archive['documents']:
            self.assertIsNone(d['sourceUrl'])
            self.assertIsNone(d['publishedAt'])
            self.assertIn('历史', d['content'])

    def test_historical_consultation_and_exam_boundaries_survive_merge(self):
        estimate = self.archive['documents'][0]['content']
        self.assertIn('2026增加180个计划', estimate)
        self.assertIn('不是2026实际录取结果', estimate)
        self.assertIn('未独立核验', estimate)
        self.assertIn('语数外三科总分', estimate)
        plans = self.archive['documents'][2]['content']
        self.assertIn('本科120、高职90', plans)
        self.assertIn('不含住宿费', plans)
        for code in range(1, 7):
            self.assertIn(f'2026分类计划{code:02}', plans)

    def test_map_asset_integrity_and_uncertainty(self):
        public = ROOT / 'campus-ai-web/public'
        info = json.loads((public / 'campus-map/tsguas-map-2026-10-09.json').read_text())
        self.assertEqual(info['imageSha256'], hashlib.sha256((public / info['image'].lstrip('/')).read_bytes()).hexdigest())
        self.assertFalse(info['satelliteVerified'])
        self.assertFalse(info['walkableGraphVerified'])
        self.assertEqual(29, len(info['points']))
        route = next(d['content'] for d in self.docs if d['key'] == 'map-routes')
        for boundary in ['先确认', '不是实测路线', '冲突', '未用于路径核验']:
            self.assertIn(boundary, route)

    def test_library_reading_limit_is_not_borrowing_limit(self):
        borrowing = next(d['content'] for d in self.docs if d['key'] == 'library-borrow')
        self.assertIn('外借上限10册', borrowing)
        self.assertIn('不是学生外借额度', borrowing)
        hours = next(d['content'] for d in self.docs if d['key'] == 'library-hours')
        self.assertIn('周六日及法定节假日不开放', hours)
        self.assertIn('不能保证实时开门', hours)


if __name__ == '__main__':
    unittest.main()
