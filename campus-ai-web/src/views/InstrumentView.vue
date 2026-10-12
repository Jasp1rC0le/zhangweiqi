<script setup>
import {onBeforeUnmount,onMounted,ref} from 'vue'
import {onBeforeRouteLeave,useRouter} from 'vue-router'
import InstrumentLibrary from '@/components/InstrumentLibrary.vue'
import {emptyProject} from '@/utils/projectStudio'
import {createProject} from '@/api/projects'
const router=useRouter(),library=ref(),busy=ref(false),error=ref(''),requestId=ref(crypto.randomUUID()),saved=ref(false)
onBeforeRouteLeave(()=>saved.value||(!busy.value&&(!library.value?.hasPending||window.confirm('仪器记录尚未保存，离开将清除本页草稿。继续？'))))
function unload(e){if(!saved.value&&(busy.value||library.value?.hasPending)){e.preventDefault();e.returnValue=''}}
onMounted(()=>window.addEventListener('beforeunload',unload));onBeforeUnmount(()=>window.removeEventListener('beforeunload',unload))
async function save(note){if(busy.value)return;busy.value=true;error.value='';try{const content={...emptyProject(),track:'engineering',title:note.title,manuscript:note.text};const p=await createProject(requestId.value,content);requestId.value=crypto.randomUUID();saved.value=true;await router.push(`/projects/${p.id}`)}catch(e){error.value=e.response?.data?.message||e.response?.data?.detail||'保存失败，记录仍留在本页，请重试'}finally{busy.value=false}}
</script>
<template><div class="work-page"><InstrumentLibrary ref="library" :saving="busy" :save-error="error" @append="save" /></div></template>
