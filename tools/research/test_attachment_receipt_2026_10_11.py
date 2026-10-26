"""Offline regression tests: never authenticate, fetch, publish or mutate originals."""
import unittest
from intake_attachments_2026_10_11 import download_key, retain_review


class ReceiptTest(unittest.TestCase):
    def test_query_order_does_not_make_another_attachment(self):
        base = 'https://jwc.tsguas.edu.cn/system/_content/download.jsp?'
        self.assertEqual(download_key(base + 'owner=1&wbfileid=2&urltype=news.DownloadAttachUrl'),
                         download_key(base + 'wbfileid=2&urltype=news.DownloadAttachUrl&owner=1'))
        self.assertNotEqual(download_key(base + 'owner=1&wbfileid=2'),
                            download_key(base + 'owner=1&wbfileid=3'))

    def test_same_bytes_keep_review_and_publication(self):
        old = {'sha256': 'a', 'humanReviewed': True, 'published': True,
               'documentId': 128, 'reviewedAt': 'recorded', 'renderNote': 'font limitation'}
        fresh = {'sha256': 'a', 'humanReviewed': False, 'published': False, 'chars': 42}
        row = retain_review(fresh, old)
        self.assertTrue(row['humanReviewed'])
        self.assertTrue(row['published'])
        self.assertEqual(row['documentId'], 128)
        self.assertEqual(row['chars'], 42)

    def test_different_bytes_never_inherit_review(self):
        row = retain_review({'sha256': 'b', 'humanReviewed': False},
                            {'sha256': 'a', 'humanReviewed': True, 'documentId': 128})
        self.assertFalse(row['humanReviewed'])
        self.assertNotIn('documentId', row)

    def test_archive_member_review_requires_matching_bytes(self):
        old = {'sha256': 'zip', 'members': [{'sha256': 'a', 'humanReviewed': True},
                                           {'sha256': 'b', 'humanReviewed': True}]}
        fresh = {'sha256': 'zip', 'members': [{'sha256': 'a', 'humanReviewed': False},
                                             {'sha256': 'c', 'humanReviewed': False}]}
        rows = retain_review(fresh, old)['members']
        self.assertTrue(rows[0]['humanReviewed'])
        self.assertFalse(rows[1]['humanReviewed'])


if __name__ == '__main__':
    unittest.main()
