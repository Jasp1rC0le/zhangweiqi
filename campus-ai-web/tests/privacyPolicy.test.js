import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PRIVACY_POLICY_VERSION, PRIVACY_CONTACT } from '../src/utils/privacyPolicy.js'
test('displayed and submitted consent versions match server policy', () => {
  const source = readFileSync(new URL('../../campus-ai-server/src/main/java/com/campusai/security/PrivacyPolicyVersion.java', import.meta.url), 'utf8')
  assert.ok(source.includes(`CURRENT = "${PRIVACY_POLICY_VERSION}"`))
  assert.equal(PRIVACY_CONTACT, 'contact@campthinkhub.cn')
})
