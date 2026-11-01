<script setup>
import { computed, onBeforeUnmount, reactive, watch } from 'vue'
import { saveAccountNickname, changeAccountPassword } from '@/api/accountSettings'
import { createAccountCredentials } from '@/utils/accountCredentials'

const props = defineProps({ owner: { type: String, required: true }, nickname: { type: String, default: '' }, blocked: Boolean, otherDirty: Boolean,
  verifiedEmail: { type: String, default: '' }, emailKnown: Boolean })
const emit = defineEmits(['nickname-saved', 'password-changed'])
const state = reactive({ nickname: '', savedNickname: '', currentPassword: '', password: '', confirm: '', nicknameBusy: false, passwordBusy: false,
  nicknameError: '', nicknameStatus: '', passwordError: '' })
const model = createAccountCredentials({ owner: () => props.owner, state, blocked: () => props.blocked, otherDirty: () => props.otherDirty,
  saveNickname: saveAccountNickname, changePassword: changeAccountPassword, nicknameSaved: value => emit('nickname-saved', value), passwordChanged: owner => emit('password-changed', owner) })
const busy = computed(() => state.nicknameBusy || state.passwordBusy)
watch(() => props.owner, () => model.reset(props.nickname), { immediate: true, flush: 'sync' })
watch(() => props.nickname, value => model.syncNickname(value), { flush: 'sync' })
onBeforeUnmount(() => model.dispose())
defineExpose({ busy, dirty: computed(() => model.dirty()) })
</script>

<template>
  <section v-if="owner" class="account-card account-credentials" aria-labelledby="account-credentials-title">
    <h2 id="account-credentials-title" class="sr-only">昵称与密码</h2>
    <form class="nickname-form" :aria-busy="state.nicknameBusy" @submit.prevent="model.save">
      <label for="account-nickname">昵称<input id="account-nickname" v-model="state.nickname" type="text" maxlength="50" autocomplete="nickname" required :disabled="blocked || busy" @input="state.nicknameError = ''; state.nicknameStatus = ''" /></label>
      <button type="submit" :disabled="blocked || busy || state.nickname === state.savedNickname">{{ state.nicknameBusy ? '保存中…' : '保存昵称' }}</button>
      <p v-if="state.nicknameError" class="form-error credentials-error" role="alert">{{ state.nicknameError }}</p><p v-else-if="state.nicknameStatus" class="credentials-status" role="status">{{ state.nicknameStatus }}</p>
    </form>
    <details id="password-security" class="account-setting password-setting"><summary><span class="setting-label">修改密码</span><span class="setting-value">使用当前密码验证</span><span class="setting-chevron" aria-hidden="true"></span></summary>
      <form class="account-form credentials-password" :aria-busy="state.passwordBusy" @submit.prevent="model.updatePassword" @input="state.passwordError = ''">
        <label for="change-current-password">当前密码<input id="change-current-password" v-model="state.currentPassword" type="password" autocomplete="current-password" maxlength="72" required :disabled="blocked || busy" /></label>
        <div class="form-pair"><label for="change-new-password">新密码<input id="change-new-password" v-model="state.password" type="password" autocomplete="new-password" minlength="6" maxlength="72" required :disabled="blocked || busy" /></label><label for="change-confirm-password">确认新密码<input id="change-confirm-password" v-model="state.confirm" type="password" autocomplete="new-password" minlength="6" maxlength="72" required :disabled="blocked || busy" /></label></div>
        <p class="credentials-hint">至少6位，请先保存未完成内容。修改后需重新登录，旧会话、找回和日历订阅链接失效。</p>
        <p v-if="otherDirty || state.nickname !== state.savedNickname" class="credentials-hint">请先保存其他修改。</p>
        <p v-if="state.passwordError" class="form-error credentials-error" role="alert">{{ state.passwordError }}</p>
        <div class="credentials-actions"><button type="submit" :disabled="blocked || busy || otherDirty || state.nickname !== state.savedNickname">{{ state.passwordBusy ? '修改中…' : '更新密码' }}</button></div>
      </form>
    </details>
    <div class="credentials-recovery"><RouterLink to="/forgot-password">忘记密码？</RouterLink><RouterLink :to="{ path: '/account', hash: '#security' }">{{ !emailKnown ? '核对找回邮箱' : verifiedEmail ? '找回邮箱已验证' : '绑定找回邮箱' }}</RouterLink></div>
  </section>
</template>

<style scoped>
.account-credentials{padding:22px 0}.nickname-form{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:10px 14px}.nickname-form label,.credentials-password label{display:grid;gap:8px;min-width:0;color:#29323c;font-size:14px}.account-credentials input{box-sizing:border-box;min-height:46px;min-width:0;width:100%;padding:10px 12px;border:1px solid #dbe3ec;border-radius:10px;background:#f7f9fc;color:#29323c;font:inherit;font-size:16px}.account-credentials input:focus-visible{outline:2px solid #0b62db;outline-offset:2px}.nickname-form>p{grid-column:1/-1;margin:0}.password-setting{margin-top:14px;border-top:1px solid #e2e7ec}.credentials-password{display:grid;gap:14px;padding:2px 0 16px}.credentials-password .form-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.credentials-actions,.credentials-recovery{display:flex;align-items:center;flex-wrap:wrap;gap:10px 18px}.credentials-actions>a,.credentials-recovery a{display:inline-flex;align-items:center;min-height:44px;color:#245b9e;font-size:13px;text-decoration:none}.password-setting>summary{display:flex;align-items:center;gap:12px;min-height:64px;list-style:none;cursor:pointer}.password-setting>summary::-webkit-details-marker{display:none}.password-setting .setting-label{font-size:14px;font-weight:500}.password-setting .setting-value{margin-left:auto;color:#5d6876;font-size:12px}.password-setting .setting-chevron{width:7px;height:7px;flex:none;margin:0 4px;border-right:1.5px solid #657589;border-bottom:1.5px solid #657589;transform:rotate(45deg);transition:transform 180ms ease}.password-setting[open] .setting-chevron{transform:rotate(225deg)}.password-setting>summary:focus-visible{outline:2px solid #0b62db;outline-offset:2px}.credentials-recovery{margin-top:4px;justify-content:space-between}.credentials-error{color:#a43434;font-size:13px}.credentials-status,.credentials-hint{color:#5d6876;font-size:13px;line-height:1.6}.account-credentials a:focus-visible{outline:2px solid #0b62db;outline-offset:3px}.account-credentials a:hover{text-decoration:underline;text-underline-offset:3px}
@media(prefers-reduced-motion:reduce){.password-setting .setting-chevron{transition:none}}
@media(max-width:520px){.credentials-password .form-pair{grid-template-columns:minmax(0,1fr)}.nickname-form{gap:10px}.nickname-form button{padding:10px 12px}}
</style>

