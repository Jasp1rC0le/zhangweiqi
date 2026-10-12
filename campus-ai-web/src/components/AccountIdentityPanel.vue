<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { isAdministrator } from '@/utils/adminAccess'

const auth = useAuthStore()
const busy = ref(false), checked = ref(false), error = ref(''), updated = ref('')
const roleLabel = computed(() => ({ ADMIN: '学校管理员', TEACHER: '教师', STUDENT: '校园用户' })[auth.user?.role] || '待核验')
async function verify() {
  if (busy.value) return
  busy.value = true; error.value = ''; checked.value = false
  try {
    await auth.loadCurrentUser()
    checked.value = true
    updated.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } catch { error.value = '身份核验未完成，暂不展示后台入口。请检查连接后重试' }
  finally { busy.value = false }
}
onMounted(verify)
</script>

<template>
  <section class="identity-panel" aria-labelledby="account-identity-title" :aria-busy="busy">
    <div class="identity-copy">
      <h2 id="account-identity-title">账号身份</h2>
      <p>@{{ auth.user?.username || '未读取' }} <span>{{ busy ? '核验中' : checked ? roleLabel : '待核验' }}</span></p>
      <small>权限以服务器为准{{ updated && checked ? ` · ${updated} 已核验` : '' }}</small>
    </div>
    <div class="identity-actions">
      <RouterLink v-if="checked && isAdministrator(auth.user)" to="/admin" class="identity-admin-link">进入管理后台</RouterLink>
      <button type="button" :disabled="busy" @click="verify">{{ busy ? '正在核验…' : '重新核验身份' }}</button>
    </div>
    <p v-if="error" class="identity-error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.identity-panel { display:flex; flex-wrap:wrap; align-items:center; gap:20px; margin-bottom:24px; padding:24px; border:1px solid #d4dacd; border-radius:22px; background:#fffefa; }
.identity-copy { flex:1 1 200px; min-width:0; }
.identity-copy h2 { margin:0 0 10px; font-size:20px; color:#283144; }
.identity-copy p { margin:0 0 8px; overflow-wrap:anywhere; font-size:16px; color:#38472f; }
.identity-copy p span { margin-inline-start:12px; font-size:14px; }
.identity-copy small { color:#596550; font-size:14px; }
.identity-actions { display:flex; flex-wrap:wrap; gap:10px; }
.identity-actions button,.identity-admin-link { display:inline-flex; align-items:center; justify-content:center; min-height:44px; padding:10px 16px; border:1px solid #cbd3c3; border-radius:14px; background:#f4f5ef; color:#38472f; font:inherit; text-decoration:none; cursor:pointer; }
.identity-admin-link { background:#3548da; color:#fff; border-color:#3548da; }
.identity-actions button:hover { background:#e9ede2; }.identity-admin-link:hover { background:#293bc4; }
.identity-actions :focus-visible { outline:2px solid #3548da; outline-offset:3px; }
.identity-actions button:disabled { opacity:.6; cursor:wait; }
.identity-error { flex-basis:100%; margin:0; color:#923d31; font-size:14px; line-height:1.7; }
</style>
