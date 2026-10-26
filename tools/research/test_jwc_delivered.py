import hashlib
import json
import unittest
from pathlib import Path

from pypdf import PdfReader
from build_jwc_delivered import build, normalized_body, ROOT, FILES


class DeliveredJwcTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pack = build()
        cls.docs = cls.pack['documents']
        cls.evidence = json.loads((ROOT / 'docs/research/jwc-delivered-evidence-2026-10-10.json').read_text())

    def test_six_unique_public_files_25_pages(self):
        rows = self.evidence['files']
        self.assertEqual(len(rows), 6)
        self.assertEqual(sum(r['pageCount'] for r in rows), 25)
        self.assertEqual(len({r['sha256'] for r in rows}), 6)
        for row in rows:
            self.assertEqual(hashlib.sha256((ROOT / row['archive']).read_bytes()).hexdigest(), row['sha256'])
            self.assertEqual(row['textPagesReviewed'], list(range(1, row['pageCount'] + 1)))
            self.assertFalse(row['containsFilledPersonalData'])
            self.assertFalse(row['captchaSolvedByAgent'])

    def test_actual_same_bodies_not_merely_similar_titles(self):
        book = PdfReader(ROOT / '.local/research/official-2026-10-09/student-handbook-2025.pdf')
        for row, (lo, hi) in zip(self.evidence['files'][:2], [(67, 70), (51, 66)]):
            supplied = PdfReader(ROOT / row['archive'])
            self.assertEqual(normalized_body(supplied.pages), normalized_body(book.pages[lo-1:hi]))

    def test_only_one_new_topic_two_revisions(self):
        self.assertEqual([d.get('supersedesDocumentId') for d in self.docs], [77, 19, None])
        self.assertEqual(len({d['sourceUrl'] for d in self.docs}), 3)
        for d in self.docs:
            self.assertEqual(hashlib.sha256(d['content'].encode()).hexdigest(), d['sha256'])

    def test_stale_unread_claims_removed_but_other_sections_kept(self):
        body = self.docs[0]['content']
        for phrase in ['专项办法单独附件尚未核验', '教务处6份独立附件仍受下载验证码阻挡']:
            self.assertNotIn(phrase, body)
        for phrase in ['勤工助学申请与工时', '学费减免申请', '学生申诉怎么提出及期限冲突', '宿舍钥匙、维修和用电安全', '健康成长中心位置和预约']:
            self.assertIn(phrase, body)

    def test_version_not_relabelled_2026(self):
        for d in self.docs:
            self.assertEqual(d['publishedAt'], '')
        self.assertIn('第一章至末尾的正文', self.docs[0]['content'])
        self.assertIn('是否另有后续替代文件尚未确认', self.docs[0]['content'])
        self.assertIn('2021年3月19日', self.docs[2]['content'])

    def test_gpa_grade_and_appeal_scopes(self):
        body = self.docs[0]['content']
        for phrase in ['三年制高职标准3年、最长5年', '三二分段高职标准2年、最长4年', '低于70分按实际分数', '决定公布之日起10日', '接到退学决定书之日起10日', '达到5门但不足7门', '达到7门及以上', '两门考查课折算一门考试课']:
            self.assertIn(phrase, body)

    def test_forms_are_fields_not_fake_approval(self):
        body = self.docs[1]['content']
        for phrase in ['复学后班级', '家长签字', '学院专职副书记', '实际停止参与教学活动之日', '下一学年对应学期开学报到日期', '毕业证明书等其他附件内容仍未', '不是线上提交就自动退学', '未列休学起止日期']:
            self.assertIn(phrase, body)

    def test_veteran_scope_copies_and_privacy(self):
        body = self.docs[2]['content']
        for phrase in ['公共体育、军事技能、军事理论', '自愿申请', '90分', '一式三份', '不承诺批准后即时显示', '2021年3月19日', '逾期不予补办', '不上传公共问答或校园墙']:
            self.assertIn(phrase, body)

    def test_all_six_source_pages_accounted_for(self):
        combined = '\n'.join(d['content'] for d in self.docs)
        for row in self.evidence['files']:
            self.assertIn(row['sourceUrl'], combined)

    def test_no_personal_paths_or_credentials_in_published_body(self):
        for d in self.docs:
            self.assertNotIn('/Users/', d['content'])
            self.assertNotIn('JasperCole', d['content'])
            self.assertLess(len(d['content']), 100000)


if __name__ == '__main__':
    unittest.main()
