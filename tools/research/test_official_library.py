import unittest
import copy
import json
from admissions_library import load_admissions, validate_admissions
from official_library import build, export, export_admissions, load_and_validate, search


class OfficialLibraryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        build()

    def test_full_register_and_all_cards(self):
        register, cards = load_and_validate()
        self.assertEqual(63, len(register["sources"]))
        self.assertEqual(21, len(cards["cards"]))

    def test_two_character_chinese(self):
        result = search("电费", "2026-10-04")
        self.assertIn("K13", [c["id"] for c in result["answerCards"]])

    def test_old_sports_information_is_not_an_answer(self):
        result = search("体育馆", "2026-10-04", archive=True)
        self.assertEqual([], result["answerCards"])
        self.assertTrue(result["pendingQuestions"])
        self.assertNotIn("S37", [s["id"] for c in result["answerCards"] for s in c["sources"]])
        self.assertTrue(any(s["id"] == "S37" for s in result["referenceOnly"]))

    def test_expired_hukou_card_is_removed(self):
        self.assertIn("K17", [c["id"] for c in search("10月13日", "2026-10-13")["answerCards"]])
        self.assertEqual([], search("10月13日", "2026-10-14")["answerCards"])

    def test_review_due_and_future_evidence_are_removed(self):
        self.assertEqual([], search("电费", "2026-12-01")["answerCards"])
        self.assertEqual([], search("电费", "2026-10-03")["answerCards"])

    def test_scopes_do_not_leak_into_student_answers(self):
        self.assertEqual([], search("备案", "2026-10-04")["answerCards"])
        result = search("备案", "2026-10-04", scope="operations", archive=True)
        self.assertTrue(result["referenceOnly"])
        self.assertTrue(all(s["scope"] == "operations" for s in result["referenceOnly"]))

    def test_queries_are_literal_and_parameterized(self):
        self.assertEqual([], search("' OR 1=1 --", "2026-10-04")["answerCards"])
        self.assertEqual([], search("%", "2026-10-04")["answerCards"])

    def test_export_stays_scoped_and_expires_at_review_boundary(self):
        result = export(12345,"2026-10-04")
        self.assertEqual(18, len(result))
        self.assertEqual(len(result),len({r["sourceUrl"] for r in result}))
        merged = next(r for r in result if r["sourceUrl"].endswith("1006/1847.htm"))
        self.assertIn("宿舍电费怎么交",merged["content"])
        self.assertIn("宿舍门禁和断电时间是什么",merged["content"])
        self.assertIn("住宿服务去哪里咨询",merged["content"])
        self.assertTrue(all(r["schoolId"] == 12345 for r in result))
        self.assertTrue(all(r["sourceUrl"].startswith("https://") for r in result))
        deadline = next(r for r in result if r["title"] == "2026年迁入学校集体户籍什么时候申请")
        self.assertEqual("2026-10-14T00:00:00", deadline["expiresAt"])
        self.assertEqual([], export(12345,"2026-12-01"))
        with self.assertRaises(ValueError):
            export(0,"2026-10-04")

    def test_user_correction_supersedes_old_word_thresholds(self):
        groups = {g['id']: g for g in load_admissions()['generalGaokao']['groups']}
        expected = {'art': (490,495), 'physics_chemistry': (500,505), 'physics': (510,None),
                    'unrestricted': (510,520), 'vocational_gaokao': (245,None)}
        self.assertEqual(expected, {k:(g['tryAbove'],g['hopeAbove']) for k,g in groups.items()})
        self.assertEqual(34064, groups['physics_chemistry']['rank2025'])
        self.assertEqual(180, groups['physics_chemistry']['addedSeats2026Reported'])
        self.assertEqual('2026-10-04', groups['physics_chemistry']['expansionConfirmedAt'])
        self.assertEqual('2025年中德增加180个招生计划', groups['physics_chemistry']['expansionStatementRaw'])
        self.assertEqual('语文数学外语三科总分', groups['vocational_gaokao']['scoreBasis'])

    def test_confirmed_expansion_year_reaches_retrieval_without_old_wording(self):
        issue = next(i for i in load_admissions()['issues'] if i['id'] == 'Q03')
        self.assertEqual('resolved_by_user', issue['status'])
        result = search('180', '2026-10-04', archive=True)['admissionsReference']
        self.assertEqual(['G-physics_chemistry'], [r['id'] for r in result])
        self.assertIn('对应2026年', result[0]['content'])
        self.assertNotIn('2025年中德增加180', result[0]['content'])
        published = json.dumps(export_admissions(12345, '2026-10-04'), ensure_ascii=False)
        self.assertNotIn('2025年中德增加180', published)
        self.assertNotIn('待确认年份', published)

    def test_classified_plan_totals_and_result_grain(self):
        c = load_admissions()['classifiedAdmissions']
        self.assertEqual((210,120,90), (c['totalSeats'],c['bachelorSeats'],c['vocationalSeats']))
        self.assertEqual(6, len(c['plans']))
        self.assertEqual(12, len(c['officialResults']))
        results = {(r['year'],r['programCode']): r['min'] for r in c['officialResults']}
        self.assertEqual(574, results[2025,'01'])
        self.assertEqual(551, results[2026,'01'])
        self.assertEqual(574, results[2026,'03'])

    def test_invalid_admissions_data_fails_closed(self):
        pack = load_admissions()
        bad = copy.deepcopy(pack)
        bad['classifiedAdmissions']['totalSeats'] = 211
        with self.assertRaisesRegex(ValueError, 'total mismatch'):
            validate_admissions(bad)
        bad = copy.deepcopy(pack)
        bad['classifiedAdmissions']['officialResults'][0]['sourceId'] = 'A05'
        with self.assertRaisesRegex(ValueError, 'unverified public result'):
            validate_admissions(bad)
        bad = copy.deepcopy(pack)
        bad['classifiedAdmissions']['officialResults'].append(bad['classifiedAdmissions']['officialResults'][0])
        with self.assertRaisesRegex(ValueError, 'duplicate result'):
            validate_admissions(bad)

    def test_admissions_archive_does_not_leak_into_default_answers(self):
        self.assertEqual([], search('490', '2026-10-04')['answerCards'])
        self.assertEqual([], search('490', '2026-10-04')['admissionsReference'])
        result = search('490', '2026-10-04', archive=True)['admissionsReference']
        self.assertEqual(['G-art'], [r['id'] for r in result])
        self.assertEqual('consultation_estimate', result[0]['kind'])
        self.assertIn('user_confirmed_text', result[0]['provenance'])
        self.assertEqual([], search('490', '2026-10-03', archive=True)['admissionsReference'])
        self.assertEqual([], search('490', '2026-10-04', scope='operations', archive=True)['admissionsReference'])
        self.assertEqual([], search('%', '2026-10-04', archive=True)['admissionsReference'])

    def test_internal_faq_and_unread_article_are_not_exported(self):
        pack = load_admissions()
        sources = {s['id']: s for s in pack['sources']}
        self.assertEqual('internal_only', sources['A02']['access'])
        self.assertEqual('unread', sources['A05']['status'])
        exported = json.dumps(export(12345, '2026-10-04'), ensure_ascii=False)
        self.assertNotIn('495分以上有希望', exported)
        self.assertNotIn('招生志愿者', exported)
        self.assertNotIn('mp.weixin.qq.com', exported)

    def test_admissions_review_export_is_provenanced_and_separate(self):
        result = export_admissions(12345, '2026-10-04')
        self.assertEqual(14, len(result))
        self.assertTrue(all(r['sourceUrl'] is None and r['publishedAt'] is None for r in result))
        self.assertTrue(all(r['schoolId'] == 12345 for r in result))
        self.assertTrue(all('需管理员审核' in r['sourceDepartment'] for r in result))
        self.assertTrue(all('不是发布日期' in r['content'] for r in result))
        self.assertTrue(all('招生志愿者内部使用' not in r['content'] for r in result))
        self.assertEqual([], export_admissions(12345, '2026-10-03'))
        with self.assertRaises(ValueError):
            export_admissions(0, '2026-10-04')

    def test_past_events_and_contact_updates_are_explicit(self):
        pack = load_admissions()
        self.assertTrue(all(e['statusAtIngestion'] == 'ended' for e in pack['events']))
        self.assertIn('未明确具体批次', pack['events'][0]['note'])
        self.assertEqual('2026-06-26', pack['events'][1]['date'])
        _, cards = load_and_validate()
        contact = next(c for c in cards['cards'] if c['id'] == 'K01')
        self.assertIn('022-28776655', contact['answer'])
        self.assertNotIn('28776716', contact['answer'])


if __name__ == "__main__":
    unittest.main()
