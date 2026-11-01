<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElDialog } from 'element-plus'
import { useCourseScheduleStore } from '@/stores/courseSchedule'
import { saveCourseSchedule } from '@/api/courseSchedule'
const props=defineProps({owner:String,disabled:Boolean}),emit=defineEmits(['saved'])
const store=useCourseScheduleStore(),visible=ref(false),busy=ref(false),error=ref(''),snapshot=ref(null),names=ref([])
let generation=0,disposed=false,controller
const dirty=computed(()=>Boolean(visible.value&&snapshot.value&&snapshot.value.courses.some((course,i)=>(course.teacher||'')!==names.value[i])))
async function open(){
  if(props.disabled||busy.value||!props.owner)return
  const owner=props.owner,run=++generation;error.value='';snapshot.value=null;names.value=[];busy.value=true
  try{await store.load(true);if(disposed||owner!==props.owner||run!==generation)return;if(store.error||!store.schedule)throw new Error(store.error||'请先导入课表');snapshot.value={...store.schedule,courses:store.schedule.courses.map(course=>({...course,weeks:[...course.weeks]}))};names.value=snapshot.value.courses.map(course=>course.teacher||'');visible.value=true}
  catch(failure){if(owner===props.owner&&run===generation){error.value=failure.message;visible.value=true}}
  finally{if(run===generation)busy.value=false}
}
async function save(){
  if(!snapshot.value||props.disabled||busy.value||!dirty.value)return
  const owner=props.owner,principal=store.principal,run=generation;busy.value=true;error.value='';const c=new AbortController();controller=c
  try{
    if(names.value.some(value=>value.trim().length>100||[...value].some(char=>char.codePointAt(0)<32||char.codePointAt(0)===127)))throw new Error('教师姓名限100字')
    const source=snapshot.value,{data}=await saveCourseSchedule({revision:source.revision,semester:source.semester,firstMonday:source.firstMonday,remindDays:source.remindDays,courses:source.courses.map((course,index)=>({...course,teacher:names.value[index].trim()}))},c.signal)
    if(disposed||owner!==props.owner||run!==generation)return
    if(!store.adopt(data.schedule,principal))throw new Error('请刷新课表')
    visible.value=false;snapshot.value=null;names.value=[];emit('saved')
  }catch(failure){if(owner===props.owner&&run===generation)error.value=failure.response?.status===409?'课表已更新，请重新打开':failure.response?.data?.message||failure.message||'保存未确认，请刷新'}
  finally{if(run===generation){busy.value=false;controller=null}}
}
watch(()=>props.owner,()=>{generation++;controller?.abort();visible.value=false;busy.value=false;snapshot.value=null;names.value=[];error.value=''}, {flush:'sync'})
onBeforeUnmount(()=>{disposed=true;generation++;controller?.abort();names.value=[];snapshot.value=null})
defineExpose({open,dirty,busy})
</script>
<template>
  <ElDialog v-model="visible" title="关联教师" width="min(540px, calc(100vw - 24px))" append-to-body :close-on-click-modal="!busy" :close-on-press-escape="!busy" :show-close="!busy" destroy-on-close>
    <form class="teacher-link-form" @submit.prevent="save">
      <label v-for="(course,index) in snapshot?.courses||[]" :key="index"><span>{{course.name}}</span><input v-model="names[index]" :disabled="busy||disabled" maxlength="100" :aria-label="`${course.name}的教师姓名`" placeholder="教师姓名"/></label>
      <p v-if="error" role="alert">{{error}}</p>
      <button type="submit" :disabled="busy||disabled||!dirty">{{busy?'保存中…':'保存'}}</button>
    </form>
  </ElDialog>
</template>
<style scoped>
.teacher-link-form{display:grid;gap:14px}.teacher-link-form label{display:grid;grid-template-columns:minmax(0,1fr) minmax(110px,.7fr);align-items:center;gap:16px}.teacher-link-form label>span{font-size:14px;line-height:1.5;overflow-wrap:anywhere}.teacher-link-form input{box-sizing:border-box;min-width:0;min-height:44px;padding:9px 12px;font:inherit;font-size:16px;color:var(--assistant-ink,#29323c);border:1px solid var(--assistant-line,#dce3ea);background:var(--assistant-surface,#fff);border-radius:10px}.teacher-link-form button{justify-self:end;min-height:44px;padding:10px 20px;font:inherit;border:0;border-radius:10px;background:var(--assistant-accent,#087f7b);color:#fff;cursor:pointer}.teacher-link-form button:disabled{opacity:.5;cursor:default}.teacher-link-form p{font-size:13px;color:var(--assistant-danger,#a43e42);margin:0}.teacher-link-form :is(input,button):focus-visible{outline:2px solid var(--assistant-accent);outline-offset:2px}
</style>
