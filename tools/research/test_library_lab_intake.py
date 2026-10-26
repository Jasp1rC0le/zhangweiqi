import hashlib
import json
import unittest
from build_library_lab_intake import build, ROOT, SOURCE_DATES


class LibraryLabIntakeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.docs = build()['documents']
        cls.folder = ROOT / '.local/research/library-lab-2026-10-10'

    def test_unique_sources_and_hashes(self):
        self.assertEqual(len(self.docs), 5)
        self.assertEqual(len({d['sourceUrl'] for d in self.docs}), 5)
        self.assertEqual(len({d['sha256'] for d in self.docs}), 5)
        for d in self.docs:
            self.assertEqual(hashlib.sha256(d['content'].encode()).hexdigest(), d['sha256'])

    def test_library_registration_and_translation_limits(self):
        body = self.docs[0]['content']
        for phrase in ['校园网IP范围内', '20M内PDF', '英中', '导出题录不等于获得全文下载权限', '不是本站已实测', '2025-10-13']:
            self.assertIn(phrase, body)

    def test_career_resources_not_live_jobs_or_free_access_promise(self):
        body = self.docs[1]['content']
        for phrase in ['2025-10-09', '不是学校当前岗位招聘公告', '不能承诺全库永久免费', '6页']:
            self.assertIn(phrase, body)

    def test_consumables_scope_and_deadline(self):
        body = self.docs[2]['content']
        for phrase in ['2020-10-15', '不自动适用于每个学院', '定量提供', '开课前15天办完申请审批', '独立空白附件未在本批取得']:
            self.assertIn(phrase, body)

    def test_paper_and_electronic_retention_not_conflated(self):
        body = self.docs[3]['content']
        for phrase in ['本科层次5年', '高职层次3年', '电子版永久保留', '不是学生个人学籍', '主管领导签字']:
            self.assertIn(phrase, body)

    def test_food_restriction_scope(self):
        body = self.docs[4]['content']
        self.assertIn('适用于中小学、幼儿园', body)
        self.assertIn('不能直接改写为本大学一概禁售', body)
        self.assertIn('2026-03-31', body)

    def test_downloads_are_preserved_with_hashes(self):
        rows = json.loads((self.folder/'download-evidence.json').read_text())['entries']
        self.assertEqual([r['pageCount'] for r in rows], [1, 33, 6])
        for row in rows:
            self.assertEqual(hashlib.sha256((ROOT/row['archive']).read_bytes()).hexdigest(), row['sha256'])

    def test_published_readbacks_and_no_preexisting_title(self):
        readbacks = json.loads((self.folder/'readbacks.json').read_text())
        before = (self.folder/'list-before.txt').read_text()
        self.assertEqual(len(readbacks), 5)
        self.assertTrue(all(r['bodyMatch'] and r['titleMatch'] and r['sourceMatch'] for r in readbacks))
        for doc in self.docs:
            self.assertNotIn(doc['title'], before)
            self.assertNotIn('/Users/', doc['content'])
            self.assertEqual(doc['publishedAt'], SOURCE_DATES[doc['key']])

    def test_date_corrections_keep_original_ids(self):
        rows = json.loads((self.folder/'date-results.json').read_text())
        self.assertEqual([r['id'] for r in rows], [93,94,95,96,97])
        self.assertTrue(all('未重复入库' in r['status'] for r in rows))

    def test_housing_revision_preserves_old_answers(self):
        pack = json.loads((ROOT/'docs/research/housing-revision-2026-10-10.json').read_text())
        self.assertTrue(pack['content'].startswith((self.folder/'old-housing.txt').read_text()))
        self.assertTrue(json.loads((self.folder/'housing-readback.json').read_text())['bodyMatch'])
        for phrase in ['每月1日每人7度', '空调无赠电', '0.3元/升', '0.06元/升', '原9月30日办理窗口已过']:
            self.assertIn(phrase, pack['content'])

    def test_student_card_sources_and_unknown_closing_year(self):
        pack = json.loads((ROOT/'docs/research/student-card-pack-2026-10-10.json').read_text())
        body = pack['documents'][0]['content']
        for phrase in ['2024-11-08', '学生证不是消费用校园一卡通', '仅针对补办火车票学生优惠卡',
                       '未提供年份', '不能据此判断2026年10月仍停办', '未验证表单当前可用']:
            self.assertIn(phrase, body)
        self.assertFalse(pack['screenshot']['formAvailabilityVerified'])

    def test_exam_proof_requires_exam_specific_confirmation(self):
        pack = json.loads((ROOT/'docs/research/student-card-pack-2026-10-10.json').read_text())
        body = pack['documents'][1]['content']
        for phrase in ['2026年6月考次', '近期免冠照片', '普通在读证明不一定', '先说明要参加的考试名称和考次',
                       '不能替学生承诺']:
            self.assertIn(phrase, body)


if __name__ == '__main__':
    unittest.main()
