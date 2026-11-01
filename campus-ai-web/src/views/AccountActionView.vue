<script setup>
import { computed, onBeforeUnmount, reactive, toRefs, watch } from 'vue'
import { useRoute } from 'vue-router'
import http from '@/api/http'
import CampMark from '@/components/CampMark.vue'
import { Check, Lock } from '@element-plus/icons-vue'
import { createAccountActionFlow, scrubAccountActionHistory } from '@/utils/accountActionFlow'
import { useUnsavedChanges } from '@/utils/useUnsavedChanges'

const route = useRoute()
const mode = computed(() => route.name)
const state = reactive({ token: '', busy: false, done: false, errorText: '' })
const { token, busy, done, errorText } = toRefs(state)
const form = reactive({ username: '', email: '', password: '', confirm: '' })
const flow = createAccountActionFlow({ mode: () => mode.value, state, form, request: (url, body, options) => http.post(url, body, options) })
watch(() => route.fullPath, () => {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const value = params.get('token') || ''
  if (value) window.history.replaceState(scrubAccountActionHistory(window.history.state, window.location.pathname, window.location.origin), '', window.location.pathname)
  void flow.initialize(value)
}, { immediate: true, flush: 'sync' })
const submit = () => flow.submit()
useUnsavedChanges(() => !done.value && Boolean(form.username || form.email || form.password || form.confirm), () => busy.value)
onBeforeUnmount(() => flow.dispose())
</script>

<template>
  <main class="action-page">
    <RouterLink to="/login" class="brand"><CampMark /> Campthink.</RouterLink>
    <section class="action-card">
      <div class="action-symbol" :class="{ 'is-done': done }" aria-hidden="true"><Check v-if="done" /><Lock v-else /></div>
      <h1>{{ mode === 'verify-email' ? '验证邮箱' : mode === 'reset-password' ? '设置新密码' : '找回密码' }}</h1>
      <p v-if="done" class="description">
        {{ mode === 'verify-email' ? '邮箱验证成功，现在可以用于找回密码。' :
          mode === 'reset-password' ? '密码已更新，请使用新密码登录。旧会话与链接已失效。' :
          '若用户名与已验证邮箱匹配，我们会发送重置链接。请检查收件箱。' }}
      </p>
      <p v-else-if="mode === 'verify-email'" class="description" :role="errorText ? 'alert' : 'status'">{{ busy ? '正在验证…' : errorText }}</p>
      <div v-else-if="mode === 'reset-password' && !token" role="alert">
        <p class="description">这个重置链接不完整。请重新申请邮件，并从邮件中打开完整链接。</p>
        <RouterLink to="/forgot-password" class="return-link">重新申请重置邮件 →</RouterLink>
      </div>
      <template v-else-if="!done">
        <p class="description">{{ mode === 'forgot-password' ?
          '填写用户名和已验证的邮箱，我们会发送一次性重置链接。' : '新密码至少 6 个字符。' }}</p>
        <form @submit.prevent="submit">
          <template v-if="mode === 'forgot-password'">
            <label for="recovery-username">登录账号</label>
            <input id="recovery-username" v-model="form.username" autocomplete="username" maxlength="50" :disabled="busy" required />
            <label for="recovery-email">已验证邮箱</label>
            <input id="recovery-email" v-model="form.email" type="email" autocomplete="email" maxlength="254" :disabled="busy" required />
          </template>
          <template v-else>
            <label for="new-password">新密码</label>
            <input id="new-password" v-model="form.password" type="password" autocomplete="new-password" required minlength="6" maxlength="72" :disabled="busy" />
            <label for="confirm-password">再次输入新密码</label>
            <input id="confirm-password" v-model="form.confirm" type="password" autocomplete="new-password" required minlength="6" maxlength="72" :disabled="busy" />
          </template>
          <p v-if="errorText" class="error" role="alert">{{ errorText }}</p>
          <button type="submit" :disabled="busy || (mode === 'reset-password' && !token)">
            {{ busy ? '正在处理…' : mode === 'forgot-password' ? '发送重置链接' : '更新密码' }}
          </button>
        </form>
      </template>
      <button v-if="done && mode === 'forgot-password'" type="button" class="edit-recovery" @click="flow.edit">重新填写</button>
      <RouterLink to="/login?reauth=1" class="return-link">返回登录 →</RouterLink>
    </section>
  </main>
</template>

<style scoped>
.action-page { min-height: 100svh; background: radial-gradient(circle at 65% 8%, #eaf1fb, transparent 42%), #f7f8fa; padding: 28px; }
.brand { color: #20252e; text-decoration: none; font-size: 18px; font-weight: 700; letter-spacing: -.04em; }
.action-card { max-width: 480px; margin: max(9vh, 50px) auto 0; padding: clamp(28px, 6vw, 48px); background: #fff; border: 1px solid #e6e9ee; border-radius: 28px; box-shadow: 0 28px 80px #243f6810; }
.eyebrow { color: #6e809b; font-size: 12px; font-weight: 700; letter-spacing: .16em; }
h1 { margin: 10px 0 14px; font-size: clamp(32px, 5vw, 44px); letter-spacing: -.06em; color: #1d1d1f; }
.description { color: #6d7480; line-height: 1.7; }
form { display: grid; gap: 11px; margin-top: 30px; }
label { color: #434b57; font-size: 13px; font-weight: 600; }
input { min-height: 49px; padding: 0 15px; border: 1px solid #d8dee8; border-radius: 12px; outline: 0; background: #fafbfc; }
input:focus-visible { border-color: #3675cd; box-shadow: 0 0 0 3px #3675cd22; }
button { min-height: 49px; margin-top: 12px; border: 0; border-radius: 12px; background: #1967d2; color: #fff; font-weight: 600; cursor: pointer; }
button:disabled { opacity: .55; cursor: wait; }
.error { color: #a83b42; margin: 2px 0; }
.return-link { display: inline-block; margin-top: 28px; color: #3565ae; text-decoration: none; font-size: 14px; }
</style>
