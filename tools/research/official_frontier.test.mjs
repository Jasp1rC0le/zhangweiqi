import assert from 'node:assert/strict'
import test from 'node:test'
import { buildFrontier, officialUrl } from './official_frontier.mjs'

const url = 'https://jwc.tsguas.edu.cn/rules.htm'
const input = pages => [{ name: 'fixture', data: { pages } }]
test('accepts only public school URLs without credentials or auth parameters', () => {
  for (const value of ['https://tsguas.edu.cn.evil.test/', 'file:///tmp/a', 'http://127.0.0.1/',
    'https://a:pass@jwc.tsguas.edu.cn/', url + '?ticket=secret']) assert.equal(officialUrl(value), null)
  assert.equal(officialUrl(url), url)
})
test('preserves download IDs and separate HTTP routes', () => {
  const rows = [url, url.replace('https:', 'http:'), url + '?wbfileid=1', url + '?wbfileid=2'].map(url => ({ url }))
  assert.equal(buildFrontier(input(rows)).counts.knownOfficialUrls, 4)
})
test('CMS conversion markup is not a school resource URL', () => {
  for (const value of [
    "https://hqjj.tsguas.edu.cn/<span style='color:red'>转换链接错误</span>",
    'https://hqjj.tsguas.edu.cn/bmgk/%3Cspan%20style=color:red%3E转换链接错误%3C/span%3E',
    'https://hqjj.tsguas.edu.cn/info/1007/%3cSPAN%3eerror%3c%2fSPAN%3e',
    'https://hqjj.tsguas.edu.cn/%3C%73%70%61%6e%3Eerror%3C/span%3E',
  ]) assert.equal(officialUrl(value), null)
})
test('filtering markup preserves encoded Chinese and legacy-byte download paths', () => {
  for (const value of [
    'https://jwc.tsguas.edu.cn/附件/课程表.pdf',
    'https://jwc.tsguas.edu.cn/%B9%E6%D4%F2.pdf',
    'https://jwc.tsguas.edu.cn/download.jsp?wbfileid=42&name=%3Ctag%3E',
  ]) assert.equal(officialUrl(value), new URL(value).href)
})
test('CMS error links remain source-page hints instead of pending downloads', () => {
  const result = buildFrontier(input([{ url, discoveredLinks: [
    { label: '校园地图', url: 'https://hqjj.tsguas.edu.cn/%3Cspan%3E转换链接错误%3C/span%3E' },
  ] }]))
  assert.equal(result.counts.knownOfficialUrls, 1)
  assert.equal(result.counts.unresolvedNavigationHints, 1)
  assert.equal(result.unresolvedNavigationHints[0].parentUrl, url)
  assert.equal(result.unresolvedNavigationHints[0].label, '校园地图')
})
test('failed reread keeps historical evidence but stays pending', () => {
  const result = buildFrontier(input([{ url, status: 'read' }, { url, status: 'fetch_failed' }]))
  assert.equal(result.entries[0].everRead, true)
  assert.equal(result.entries[0].nextAction, 'read_missing_content')
  assert.equal(result.entries[0].observations.length, 2)
  assert.equal(result.entries[0].published, 'not_inferred_from_reading')
})
test('403 and captcha cannot be erased by a later read', () => {
  const result = buildFrontier([{ name: 'fixture', data: { pages: [{ url, status: 'captcha_required' }, { url, status: 'read' }] } }])
  assert.equal(result.entries[0].nextAction, 'needs_normal_access_or_authorized_export')
})
test('unknown destinations remain navigation hints not invented pages', () => {
  const result = buildFrontier(input([{ url, discoveredLinks: [{ label: '下一页', locatorHint: 8 },
    { label: '下一页', locatorHint: 8 }, { label: '下载', url: url + '?wbfileid=42' }] }]))
  assert.equal(result.counts.knownOfficialUrls, 2)
  assert.equal(result.counts.unresolvedNavigationHints, 1)
  assert.deepEqual(result.entries.find(e => e.url.includes('?')).parents, [url])
})
test('complete text windows never prove a full subtree or whole site', () => {
  const result = buildFrontier(input([{ url, status: 'text_returned', textWindowComplete: true }]))
  assert.equal(result.allSiteLinksExhausted, false)
  assert.equal(result.wholeSiteDenominatorKnown, false)
  assert.equal(result.entries[0].subtreeComplete, false)
  assert.equal(result.entries[0].nextAction, 'review_links_and_attachments')
})
test('a fully reviewed public user copy resolves content only and retains captcha history', () => {
  const result = buildFrontier(input([{ url, status: 'captcha_required' },
    { url, status: 'attachment_reviewed_from_user_copy', textWindowComplete: true,
      evidence: 'public_pdf_reviewed_sha256:' + 'a'.repeat(64) }]))
  assert.equal(result.entries[0].nextAction, 'review_future_source_updates')
  assert.equal(result.entries[0].observations[0].status, 'captcha_required')
  assert.equal(result.entries[0].published, 'not_inferred_from_reading')
  assert.equal(result.entries[0].subtreeComplete, false)
})
test('an unverified or partial user copy does not resolve the blocker', () => {
  for (const row of [
    { textWindowComplete: true },
    { evidence: 'public_pdf_reviewed_sha256:' + 'a'.repeat(64) },
    { textWindowComplete: true, evidence: 'public_pdf_reviewed_sha256:invalid' },
  ]) {
    const result = buildFrontier(input([{ url, status: 'captcha_required' },
      { url, status: 'attachment_reviewed_from_user_copy', ...row }]))
    assert.equal(result.entries[0].nextAction, 'needs_normal_access_or_authorized_export')
  }
})
test('reviewed DOCX closes the content gap without claiming publication or solving captcha', () => {
  const result = buildFrontier(input([{ url, status: 'captcha_required' },
    { url, status: 'attachment_reviewed_from_user_copy', textWindowComplete: true,
      evidence: 'public_docx_reviewed_sha256:' + 'b'.repeat(64) }]))
  assert.equal(result.entries[0].nextAction, 'review_future_source_updates')
  assert.equal(result.entries[0].observations[0].status, 'captcha_required')
  assert.equal(result.entries[0].published, 'not_inferred_from_reading')
})

