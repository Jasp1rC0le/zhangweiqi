import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { composerHeight } from '../src/utils/chatPresentation.js'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const view = read('src/views/ChatView.vue'), css = read('src/styles/chat-refinement.css')

test('one flex scroller owns spare height so every chat state uses the bottom dock', () => {
  assert.doesNotMatch(view + css, /chat-main--fresh|composer-upload-row|margin-bottom: auto/)
  assert.match(css, /\.message-scroller \{ flex: 1 1 0; min-height: 0;/)
  assert.match(css, /\.composer-wrap \{ margin-top: auto;/)
  assert.match(css, /padding-bottom: max\(12px, env\(safe-area-inset-bottom\)\)/)
  assert.match(css, /\.chat-attachment \{ max-height: clamp\(64px, calc\(var\(--chat-viewport-height/)
})

test('text, consent-gated voice and send share one surface without hiding the voice control', () => {
  const filename = 'ChatView.vue', { descriptor } = parse(view)
  compileScript(descriptor, { id: 'chat-dock' })
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename, id: 'chat-dock' }).errors, [])
  const start = view.indexOf('<div class="composer"'), end = view.indexOf('<p v-if="answerNotice"', start)
  const surface = view.slice(start, end)
  assert.ok(start > 0)
  for (const text of ['<textarea', '<details', '<HoldToTalk compact-entry', 'aria-label="发送"', 'aria-label="停止接收回答"']) assert.ok(surface.includes(text), text)
  assert.doesNotMatch(surface, /<div v-show=/)
  assert.match(surface, /@mode="voiceMode=\$event" @keyboard="focusKeyboard"/)
  assert.match(read('src/components/HoldToTalk.vue'), /disabled \|\| !consent/)
})

test('plus menu retains uploads, private originals, all mode and draft boundaries', () => {
  const menu = view.slice(view.indexOf('<details v-show="!voiceMode'), view.indexOf('</details>', view.indexOf('<details v-show="!voiceMode')))
  for (const text of ['上传资料', '我的原件', 'chatAttachment.open()', 'chatAttachment.openLibrary()', 'Boolean(activeChatAction)', '<ChatDraftRecovery', 'chooseWorkspace(workspace)', 'closeChatTools()']) assert.ok(menu.includes(text), text)
  assert.ok(view.includes('aria-label="附件、模式和草稿设置"'))
  assert.equal((view.match(/id="chat-upload-hint"/g) || []).length, 1)
})

test('task shortcuts remain semantic, touch-sized and draft-only', () => {
  const start = read('src/components/ChatStart.vue')
  assert.match(start, /aria-label="开始校园任务"/)
  assert.match(start, /route: '\/timetable'/)
  assert.match(start, /v-for="item in suggestions"/)
  assert.match(start, /aria-controls="item.action === 'campus'/)
  assert.match(start, /min-height: 44px/)
  assert.doesNotMatch(start, /submitPrompt|fetch\(|axios/)
})

test('long drafts grow only within their viewport allowance and never truncate content', () => {
  assert.deepEqual(composerHeight(20, 844), { height: 44, overflowY: 'hidden' })
  assert.deepEqual(composerHeight(500, 844), { height: 138, overflowY: 'auto' })
  assert.deepEqual(composerHeight(500, 360), { height: 90, overflowY: 'auto' })
  assert.deepEqual(composerHeight(90, 360), { height: 90, overflowY: 'hidden' })
  assert.deepEqual(composerHeight(500, 100), { height: 44, overflowY: 'auto' })
  for (const viewport of [undefined, NaN, 0, -1, Infinity]) assert.equal(composerHeight(500, viewport).height, 138)
})

test('viewport listeners are symmetric and text is resized after keyboard or window changes', () => {
  assert.ok(view.includes('observeVisualViewport(window, updateChatViewport)'))
  assert.ok(view.includes('chatViewportObserver?.stop()'))
  const observer = read('src/utils/visualViewport.js')
  assert.ok(observer.includes("[viewport, 'resize'], [viewport, 'scroll']"))
  const viewportUpdate = view.slice(view.indexOf('function updateChatViewport('), view.indexOf('function toggleChatSidebar()'))
  assert.ok(viewportUpdate.includes('nextTick(resizeComposer)'))
  assert.match(view, /composerHeight\(element.scrollHeight, window.visualViewport\?\.height \|\| window.innerHeight\)/)
  assert.ok(view.includes("'--chat-viewport-height': keyboardHeight"))
})
