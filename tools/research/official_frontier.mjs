// Offline queue builder: never fetches a URL, authenticates, or publishes knowledge.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function officialUrl(value) {
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null
    if (url.hostname !== 'tsguas.edu.cn' && !url.hostname.endsWith('.tsguas.edu.cn')) return null
    if ([...url.searchParams.keys()].some(key => /token|password|ticket|session|secret|auth|code/i.test(key))) return null
    // Some CMS hrefs contain literal "转换链接错误" HTML. Resolve these in the
    // source page, not as resource URLs. Byte decoding detects escaped ASCII
    // tags without rejecting legacy non-UTF8 filenames or changing the URL.
    const pathSignal = url.pathname.replace(/%([0-9a-f]{2})/gi,
      (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    if (/<\/?[a-z][^>]*>/i.test(pathSignal)) return null
    // Keep query order, scheme and fragments: downloads and SPA routes may differ.
    return url.href
  } catch { return null }
}

const blockedStates = /captcha|login|restricted|403|denied|校内|登录|验证码/i
const unreadStates = /fail|timeout|unresolved|unread|partial|metadata|excerpt/i

export function buildFrontier(inputs) {
  const pages = new Map(), hints = new Map(), rejected = []
  function page(value) {
    const url = officialUrl(value)
    if (!url) return null
    if (!pages.has(url)) pages.set(url, { url, observations: [], parents: [], accessBlockers: [] })
    return pages.get(url)
  }
  for (const { name, data } of inputs) {
    for (const row of data.pages || data.entries || data.sources || []) {
      const entry = page(row.url)
      if (!entry) { if (row.url) rejected.push({ source: name, url: row.url }); continue }
      entry.observations.push({ source: name, checkedAt: row.checkedAt || data.checkedAt || data.completedOn || null,
        status: row.status || 'unknown', evidence: row.evidence || null,
        textWindowComplete: row.textWindowComplete === true, note: row.note || row.limitation || null })
      if (row.parentUrl && officialUrl(row.parentUrl)) entry.parents.push(officialUrl(row.parentUrl))
      for (const link of row.discoveredLinks || []) {
        const target = page(link.url)
        if (target) target.parents.push(entry.url)
        else if (link.label) {
          // A locator is a lead, not a URL or a distinct article. Never guess a destination.
          const key = JSON.stringify([entry.url, link.label, link.locatorHint ?? null])
          if (!hints.has(key)) hints.set(key, { parentUrl: entry.url, label: link.label,
            locatorHint: link.locatorHint ?? null, status: 'resolve_in_source_page', source: name })
        }
      }
    }
    for (const blocker of data.accessBlockers || []) {
      const target = page(blocker.url)
      if (target) target.accessBlockers.push({ ...blocker, source: name })
    }
  }
  const entries = [...pages.values()].map(entry => {
    const observations = entry.observations
    const latest = observations.at(-1)
    const blocked = entry.accessBlockers.length > 0 || observations.some(o => blockedStates.test(o.status))
    let nextAction = !latest ? 'read_discovered_url' : 'review_links_and_attachments'
    if (latest && (unreadStates.test(latest.status) || unreadStates.test(latest.evidence || '') || latest.status === 'unknown')) nextAction = 'read_missing_content'
    if (blocked) nextAction = 'needs_normal_access_or_authorized_export'
    // Extraction is a receipt, not a review. Do not request the same user file again.
    if (latest?.status === 'attachment_extracted_from_user_copy'
      && /^public_(?:pdf|docx|doc|xlsx|rar|zip)_extracted_sha256:[a-f0-9]{64}$/.test(latest.evidence || '')) {
      nextAction = 'review_received_attachment'
    }
    // A reviewed user copy resolves the content gap, not the remote access restriction.
    // Keep every historical blocker; ordinary successful reads still cannot clear one.
    if (latest?.status === 'attachment_reviewed_from_user_copy' && latest.textWindowComplete
      && /^public_(?:pdf|docx|doc|xlsx|rar|zip)_reviewed_sha256:[a-f0-9]{64}$/.test(latest.evidence || '')) {
      nextAction = 'review_future_source_updates'
    }
    return { ...entry, parents: [...new Set(entry.parents)], latestStatus: latest?.status || 'discovered', nextAction,
      everRead: observations.some(o => o.textWindowComplete || ['text_verified', 'read', 'image_verified'].includes(o.status)),
      published: 'not_inferred_from_reading', subtreeComplete: false }
  }).sort((a, b) => a.url.localeCompare(b.url))
  const byAction = {}
  for (const entry of entries) byAction[entry.nextAction] = (byAction[entry.nextAction] || 0) + 1
  return { schemaVersion: 1, allSiteLinksExhausted: false, wholeSiteDenominatorKnown: false,
    scope: '已观察到的学校公开网址与未解析导航线索；不是全站URL全集，也不是可直接发布的事实',
    rules: ['仅合并已有证据，不联网、不绕过权限、不自动发布', '失败记录不抹去历史已读证据，也不算收齐',
      'HTTP和HTTPS及下载查询参数不合并', '发现链接、读正文、核附件、发布与检索验收分开'],
    inputs: inputs.map(input => input.name),
    counts: { knownOfficialUrls: entries.length, unresolvedNavigationHints: hints.size, excludedUrls: rejected.length, byAction },
    entries, unresolvedNavigationHints: [...hints.values()],
    excludedUrlCount: rejected.length }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  const names = ['official-source-register-2026-10-04.json', 'official-crawl-coverage-2026-10-09.json',
    'official-site-inventory-2026-10-09.json', 'policy-completion-evidence-2026-10-10.json',
    'official-intake-evidence-2026-10-10.json', 'official-expansion-evidence-2026-10-10.json',
    'policy-final-evidence-2026-10-10.json', 'jwc-delivered-evidence-2026-10-10.json',
    'service-lab-web-evidence-2026-10-10.json', 'service-lab-docx-evidence-2026-10-10.json',
    'library-lab-evidence-2026-10-10.json', 'safety-delivered-evidence-2026-10-10.json',
    'teaching-followup-evidence-2026-10-10.json', 'public-followup-evidence-2026-10-10.json',
    'attachment-intake-evidence-2026-10-11.json']
  const inputs = names.map(name => ({ name, data: JSON.parse(fs.readFileSync(path.join(root, 'docs/research', name), 'utf8')) }))
  const result = buildFrontier(inputs)
  const output = path.join(root, 'docs/research/official-frontier-2026-10-11.json')
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify({ output, ...result.counts }))
}
