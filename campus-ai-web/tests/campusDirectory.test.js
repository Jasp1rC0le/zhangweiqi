import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { campusDirectory } from '../src/utils/campusDirectory.js'
test('campus references are official HTTPS sources with no credential-bearing links', () => {
  assert.equal(campusDirectory.school, '天津中德应用技术大学')
  assert.equal(new Set(campusDirectory.entries.map(item => item.title)).size, campusDirectory.entries.length)
  for (const item of campusDirectory.entries) {
    const url = new URL(item.url)
    assert.equal(url.protocol, 'https:')
    assert.ok(url.hostname === 'tsguas.edu.cn' || url.hostname.endsWith('.tsguas.edu.cn'))
    assert.equal(url.username, ''); assert.equal(url.password, '')
    assert.ok(item.detail.length > 10)
  }
})
test('directory heading does not apply a single verification date to mixed sources', () => {
  const view = readFileSync(new URL('../src/components/CampusDirectory.vue', import.meta.url), 'utf8')
  assert.match(view, /核验日期和来源以各条说明为准/)
  assert.doesNotMatch(view, /以下公开资料核对于/)
})
test('new service references do not confuse gym and library reservations', () => {
  assert.equal(campusDirectory.entries.length, 19)
  const library = campusDirectory.entries.find(item => item.title === '图书馆座位预约流程')
  const gym = campusDirectory.entries.find(item => item.title === '体育馆开放与预约核对')
  assert.match(library.detail, /20:00/)
  assert.match(library.detail, /2026-04-13/)
  assert.match(gym.detail, /用户2026-10-09截图/)
  assert.match(gym.detail, /20:59准备、21:00排队/)
  assert.match(gym.detail, /非小程序直达/)
  assert.match(gym.detail, /尚未接入代预约/)
  assert.doesNotMatch(gym.detail, /20:00/)
  const contact = campusDirectory.entries.find(item => item.title === '招生咨询')
  assert.match(contact.detail, /022-28776099/)
  assert.match(contact.detail, /022-28776655/)
  assert.doesNotMatch(contact.detail, /28776716/)
  assert.equal(contact.url, 'https://zs.tsguas.edu.cn/')
})
test('academic portal retains its route without pretending to have read private records', () => {
  const portal = campusDirectory.entries.find(item => item.title === '教务系统登录入口')
  assert.equal(portal.url, 'https://zdjw.tsguas.edu.cn/app-web/#/tabs/home')
  assert.match(portal.detail, /本次访问未验证/)
  assert.match(portal.detail, /不收取密码或同步个人成绩课表/)
})
test('admissions directory separates exam types and estimates from results', () => {
  const admissions = campusDirectory.entries.find(item => item.title === '历年录取分数查询')
  assert.match(admissions.detail, /普通高考、高职分类考试、专升本分别查看/)
  assert.match(admissions.detail, /预估分不等于实际录取线/)
  assert.equal(admissions.url, 'https://zs.tsguas.edu.cn/lnfscx.htm')
})

test('checked image facts distinguish borrowing and in-library reading limits', () => {
  const borrowing = campusDirectory.entries.find(item => item.title === '文献借阅规则')
  assert.match(borrowing.detail, /外借10册、30天/)
  assert.match(borrowing.detail, /馆内每次取阅5册不是外借额度/)
  const hours = campusDirectory.entries.find(item => item.title === '图书馆开放时间')
  assert.match(hours.detail, /书库周末不开放/)
  assert.match(hours.detail, /不保证实时开放/)
})
