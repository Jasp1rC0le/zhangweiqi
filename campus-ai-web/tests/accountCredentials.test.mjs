import test from 'node:test'
import assert from 'node:assert/strict'
import { createAccountCredentials, passwordIssue, nicknameIssue } from '../src/utils/accountCredentials.js'
import { createAccountActionFlow, scrubAccountActionHistory } from '../src/utils/accountActionFlow.js'

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function credentials() {
  let principal = 'user1:school1:session1', blocked = false, otherDirty = false
  const state = {}, names = [], passwords = [], writes = [], nameWrite = deferred(), passwordWrite = deferred()
  const model = createAccountCredentials({ owner: () => principal, state, blocked: () => blocked, otherDirty: () => otherDirty,
    saveNickname(value, options) { writes.push({ kind: 'nickname', value, signal: options.signal }); return nameWrite.promise },
    changePassword(current, next, options) { writes.push({ kind: 'password', current, next, signal: options.signal }); return passwordWrite.promise },
    nicknameSaved: value => names.push(value), passwordChanged: owner => passwords.push(owner) })
  model.reset('原昵称')
  return { model, state, names, passwords, writes, nameWrite, passwordWrite,
    owner: value => { principal = value }, blocked: value => { blocked = value }, dirty: value => { otherDirty = value } }
}
test('nickname saves a display name only, confirms readback and suppresses duplicate submission', async () => {
  const f = credentials(); f.state.nickname = ' 新昵称 '
  const pending = f.model.save(); await f.model.save(); assert.equal(f.writes.length, 1)
  f.nameWrite.resolve({ nickname: '新昵称', role: 'ADMIN', id: 99 }); await pending
  assert.deepEqual(f.names, [{ owner: 'user1:school1:session1', nickname: '新昵称' }])
  assert.equal(f.state.nickname, '新昵称'); assert.equal(f.model.dirty(), false); assert.equal(f.state.nicknameBusy, false)
})
test('stale or unverified name results never alter another account and unsent text survives an identity read', async () => {
  const f = credentials(); f.state.nickname = '未保存'; f.model.syncNickname('服务端新名'); assert.equal(f.state.nickname, '未保存')
  const pending = f.model.save(); f.owner('user2'); f.model.reset('另一个昵称'); f.nameWrite.resolve({ nickname: '未保存' }); await pending
  assert.equal(f.names.length, 0); assert.equal(f.state.nickname, '另一个昵称')
  const wrong = credentials(); wrong.state.nickname = '想保存'; const failed = wrong.model.save(); wrong.nameWrite.resolve({ nickname: '未变更' }); await failed
  assert.equal(wrong.names.length, 0); assert.match(wrong.state.nicknameError, /保存结果未核对/)
})
test('password validation covers confirmations byte limits unchanged passwords and other unsaved edits', async () => {
  assert.ok(passwordIssue('short')); assert.ok(passwordIssue('秘密'.repeat(13))); assert.ok(passwordIssue('long-enough', 'different'))
  assert.equal(passwordIssue('new-password', 'new-password'), ''); assert.ok(nicknameIssue('中间\n换行')); assert.equal(nicknameIssue('昵称 👩‍🎓'), '')
  const f = credentials(); Object.assign(f.state, { currentPassword: 'old-password', password: 'new-password', confirm: 'new-password' })
  f.dirty(true); await f.model.updatePassword(); assert.equal(f.writes.length, 0); assert.match(f.state.passwordError, /其他未保存/)
  f.dirty(false); f.state.nickname = '昵称草稿'; await f.model.updatePassword(); assert.equal(f.writes.length, 0)
})
test('confirmed password changes clear secrets before logout while errors never pretend success', async () => {
  const f = credentials(); Object.assign(f.state, { currentPassword: 'old-password', password: 'new-password', confirm: 'new-password' })
  const pending = f.model.updatePassword(); await f.model.updatePassword(); assert.equal(f.writes.length, 1)
  f.passwordWrite.resolve(); await pending
  assert.deepEqual(f.passwords, ['user1:school1:session1']); assert.equal(f.state.password, ''); assert.equal(f.state.currentPassword, ''); assert.equal(f.model.dirty(), false)
  const bad = credentials(); Object.assign(bad.state, { currentPassword: 'old-password', password: 'new-password', confirm: 'new-password' })
  const failure = bad.model.updatePassword(); bad.passwordWrite.reject({ response: { data: { message: '当前密码不正确' } } }); await failure
  assert.equal(bad.passwords.length, 0); assert.equal(bad.state.passwordError, '当前密码不正确')
})
test('account cutover and disposal erase secret inputs and reject late password effects', async () => {
  const f = credentials(); Object.assign(f.state, { currentPassword: 'old-password', password: 'new-password', confirm: 'new-password' })
  const pending = f.model.updatePassword(); f.owner('user2'); f.model.reset('第二用户'); assert.equal(f.writes[0].signal.aborted, true)
  f.passwordWrite.resolve(); await pending; assert.equal(f.passwords.length, 0); assert.equal(f.state.password, '')
  f.state.password = 'sensitive'; f.model.dispose(); assert.equal(f.state.password, ''); await f.model.updatePassword(); assert.equal(f.writes.length, 1)
})
function publicFlow(kind = 'forgot-password') {
  let mode = kind
  const state = {}, form = {}, calls = []
  const flow = createAccountActionFlow({ mode: () => mode, state, form, request(url, body, options) { const d = deferred(); calls.push({ url, body, signal: options.signal, ...d }); return d.promise } })
  return { flow, state, form, calls, mode: value => { mode = value } }
}
test('forgot password requests require explicit submission and never reveal account existence', async () => {
  const f = publicFlow(); await f.flow.initialize(); Object.assign(f.form, { username: ' student ', email: ' synthetic@example.test ' })
  assert.equal(f.calls.length, 0); const pending = f.flow.submit(); await f.flow.submit(); assert.equal(f.calls.length, 1)
  assert.deepEqual(f.calls[0].body, { username: 'student', email: 'synthetic@example.test' }); f.calls[0].resolve(); await pending
  assert.equal(f.state.done, true); assert.equal(f.state.busy, false); f.flow.edit(); assert.equal(f.state.done, false); assert.equal(f.calls.length, 1)
})
test('public reset validates matching passwords consumes only its token and clears secrets on confirmation', async () => {
  const f = publicFlow('reset-password'); await f.flow.initialize('synthetic-onetime-token')
  Object.assign(f.form, { password: 'new-password', confirm: 'different' }); await f.flow.submit(); assert.equal(f.calls.length, 0)
  f.form.confirm = 'new-password'; const pending = f.flow.submit(); assert.equal(f.calls[0].url, '/api/auth/password-reset/confirm')
  f.calls[0].resolve(); await pending; assert.equal(f.state.token, ''); assert.equal(f.form.password, ''); assert.equal(f.form.confirm, ''); assert.equal(f.state.done, true)
})
test('reused public routes cannot display old verification or reset results', async () => {
  const f = publicFlow('verify-email'), verify = f.flow.initialize('old-link')
  f.mode('reset-password'); await f.flow.initialize('new-link'); assert.equal(f.calls[0].signal.aborted, true)
  f.calls[0].resolve(); await verify; assert.equal(f.state.done, false); assert.equal(f.state.token, 'new-link')
  Object.assign(f.form, { password: 'new-password', confirm: 'new-password' }); const pending = f.flow.submit(); f.flow.dispose(); f.calls[1].resolve(); await pending
  assert.equal(f.state.done, false); assert.equal(f.form.password, ''); assert.equal(f.state.token, '')
  await f.flow.initialize('late-link'); assert.equal(f.state.token, '')
})
test('expired or failed reset links remain retry errors rather than a false successful reset', async () => {
  const f = publicFlow('reset-password'); await f.flow.initialize('expired-link'); Object.assign(f.form, { password: 'new-password', confirm: 'new-password' })
  const pending = f.flow.submit(); f.calls[0].reject({ response: { data: { message: '链接无效或已过期' } } }); await pending
  assert.equal(f.state.done, false); assert.equal(f.state.errorText, '链接无效或已过期')
})
test('current history and Vue router references drop credential fragments without destroying position metadata', () => {
  const source = { back: '/verify-email#token=old', current: '/reset-password#token=current', forward: '/chat', position: 9, scroll: { top: 17 } }
  const cleaned = scrubAccountActionHistory(source, '/reset-password', 'https://campthink.cn')
  assert.equal(cleaned.current, '/reset-password'); assert.equal(cleaned.back, '/verify-email'); assert.equal(cleaned.forward, '/chat')
  assert.equal(cleaned.position, 9); assert.deepEqual(cleaned.scroll, { top: 17 }); assert.equal(source.current, '/reset-password#token=current')
})
