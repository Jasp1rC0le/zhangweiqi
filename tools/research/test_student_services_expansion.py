"""Version, privacy and reading-boundary regressions for this reviewed intake."""
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / 'docs/research'


class StudentServicesExpansionTests(unittest.TestCase):
    def setUp(self):
        self.pack = json.loads((ROOT / 'student-services-expansion-2026-10-10.json').read_text())
        self.docs = {d['key']: d for d in self.pack['topics']}
        self.evidence = json.loads((ROOT / 'official-expansion-evidence-2026-10-10.json').read_text())

    def test_unique_topics_and_no_private_data(self):
        self.assertEqual(9, len(self.docs))
        self.assertEqual(9, len({d['title'] for d in self.docs.values()}))
        self.assertEqual(6, len(self.pack['documents']))
        self.assertEqual(6, len({d['sourceUrl'] for d in self.pack['documents']}))
        for d in self.docs.values():
            self.assertIn(d['sourceUrl'], d['content'])
            self.assertIn('本站复核期限不等于学校制度有效期', d['content'])
            self.assertNotRegex(d['content'], r'(?<!\d)1[3-9]\d{9}(?!\d)')
            self.assertNotIn('/Users/', d['content'])

    def test_handbook_pages_are_reviewed_not_whole_book(self):
        book = self.evidence['attachments'][0]
        pages = {p for lo, hi in book['reviewedPageRanges'] for p in range(lo, hi + 1)}
        self.assertEqual(94, len(pages))
        self.assertEqual(len(pages), book['reviewedPageCount'])
        self.assertEqual(132, book['pageCount'] - len(pages))
        self.assertTrue(set(book['visualCheckedPages']) <= pages)
        self.assertFalse(book['wholeDocumentReviewed'])
        self.assertFalse(book['wholeDocumentPublished'])
        for d in self.docs.values():
            if 'pdfPages' in d:
                self.assertTrue(set(range(d['pdfPages'][0], d['pdfPages'][1] + 1)) <= pages)
                self.assertIn(str(d['policyYear']) + '版', d['content'])
                self.assertIn('2026', d['content'])

    def test_publicity_days_not_conflated(self):
        self.assertIn('五天', self.docs['financial-hardship-recognition']['content'])
        self.assertIn('5个工作日', self.docs['tuition-relief-history']['content'])
        self.assertIn('动态调整', self.docs['financial-hardship-recognition']['content'])

    def test_work_study_scope_and_no_current_wage_promise(self):
        text = self.docs['work-study-application']['content']
        for word in ['2019版', '每周不超过8小时', '每月不超过40小时', '不是登记就自动', '校外兼职', '不能拿旧版每小时标准保证今年工资']:
            self.assertIn(word, text)

    def test_admissions_type_and_window_are_explicit(self):
        text = self.docs['adult-admissions-2026']['content']
        for word in ['成人高等学历教育', '不是普通高考', '二年半', '没有列出金额', '不能据此说当前仍能报名']:
            self.assertIn(word, text)

    def test_archive_revision_preserves_target_and_scope(self):
        d = self.docs['archive-service-revision']
        self.assertEqual(20, d['supersedesDocumentId'])
        self.assertIn('08:30—11:30、13:30—16:00', d['content'])
        self.assertIn('不是毕业生个人档案寄送时限', self.docs['archives-faq']['content'])

    def test_site_coverage_not_overclaimed(self):
        self.assertFalse(self.evidence['allSiteLinksExhausted'])
        self.assertFalse(self.evidence['wholeSiteDenominatorKnown'])
        rows = self.evidence['pages']
        self.assertEqual(len(rows), len({r['url'] for r in rows}))
        self.assertEqual(len(rows), self.evidence['summary']['uniqueObservedUrls'])
        self.assertEqual(sum(bool(r['textWindowComplete']) for r in rows), self.evidence['summary']['textWindowsComplete'])

    def test_handbook_revision_keeps_previous_body(self):
        previous = json.loads((ROOT / 'policy-completion-2026-10-09.json').read_text())
        before = next(d for d in previous['documents'] if d['key'] == 'student-handbook-services-2025')
        after = next(d for d in self.pack['documents'] if d.get('supersedesDocumentId') == 65)
        self.assertTrue(after['content'].startswith(before['content'] + '\n\n'))
        for topic in self.pack['topics'][:4]:
            self.assertIn(topic['content'], after['content'])
        self.assertEqual('', after['publishedAt'])

    def test_admissions_contacts_keep_both_types_and_do_not_stuff_aliases(self):
        d = self.docs['admissions-contact-disambiguation']
        self.assertEqual(12, d['supersedesDocumentId'])
        for term in ['022-28776099', '022-28776655', '022-28776599', '普通本科、高职', '研究生', '继续教育']:
            self.assertIn(term, d['content'])
        self.assertEqual('', d['publishedAt'])
        self.assertLess(len(d['content']), 600)


if __name__ == '__main__':
    unittest.main()
