<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { CopyDocument, TopRight } from '@element-plus/icons-vue'
import http, { userSessionGeneration } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { createLatestRequest } from '@/utils/latestRequest'
import { createScopedTextCopy } from '@/utils/scopedTextCopy'
import { validSchoolInvoice, schoolInvoiceText } from '@/utils/schoolInvoice'
const props = defineProps({ disabled: Boolean })
const auth = useAuthStore(), info = ref(null), loading = ref(false), error = ref(''), unavailable = ref(false), manual = ref()
const owner = computed(() => auth.user ? `${auth.user.id}:${auth.user.schoolId}:${userSessionGeneration.value}` : '')
const state = reactive({ busy: false, notice: '', manualText: '' })
const copy = createScopedTextCopy({ key: () => `${owner.value}:${schoolInvoiceText(info.value)}`, available: () => !!owner.value && !!info.value && !props.disabled && !loading.value && !error.value,
  text: () => schoolInvoiceText(info.value), state, write: text => navigator.clipboard.writeText(text), successNotice: '开票信息已复制', failureNotice: '可在下方全选复制' })
const reader = createLatestRequest({
  load: options => http.get(`/api/schools/${auth.user.schoolId}/invoice`, options),
  onStart: () => { loading.value = true; error.value = ''; unavailable.value = false; info.value = null; copy.reset() },
  onSuccess: ({ data }) => { if (!validSchoolInvoice(data)) { error.value = '开票信息未能核对，请查看财务处官网'; return } info.value = data },
  onError: e => { unavailable.value = e.response?.status === 404; if (!unavailable.value) error.value = '开票信息未能读取，请重试' },
  onFinish: () => { loading.value = false },
})
function load() { if (owner.value && !props.disabled) return reader.run() }
watch(owner, () => { reader.cancel(); info.value = null; error.value = ''; copy.reset(); load() }, { flush: 'sync' })
watch(() => props.disabled, () => copy.reset())
function visibility() { if (document.hidden) copy.reset() }
onMounted(() => { document.addEventListener('visibilitychange', visibility); load() })
onBeforeUnmount(() => { reader.dispose(); copy.dispose(); document.removeEventListener('visibilitychange', visibility) })
</script>
<template>
  <section id="invoice-info" class="school-invoice" tabindex="-1" aria-labelledby="invoice-title">
    <header><h2 id="invoice-title">学校开票</h2><button v-if="info" type="button" :disabled="disabled || state.busy" @click="copy.copy"><el-icon><CopyDocument /></el-icon>{{ state.busy ? '复制中…' : '复制信息' }}</button></header>
    <p v-if="loading" role="status">正在读取…</p>
    <p v-else-if="unavailable">本校开票信息暂未收录</p>
    <p v-else-if="error" class="school-invoice-error" role="alert">{{ error }}<button type="button" :disabled="disabled" @click="load">重试</button></p>
    <template v-else-if="info"><dl><div><dt>抬头</dt><dd>{{ info.unitName }}</dd></div><div><dt>税号</dt><dd class="school-invoice-tax">{{ info.taxId }}</dd></div></dl><a :href="info.sourceUrl" target="_blank" rel="noopener noreferrer">财务处官网<el-icon><TopRight /></el-icon></a><small>{{ info.checkedOn }} 核对</small></template>
    <p class="school-invoice-notice" role="status">{{ state.notice }}</p>
    <div v-if="state.manualText" class="school-invoice-manual"><textarea ref="manual" :value="state.manualText" readonly rows="3" aria-label="开票信息，可全选复制" @focus="$event.target.select()" /><button type="button" @click="manual?.focus(); manual?.select()">全选</button></div>
  </section>
</template>
<style scoped>
.school-invoice{padding:28px 0;color:var(--assistant-ink,#29323c);scroll-margin-top:24px;border-bottom:1px solid var(--assistant-line,#e2e7ec)}.school-invoice header{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}.school-invoice h2{margin:0;font-size:22px;font-weight:600;letter-spacing:-.02em}.school-invoice button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:10px 14px;border:0;border-radius:12px;font:inherit;font-size:15px;background:var(--assistant-soft,#eaf2ff);color:var(--assistant-accent-hover,#084db0);cursor:pointer}.school-invoice button:hover:not(:disabled){background:#dceaff}.school-invoice button:disabled{opacity:.5;cursor:default}.school-invoice :is(button,a,textarea):focus-visible{outline:2px solid var(--assistant-accent,#0b62db);outline-offset:3px}.school-invoice dl{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:24px 0 12px}.school-invoice dt{font-size:14px;color:var(--assistant-muted,#5d6876);margin-bottom:8px}.school-invoice dd{margin:0;font-size:17px;font-weight:500;line-height:1.65;overflow-wrap:anywhere}.school-invoice-tax{font-variant-numeric:tabular-nums;letter-spacing:.025em}.school-invoice a{display:inline-flex;align-items:center;gap:4px;min-height:44px;color:var(--assistant-accent-hover,#084db0);font-size:14px;text-decoration:none}.school-invoice a:hover{text-decoration:underline;text-underline-offset:4px}.school-invoice small{margin-left:16px;color:var(--assistant-muted,#5d6876);font-size:13px}.school-invoice-notice{min-height:22px;margin:0;font-size:14px;color:var(--assistant-muted,#5d6876)}.school-invoice-manual{display:grid;gap:8px}.school-invoice textarea{box-sizing:border-box;width:100%;font:inherit;font-size:16px;padding:12px;border:1px solid #d6dde5;border-radius:12px;background:#f7f9fc;color:#29323c}.school-invoice-error{font-size:15px;color:var(--assistant-danger,#bf303d)}.school-invoice ::selection{background:var(--assistant-soft,#eaf2ff)}
@media(max-width:600px){.school-invoice dl{grid-template-columns:1fr;gap:18px}.school-invoice h2{font-size:20px}.school-invoice small{display:block;margin:0}}
</style>
