<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CampMark from '@/components/CampMark.vue'
import { workspaceRetryTarget } from '@/utils/connectionRetry'
const route = useRoute(), router = useRouter(), busy = ref(false)
async function retry() {
  if (busy.value) return
  busy.value = true
  const destination = workspaceRetryTarget(route.query.retry, path => router.resolve(path))
  try { await router.replace(destination) }
  finally { busy.value = false }
}
</script>
<template>
  <main class="connection-page">
    <section aria-labelledby="connection-title">
      <CampMark />
      <h1 id="connection-title">暂时连不上服务</h1>
      <p>我们还无法确认你的登录状态，不必重新输入密码。检查网络后，再试一次</p>
      <button type="button" :disabled="busy" @click="retry">{{ busy ? '正在重新连接…' : '重新连接' }}</button>
      <RouterLink to="/login?reauth=1">返回登录页</RouterLink>
    </section>
  </main>
</template>
<style scoped>
.connection-page { min-height: 100svh; display: grid; place-items: center; padding: 24px; background: #f8f7f3; color: #273044; }
section { width: min(100%, 520px); padding: clamp(24px, 5vw, 48px); border: 1px solid #dedfd5; background: #fffefa; border-radius: 30px; }
.eyebrow { font-size: 13px; letter-spacing: .12em; margin-top: 28px; }
h1 { font-size: clamp(26px, 5vw, 36px); letter-spacing: -.04em; }
p { line-height: 1.8; color: #626c60; }
button { display: block; width: 100%; margin: 28px 0 20px; padding: 16px; border: 0; border-radius: 18px; background: #3547e1; color: white; font: inherit; cursor: pointer; }
button:disabled { opacity: .65; cursor: wait; }
a { color: #3547b1; } button:focus-visible, a:focus-visible { outline: 3px solid #9ea9ff; outline-offset: 4px; }
</style>
