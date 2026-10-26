import test from 'node:test'
import assert from 'node:assert/strict'
import { Marked, marked } from 'marked'
import { readFileSync } from 'node:fs'
import { cjkStrongExtension } from '../src/utils/cjkStrong.js'

const parser = new Marked(cjkStrongExtension())
const options = { async: false, breaks: true, gfm: true }
const parse = content => parser.parse(content, options)

test('real list answer renders both emphasis spans, including Chinese closing punctuation', () => {
  const source = '- **课表编排、休学复学**：由**教务处（招生办公室）**负责。[资料3]'
  const actual = parse(source)
  assert.match(actual, /<strong>课表编排、休学复学<\/strong>/)
  assert.match(actual, /<strong>教务处（招生办公室）<\/strong>/)
  assert.ok(!actual.includes('**'))
})

test('Chinese quotes, colon and parentheses can be emphasized within prose', () => {
  for (const source of ['看**“学籍”**这里', '由**部门(教务)**负责', '先看**申请材料：**再办理']) {
    assert.match(parse(source), /<strong>[^<]+<\/strong>/)
    assert.ok(!parse(source).includes('**'), source)
  }
})

test('multiple Chinese emphasis spans on a line all remain readable', () => {
  assert.equal((parse('由**教务处（招生办）**负责，找**所在学院（教学办）**核对。')
    .match(/<strong>/g) || []).length, 2)
})

test('ordinary Latin emphasis and combined emphasis keep the native grammar', () => {
  for (const source of ['a**word)**b', '**normal** and _other_', '***校园***', '*English* **English**']) {
    assert.equal(parse(source), marked.parse(source, options), source)
  }
})

test('inline and fenced code do not convert Chinese marker examples', () => {
  const inline = parse('示例：`**教务处（招生办）**`')
  assert.match(inline, /<code>\*\*教务处（招生办）\*\*<\/code>/)
  assert.ok(!inline.includes('<strong>'))
  const fenced = parse('```text\n**教务处（招生办）**\n```')
  assert.match(fenced, /<pre><code/)
  assert.ok(fenced.includes('**教务处（招生办）**'))
  assert.ok(!fenced.includes('<strong>'))
})

test('escaped Chinese marker examples stay literal', () => {
  const source = String.raw`示例：\*\*教务处（招生办）\*\*`
  assert.equal(parse(source), marked.parse(source, options))
  assert.ok(!parse(source).includes('<strong>'))
})

test('raw HTML code and preformatted blocks retain the native parser behavior', () => {
  for (const source of ['<code>**校园。）**</code>', '<pre>**校园。）**</pre>']) {
    assert.equal(parse(source), marked.parse(source, options))
  }
})

test('unfinished streaming emphasis and whitespace-delimited text remain native', () => {
  for (const source of ['由**教务处（招生办）', '** 教务处 **', '**校园\n材料。**', '**校园\r材料。**']) {
    assert.equal(parse(source), marked.parse(source, options), source)
  }
})

test('links and tables keep their existing Markdown structure', () => {
  assert.match(parse('由**[教务处](https://jwc.tsguas.edu.cn/)（招生办）**负责。'),
    /<strong><a href="https:\/\/jwc\.tsguas\.edu\.cn\/">教务处<\/a>（招生办）<\/strong>/)
  const table = '| 事项 | 部门 |\n| --- | --- |\n| 学籍 | **教务处（招生办）** |'
  assert.match(parse(table), /<table>/)
  assert.match(parse(table), /<strong>教务处（招生办）<\/strong>/)
})

test('unmatched marker-heavy input completes without a new recursive path', { timeout: 2000 }, () => {
  const source = '**校园。'.repeat(5000)
  assert.ok(parse(source).length > 0)
})

test('chat dialect is isolated and output still goes through the existing sanitizer', () => {
  const source = readFileSync(new URL('../src/utils/safeMarkdown.js', import.meta.url), 'utf8')
  assert.match(source, /const messageMarkdown = new Marked\(cjkStrongExtension\(\)\)/)
  assert.match(source, /DOMPurify\.sanitize\(messageMarkdown\.parse\(/)
  assert.ok(source.includes("FORBID_TAGS: ['img', 'picture', 'source', 'video'"))
  assert.equal(marked.parse('由**教务处（招生办公室）**负责。', options).includes('**'), true)
})
