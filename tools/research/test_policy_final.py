import hashlib
import json
import unittest
from pathlib import Path

from build_policy_final import build

ROOT = Path(__file__).resolve().parents[2]
REVIEW = json.loads((ROOT / 'docs/research/policy-final-review-2026-10-10.json').read_text())


def pages(ranges):
    return [p for start, end in ranges for p in range(start, end + 1)]


class FinalPolicyTest(unittest.TestCase):
    def test_page_union_is_exact_and_disjoint(self):
        book = REVIEW['handbook']
        old, new = pages(book['previousReviewedRanges']), pages(book['newReviewedRanges'])
        self.assertEqual((len(old), len(new)), (94, 132))
        self.assertEqual(len(set(old + new)), 226)
        self.assertEqual(set(old + new), set(range(1, 227)))

    def test_image_page_not_counted_as_text(self):
        self.assertEqual(REVIEW['handbook']['imageOnlyPage']['page'], 6)
        self.assertTrue(REVIEW['handbook']['imageOnlyPage']['reviewed'])

    def test_revision_preserves_entire_prior_body(self):
        revision = REVIEW['revision']
        base = json.loads((ROOT / revision['baseFile']).read_text())
        old = next(d for d in base['documents'] if d['key'] == revision['baseKey'])
        new = build()['documents'][0]
        self.assertEqual(new['content'], old['content'] + revision['appendContent'])
        self.assertEqual(new['sourceUrl'], old['sourceUrl'])
        self.assertEqual(new['supersedesDocumentId'], 72)

    def test_unique_sources_and_hashes(self):
        docs = build()['documents']
        self.assertEqual(len(docs), 6)
        self.assertEqual(len({d['sourceUrl'] for d in docs}), 6)
        for doc in docs:
            self.assertEqual(hashlib.sha256(doc['content'].encode()).hexdigest(), doc['sha256'])
            self.assertNotIn('#', doc['sourceUrl'])

    def test_conflicts_and_stale_terms_not_flattened(self):
        text = build()['documents'][0]['content']
        for keyword in ['10日', '10个工作日', '期限冲突', '2016', '2017', '不作为2026', '验证码']:
            self.assertIn(keyword, text)

    def test_elective_deadline_and_targeted_makeup(self):
        text = build()['documents'][1]['content']
        for phrase in ['10月10日12:00', '10月12日12:00至18:00', '不是所有学生补选', '2026级新生', '08:00', '不足20人']:
            self.assertIn(phrase, text)

    def test_fee_does_not_collect_credentials_or_invent_amount(self):
        text = build()['documents'][3]['content']
        self.assertIn('本说明未列统一金额', text)
        self.assertIn('不代表学校其他通知未公布收费标准', text)
        self.assertIn('Campthink网站不代收款', text)
        self.assertIn('不索取密码验证码', text)
        self.assertNotIn('身份证后六位', text)

    def test_historical_project_scope(self):
        text = build()['documents'][4]['content']
        for phrase in ['窗口现已结束', '第二届', 'C-310', '未取得附件文件']:
            self.assertIn(phrase, text)

    def test_exclusions_are_not_publications(self):
        published = {d['sourceUrl'] for d in build()['documents']}
        self.assertTrue(all(e['sourceUrl'] not in published for e in REVIEW['excludedFromNewPublication']))

    def test_captcha_not_claimed_downloaded(self):
        evidence = json.loads((ROOT / 'docs/research/policy-final-evidence-2026-10-10.json').read_text())
        self.assertEqual(len(evidence['attachments']), 6)
        flow = evidence['normalDownloadFlow']
        self.assertTrue(flow['userAuthorizedCaptcha'])
        self.assertFalse(flow['captchaCompleted'])
        self.assertEqual(flow['filesDownloaded'], 0)
        for row in evidence['attachments']:
            self.assertEqual(row['state'], 'captcha_required')
            self.assertFalse(row['reviewed'])
            self.assertFalse(row['imported'])

    def test_pagination_deduplicates_overlapping_pages(self):
        evidence = json.loads((ROOT / 'docs/research/policy-final-evidence-2026-10-10.json').read_text())
        p = evidence['pagination']
        self.assertEqual([x['listedLinks'] for x in p['pages']], [20, 39, 20])
        self.assertEqual(len({x['url'] for x in p['articles']}), 47)
        self.assertEqual(p['uniqueArticleCount'], 47)
        additional = evidence['additionalArticleChecks']
        self.assertEqual(len(additional), 44)
        all_read = {r['url'] for r in additional}
        all_read.update(r['url'] for r in evidence['articleChecks'] if r['status'] == 'full_text_reviewed')
        self.assertTrue({r['url'] for r in p['articles']}.issubset(all_read))
        self.assertTrue(all(not r['bodyImagesReviewed'] for r in additional))

    def test_cross_discipline_is_historical_not_recruitment_promise(self):
        text = build()['documents'][5]['content']
        for phrase in ['2024年12月27日', '2026年6月11日', '当前是否仍招', '没有接通报名', '不是同一赛事']:
            self.assertIn(phrase, text)

    def test_seven_original_images_have_provenance(self):
        evidence = json.loads((ROOT / 'docs/research/policy-final-evidence-2026-10-10.json').read_text())
        self.assertEqual(len(evidence['images']), 7)
        for image in evidence['images']:
            self.assertTrue(image['visuallyReviewed'])
            self.assertEqual(len(image['sha256']), 64)
            self.assertTrue(image['url'].startswith('https://'))


if __name__ == '__main__':
    unittest.main()
