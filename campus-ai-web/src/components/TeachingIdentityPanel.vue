<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { userSessionGeneration } from '@/api/http'
import { useScopedConfirmation } from '@/utils/useScopedConfirmation'
import { useUnsavedChanges } from '@/utils/useUnsavedChanges'
import { createIdentityResource, IDENTITY_ROLES, IDENTITY_STATES } from '@/utils/teachingIdentity'
import { readMyTeachingIdentities, readIdentityApplications, applyTeachingIdentity, reviewTeachingIdentity } from '@/api/teachingIdentity'

const props = defineProps({ admin: Boolean })
const auth = useAuthStore()
const owner = computed(() => auth.user && (!props.admin || auth.user.role === 'ADMIN') ? `${auth.user.id}:${auth.user.schoolId}:${userSessionGeneration.value}` : '')
const state = reactive({ busy: false, loaded: false, enabled: false, items: [], page: 0, total: 0, totalPages: 0, error: '', notice: '' })
const role = ref('TEACHER'), filter = ref('PENDING'), search = ref(''), selected = ref(null), decision = ref('APPROVE'), reason = ref('')
const query = ref({ status: 'PENDING', page: 0, size: 25, search: '' })
let disposed = false
const resource = createIdentityResource({ state, owner: () => owner.value, userId: () => auth.user?.id, admin: props.admin,
  read: (params, signal) => props.admin ? readIdentityApplications(params, signal) : readMyTeachingIdentities(signal), apply: applyTeachingIdentity, review: reviewTeachingIdentity })
