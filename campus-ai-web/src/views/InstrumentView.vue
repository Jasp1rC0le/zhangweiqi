<script setup>
import {computed,onBeforeUnmount,onMounted,ref,watch} from 'vue'
import {onBeforeRouteLeave,useRouter} from 'vue-router'
import InstrumentLibrary from '@/components/InstrumentLibrary.vue'
import {emptyProject} from '@/utils/projectStudio'
import {createProject} from '@/api/projects'
import {useAuthStore} from '@/stores/auth'
import {userSessionGeneration} from '@/api/http'
import {createAccountLifecycle} from '@/utils/accountLifecycle'
const router=useRouter(),auth=useAuthStore(),library=ref(),busy=ref(false),error=ref(''),errorInstrument=ref(''),savedProject=ref(null),status=ref('')
const owner=computed(()=>auth.user?.id?`${auth.user.id}:${auth.user.schoolId}:${userSessionGeneration.value}`:null),lifecycle=createAccountLifecycle(()=>owner.value)
watch(owner,()=>{lifecycle.reset();busy.value=false;error.value='';status.value='';savedProject.value=null},{flush:'sync'})
onBeforeRouteLeave(()=>!busy.value&&(!library.value?.hasPending||window.confirm('还有仪器记录尚未保存，离开将清除本页这些草稿。继续？')))
function unload(e){if(busy.value||library.value?.hasPending){e.preventDefault();e.returnValue=''}}
onMounted(()=>window.addEventListener('beforeunload',unload));onBeforeUnmount(()=>{lifecycle.dispose();window.removeEventListener('beforeunload',unload)})
async function save(note){
  if(busy.value||!owner.value)return
  const ticket=lifecycle.capture();busy.value=true;error.value='';errorInstrument.value=note.instrumentId;status.value='';let acknowledged=false
  try{
    const content={...emptyProject(),track:'engineering',title:note.title,manuscript:note.text}
    const p=await createProject(note.requestId,content,{signal:ticket.signal})
    if(!ticket.current())return
    if(p?.id!==note.requestId||!Number.isInteger(p.revision)||p.revision<1||p.content?.manuscript!==content.manuscript)throw new Error('项目保存响应未通过核对，记录仍保留，可重试确认')
    acknowledged=true;library.value.markAccepted(note);savedProject.value={id:p.id,title:note.title};busy.value=false
    status.value=library.value.hasPending?`已保存“${note.title}”，其余 ${library.value.pendingCount} 份记录仍在本页`:`已保存“${note.title}”`
    if(!library.value.hasPending)await router.push(`/projects/${p.id}`)
  }catch(e){if(ticket.current())error.value=acknowledged?'记录已保存，但未能打开项目；可使用上方入口，不必重复保存':e.response?.data?.message||e.response?.data?.detail||e.message||'未能确认保存，记录仍留在本页，请重试'}
  finally{if(ticket.current())busy.value=false}
}
</script>
<template><div class="work-page"><p v-if="status" class="instrument-save-status" role="status">{{status}} <RouterLink v-if="savedProject" :to="`/projects/${savedProject.id}`">打开已保存项目</RouterLink></p><InstrumentLibrary :key="owner" ref="library" :saving="busy" :save-error="error" :save-error-instrument="errorInstrument" @append="save" /></div></template>
<style scoped>
.instrument-save-status{margin:0 0 20px;font-size:14px;line-height:1.7;color:var(--assistant-ink,#29323c)}
.instrument-save-status a{color:var(--assistant-accent,#0b62db);text-underline-offset:4px}
</style>
