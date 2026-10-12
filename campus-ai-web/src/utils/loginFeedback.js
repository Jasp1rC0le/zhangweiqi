// Do not reveal whether a username exists, or display arbitrary backend internals.
export function loginFailureMessage(error) {
  const status = error?.response?.status
  if (status === 401) return '用户名或密码不匹配，请核对当前站点的账号后重试'
  if (status === 429) return '登录尝试过于频繁，请稍后再试'
  if (status === 403) return '登录请求被拒绝，请刷新页面后重试'
  if (status === 400) return '请检查用户名和密码格式后重试'
  if (status >= 500) return '登录服务暂时不可用，请稍后重试，不必修改密码'
  return '未能连接登录服务，请检查网络后重试'
}
