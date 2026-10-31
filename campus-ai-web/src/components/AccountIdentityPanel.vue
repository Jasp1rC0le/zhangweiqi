<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { isAdministrator } from '@/utils/adminAccess'
import { IDENTITY_ROLES } from '@/utils/teachingIdentity'

const auth = useAuthStore()
const displayName = computed(() => auth.user?.nickname || auth.user?.username || '我的账户')
const avatarLetter = computed(() => Array.from(displayName.value)[0]?.toLocaleUpperCase() || '我')
const busy = ref(false), checked = ref(false), error = ref(''), updated = ref('')
const roleLabel = computed(() => ({ ...IDENTITY_ROLES, ADMIN: '学校管理员', STUDENT: '校园用户' })[auth.user?.role] || '待核验')
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
    <span class="identity-avatar" aria-hidden="true">{{ avatarLetter }}</span>
    <div class="identity-copy">
      <h2 id="account-identity-title">{{ displayName }}</h2>
      <p>@{{ auth.user?.username || '未读取' }}</p>
      <span class="identity-role" :title="checked ? `服务器身份已核验 · ${updated}` : '身份以服务器核验结果为准'">{{ busy ? '核验中' : checked ? roleLabel : '待核验' }}</span>
    </div>
    <div class="identity-actions">
      <RouterLink v-if="checked && isAdministrator(auth.user)" to="/admin" class="identity-admin-link">管理后台</RouterLink>
      <button type="button" :disabled="busy" @click="verify">{{ busy ? '核验中…' : '刷新身份' }}</button>
    </div>
    <p v-if="error" class="identity-error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.identity-panel { display:flex; flex-wrap:wrap; align-items:center; gap:16px; margin:0; padding:24px 0; border:0; border-bottom:1px solid var(--assistant-line,#e2e7ec); background:transparent; }
.identity-avatar { display:grid; place-items:center; flex:none; width:60px; height:60px; border-radius:20px; background:#e6efff; color:#165dc4; font-size:28px; font-weight:600; }
.identity-copy { flex:1 1 170px; min-width:0; }
.identity-copy h2 { margin:0 0 4px; font-size:24px; line-height:1.35; color:#29323c; overflow-wrap:anywhere; }
.identity-copy p { display:inline; margin:0; overflow-wrap:anywhere; font-size:13px; color:#5d6876; }
.identity-role { display:inline-block; margin:4px 0 0 10px; padding:3px 7px; border-radius:6px; background:#f0f4f9; color:#43566d; font-size:12px; line-height:1.5; }
.identity-actions { display:flex; flex-wrap:wrap; gap:10px; }
.identity-actions button,.identity-admin-link { display:inline-flex; align-items:center; justify-content:center; min-height:44px; padding:10px 16px; border:1px solid #cbd3c3; border-radius:14px; background:#f4f5ef; color:#38472f; font:inherit; text-decoration:none; cursor:pointer; }
.identity-admin-link { background:#3548da; color:#fff; border-color:#3548da; }
.identity-actions button:hover { background:#e9ede2; }.identity-admin-link:hover { background:#293bc4; }
.identity-actions :focus-visible { outline:2px solid #3548da; outline-offset:3px; }
.identity-actions button:disabled { opacity:.6; cursor:wait; }
.identity-error { flex-basis:100%; margin:0; color:#923d31; font-size:14px; line-height:1.7; }
@media(max-width:600px){.identity-panel{gap:12px}.identity-avatar{width:52px;height:52px;border-radius:16px;font-size:24px}.identity-copy{flex-basis:calc(100% - 64px)}.identity-actions{padding-left:64px;gap:8px}.identity-actions button,.identity-admin-link{padding:8px 12px;font-size:13px}.identity-copy h2{font-size:22px}}
</style>
