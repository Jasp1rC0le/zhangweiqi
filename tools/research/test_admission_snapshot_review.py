import unittest
from admission_snapshot_review import Links, download_rows, inventory


class SnapshotReviewTest(unittest.TestCase):
    def test_extract_only_observed_official_xlsx_and_dedupe_by_file_id(self):
        parser = Links()
        parser.feed('''<a href="/system/_content/download.jsp?owner=2036629888&wbfileid=3939033">天津.xlsx</a>
          <a href="/system/_content/download.jsp?wbfileid=3939033&owner=2036629888">重复.xlsx</a>
          <a href="https://outside.example/system/_content/download.jsp?owner=2036629888&wbfileid=2">外部.xlsx</a>
          <a href="/system/_content/download.jsp?owner=2&wbfileid=3">其他主体.xlsx</a>
          <a href="/system/_content/download.jsp?owner=2036629888&wbfileid=4">未知.pdf</a>''')
        rows = download_rows(parser.links, 'https://zs.tsguas.edu.cn/info/1015/1736.htm', '3939033')
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['observedAccess'], 'captcha_required')
        self.assertFalse(rows[0]['downloaded'])
        self.assertFalse(rows[0]['valuesReviewed'])

    def test_other_links_are_not_reported_as_captcha_verified(self):
        parser = Links()
        parser.feed('<a href="/system/_content/download.jsp?owner=2036629888&wbfileid=1">省.xlsx</a>')
        rows = download_rows(parser.links, 'https://zs.tsguas.edu.cn/', '2')
        self.assertEqual(rows[0]['observedAccess'], 'not_opened')

    def test_saved_direct_snapshots_have_unique_articles_and_complete_link_receipt(self):
        result = inventory()
        self.assertEqual(result['uniqueObservedIndexArticles'], 21)
        self.assertEqual([len(c['files']) for c in result['catalogs']], [21, 10, 21, 10, 23, 23, 21])
        self.assertEqual(result['attachmentLinks'], 129)
        self.assertEqual(result['captchaSamples'], 7)
        identifiers = [row['fileId'] for c in result['catalogs'] for row in c['files']]
        self.assertEqual(len(identifiers), len(set(identifiers)))
        self.assertFalse(result['publicKnowledgeWrittenByScript'])


if __name__ == '__main__':
    unittest.main()
