import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'
import { validatedConfigPage, createConfigPager } from '../src/utils/teachingConfigPage.js'
import { createTeachingFlowFixture } from '../design/teachingFlowFixture.js'
const opts = { timeout: 3000 }
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const row = n => ({ value: id(n), label: `合成班${n}`, description: '合成学院' })
const query = { kind: 'CLASS', page: 0, size: 25, selected: '' }
const page = { items: [row(1)], selected: null, page: 0, size: 25, total: 1, totalPages: 1 }
test('configuration pages verify totals unique options selected identity and exact page', opts, () => {
  assert.equal(validatedConfigPage(page, query), page)
  for (const bad of [{ ...page, total: 26 }, { ...page, items: [row(1), row(1)], total: 2 }, { ...page, selected: row(2) }, { ...page, page: 1 }, { ...page, items: [{ ...row(1), value: 'foreign' }] }]) assert.throws(() => validatedConfigPage(bad, query))
  assert.equal(validatedConfigPage({ ...page, selected: row(2) }, { ...query, selected: id(2) }).selected.value, id(2))
})
test('search/page responses are fenced by account and generation; failure retains saved selection', opts, async () => {
  let owner = 'admin-a', resolve
  const state = {}, resource = createConfigPager({ owner: () => owner, state, read: async () => ({ data: page }) })
  resource.reset(); assert.equal(await resource.load(query), true)
  const deferred = new Promise(r => { resolve = r })
  const late = createConfigPager({ owner: () => owner, state, read: () => deferred })
  const pending = late.load(query); owner = 'admin-b'; late.reset(); resolve({ data: page }); await pending
  assert.equal(state.items.length, 0); assert.equal(state.loading, false)
  const fails = createConfigPager({ owner: () => owner, state, read: async () => { throw new Error('503请稍后重试') } })
  Object.assign(state, page); await fails.load(query)
  assert.deepEqual(state.items, page.items); assert.match(state.error, /503/)
})
test('mock configuration lookup pages large scopes with independent college discovery and pinned selection', opts, async () => {
  const fixture = createTeachingFlowFixture({ largeScope: true }); fixture.setActor(1)
  const read = async params => (await fixture.adapter({ method: 'get', url: '/api/admin/teaching/scopes/page', params })).data
  const first = await read(query); assert.ok(first.total > 100); assert.equal(first.items.length, 25)
  const next = await read({ ...query, page: 1, selected: first.items[0].value }); assert.equal(next.selected.value, first.items[0].value); assert.ok(!next.items.some(r => r.value === next.selected.value))
  const empty = await read({ ...query, search: '不存在', selected: first.items[0].value }); assert.equal(empty.total, 0); assert.equal(empty.selected.value, first.items[0].value)
  const colleges = await read({ ...query, kind: 'COLLEGE', size: 1 }); assert.equal(colleges.items.length, 1); assert.ok(colleges.total > 1)
  fixture.setActor(2); await assert.rejects(() => read(query), e => e.response.status === 403)
})
test('admin UI uses separate bounded pickers instead of full-array class/college selectors', opts, () => {
  const source = fs.readFileSync(new URL('../src/components/AdminTeachingPanel.vue', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /readTeachingClasses|classes\.map|classes\.length/)
  assert.equal((source.match(/<TeachingScopePicker/g) || []).length, 4)
  assert.match(source, /v-model="course.teacherId"[^>]+kind="TEACHER"/)
  assert.match(source, /selectedCourseTeacher.value\?\.value!==course.teacherId/)
  assert.match(source, /courseKey\(\) !== savedCourse.value/)
  assert.match(source, /data\?\.id !== target/)
  const picker = fs.readFileSync(new URL('../src/components/TeachingScopePicker.vue', import.meta.url), 'utf8')
  const { descriptor, errors } = parse(picker); assert.deepEqual(errors, []); compileScript(descriptor, { id: 'config-test' })
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'TeachingScopePicker.vue', id: 'config-test' }).errors, [])
  assert.match(picker, /onBeforeUnmount\(resource.reset\)/); assert.match(picker, /type="button"/)
})
