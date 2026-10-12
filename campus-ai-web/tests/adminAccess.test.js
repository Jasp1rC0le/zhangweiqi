import test from 'node:test'
import assert from 'node:assert/strict'
import { adminDestination, isAdministrator } from '../src/utils/adminAccess.js'

test('only server ADMIN identity exposes the admin entrance', () => {
  for (const user of [null, undefined, {}, {role:'STUDENT'}, {role:'TEACHER'}, {role:'admin'}]) assert.equal(isAdministrator(user), false)
  assert.equal(isAdministrator({role:'ADMIN'}), true)
})
test('admin navigation rechecks identity without asking for a password', async () => {
  let calls = 0
  assert.equal(await adminDestination(async () => { calls++; return {role:'ADMIN'} }), null)
  assert.equal(calls, 1)
  assert.equal(await adminDestination(async () => ({role:'STUDENT'})), '/chat')
  assert.equal(await adminDestination(async () => { throw {response:{status:401}} }), '/login')
})
test('transient admin verification failures must not become login expiry', async () => {
  const unavailable = new Error('offline')
  await assert.rejects(adminDestination(async () => { throw unavailable }), error => error === unavailable)
})
