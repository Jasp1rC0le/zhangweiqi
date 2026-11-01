import { createAccountLifecycle } from './accountLifecycle.js'

export function passwordIssue(password, confirm) {
  if (typeof password !== 'string' || !password.trim() || password.length < 6 || password.length > 72) return '密码须为6至72个字符'
  if (new TextEncoder().encode(password).length > 72) return '密码过长，请缩短后重试'
  if (confirm !== undefined && password !== confirm) return '两次输入的密码不一致'
  return ''
}
export function nicknameIssue(value) {
  const nickname = typeof value === 'string' ? value.trim() : ''
  return !nickname || nickname.length > 50 || Array.from(nickname).some(character => { const code = character.codePointAt(0); return code < 32 || code >= 127 && code <= 159 }) ? '昵称须为1至50个字符，不能包含换行或控制字符' : ''
}

export function createAccountCredentials({ owner, state, blocked, otherDirty, saveNickname, changePassword, nicknameSaved, passwordChanged }) {
  const life = createAccountLifecycle(owner)
  let disposed = false
  const nicknameDirty = () => state.nickname !== state.savedNickname
  function clearPasswords() { state.currentPassword = ''; state.password = ''; state.confirm = '' }
  function reset(nickname = '') {
    life.reset(); clearPasswords()
    Object.assign(state, { nickname, savedNickname: nickname, nicknameBusy: false, passwordBusy: false, nicknameError: '', nicknameStatus: '', passwordError: '' })
  }
  function syncNickname(nickname) {
    if (!nicknameDirty()) state.nickname = nickname
    state.savedNickname = nickname
  }
  async function save() {
    if (disposed || !owner() || blocked() || state.nicknameBusy || state.passwordBusy || !nicknameDirty()) return
    const value = state.nickname.trim(), issue = nicknameIssue(value)
    if (issue) { state.nicknameError = issue; return }
    const ticket = life.capture(), principal = owner()
    state.nicknameBusy = true; state.nicknameError = ''; state.nicknameStatus = ''
    try {
      const response = await saveNickname(value, { signal: ticket.signal })
      if (!ticket.current() || disposed) return
      if (typeof response?.nickname !== 'string' || response.nickname !== value || nicknameIssue(response.nickname)) throw new Error('昵称保存结果未核对，请刷新身份后重试')
      state.nickname = response.nickname; state.savedNickname = response.nickname; state.nicknameStatus = '昵称已保存'
      nicknameSaved({ owner: principal, nickname: response.nickname })
    } catch (error) { if (ticket.current() && !disposed) state.nicknameError = error.response?.data?.message || error.message || '昵称保存未确认，请重试' }
    finally { if (ticket.current() && !disposed) state.nicknameBusy = false }
  }
  async function updatePassword() {
    if (disposed || !owner() || blocked() || state.nicknameBusy || state.passwordBusy) return
    state.passwordError = ''
    if (otherDirty() || nicknameDirty()) { state.passwordError = '请先保存或清空其他未保存的修改'; return }
    const issue = passwordIssue(state.password, state.confirm)
    if (!state.currentPassword) { state.passwordError = '请输入当前密码'; return }
    if (issue) { state.passwordError = issue; return }
    if (state.currentPassword === state.password) { state.passwordError = '新密码不能与当前密码相同'; return }
    const ticket = life.capture(), principal = owner()
    state.passwordBusy = true
    try {
      await changePassword(state.currentPassword, state.password, { signal: ticket.signal })
      if (!ticket.current() || disposed) return
      clearPasswords(); state.passwordBusy = false
      passwordChanged(principal)
    } catch (error) {
      if (ticket.current() && !disposed) state.passwordError = error.response?.data?.message || '未能确认修改结果，请先用新密码尝试登录'
    } finally { if (ticket.current() && !disposed) state.passwordBusy = false }
  }
  return { save, updatePassword, reset, syncNickname,
    dirty: () => nicknameDirty() || Boolean(state.currentPassword || state.password || state.confirm),
    dispose() { disposed = true; life.dispose(); clearPasswords(); state.nickname = ''; state.savedNickname = ''; state.nicknameBusy = false; state.passwordBusy = false },
  }
}
