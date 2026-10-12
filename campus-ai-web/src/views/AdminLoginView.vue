<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAdminAuthStore } from '@/stores/adminAuth'
import { getUserAccessToken, refreshUserAccess } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import CampMark from '@/components/CampMark.vue'

const router = useRouter()
const adminAuth = useAdminAuthStore()
const auth = useAuthStore()
const form = reactive({ username: '', password: '' })
const busy = ref(false)
const errorMessage = ref('')

onMounted(async () => {
  try {
    if (!getUserAccessToken()) await refreshUserAccess()
    await adminAuth.loadCurrentUser()
    await router.replace('/admin')
  } catch {
    errorMessage.value = '请从网站统一登录入口登录管理员账号'
  }
})

async function submit() {
  if (busy.value) return
  errorMessage.value = ''
  if (!form.username.trim() || !form.password) {
    errorMessage.value = '请输入管理员账号和密码'
    return
  }
  busy.value = true
  try {
    await auth.login(form.username.trim(), form.password)
    await adminAuth.loadCurrentUser()
    form.password = ''
    await router.replace('/admin')
  } catch (error) {
    errorMessage.value = error.response?.data?.message || error.message || '登录失败，请稍后重试'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="admin-login-page">
    <div class="admin-login-shell">
      <header class="admin-login-header">
        <div class="admin-login-brand">
          <CampMark />
          <span>Campthink. <small>校园运营后台</small></span>
        </div>
        <router-link to="/chat">返回校园助手 <span aria-hidden="true">↗</span></router-link>
      </header>

      <div class="admin-login-content">
        <div class="admin-login-intro">
          <p>ADMIN WORKSPACE</p>
          <h1>好的答案，<br /><em>从这里开始</em></h1>
          <span>资料发布、用户反馈与使用情况，在同一个地方清晰处理。</span>
          <div class="admin-login-rule"></div>
          <small>管理员权限由服务器核验。普通账号无法进入后台。</small>
        </div>

        <form class="admin-login-card" @submit.prevent="submit" :aria-busy="busy">
          <p>管理员登录</p>
          <h2>欢迎回来</h2>
          <span class="admin-login-caption">使用已有的学校管理员账号登录</span>

          <label>
            <span>账号</span>
            <input v-model="form.username" name="username" autocomplete="username"
              maxlength="50" placeholder="输入管理员账号" required />
          </label>
          <label>
            <span>密码</span>
            <input v-model="form.password" name="password" type="password"
              autocomplete="current-password" placeholder="输入密码" required />
          </label>

          <p v-if="errorMessage" class="admin-login-error" role="alert">{{ errorMessage }}</p>
          <button type="submit" :disabled="busy">
            {{ busy ? '正在验证…' : '进入后台' }}
            <span aria-hidden="true">→</span>
          </button>
          <small>与网站共用登录会话。操作权限由服务器核验。</small>
        </form>
      </div>

      <footer>天津中德应用技术大学 · 校园信息服务</footer>
    </div>
  </main>
</template>

<style scoped>
.admin-login-page {
  min-height: 100vh;
  min-height: 100dvh;
  color: #1d1d1f;
  background: radial-gradient(circle at 12% 12%, #eff5ff 0, transparent 42%), #f8f9fb;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'PingFang SC', sans-serif;
}
.admin-login-shell {
  display: flex;
  flex-direction: column;
  width: min(1180px, calc(100% - 64px));
  min-height: 100vh;
  min-height: 100dvh;
  margin: auto;
}
.admin-login-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding-top: 36px;
}
.admin-login-brand { display: flex; align-items: center; gap: 11px; font-size: 18px; font-weight: 680; }
.admin-login-brand img { width: 34px; height: 34px; object-fit: contain; }
.admin-login-brand small { display: block; color: #75777f; font-size: 11px; font-weight: 500; }
.admin-login-header a { color: #464951; font-size: 13px; text-decoration: none; }
.admin-login-header a:hover { color: #0069d4; }
.admin-login-header a:focus-visible,
.admin-login-card button:focus-visible { outline: 2px solid #0071e3; outline-offset: 4px; }
.admin-login-content {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(340px, 430px);
  align-items: center;
  gap: clamp(40px, 8vw, 130px);
  flex: 1;
  padding: 68px 0;
}
.admin-login-intro > p { margin: 0 0 24px; color: #0069d4; font-size: 11px; font-weight: 700; letter-spacing: 0.2em; }
.admin-login-intro h1 { margin: 0; font-size: clamp(42px, 5vw, 68px); font-weight: 680; letter-spacing: -0.065em; line-height: 1.16; }
.admin-login-intro > span { display: block; max-width: 440px; margin-top: 24px; color: #63666e; font-size: 16px; line-height: 1.75; }
.admin-login-rule { width: 44px; height: 2px; margin: 42px 0 20px; background: #0071e3; }
.admin-login-intro > small { color: #777a82; font-size: 12px; }
.admin-login-card {
  padding: 38px;
  background: #fff;
  border: 1px solid #e8eaef;
  border-radius: 24px;
  box-shadow: 0 30px 80px rgba(27, 46, 81, 0.07);
}
.admin-login-card > p:first-child { margin: 0 0 8px; color: #0071e3; font-size: 12px; font-weight: 700; }
.admin-login-card h2 { margin: 0; font-size: 30px; font-weight: 660; letter-spacing: -0.04em; }
.admin-login-caption { display: block; margin: 10px 0 30px; color: #6c7078; font-size: 13px; }
.admin-login-card label { display: block; margin: 0 0 18px; }
.admin-login-card label span { display: block; margin-bottom: 8px; color: #464951; font-size: 13px; font-weight: 620; }
.admin-login-card input {
  width: 100%; height: 48px; padding: 0 15px; box-sizing: border-box;
  color: #1d1d1f; font: inherit; font-size: 14px; background: #f6f7f9;
  border: 1px solid transparent; border-radius: 12px; outline: none;
  transition: background 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
}
.admin-login-card input:focus { background: #fff; border-color: #6caef4; box-shadow: 0 0 0 4px #e9f3ff; }
.admin-login-error { margin: 0 0 16px; color: #af2832; font-size: 12px; line-height: 1.5; }
.admin-login-card button {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; min-height: 48px; margin-top: 26px; padding: 0 17px;
  color: #fff; font: inherit; font-size: 14px; font-weight: 650;
  background: #1d1d1f; border: 0; border-radius: 12px; cursor: pointer;
  transition: background 180ms ease, opacity 180ms ease;
}
.admin-login-card button:hover:not(:disabled) { background: #0069d4; }
.admin-login-card button:disabled { cursor: wait; opacity: 0.55; }
.admin-login-card > small { display: block; margin-top: 20px; color: #777a82; font-size: 11px; line-height: 1.5; }
.admin-login-shell > footer { padding: 20px 0 28px; color: #898b92; font-size: 11px; }
@media (max-width: 800px) {
  .admin-login-content { grid-template-columns: 1fr; gap: 34px; padding: 64px 0; }
  .admin-login-intro h1 { font-size: clamp(38px, 7vw, 52px); }
  .admin-login-intro > span { margin-top: 16px; }
  .admin-login-rule, .admin-login-intro > small { display: none; }
  .admin-login-card { max-width: 520px; }
}
@media (max-width: 520px) {
  .admin-login-shell { width: calc(100% - 32px); }
  .admin-login-header { padding-top: 20px; }
  .admin-login-brand { font-size: 15px; }
  .admin-login-brand img { width: 30px; height: 30px; }
  .admin-login-header a { font-size: 12px; }
  .admin-login-content { gap: 28px; padding: 46px 0; }
  .admin-login-card { padding: 28px 22px; border-radius: 20px; }
  .admin-login-intro h1 { font-size: 38px; }
  .admin-login-intro > span { font-size: 14px; }
}
@media (prefers-reduced-motion: reduce) {
  .admin-login-header a, .admin-login-card input, .admin-login-card button { transition: none; }
}
</style>
