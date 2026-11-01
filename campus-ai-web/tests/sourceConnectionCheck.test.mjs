import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { failedKnowledgeReason } from '../src/utils/failedKnowledgeJobs.js'

const source = readFileSync(new URL('../src/views/AdminView.vue', import.meta.url), 'utf8')
const handler = source.match(/async function checkFailedSource\(item\) \{[\s\S]*?\n\}/)[0]
function fixture(read) {
  let valid = true, released = 0
  const document = { id: 4, sourceUrl: 'https://www.tsguas.edu.cn/xxgk.htm' }
  const context = {
    documents: { value: [document] }, editorOwner: { value: '1:7:0' }, disposed: false,
    actionBusy: { value: false }, sourceProbeBusy: { value: '' }, sourceDiagnostics: {},
    safeExternalUrl: value => value.startsWith('https://'),
    editorScope: { capture: () => ({ current: () => valid, release: () => released++, signal: new AbortController().signal }) },
    previewKnowledgeUrl: read, resolveErrorMessage: (error, fallback) => error.message || fallback,
  }
  vm.createContext(context); vm.runInContext(handler, context)
  return { context, item: { key: 'KNOWLEDGE_REFRESH:4', document }, check: () => context.checkFailedSource({ key: 'KNOWLEDGE_REFRESH:4', document }), invalidate: () => { valid = false }, released: () => released }
}

test('source check reports transport failure without queuing or removing historical records', async () => {
  const f = fixture(async (_url, options) => { assert.equal(options.timeout, 16000); throw new Error('官网响应超时，未取得网页内容') })
  await f.check()
  assert.equal(f.context.sourceDiagnostics[f.item.key].message, '官网响应超时，未取得网页内容')
  assert.equal(f.context.sourceProbeBusy.value, '')
  assert.equal(f.released(), 1)
})

test('successful preview never claims synchronization and does not retain fetched body', async () => {
  const f = fixture(async () => ({ content: 'Public page text', warnings: [] }))
  await f.check()
  const result = f.context.sourceDiagnostics[f.item.key]
  assert.equal(result.message, '官网可读取，尚未同步')
  assert.equal(Object.hasOwn(result, 'content'), false)
})

test('navigation-only and empty responses are not reported as verified official content', async () => {
  for (const [preview, expected] of [
    [{ content: 'Navigation', warnings: ['未定位独立正文，当前为页面文字预览'] }, '可访问，未定位独立正文'],
    [{ content: '  ', warnings: [] }, '未取得可读正文'],
  ]) {
    const f = fixture(async () => preview); await f.check()
    assert.equal(f.context.sourceDiagnostics[f.item.key].message, expected)
  }
})

test('account or source changes discard late results and release the request', async () => {
  for (const changed of ['owner', 'url']) {
    let finish; const f = fixture(() => new Promise(resolve => { finish = resolve }))
    const pending = f.check()
    if (changed === 'owner') f.invalidate()
    else f.item.document.sourceUrl = 'https://www.tsguas.edu.cn/other.htm'
    finish({ content: 'old response', warnings: [] }); await pending
    assert.deepEqual(Object.keys(f.context.sourceDiagnostics), [])
    assert.equal(f.released(), 1)
  }
})

test('rapid repeated clicks do not start another request', async () => {
  let finish, calls = 0
  const f = fixture(() => { calls++; return new Promise(resolve => { finish = resolve }) })
  const first = f.check(); await f.check(); assert.equal(calls, 1)
  finish({ content: 'page' }); await first
})

test('failure summaries retain precise causes and do not invent a cause for legacy records', () => {
  for (const [lastError, expected] of [
    ['官网读取失败：官网响应超时，未取得网页内容', '官网响应超时，未取得内容'],
    ['官网读取失败：连接官网超时，未取得网页内容', '连接官网超时'],
    ['官网读取失败：官网域名解析失败', '官网域名解析失败'],
    ['官网读取失败：官网安全连接校验失败，未降低安全校验', '官网安全连接校验失败'],
    ['官网读取失败：网页返回状态 403；跳转链接请提交最终地址', '网页返回状态 403；跳转链接请提交最终地址'],
    ['官网读取失败：网页读取失败，请检查链接或改用文件上传', '历史读取失败，未记录具体原因'],
  ]) assert.equal(failedKnowledgeReason({ lastError }), expected)
})
