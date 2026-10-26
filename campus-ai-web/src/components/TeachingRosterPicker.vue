<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import TeachingScopePicker from './TeachingScopePicker.vue'
import { readTeachingMembers } from '@/api/teaching'
import { validatedRosterMembers } from '@/utils/teachingEnrollment'
const props=defineProps({modelValue:{type:Array,default:()=>[]},owner:{type:String,required:true},disabled:Boolean,refresh:{type:Number,default:0}})
const emit=defineEmits(['update:modelValue'])
const classId=ref(''),loadedClass=ref(''),rows=ref([]),search=ref(''),page=ref(0),loading=ref(false),error=ref('')
const selectedPage=ref(0)
const filtered=computed(()=>rows.value.filter(m=>m.name.includes(search.value.trim()) || m.studentNumber.includes(search.value.trim())))
const visible=computed(()=>filtered.value.slice(page.value*25,(page.value+1)*25))
let epoch=0,controller
async function load() {
  if(!props.owner || !classId.value || loading.value || props.disabled)return
  controller?.abort();controller=new AbortController();const signal=controller.signal,generation=++epoch,owner=props.owner,target=classId.value
  const current=()=>owner===props.owner && target===classId.value && generation===epoch && !signal.aborted
  loading.value=true;error.value='';rows.value=[];loadedClass.value=''
  try{const {data}=await readTeachingMembers(target,signal);if(current()){rows.value=validatedRosterMembers(data);loadedClass.value=target;page.value=0;search.value=''}}catch(e){if(current())error.value=e.response?.data?.message || e.message || '读取失败，已选成员没有改变'}finally{if(owner===props.owner && generation===epoch)loading.value=false}
}
function toggle(member,checked) {
  if(props.disabled || loading.value)return
  if(checked && !props.modelValue.some(m=>m.id===member.id)) {if(props.modelValue.length>=2000){error.value='单门课程最多2000人，点名按页保存';return}emit('update:modelValue',[...props.modelValue,member])}
  else if(!checked)emit('update:modelValue',props.modelValue.filter(m=>m.id!==member.id))
}
watch(search,()=>page.value=0)
watch(()=>props.modelValue.length,n=>{selectedPage.value=Math.min(selectedPage.value,Math.max(0,Math.ceil(n/25)-1))})
watch(()=>props.owner,()=>{epoch++;controller?.abort();classId.value='';loadedClass.value='';rows.value=[];loading.value=false;search.value='';page.value=0;error.value=''}, {flush:'sync'})
onBeforeUnmount(()=>{epoch++;controller?.abort();rows.value=[]})
</script>
<template>
  <section class="roster-picker" aria-label="选择课程成员">
    <p>先选行政班、读取名单，再逐人勾选；可以切换行政班继续选人。不会改变学生行政归属。</p>
    <TeachingScopePicker v-model="classId" :owner="owner" label="查找成员所在行政班" :disabled="disabled || loading" :refresh="refresh" />
    <button type="button" :disabled="disabled || loading || !classId" @click="load">{{ loading?'读取中':'读取本班名单' }}</button>
    <p v-if="error" class="roster-error" role="alert">{{ error }}</p>
    <template v-if="loadedClass===classId && rows.length">
      <input v-model="search" aria-label="查找本班学生" placeholder="查找姓名或学号" :disabled="disabled || loading" maxlength="100" />
      <ul class="member-options"><li v-for="m in visible" :key="m.id"><label><input type="checkbox" :checked="modelValue.some(selected=>selected.id===m.id)" :disabled="disabled || loading || (modelValue.length>=2000 && !modelValue.some(selected=>selected.id===m.id))" @change="toggle(m,$event.target.checked)" /><span>{{ m.name }}<small>{{ m.studentNumber }}</small></span></label></li></ul>
      <div class="member-pages"><button type="button" :disabled="disabled || page===0" @click="page--">上一页</button><span>{{ filtered.length? page+1:0 }}/{{ Math.ceil(filtered.length/25) }} · {{ filtered.length }}人</span><button type="button" :disabled="disabled || (page+1)*25>=filtered.length" @click="page++">下一页</button></div>
    </template>
    <p role="status">已选 {{ modelValue.length }}/2000 人 · 以这份勾选名单创建课程</p>
    <ul v-if="modelValue.length" class="selected-members"><li v-for="m in modelValue.slice(selectedPage*25,(selectedPage+1)*25)" :key="m.id"><span>{{ m.name }}<small>{{ m.studentNumber }}</small></span><button type="button" :aria-label="`移除已选${m.name}`" :disabled="disabled || loading" @click="toggle(m,false)">移除</button></li></ul>
    <div v-if="modelValue.length>25" class="member-pages"><button type="button" :disabled="disabled || !selectedPage" @click="selectedPage--">上一页已选</button><span>{{ selectedPage+1 }}/{{ Math.ceil(modelValue.length/25) }}</span><button type="button" :disabled="disabled || (selectedPage+1)*25>=modelValue.length" @click="selectedPage++">下一页已选</button></div>
  </section>
</template>
<style scoped>
.roster-picker{grid-column:1/-1;display:grid;gap:12px;min-width:0;color:var(--assistant-ink,#29323c)}p{font-size:14px;line-height:1.7;margin:0;color:var(--assistant-muted,#5d6876)}input,button{font:inherit;font-size:16px;min-height:44px;padding:9px 12px;min-width:0;color:inherit;background:var(--assistant-surface,#fff);border:1px solid var(--assistant-line,#e2e7ec);border-radius:12px}button{cursor:pointer;justify-self:start}.member-options,.selected-members{list-style:none;margin:0;padding:0}.member-options label{display:flex;align-items:center;gap:12px;min-height:52px;font-size:16px}.member-options input{width:20px;height:20px;min-height:20px;accent-color:var(--assistant-accent,#2b63cf)}small{display:block;font-size:14px;color:var(--assistant-muted,#5d6876)}.selected-members li{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-block:8px;border-bottom:1px solid var(--assistant-line,#e2e7ec)}.member-pages{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:14px}.roster-error{color:var(--assistant-danger,#a43e42)}:disabled{opacity:.6;cursor:not-allowed}:focus-visible{outline:2px solid var(--assistant-accent,#2b63cf);outline-offset:3px}
</style>
