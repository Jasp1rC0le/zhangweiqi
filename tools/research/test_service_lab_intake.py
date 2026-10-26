import hashlib
import json
import unittest
from build_service_lab_intake import build, ROOT, ARCHIVE


class ServiceLabTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.docs = build()['documents']
        cls.evidence = json.loads((ROOT / 'docs/research/service-lab-docx-evidence-2026-10-10.json').read_text())

    def test_two_blank_originals_archived_with_matching_hashes(self):
        self.assertEqual(len(self.evidence['files']), 2)
        for row in self.evidence['files']:
            self.assertEqual(hashlib.sha256((ROOT / row['archive']).read_bytes()).hexdigest(), row['sha256'])
            self.assertTrue(row['textAndTablesReviewed'])
            self.assertFalse(row['containsFilledPersonalData'])
            self.assertFalse(row['captchaSolvedByAgent'])

    def test_failed_render_is_not_a_visual_pass(self):
        self.assertEqual(sum(f['renderedPageCount'] for f in self.evidence['files']), 3)
        self.assertTrue(all(not f['renderedVisualPass'] for f in self.evidence['files']))

    def test_unique_sources_and_content(self):
        self.assertEqual(len(self.docs), 6)
        self.assertEqual(len({d['sourceUrl'] for d in self.docs}), 6)
        self.assertEqual(len({d['sha256'] for d in self.docs}), 6)
        self.assertEqual([d['supersedesDocumentId'] for d in self.docs if 'supersedesDocumentId' in d], [85])
        for d in self.docs:
            self.assertEqual(hashlib.sha256(d['content'].encode()).hexdigest(), d['sha256'])

    def test_proof_materials_and_2002_ambiguity(self):
        body = self.docs[0]['content']
        for phrase in ['1.5寸蓝底', '同版电子照片', '入学录取名册', '双方签字', '5个工作日予以办理或答复', '没有单独解释2002当年', '不等同于学位证明', '材料齐全且经学校核实无误']:
            self.assertIn(phrase, body)

    def test_status_change_fields_not_permission_to_change_grades(self):
        body = self.docs[1]['content']
        for phrase in ['曾用名', '原数据', '新数据', '合法性证明', '学院', '教务处（招生办公室）', '没有规定统一份数', '成绩修改', '不会替学生修改']:
            self.assertIn(phrase, body)

    def test_index_preserves_old_forms_and_removes_stale_claim(self):
        body = self.docs[2]['content']
        for phrase in ['实际停止参与教学活动之日', '复学后班级', '家长签字', '学生退学申请表怎么填', '学院专职副书记', '5188.htm', '5189.htm']:
            self.assertIn(phrase, body)
        self.assertNotIn('毕业证明书等其他附件内容仍未在本批核验', body)

    def test_labs_keep_versions_and_safety_boundaries(self):
        for phrase in ['2020-10-23', '2020-12-18', '2020-11-20', '未经批准不得使用或拆卸', '不是已核实的24小时急救电话']:
            self.assertIn(phrase, self.docs[3]['content'])
        for phrase in ['2022-03-18', '每学期一次', '每学年一次', '专业维修人员', '未读设备保养记录单附件']:
            self.assertIn(phrase, self.docs[4]['content'])

    def test_directory_not_mislabelled_as_read_forms(self):
        body = self.docs[5]['content']
        for phrase in ['附件内容未逐份核读', '不等于全是2024新版', '不表示每个学生可直接据此申请']:
            self.assertIn(phrase, body)

    def test_no_personal_identifiers_or_local_paths_in_published_body(self):
        for d in self.docs:
            self.assertNotIn('/Users/', d['content'])
            self.assertNotRegex(d['content'], r'(?<!\d)\d{17}[\dXx](?!\d)')
            self.assertLess(len(d['content']), 100000)
            self.assertEqual(d['publishedAt'], '')

    def test_eight_reviewed_source_changes_and_six_readbacks(self):
        previews = json.loads((ARCHIVE / 'source-change-previews.json').read_text())
        dismissed = json.loads((ARCHIVE / 'dismiss-results.json').read_text())
        readbacks = json.loads((ARCHIVE / 'readbacks.json').read_text())
        self.assertEqual(len(previews), 8)
        self.assertEqual(len({p['url'] for p in previews}), 4)
        self.assertEqual([(r['before'], r['after']) for r in dismissed], [(n, n-1) for n in range(8,0,-1)])
        self.assertEqual(len(readbacks), 6)
        self.assertTrue(all(r['bodyMatch'] and r['sourceMatch'] and r['titleMatch'] for r in readbacks))


if __name__ == '__main__':
    unittest.main()