const { confirm, confirming } = useScopedConfirmation(() => `${owner.value}:${selected.value?.id || ''}:${selected.value?.revision || ''}`, () => !disposed)
const ownRole = computed(() => state.items.find(i => i.requestedRole === role.value))
const busy = computed(() => state.busy || confirming.value)
useUnsavedChanges(() => !!selected.value && !!reason.value.trim(), () => busy.value)
const canApply = computed(() => state.loaded && state.enabled && !busy.value && (!ownRole.value || ownRole.value.status === 'REJECTED'))
const stateClass = status => ({ PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected', REVOKED: 'rejected' })[status]
async function load(page = 0, useFilters = false) {
  if (busy.value) return
  if (useFilters) query.value = { status: filter.value, page: 0, size: 25, search: search.value.trim() }
  else query.value = { ...query.value, page }
  selected.value = null; reason.value = ''
  await resource.load(query.value)
}
async function choose(item, action) {
  if (busy.value) return
  if (selected.value && reason.value.trim() && !(await confirm('核验说明还未保存。切换申请会放弃这段说明。', { title: '保留核验说明？', confirmText: '放弃并切换' }))) return
  if (!owner.value || !state.items.some(i => i.id === item.id && i.revision === item.revision)) return
  selected.value = { ...item }; decision.value = action; reason.value = ''; state.error = ''; state.notice = ''
}
async function submitReview() {
  if (!selected.value || busy.value || (decision.value !== 'APPROVE' && !reason.value.trim())) return
  const item = { ...selected.value }, input = { revision: item.revision, decision: decision.value, reason: reason.value.trim() }
  const saved = await resource.save({ item, input, query: query.value, confirm: () => confirm(`对 @${item.username} 的${IDENTITY_ROLES[item.requestedRole]}身份执行“${{ APPROVE: '通过', REJECT: '拒绝', REVOKE: '撤销', RESTORE: '恢复' }[input.decision]}”？不会自动授予课程、班级或学院范围。`, { title: '确认身份审核', confirmText: '确认审核', cancelText: '取消' }) })
  if (saved || state.notice) { selected.value = null; reason.value = '' }
}
async function submitApplication() {
  if (!canApply.value) return
  await resource.save({ input: { role: role.value, revision: ownRole.value?.revision || 0 } })
}
watch(owner, () => { resource.reset(); selected.value = null; reason.value = ''; search.value = ''; filter.value = 'PENDING'; query.value = { status: 'PENDING', page: 0, size: 25, search: '' }; if (owner.value) resource.load(query.value) }, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => { disposed = true; resource.dispose() })
</script>
<template>
  <section id="teaching-identity" class="teaching-identity" :aria-busy="busy" :aria-label="admin ? '教学身份审核' : '我的教学身份'">
    <h2>{{ admin ? '教学身份审核' : '我的教学身份' }}</h2>
    <p>{{ admin ? '先核实身份，再单独配置课程或负责范围。这里只审核本校账号。' : '学生基础功能无需审核。教师、辅导员和书记身份，由本校管理员核实后开放。' }}</p>
    <p v-if="state.notice" class="identity-success" role="status">{{ state.notice }}</p>
    <p v-if="state.error" class="identity-error" role="alert">{{ state.error }}</p>
    <button v-if="state.error || !state.loaded" type="button" :disabled="busy" @click="load(state.page)">{{ busy ? '正在读取…' : '重新读取身份状态' }}</button>
    <p v-if="state.loaded && !state.enabled">身份申请暂未开放。已有账户和个人课表可继续使用，不会把自选身份当作教学权限。</p>
    <template v-if="state.loaded && state.enabled">
      <form v-if="admin" class="identity-filters" @submit.prevent="load(0, true)">
        <label>审核状态<select v-model="filter" :disabled="busy"><option v-for="(label, status) in IDENTITY_STATES" :key="status" :value="status">{{ label }}</option><option value="ALL">全部状态</option></select></label>
        <label>账号或昵称<input v-model="search" maxlength="80" :disabled="busy" /></label><button :disabled="busy">筛选</button>
      </form>
      <ul class="identity-list">
        <li v-for="item in state.items" :key="item.id">
          <div><strong>{{ admin ? `${item.nickname} · ${IDENTITY_ROLES[item.requestedRole]}` : IDENTITY_ROLES[item.requestedRole] }}</strong><span class="identity-status" :class="stateClass(item.status)">{{ IDENTITY_STATES[item.status] }}</span><small v-if="admin">@{{ item.username }} · 账号编号 {{ item.userId }}</small><p v-if="item.reason">审核说明：{{ item.reason }}</p></div>
          <div v-if="admin" class="teaching-identity-actions">
            <template v-if="item.status === 'PENDING'"><button class="primary" :disabled="busy" @click="choose(item, 'APPROVE')">通过</button><button :disabled="busy" @click="choose(item, 'REJECT')">拒绝</button></template>
            <button v-else-if="item.status === 'APPROVED'" :disabled="busy" @click="choose(item, 'REVOKE')">撤销身份</button>
            <button v-else-if="item.status === 'REVOKED'" :disabled="busy" @click="choose(item, 'RESTORE')">复核恢复</button>
          </div>
        </li>
      </ul>
      <p v-if="!state.items.length">{{ admin ? '当前筛选没有申请。' : '还没有申请其他教学身份。' }}</p>
      <form v-if="admin && selected" class="identity-review" @submit.prevent="submitReview">
        <p>审核 @{{ selected.username }} 的{{ IDENTITY_ROLES[selected.requestedRole] }}身份</p>
        <label>核验说明{{ decision === 'APPROVE' ? '（选填）' : '（必填）' }}<input v-model="reason" maxlength="200" :required="decision !== 'APPROVE'" :disabled="busy" placeholder="只写核验结论，不填写证件号、电话或密码" /></label>
        <div class="teaching-identity-actions"><button class="primary" :disabled="busy">{{ busy ? '处理中…' : '确认审核' }}</button><button type="button" :disabled="busy" @click="selected = null; reason = ''">取消</button></div>
      </form>
      <nav v-if="admin" class="identity-pagination" aria-label="身份审核分页"><span>共 {{ state.total }} 项{{ state.totalPages ? ` · 第 ${state.page + 1}/${state.totalPages} 页` : '' }}</span><button type="button" :disabled="busy || state.page === 0" @click="load(state.page - 1)">上一页</button><button type="button" :disabled="busy || state.page + 1 >= state.totalPages" @click="load(state.page + 1)">下一页</button></nav>
      <form v-else class="identity-apply" @submit.prevent="submitApplication"><label>申请身份<select v-model="role" :disabled="busy"><option v-for="r in ['TEACHER','COUNSELOR','SECRETARY']" :key="r" :value="r">{{ IDENTITY_ROLES[r] }}</option></select></label><button class="primary" :disabled="!canApply">{{ ownRole?.status === 'PENDING' ? '等待管理员审核' : ownRole?.status === 'APPROVED' ? '身份已通过' : ownRole?.status === 'REVOKED' ? '请联系管理员复核' : '提交身份申请' }}</button></form>
      <p class="identity-footnote">身份通过不等于已有教学范围。<RouterLink :to="admin ? '/teaching' : '/timetable'">{{ admin ? '配置课程与负责范围' : '查看我的课表' }}</RouterLink></p>
      <button type="button" :disabled="busy" @click="load(state.page)">刷新状态</button>
    </template>
  </section>
</template>
<style scoped>
.teaching-identity { padding:24px 0; color:var(--assistant-ink,#29323c); max-width:880px; }
.teaching-identity h2 { margin:0 0 10px; font-size:20px; font-weight:600; }
.teaching-identity p { font-size:14px; line-height:1.7; color:var(--assistant-muted,#5d6876); margin:8px 0; max-width:70ch; }
.teaching-identity label { display:flex; flex-direction:column; gap:8px; font-size:14px; min-width:0; }
.teaching-identity button,.teaching-identity input,.teaching-identity select { font:inherit; min-height:44px; padding:10px 14px; border:1px solid var(--assistant-line,#e2e7ec); border-radius:12px; color:inherit; background:var(--assistant-surface,#fff); min-width:0; }
.teaching-identity input { width:100%; box-sizing:border-box; font-size:16px; caret-color:var(--assistant-accent,#2b63cf); }
.teaching-identity button { cursor:pointer; transition:background-color 180ms ease-out; }
.teaching-identity button:hover { background:var(--assistant-soft,#e9f0ff); }
.teaching-identity .primary { background:var(--assistant-accent,#2b63cf); border-color:transparent; color:#fff; }
.teaching-identity .primary:hover { background:var(--assistant-accent-hover,#214ea6); }
.teaching-identity :disabled { opacity:.55; cursor:not-allowed; }
.identity-filters { display:flex; flex-wrap:wrap; align-items:end; gap:12px; margin:22px 0; }
.identity-filters label:nth-child(2) { flex:1; min-width:160px; }
.identity-list { list-style:none; margin:20px 0; padding:0; }
.identity-list li { display:flex; gap:20px; align-items:center; justify-content:space-between; padding:18px 0; border-bottom:1px solid var(--assistant-line,#e2e7ec); }
.identity-list li>div:first-child { min-width:0; overflow-wrap:anywhere; }
.identity-list strong { font-size:16px; font-weight:500; }
.identity-list small { display:block; margin-top:7px; color:var(--assistant-muted,#5d6876); font-size:13px; }
.identity-status { display:inline-block; margin-left:12px; font-size:13px; padding:4px 8px; border-radius:7px; }
.identity-status.pending { color:var(--assistant-warning,#8b5e14); background:var(--assistant-warning-soft,#fff4d9); }
.identity-status.approved { color:var(--assistant-success,#216b4c); background:var(--assistant-success-soft,#eaf6ef); }
.identity-status.rejected { color:var(--assistant-danger,#a43e42); background:var(--assistant-danger-soft,#fdeced); }
.teaching-identity-actions,.identity-pagination,.identity-apply { display:flex; align-items:center; flex-wrap:wrap; gap:10px; }
.identity-apply { align-items:end; margin:20px 0; }
.identity-pagination { margin-top:20px; font-size:14px; font-variant-numeric:tabular-nums; }
.identity-pagination span { margin-right:auto; }
.identity-review { background:var(--assistant-panel,#f0f3f6); padding:18px; border-radius:14px; margin:20px 0; }
.identity-review .teaching-identity-actions { margin-top:14px; }
.teaching-identity .identity-error { color:var(--assistant-danger,#a43e42); }
.teaching-identity .identity-success { color:var(--assistant-success,#216b4c); }
.identity-footnote a { color:var(--assistant-accent-hover,#214ea6); text-underline-offset:4px; }
.teaching-identity :focus-visible { outline:2px solid var(--assistant-accent,#2b63cf); outline-offset:3px; }
@media(max-width:600px) { .identity-list li { align-items:start; flex-direction:column; gap:12px; } .identity-filters { align-items:stretch; } .identity-filters label,.identity-apply label { flex:1; } .identity-status { margin-left:8px; } .identity-pagination span { width:100%; } }
@media(prefers-reduced-motion:reduce) { .teaching-identity button { transition:none; } }
</style>
