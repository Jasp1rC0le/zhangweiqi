import test from 'node:test'
import assert from 'node:assert/strict'
import { wallComposerText, wallHasSeparateTitle, wallPostPayload, wallPostTitle } from '../src/utils/wallComposer.js'
test('one body produces a bounded title without splitting Unicode characters', () => {
  assert.equal(wallPostTitle('  今天想找个学习搭子\n晚饭后一起复习。'), '今天想找个学习搭子')
  const title = wallPostTitle('🙂'.repeat(80))
  assert.equal(Array.from(title).length, 43)
  assert.ok(title.length < 100)
  assert.equal(wallHasSeparateTitle({ title: '新鲜事', body: '新鲜事' }), false)
})
test('legacy title and body remain visible together and preserve an unchanged retry payload', () => {
  const form = { id: 'request', category: 'team', title: '原来的标题', body: '原来的正文' }
  assert.equal(wallComposerText(form), '原来的标题\n原来的正文')
  assert.deepEqual(wallPostPayload(form), form)
  const edited = { ...form, title: '', body: '原来的标题\n原来的正文，新增内容' }
  assert.equal(wallPostPayload(edited).id, 'request')
  assert.equal(wallPostPayload(edited).body, edited.body)
})
test('new posts and title-only legacy drafts have a real nonempty body', () => {
  assert.deepEqual(wallPostPayload({id:'a',category:'campus',title:'',body:' 今天的新鲜事 '}),{id:'a',category:'campus',title:'今天的新鲜事',body:'今天的新鲜事'})
  assert.equal(wallPostPayload({id:'b',category:'campus',title:'只有旧标题',body:''}).body,'只有旧标题')
})
