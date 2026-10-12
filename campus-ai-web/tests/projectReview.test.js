import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyProject, inspectProject, projectMarkdown } from '../src/utils/projectStudio.js'
import { reviewFingerprint, recordReviewFeedback, validateReviewFeedback } from '../src/utils/projectReview.js'

test('feedback never clears a rule result and persists its original fingerprint', async () => {
  const project = emptyProject(), original = inspectProject(project)
  const fingerprint = await reviewFingerprint(project)
  project.reviewFeedback = recordReviewFeedback([], original.issues[0], fingerprint, '实物成果待老师复核')
  assert.deepEqual(inspectProject(project), original)
  assert.equal(await reviewFingerprint(project), fingerprint)
  assert.match(projectMarkdown(project), /实物成果待老师复核/)
  project.title = '改名称不影响规则'; project.deadline = '2026-09-24'
  assert.equal(await reviewFingerprint(project), fingerprint)
  project.manuscript = '新正文'
  assert.notEqual(await reviewFingerprint(project), fingerprint)
  assert.equal(project.reviewFeedback[0].fingerprint, fingerprint)
})
test('feedback replaces only its own issue and rejects invalid or oversized notes', () => {
  const digest = 'a'.repeat(64), issue = {key:'one',title:'资料'}
  const first = recordReviewFeedback([], issue, digest, ' 原理由 ')
  const second = recordReviewFeedback(first, issue, digest, '更新理由')
  assert.equal(first[0].reason, '原理由'); assert.equal(second.length, 1)
  assert.equal(second[0].reason, '更新理由')
  assert.equal(validateReviewFeedback(second), '')
  assert.equal(validateReviewFeedback(null), '')
  assert.notEqual(validateReviewFeedback([first[0],first[0]]), '')
  assert.notEqual(validateReviewFeedback([{...first[0], fingerprint:'fake'}]), '')
  assert.throws(() => recordReviewFeedback([],issue,digest,' '))
  assert.throws(() => recordReviewFeedback([],issue,digest,'x'.repeat(501)))
  assert.throws(() => recordReviewFeedback([],issue,'fake','理由'))
})
