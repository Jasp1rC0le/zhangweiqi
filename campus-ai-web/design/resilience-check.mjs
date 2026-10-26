import { createRequire } from 'node:module'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { chromium } = require(require.resolve('playwright', { paths: ['/Users/zhangweiqi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'] }))
const output = await mkdtemp(path.join(tmpdir(), 'campthink-resilience-'))
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.setDefaultTimeout(12000)
const errors = [], passed = [], counts = {}
page.on('pageerror', e => errors.push(e.message))
let acceptLeave = false
page.on('dialog', d => acceptLeave ? d.accept() : d.dismiss())
const state = { refreshFails: true, profileFails: true, saveFails: true, feedbackFails: true, logoutFails: true, authenticated: true, delay: 0, privateExpired: false }
// Every API request is intercepted. No request writes to a real account/server.
await page.route(url => url.pathname.startsWith('/api/'), async route => {
  const request = route.request(), url = new URL(request.url()), key = request.method() + ' ' + url.pathname
  counts[key] = (counts[key] || 0) + 1
  const respond = (data, status = 200) => route.fulfill({status, contentType:'application/json', body:JSON.stringify(data)})
  const fail = () => respond({message:'模拟服务暂时不可用'}, 503)
  if (url.pathname === '/api/auth/refresh') return state.refreshFails ? fail() : state.authenticated ? respond({token:'fixture-token'}) : respond({}, 401)
  if (url.pathname === '/api/auth/me') return respond({id:-999, username:'fixture-only', nickname:'验收同学', schoolId:1, role:'STUDENT'})
  if (url.pathname === '/api/auth/logout') {
    await new Promise(resolve => setTimeout(resolve, state.delay))
    if (state.logoutFails) return fail()
    state.authenticated = false
    return respond({})
  }
  if (url.pathname === '/api/account/profile') {
    await new Promise(resolve => setTimeout(resolve, state.delay))
    if (request.method() === 'GET') return state.profileFails ? fail() : respond({major:'机械工程',skills:['制图']})
    return state.saveFails ? fail() : respond({})
  }
  if (url.pathname === '/api/contact-messages') {
    await new Promise(resolve => setTimeout(resolve, state.delay))
    return state.feedbackFails ? fail() : respond({id:-1})
  }
  if (url.pathname === '/api/account/email') return respond({})
  if (url.pathname === '/api/ai/quota') return respond({limit:20000,remaining:18000})
  if (url.pathname === '/api/models') return respond([{key:'standard',name:'问答',available:true}])
  if (url.pathname === '/api/schools') return respond([{id:1,name:'天津中德应用技术大学'}])
  if (url.pathname === '/api/test-private') return state.privateExpired ? respond({},401) : respond({})
  if (url.pathname === '/api/conversations' && request.method() === 'POST') return respond({id:-100,title:'模拟对话'})
  if (url.pathname.endsWith('/messages/stream')) return respond({},401)
  return respond([])
})
const check = name => passed.push(name)
async function capture(name) {
  await page.screenshot({path:path.join(output, name+'.png')})
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, name+' horizontal overflow')
}
async function nav(label) {
  if (page.viewportSize().width < 700) await page.getByRole('button',{name:'打开菜单',exact:true}).click()
  await page.locator('.sidebar').getByRole('button',{name:label,exact:true}).click()
}
try {
  await page.goto('http://127.0.0.1:5173/account')
  await page.getByRole('heading',{name:'暂时连不上服务'}).waitFor()
  check('initial refresh 503 shows recoverable connection page, not login')
  await capture('connection-error-desktop')
  state.refreshFails = false; state.delay = 650
  await page.getByRole('button',{name:'重新连接',exact:true}).click()
  await page.getByText('正在读取个人信息…',{exact:true}).waitFor()
  assert.equal(await page.locator('#profile-major').isDisabled(),true)
  await page.getByRole('button',{name:'重新读取',exact:true}).waitFor()
  assert.equal(await page.locator('#profile-major').isDisabled(),true)
  check('profile loading and failed load cannot overwrite server data')
  await capture('profile-load-error-desktop')
  state.profileFails = false
  await page.getByRole('button',{name:'重新读取',exact:true}).click()
  await page.waitForFunction(() => document.querySelector('#profile-major')?.value === '机械工程')
  await page.locator('#profile-major').fill('车辆工程')
  assert.equal(await page.evaluate(() => { const event = new Event('beforeunload',{cancelable:true}); window.dispatchEvent(event); return event.defaultPrevented }),true)
  await nav('提交意见')
  assert.ok(page.url().includes('/account'))
  assert.equal(await page.locator('#profile-major').inputValue(),'车辆工程')
  check('profile unsaved leave cancellation retains draft')
  await page.getByRole('button',{name:'保存个性化资料',exact:true}).click()
  assert.equal(await page.locator('#profile-major').isDisabled(),true)
  await page.getByRole('alert').filter({hasText:'模拟服务暂时不可用'}).waitFor()
  assert.equal(await page.locator('#profile-major').inputValue(),'车辆工程')
  check('profile save failure retains edits, locks fields while pending')
  state.saveFails = false
  await page.getByRole('button',{name:'保存个性化资料',exact:true}).click()
  await page.getByText('已保存，后续建议会参考这些信息',{exact:true}).waitFor()
  assert.equal(await page.getByRole('button',{name:'保存个性化资料',exact:true}).isDisabled(),true)
  check('profile success resets dirty state')
  await nav('提交意见')
  await page.getByRole('heading',{name:'让它更好'}).waitFor()
  await page.getByRole('textbox',{name:'主题',exact:true}).fill('只有主题的草稿')
  await nav('校园助手')
  assert.ok(page.url().includes('/feedback'))
  check('feedback subject-only draft is guarded')
  await page.getByRole('textbox',{name:'联系方式',exact:true}).fill('fixture@example.invalid')
  await page.getByRole('textbox',{name:'具体意见',exact:true}).fill('这是隔离浏览器内的验收内容')
  await page.getByRole('button',{name:'提交意见',exact:true}).last().click()
  await page.locator('.feedback-work').evaluate(form => form.requestSubmit())
  assert.equal(await page.getByRole('textbox',{name:'具体意见',exact:true}).isDisabled(),true)
  await page.getByRole('alert').filter({hasText:'模拟服务暂时不可用'}).waitFor()
  assert.equal(await page.getByRole('textbox',{name:'具体意见',exact:true}).inputValue(),'这是隔离浏览器内的验收内容')
  assert.equal(counts['POST /api/contact-messages'],1)
  check('feedback failure keeps input and submit is single-flight')
  await capture('feedback-error-desktop')
  state.feedbackFails = false
  await page.getByRole('button',{name:'提交意见',exact:true}).last().click()
  await page.getByText('意见已送达管理员，谢谢你的反馈',{exact:true}).waitFor()
  assert.equal(await page.getByRole('textbox',{name:'具体意见',exact:true}).inputValue(),'')
  await page.getByRole('textbox',{name:'主题',exact:true}).fill('新的意见')
  assert.equal(await page.getByText('意见已送达管理员，谢谢你的反馈',{exact:true}).count(),0)
  check('feedback success clears sent fields; new edits clear stale success')
  // Exercise the real Axios interceptor from the running app.
  state.privateExpired = true; state.refreshFails = true
  const requestResult = await page.evaluate(async () => {
    const moduleUrl = performance.getEntriesByType('resource').map(entry => entry.name).find(url => new URL(url).pathname === '/src/api/http.js')
    const {default:http,getUserAccessToken} = await import(moduleUrl)
    try { await http.get('/api/test-private') } catch(e) { return {status:e.response?.status,token:getUserAccessToken()} }
  })
  assert.deepEqual(requestResult,{status:503,token:'fixture-token'})
  assert.ok(page.url().includes('/feedback'))
  assert.equal(await page.getByRole('textbox',{name:'主题',exact:true}).inputValue(),'新的意见')
  check('real Axios 401 → refresh 503 preserves page, token and feedback draft')
  acceptLeave = true
  await nav('校园助手')
  await page.getByRole('textbox',{name:'输入消息'}).fill('请保留这段未发送成功的问题')
  await page.getByRole('button',{name:'发送',exact:true}).click()
  await page.waitForFunction(() => document.querySelector('[aria-label="输入消息"]')?.value === '请保留这段未发送成功的问题')
  await page.getByRole('button',{name:'发送',exact:true}).waitFor({state:'visible'})
  await page.waitForTimeout(800)
  assert.ok(page.url().includes('/chat'))
  assert.equal(await page.getByRole('textbox',{name:'输入消息'}).inputValue(),'请保留这段未发送成功的问题')
  check('stream 401 → refresh 503 restores unsent question without navigation')
  state.refreshFails = false
  await page.locator('.sidebar .profile').click()
  await page.getByRole('button',{name:'退出登录',exact:true}).click()
  await page.getByRole('alertdialog').waitFor()
  await page.keyboard.press('Shift+Tab')
  assert.equal(await page.evaluate(() => Boolean(document.activeElement.closest('.logout-dialog'))),true)
  await page.keyboard.press('Tab')
  assert.equal(await page.evaluate(() => Boolean(document.activeElement.closest('.logout-dialog'))),true)
  check('logout keyboard focus is contained; background navigation is inert')
  await page.getByRole('button',{name:'确认退出',exact:true}).click()
  assert.equal(await page.getByRole('button',{name:'正在退出…',exact:true}).isDisabled(),true)
  await page.getByRole('alert').filter({hasText:'未能确认退出成功'}).waitFor()
  assert.ok(page.url().includes('/chat'))
  check('logout failure remains signed in with actionable error')
  await capture('logout-error-desktop')
  await page.getByRole('button',{name:'取消',exact:true}).click()
  await page.setViewportSize({width:390,height:844})
  await nav('提交意见')
  await page.getByRole('heading',{name:'让它更好'}).waitFor()
  await page.waitForTimeout(400)
  await capture('feedback-mobile')
  await page.getByRole('button',{name:'打开菜单',exact:true}).click()
  await page.locator('.sidebar .profile').click()
  await page.getByRole('button',{name:'个人信息',exact:true}).click()
  await page.locator('#profile-major').waitFor()
  await page.waitForTimeout(850)
  await page.locator('#profile-major').scrollIntoViewIfNeeded()
  await capture('profile-mobile')
  check('390px feedback and profile render without horizontal overflow')
  await page.getByRole('button',{name:'打开菜单',exact:true}).click()
  await page.locator('.sidebar .profile').click()
  await page.getByRole('button',{name:'退出登录',exact:true}).click()
  state.logoutFails = false
  await page.getByRole('button',{name:'确认退出',exact:true}).click()
  await page.waitForURL('**/login')
  check('confirmed logout navigates to login')
  assert.deepEqual(errors,[])
} finally {
  await writeFile(path.join(output,'results.json'),JSON.stringify({passed,errors,counts},null,2))
  console.log(JSON.stringify({output,passed,errors,counts},null,2))
  await browser.close()
}
