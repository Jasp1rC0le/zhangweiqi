import test from 'node:test'
import assert from 'node:assert/strict'
import { loginFailureMessage } from '../src/utils/loginFeedback.js'

test('login failure preserves privacy and distinguishes credentials from server outages', () => {
  assert.match(loginFailureMessage({response:{status:401}}), /用户名或密码不匹配/)
  for (const status of [500,502,503]) {
    assert.match(loginFailureMessage({response:{status}}), /不必修改密码/)
    assert.doesNotMatch(loginFailureMessage({response:{status}}), /密码不匹配/)
  }
  assert.match(loginFailureMessage({response:{status:429}}), /过于频繁/)
  assert.match(loginFailureMessage({response:{status:403}}), /刷新页面/)
  assert.match(loginFailureMessage({response:{status:400}}), /格式/)
  assert.match(loginFailureMessage(new Error('network')), /检查网络/)
})

test('login feedback never echoes response payloads or internal error details', () => {
  const error = {message:'private internal detail',response:{status:401,data:{message:'unknown account fixture-user'}}}
  assert.doesNotMatch(loginFailureMessage(error), /fixture-user|private|unknown/)
  assert.equal(loginFailureMessage(null), loginFailureMessage(undefined))
})
