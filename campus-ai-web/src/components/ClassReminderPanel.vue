<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { useClassReminderStore } from '@/stores/classReminders'
import { CLASS_REMINDER_MINUTES } from '@/utils/classReminders'
import { readCalendarLink, enableCalendarLink } from '@/api/calendarImport'
const props=defineProps({disabled:Boolean,owner:{type:String,default:''}})
const reminders=useClassReminderStore(),state=reminders.state,busy=ref(false),error=ref('')
let generation=0,controller,disposed=false
async function changeMinutes(value){
  const minutes=Number(value),owner=props.owner
  if(!owner||props.disabled||busy.value)return
  const run=++generation
  busy.value=true;error.value='';controller?.abort();const c=new AbortController();controller=c
  try{
    await reminders.configure(state.enabled,minutes)
    if(disposed||run!==generation||owner!==props.owner)return
    const {data}=await readCalendarLink(c.signal)
    if(disposed||run!==generation||owner!==props.owner)return
    if(data.active&&data.minutes!==minutes)await enableCalendarLink(minutes,c.signal)
  }catch{if(!disposed&&run===generation&&owner===props.owner)error.value='日历提醒未更新，请重试'}
  finally{if(run===generation){busy.value=false;controller=null}}
}
watch(()=>props.owner,()=>{generation++;controller?.abort();controller=null;busy.value=false;error.value=''}, {flush:'sync'})
onBeforeUnmount(()=>{disposed=true;generation++;controller?.abort()})
</script>
<template>
  <section id="class-reminder-preferences" tabindex="-1" class="account-reminder-preferences" aria-labelledby="class-reminder-title">
    <div class="reminder-preference-row"><h2 id="class-reminder-title">上课提醒</h2><label>提前<select :value="state.minutes" aria-label="上课提醒提前时间" :disabled="disabled||busy" @change="changeMinutes($event.target.value)"><option v-for="minutes in CLASS_REMINDER_MINUTES" :key="minutes" :value="minutes">{{minutes}}分钟</option></select></label></div>
    <label class="reminder-page-toggle"><span>网页内提醒</span><input type="checkbox" :checked="state.enabled" :disabled="disabled||busy" @change="reminders.configure($event.target.checked,state.minutes)"/></label>
    <p v-if="error" role="alert">{{error}} <button type="button" :disabled="disabled||busy" @click="changeMinutes(state.minutes)">重试</button></p>
    <p v-if="state.storageUnavailable" role="status">设置仅在本页生效</p>
  </section>
</template>
<style scoped>
.account-reminder-preferences{padding:20px 0;margin:18px 0;border-block:1px solid var(--assistant-line,#e2e7ec)}.reminder-preference-row{display:flex;align-items:center;justify-content:space-between;gap:16px}.reminder-preference-row h2{font-size:17px;font-weight:500;margin:0}.reminder-preference-row label{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--assistant-muted,#5d6876)}.reminder-preference-row select{min-height:44px;min-width:100px;padding:8px 12px;font:inherit;font-size:16px;border:1px solid var(--assistant-line,#e2e7ec);border-radius:10px;background:var(--assistant-surface,#fff);color:var(--assistant-ink,#29323c)}.reminder-page-toggle{display:flex;align-items:center;justify-content:space-between;min-height:44px;margin-top:8px;font-size:14px}.reminder-page-toggle input{width:20px;height:20px;accent-color:var(--assistant-accent,#0b62db)}.account-reminder-preferences :is(input,select,button):focus-visible{outline:2px solid var(--assistant-accent,#0b62db);outline-offset:3px}.account-reminder-preferences p{font-size:12px;color:var(--assistant-danger,#a43e42);margin:8px 0 0}.account-reminder-preferences button{min-height:44px;border:0;background:transparent;color:var(--assistant-accent);font:inherit;cursor:pointer}
</style>
