<script setup>
import {onBeforeUnmount,onMounted,ref,watch} from 'vue'
import {readCourseImageCapability,importCourseImages} from '@/api/courseSchedule'
import {courseImageFilesIssue,courseImageImportFeedback} from '@/utils/courseImageRecognition'
import {takeCourseFiles} from '@/utils/courseFile'
import NavigationIcon from './NavigationIcon.vue'
const props=defineProps({scope:String,revision:{type:Number,default:0},disabled:Boolean}),emit=defineEmits(['busy','pending','imported','refresh'])
const capability=ref(null),loading=ref(false),files=ref([]),busy=ref(false),uncertain=ref(false),error=ref(''),notice=ref('')
let generation=0,disposed=false,controller=null,capController=null
watch(busy,value=>emit('busy',value),{flush:'sync'})
async function loadCapability(){
  capController?.abort();const c=new AbortController();capController=c;const owner=props.scope;loading.value=true
  try{
    const {data}=await readCourseImageCapability(c.signal)
    if(disposed||c.signal.aborted||owner!==props.scope)return
    if(data?.version!==2||data.provider!=='local-ocr'||data.external!==false||data.automaticImport!==true||data.batchImport!==true||data.maxImages!==20||data.maxBytes!==2097152)throw new Error()
    capability.value=data;error.value=''
  }catch{
    if(!disposed&&!c.signal.aborted&&owner===props.scope){capability.value=null;error.value='截图导入暂不可用'}
  }finally{if(capController===c){loading.value=false;capController=null}}
}
function reset(){generation++;controller?.abort();controller=null;busy.value=false;uncertain.value=false;files.value=[];error.value='';notice.value='';emit('pending',false)}
async function choose(event){
  const selected=takeCourseFiles(event.target)
  if(!selected.length||props.disabled||busy.value||uncertain.value)return
  const issue=courseImageFilesIssue(selected)
  if(issue){error.value=issue;return}
  reset();files.value=selected;await recognize()
}
function cancel(){generation++;controller?.abort();controller=null;busy.value=false;uncertain.value=true;notice.value='已停止等待，请刷新查看结果'}
async function recognize(){
  if(props.disabled||busy.value||uncertain.value||!files.value.length||!capability.value?.available||!props.scope)return
  const run=++generation,owner=props.scope,revision=props.revision,c=new AbortController()
  controller=c;busy.value=true;error.value='';notice.value=`正在导入${files.value.length}张…`
  try{
    const {data}=await importCourseImages(files.value,revision,c.signal)
    if(disposed||run!==generation||owner!==props.scope||c.signal.aborted)return
    if(!data?.schedule||!Number.isInteger(data.importedRows)||data.importedRows<1||data.importedRows>2400||!Array.isArray(data.weeks)||!data.weeks.length||data.weeks.length>20||data.week!==Math.min(...data.weeks)||data.weeks.some(w=>!Number.isInteger(w)||w<1||w>30)||new Set(data.weeks).size!==data.weeks.length||!Array.isArray(data.schedule.courses)||!data.schedule.courses.some(course=>course.weeks?.includes(data.week)))throw new Error('导入结果未确认，请刷新')
    emit('imported',{...data,owner});notice.value=courseImageImportFeedback(data).message
  }catch(failure){
    if(!disposed&&run===generation&&owner===props.scope&&!c.signal.aborted){
      const status=failure.response?.status
      uncertain.value=!status||status===409||status>=500
      error.value=failure.response?.data?.message||failure.response?.data?.detail||failure.message||'导入结果未确认'
      notice.value=''
    }
  }finally{if(run===generation){busy.value=false;controller=null}}
}
watch(()=>props.scope,()=>{reset();capController?.abort();if(props.scope)void loadCapability()},{flush:'sync'})
onMounted(loadCapability);onBeforeUnmount(()=>{disposed=true;reset();capController?.abort()})
</script>
<template>
  <section class="course-image-import" aria-label="批量截图导入" :aria-busy="busy||loading">
    <div class="image-actions">
      <label class="image-picker work-button primary" :class="{'image-picker-disabled':disabled||busy||uncertain||!capability?.available}">
        <NavigationIcon name="timetable"/><span>批量导入</span>
        <input type="file" multiple accept="image/png,image/jpeg,.png,.jpg,.jpeg" aria-label="选择课表截图，可多选" :disabled="disabled||busy||uncertain||!capability?.available" @change="choose"/>
      </label>
      <button v-if="busy" class="work-button" type="button" @click="cancel">停止等待</button>
      <button v-if="!capability&&!loading" class="work-button" type="button" @click="loadCapability">重试</button>
      <button v-if="uncertain||error" class="work-button" type="button" :disabled="disabled||busy" @click="emit('refresh')">刷新课表</button>
    </div>
    <p v-if="loading||notice" class="image-status" role="status">{{loading?'正在准备…':notice}}</p>
    <p v-if="capability&&!capability.available" class="image-status" role="status">截图导入暂不可用</p>
    <p v-if="error" class="image-error" role="alert">{{error}}</p>
  </section>
</template>
<style scoped>
.course-image-import{margin:12px 0 16px}
.image-actions{display:flex;align-items:center;flex-wrap:wrap;gap:10px}
.image-picker{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;cursor:pointer;overflow:hidden;box-sizing:border-box}
.image-picker input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
.image-picker svg{width:20px;height:20px;flex:none}
.image-picker-disabled{opacity:.55;cursor:default}
.image-picker-disabled input{cursor:default}
.image-picker:focus-within{outline:2px solid var(--assistant-accent,#0b62db);outline-offset:3px}
.image-status,.image-error{margin:10px 0 0;font-size:14px;line-height:1.6;overflow-wrap:anywhere}
.image-status{color:var(--assistant-muted,#5d6876)}
.image-error{color:var(--assistant-danger,#bf303d)}
</style>
