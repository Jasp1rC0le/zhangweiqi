import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const css = fs.readFileSync(new URL('../src/styles/apple-workspace.css', import.meta.url), 'utf8')
const view = fs.readFileSync(new URL('../src/views/ChatView.vue', import.meta.url), 'utf8')
const dock = fs.readFileSync(new URL('../src/styles/chat-refinement.css', import.meta.url), 'utf8')
const token = name => css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1]

function luminance(hex) {
  const values = hex.slice(1).match(/../g).map(value => {
    const channel = Number.parseInt(value, 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722
}
function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

test('selected Apple tokens are confined to opted-in authenticated workspaces', () => {
  assert.ok(css.includes('.workspace:is(.chat-focused, .calm-workspace)'))
  assert.ok(!css.includes('\n:root {'))
  assert.ok(!css.includes('.pro-dialog') && !css.includes('.auth-dialog'))
  assert.ok(!css.includes('backdrop-filter') && !css.includes('gradient('))
  assert.ok(view.includes("import '@/styles/apple-workspace.css'"))
})
test('body, placeholder, active navigation and white send icon retain readable contrast', () => {
  for (const background of ['assistant-bg', 'assistant-panel', 'assistant-surface', 'assistant-soft']) {
    assert.ok(contrast(token('assistant-ink'), token(background)) >= 4.5)
    assert.ok(contrast(token('assistant-muted'), token(background)) >= 4.5)
  }
  assert.ok(contrast(token('assistant-accent-hover'), token('assistant-soft')) >= 4.5)
  assert.ok(contrast('#ffffff', token('assistant-accent')) >= 4.5)
})
test('history state belongs to the rounded child instead of a square parent layer', () => {
  assert.match(css, /\.conversation-row,\s*html:root body \.workspace:is\(\.chat-focused, \.calm-workspace\) \.conversation-row:is\(:hover, \.active\)\s*\{\s*background:\s*transparent;\s*box-shadow:\s*none;/)
  assert.match(css, /\.conversation-item\s*\{\s*border-radius:\s*12px;/)
  const rowRule = css.match(/\.conversation-row:is\(:hover, \.active\)\s*\{([^}]+)\}/)?.[1]
  assert.ok(!rowRule.includes('overflow'), 'do not clip the existing keyboard focus or delete control')
  assert.ok(view.includes('class="conversation-delete"'))
})
test('compact composer keeps multiline input and accessible keyboard guidance', () => {
  assert.match(dock, /\.composer\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column/)
  assert.match(dock, /\.composer textarea\s*\{[^}]*min-height:\s*44px/)
  assert.match(dock, /\.composer-controls\s*\{[^}]*display:\s*flex/)
  assert.ok(view.includes('aria-describedby="chat-composer-help"'))
  assert.ok(view.includes('id="chat-composer-help"'))
  assert.ok(view.includes('@compositionstart="composerComposing = true"'))
  assert.ok(view.includes('@keydown.enter.exact="handleComposerEnter"'))
  assert.ok(view.includes('aria-label="停止接收回答"'))
  assert.ok(view.includes("placeholder: '随时问我'"))
  assert.ok(css.includes('.message-row.assistant .message-role'))
})
test('return-to-latest anchors above the entire composer instead of a fixed screen offset', () => {
  const start = view.indexOf('<section class="composer-wrap">')
  const jump = view.indexOf('<Transition name="jump">', start)
  assert.ok(start > 0 && jump > start && jump < view.indexOf('<ChatAttachmentPreview', start))
  assert.match(css, /\.jump-latest\s*\{\s*bottom:\s*calc\(100% \+ 12px\)/)
  assert.ok(view.includes("@click=\"scrollToBottom('smooth')\""))
})
test('phone layout removes decorative frame insets while preserving 44px actions', () => {
  const mobile = css.slice(css.indexOf('@media (max-width: 760px)'), css.indexOf('@media (max-width: 360px)'))
  assert.match(mobile, /padding:\s*0/)
  assert.match(mobile, /border-radius:\s*0/)
  assert.match(mobile, /\.chat-menu-button\s*\{\s*width:\s*44px;\s*height:\s*44px/)
  assert.ok(!css.includes('transition: all'))
})
test('reduced motion removes the press scale instead of just speeding it up', () => {
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
  assert.match(reduced, /:not\(:disabled\):active\s*\{\s*scale:\s*1/)
  assert.ok(css.includes('scale: 0.96'))
})