test('reviewed legacy DOC preserves the original access blocker', () => {
  const result=buildFrontier(input([{url,status:'captcha_required'},
    {url,status:'attachment_reviewed_from_user_copy',textWindowComplete:true,
      evidence:'public_doc_reviewed_sha256:'+'c'.repeat(64)}]))
  assert.equal(result.entries[0].nextAction,'review_future_source_updates')
  assert.equal(result.entries[0].observations[0].status,'captcha_required')
  assert.equal(result.allSiteLinksExhausted,false)
})

test('received office files leave the download queue but do not imply review or publication', () => {
  for (const type of ['pdf', 'docx', 'doc', 'xlsx', 'rar', 'zip']) {
    const result = buildFrontier(input([{ url, status: 'captcha_required' },
      { url, status: 'attachment_extracted_from_user_copy', textWindowComplete: false,
        evidence: `public_${type}_extracted_sha256:` + 'd'.repeat(64) }]))
    const entry = result.entries[0]
    assert.equal(entry.nextAction, 'review_received_attachment')
    assert.equal(entry.everRead, false)
    assert.equal(entry.observations[0].status, 'captcha_required')
    assert.equal(entry.published, 'not_inferred_from_reading')
    assert.equal(entry.subtreeComplete, false)
  }
})

test('reviewed workbook and archive clear only the content gap, not publication', () => {
  for (const type of ['xlsx', 'rar', 'zip']) {
    const result = buildFrontier(input([{ url, status: 'captcha_required' },
      { url, status: 'attachment_reviewed_from_user_copy', textWindowComplete: true,
        evidence: `public_${type}_reviewed_sha256:` + 'e'.repeat(64) }]))
    assert.equal(result.entries[0].nextAction, 'review_future_source_updates')
    assert.equal(result.entries[0].observations[0].status, 'captcha_required')
    assert.equal(result.entries[0].published, 'not_inferred_from_reading')
  }
})

test('a receipt without a valid extraction hash does not resolve a download blocker', () => {
  for (const evidence of [null, 'public_pdf_extracted_sha256:invalid', 'public_exe_extracted_sha256:' + 'a'.repeat(64)]) {
    const result = buildFrontier(input([{ url, status: 'captcha_required' },
      { url, status: 'attachment_extracted_from_user_copy', evidence }]))
    assert.equal(result.entries[0].nextAction, 'needs_normal_access_or_authorized_export')
  }
})
