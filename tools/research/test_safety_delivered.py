import hashlib
import json
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
RESEARCH=ROOT/'docs/research'
LOCAL=ROOT/'.local/research/safety-delivered-2026-10-10'
def load(path):
    return json.loads(path.read_text())

class SafetyDeliveredEvidenceTest(unittest.TestCase):
    def test_seven_original_files_match_reviewed_hashes(self):
        rows=load(LOCAL/'reviewed-extraction.json')
        self.assertEqual(len(rows),7)
        for row in rows:
            self.assertTrue(row['reviewed'])
            self.assertEqual(hashlib.sha256((ROOT/row['archive']).read_bytes()).hexdigest(),row['sha256'])
        self.assertEqual(sum(r.get('pages') or 0 for r in rows),212)

    def test_seven_normal_admin_readbacks_are_exact(self):
        pack={d['key']:d for d in load(RESEARCH/'safety-delivered-pack-2026-10-10.json')['documents']}
        for number in range(101,108):
            row=load(LOCAL/f'readback-{number}.json')
            self.assertTrue(all(row['check'][key] for key in ['contentMatches','titleMatches','sourceMatches']))
            self.assertEqual(row['body'],pack[row['check']['key']]['content'])

    def test_safety_semantics_not_all_yes_means_safe(self):
        content='\n'.join(d['content'] for d in load(RESEARCH/'safety-delivered-pack-2026-10-10.json')['documents'])
        for marker in ['不能把第7项的“是”当作安全合格','三个签名栏都写“申报人”','已停用','2024']:
            self.assertIn(marker,content)
        self.assertNotRegex(content,r'(?<!\d)1[3-9]\d{9}(?!\d)')
        self.assertNotRegex(content,r'(?<!\d)\d{17}[\dXx](?!\d)')

    def test_teaching_publications_and_scope_repair(self):
        rows=load(LOCAL/'teaching-readbacks.json')
        self.assertEqual([r['id'] for r in rows],[109,110,111])
        self.assertTrue(all(r['bodyMatch'] and r['sourceMatch'] and r['titleMatch'] for r in rows))
        more=load(LOCAL/'teaching-more-readbacks.json')
        self.assertEqual([r['id'] for r in more],[113,114])
        self.assertTrue(all(r['verified'] for r in more))
        scope=load(LOCAL/'readback-115.json')
        self.assertTrue(scope['verified'])
        self.assertIn('23本天津市立项教材以外',scope['content'])
        self.assertIn('不是对那23本教材统一另加',scope['content'])

    def test_household_dates_have_separate_meanings(self):
        row=load(LOCAL/'readback-108.json')
        self.assertTrue(row['contentMatches'])
        self.assertIn('线上截止2026年10月13日',row['body'])
        self.assertIn('2026年10月15日前',row['body'])
        self.assertTrue(load(LOCAL/'readback-112.json')['verified'])

    def test_library_map_and_service_readbacks_match(self):
        self.assertTrue(load(LOCAL/'readback-116.json')['verified'])
        self.assertTrue(load(LOCAL/'readback-117.json')['bodyMatches'])
        mapped=load(LOCAL/'readback-118-normalized.json')
        self.assertTrue(mapped['bodyMatches'])
        self.assertEqual(mapped['content'],load(RESEARCH/'map-road-revision-2026-10-10.json')['content'])
        self.assertTrue(all(r['bodyMatches'] for r in load(LOCAL/'closeout-readbacks.json')))
        self.assertTrue(load(LOCAL/'readback-122.json')['bodyMatches'])
        contact=load(LOCAL/'readback-123.json')
        self.assertTrue(contact['bodyMatches'])
        self.assertIn('未列出咨询电话号码',contact['content'])

    def test_archived_media_hashes_and_pdf_pages(self):
        rows=load(LOCAL/'public-followup/media-evidence.json')
        self.assertEqual(len(rows),4)
        for row in rows:
            self.assertEqual(hashlib.sha256((ROOT/row['archive']).read_bytes()).hexdigest(),row['sha256'])
        self.assertEqual(rows[-1]['pages'],10)
        for page in range(1,11):
            self.assertTrue((LOCAL/f'public-followup/cnki-ai-{page:02}.png').is_file())

    def test_no_false_whole_site_completion(self):
        frontier=load(RESEARCH/'official-frontier-2026-10-10.json')
        self.assertFalse(frontier['allSiteLinksExhausted'])
        self.assertFalse(frontier['wholeSiteDenominatorKnown'])
        self.assertGreater(frontier['counts']['byAction']['read_missing_content'],0)
        urls=[r['url'] for r in frontier['entries']]
        self.assertEqual(len(urls),len(set(urls)))
        handbook=next(r for r in frontier['entries'] if 'FFA266AA8175242C2F0B0E5FE8A' in r['url'])
        self.assertEqual(handbook['latestStatus'],'full_text_reviewed')

    def test_new_captcha_gaps_not_resolved_by_directory_read(self):
        rows=load(RESEARCH/'teaching-followup-evidence-2026-10-10.json')['accessBlockers']
        self.assertEqual(len(rows),15)
        self.assertTrue(all(r['status']=='captcha' for r in rows))
        self.assertEqual(len({r['url'] for r in rows}),15)

    def test_original_fixed_questions_and_new_version_links(self):
        report=(LOCAL/'evaluation-final.txt').read_text()
        self.assertIn('命中 30/30',report)
        self.assertIn('MRR 0.97',report)
        self.assertIn('标准资料 #30 → 当前版本 #118',report)
        self.assertIn('标准资料 #39 → 当前版本 #116',report)

    def test_privacy_exclusions_not_misreported_as_full_read(self):
        rows=load(RESEARCH/'public-followup-evidence-2026-10-10.json')['pages']
        sensitive=next(r for r in rows if r['url']=='https://www.tsguas.edu.cn/info/1158/2546.htm')
        self.assertFalse(sensitive['textWindowComplete'])
        self.assertEqual(sensitive['status'],'partial_or_excluded')
        self.assertIn('不发布名单',sensitive['note'])

if __name__=='__main__':
    unittest.main()
