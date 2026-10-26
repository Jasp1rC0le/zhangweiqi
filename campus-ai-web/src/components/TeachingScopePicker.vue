<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { readTeachingConfigPage } from '@/api/teaching'
import { createConfigPager } from '@/utils/teachingConfigPage'
const props = defineProps({ modelValue: { type: String, default: '' }, owner: { type: String, required: true }, label: { type: String, required: true }, kind: { type: String, default: 'CLASS' }, disabled: Boolean, optional:Boolean,readPage:{type:Function,default:readTeachingConfigPage},refresh: { type: Number, default: 0 } })
const emit = defineEmits(['update:modelValue','selected'])
const noun = computed(() => props.kind === 'TEACHER' ? '教师账号' : props.kind === 'COURSE' ? '课程' : props.kind === 'COLLEGE' ? '学院' : '班级')
const search = ref(''), appliedSearch = ref(''), selected = ref(null)
let lastQuery = null, pendingLoad = true
const state = reactive({ items: [], selected: null, page: 0, total: 0, totalPages: 0, loading: false, error: '' })
const resource = createConfigPager({ owner: () => `${props.owner}:${props.kind}`, read: (...args)=>props.readPage(...args), state })
const options = computed(() => selected.value && !state.items.some(row => row.value === selected.value.value) ? [selected.value, ...state.items] : state.items)
async function load(page = 0, applySearch = false) {
  if (!props.owner) return
  if (props.disabled) { pendingLoad = true; return }
  pendingLoad = false
  const query = { kind: props.kind, page, size: 25, search: applySearch ? search.value.trim() : appliedSearch.value, selected: props.modelValue }
  lastQuery = query
  if (await resource.load(query)) {
    appliedSearch.value = query.search
    selected.value = state.selected
    emit('selected',selected.value)
  }
}
async function retry() {
  if (!props.owner || props.disabled || !lastQuery) return
  if (await resource.load({ ...lastQuery, selected: props.modelValue })) { appliedSearch.value = lastQuery.search; selected.value = state.selected;emit('selected',selected.value) }
}
function choose(event) {
  selected.value = options.value.find(row => row.value === event.target.value) || null
  emit('update:modelValue', event.target.value)
  emit('selected',selected.value)
}
watch(() => props.modelValue, value => { if (!value) selected.value = null;else if(selected.value?.value!==value){const row=state.items.find(r=>r.value===value);if(row){selected.value=row;emit('selected',row)}else load(0)} })
watch(() => `${props.owner}:${props.kind}`, () => { resource.reset(); lastQuery = null; pendingLoad = true; search.value = ''; appliedSearch.value = ''; selected.value = null; load() }, { flush: 'sync' })
watch(() => props.refresh, () => load(0))
watch(() => props.disabled, disabled => { if (!disabled && pendingLoad) load(0) })
onMounted(load)
onBeforeUnmount(resource.reset)
</script>
<template>
  <div class="scope-picker">
    <label>{{ label }}
      <select :value="modelValue" :aria-label="label" :required="!optional" :disabled="disabled || state.loading" @change="choose">
        <option value="">{{ optional?'全部授权班级':`选择${noun}` }}</option>
        <option v-if="modelValue && !options.some(row => row.value === modelValue)" :value="modelValue" disabled>已选目标不可用，请重新选择</option>
        <option v-for="row in options" :key="row.value" :value="row.value">{{ row.description ? `${row.description} · ` : '' }}{{ row.label }}</option>
      </select>
    </label>
    <div class="scope-search"><input v-model="search" :aria-label="`查找${label}`" :placeholder="kind === 'TEACHER' ? '搜索教师姓名或登录账号' : kind === 'COURSE' ? '搜索课程或学期' : kind === 'COLLEGE' ? '搜索学院' : '搜索班级或学院'" maxlength="100" :disabled="disabled || state.loading" @keydown.enter.prevent="load(0, true)" /><button type="button" :disabled="disabled || state.loading" @click="load(0, true)">查找</button></div>
    <p v-if="state.error" role="alert">{{ state.error }} <button type="button" :disabled="disabled || state.loading" @click="retry">重试</button></p>
    <div v-else class="scope-pages"><span role="status">{{ state.loading ? '读取中' : `共${state.total}项` }}</span><button type="button" :disabled="disabled || state.loading || state.page === 0" @click="load(state.page - 1)">上一页</button><span>{{ state.totalPages ? state.page + 1 : 0 }}/{{ state.totalPages }}</span><button type="button" :disabled="disabled || state.loading || state.page + 1 >= state.totalPages" @click="load(state.page + 1)">下一页</button></div>
  </div>
</template>
<style scoped>
.scope-picker{min-width:0;display:grid;gap:8px;color:var(--assistant-ink,#29323c)}label{display:grid;gap:6px;font-size:14px}.scope-search,.scope-pages{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.scope-search input{flex:1;min-width:80px}input,select,button{font:inherit;font-size:16px;min-height:44px;min-width:0;padding:9px 12px;color:inherit;background:var(--assistant-surface,#fff);border:1px solid var(--assistant-line,#e2e7ec);border-radius:12px}select{width:100%}button{cursor:pointer}.scope-pages{font-size:14px;font-variant-numeric:tabular-nums}.scope-pages button{font-size:14px}.scope-picker p{font-size:14px;line-height:1.7;margin:0;color:var(--assistant-danger,#a43e42)}:disabled{opacity:.6;cursor:not-allowed}:focus-visible{outline:2px solid var(--assistant-accent,#2b63cf);outline-offset:3px}
</style>
