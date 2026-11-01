import http from './http'

export async function saveAccountNickname(nickname, options = {}) {
  return (await http.put('/api/account/nickname', { nickname }, options)).data
}
export async function changeAccountPassword(currentPassword, password, options = {}) {
  await http.post('/api/account/password', { currentPassword, password }, options)
}
