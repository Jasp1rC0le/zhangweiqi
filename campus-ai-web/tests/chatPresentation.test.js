import test from 'node:test'
import assert from 'node:assert/strict'
import {
  appendChatAttachment,
  chatInputLimit,
  shouldSendOnEnter,
  scrollBehavior,
  followAfterScroll,
} from '../src/utils/chatPresentation.js'

test('attachment joins the existing message and retains the question', () => {
  assert.equal(
    appendChatAttachment('请核对', '样例.txt', '实验数据：1,2', 100),
    '请核对\n\n【附件：样例.txt】\n实验数据：1,2',
  )
})
test('attachment rejects over-limit or empty extraction without truncation', () => {
  assert.throws(() => appendChatAttachment('已有草稿', 'test.txt', 'abc', 10), /超过/)
  assert.throws(() => appendChatAttachment('', 'test.txt', ' ', 100), /没有/)
  assert.equal(chatInputLimit('kimi'), 50000)
  assert.equal(chatInputLimit('standard'), 10000)
})
test('filename control characters cannot create extra header lines', () => {
  assert.equal(appendChatAttachment('', 'a\r\nb.txt', '内容', 100), '【附件：a  b.txt】\n内容')
})
test('mobile Enter and IME confirmation never send', () => {
  assert.equal(shouldSendOnEnter({}, false, true), false)
  assert.equal(shouldSendOnEnter({ isComposing: true }, false, false), false)
  assert.equal(shouldSendOnEnter({ keyCode: 229 }, false, false), false)
  assert.equal(shouldSendOnEnter({}, true, false), false)
  assert.equal(shouldSendOnEnter({}, false, false), true)
})
test('reduced motion disables smooth programmatic scrolling', () => {
  assert.equal(scrollBehavior('smooth', true), 'instant')
  assert.equal(scrollBehavior('smooth', false), 'smooth')
})
test('growing stream does not cancel follow, upward reading does, returning to bottom resumes', () => {
  assert.equal(followAfterScroll(true, 100, 130, 1400, 600), true)
  assert.equal(followAfterScroll(true, 700, 400, 1400, 600), false)
  assert.equal(followAfterScroll(false, 400, 600, 1400, 600), false)
  assert.equal(followAfterScroll(false, 600, 790, 1400, 600), true)
})
