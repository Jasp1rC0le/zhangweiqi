import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PRIVACY_POLICY_VERSION, PRIVACY_CONTACT, serviceProviders } from '../src/utils/privacyPolicy.js'
test('displayed and submitted consent versions match server policy', () => {
  const source = readFileSync(new URL('../../campus-ai-server/src/main/java/com/campusai/security/PrivacyPolicyVersion.java', import.meta.url), 'utf8')
  assert.ok(source.includes(`CURRENT = "${PRIVACY_POLICY_VERSION}"`))
  assert.equal(PRIVACY_CONTACT, 'contact@campthinkhub.cn')
})
test('enabled public web search is disclosed without changing the accepted policy contract', () => {
  const provider = serviceProviders.find(item => item.name.includes('Bocha'))
  assert.ok(provider)
  assert.match(provider.purpose, /检索关键词/)
  assert.match(provider.state, /联网搜索已启用/)
  const view = readFileSync(new URL('../src/views/PrivacyView.vue', import.meta.url), 'utf8')
  assert.doesNotMatch(view, /没有自行启用境外模型、联网搜索/)
  assert.match(view, /本地规则检查通过后同校可见/)
})
