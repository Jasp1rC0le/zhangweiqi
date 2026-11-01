import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { groupFailedKnowledgeJobs, failedKnowledgeReason } from '../src/utils/failedKnowledgeJobs.js'
import { feedbackPayload } from '../src/utils/feedbackForm.js'

test('failure grouping preserves every historical attempt and distinguishes index from refresh', () => {
  const jobs = [
    { id: 9, type: 'KNOWLEDGE_REFRESH', refId: 4, lastError: '官网读取失败：网页读取失败' },
    { id: 8, type: 'KNOWLEDGE_REFRESH', refId: 4 },
    { id: 7, type: 'KNOWLEDGE_INDEX', refId: 4 },
    { id: 6, type: 'KNOWLEDGE_REFRESH', refId: null },
    { id: 5, type: 'KNOWLEDGE_REFRESH', refId: null },
  ]
  const before = structuredClone(jobs)
  const document = { id: '4', title: '原始来源', status: 'PUBLISHED' }
  const groups = groupFailedKnowledgeJobs(jobs, [document])
  assert.equal(groups.length, 4)
  assert.equal(groups[0].records.length, 2)
  assert.equal(groups[0].document, document)
  assert.deepEqual(groups.flatMap(group => group.records).map(job => job.id), [9, 8, 7, 6, 5])
  assert.deepEqual(jobs, before)
  assert.equal(failedKnowledgeReason(jobs[0]), '历史读取失败，未记录具体原因')
  assert.equal(failedKnowledgeReason({ lastError: '未获读取权限' }), '未获读取权限')
  assert.equal(failedKnowledgeReason(null), '未返回错误原因')
})

test('short feedback derives a bounded subject without changing the message or supplied identity', () => {
  const form = { name: ' 小张 ', contact: ' a@example.test ', subject: '', message: ` ${'长'.repeat(150)}\n第二行 ` }
  const payload = feedbackPayload(form, 'fallback')
  assert.equal(payload.subject.length, 120)
  assert.equal(payload.message, form.message.trim())
  assert.equal(payload.name, '小张')
  assert.equal(payload.contact, 'a@example.test')
  assert.equal(form.subject, '')
  assert.equal(feedbackPayload({ message: '内容', name: '', subject: '自定主题' }, '账户称呼').subject, '自定主题')
  assert.equal(feedbackPayload({ message: '内容' }, '账户称呼').name, '账户称呼')
  assert.equal(feedbackPayload({ message: '   ' }).subject, '')
})

test('fullscreen authentication overrides apply only to phone layouts', () => {
  const css = readFileSync(new URL('../src/styles/auth-fullscreen.css', import.meta.url), 'utf8')
  let rules = 0
  postcss.parse(css).walkRules(rule => {
    if (!rule.selector.includes('.auth-fullscreen')) return
    rules++
    let node = rule.parent, phoneOnly = false
    while (node) {
      if (node.type === 'atrule' && node.name === 'media' && node.params === '(max-width: 760px)') phoneOnly = true
      node = node.parent
    }
    assert.equal(phoneOnly, true, rule.selector)
  })
  assert.ok(rules > 20)
})

test('auto-height phone authentication keeps the active login and registration panels in layout flow', () => {
  const css = postcss.parse(readFileSync(new URL('../src/styles/auth-fullscreen.css', import.meta.url), 'utf8'))
  const declarations = selector => {
    let found
    css.walkRules(rule => {
      if (rule.selector !== selector) return
      found = Object.fromEntries(rule.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]))
    })
    return found
  }
  const active = declarations('html:root body .auth-fullscreen .auth-stage > .auth-form')
  assert.ok(active, 'Both active panels need a phone override against the incumbent absolute-positioned form.')
  assert.equal(active.position, 'relative', 'An auto-height stage cannot get height from an absolute-positioned active panel.')
  assert.equal(active.inset, 'auto')
  const leaving = declarations('html:root body .auth-fullscreen .auth-stage > .auth-form.auth-step-leave-active')
  assert.equal(leaving.position, 'absolute', 'Only the outgoing panel leaves flow during the tab crossfade.')
})
