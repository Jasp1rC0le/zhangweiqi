<script setup>
import {onBeforeUnmount,onMounted,ref,watch} from 'vue'
import {readCourseImageCapability,importCourseImage} from '@/api/courseSchedule'
import {courseImageFileIssue} from '@/utils/courseImageRecognition'
import {takeCourseFile} from '@/utils/courseFile'
import NavigationIcon from './NavigationIcon.vue'
const props=defineProps({scope:String,revision:{type:Number,default:0},disabled:Boolean}),emit=defineEmits(['busy','pending','imported','refresh'])
const capability=ref(null),loading=ref(false),file=ref(null),imageUrl=ref(''),busy=ref(false),error=ref(''),notice=ref('')
let generation=0,disposed=false,controller=null,capController=null
watch(busy,v=>emit('busy',v),{flush:'sync'})
async function loadCapability(){
  capController?.abort();const c=new AbortController();capController=c;const owner=props.scope;loading.value=true
  try{const {data}=await readCourseImageCapability(c.signal);if(disposed||c.signal.aborted||owner!==props.scope)return;if(data?.version!==2||data.provider!=='local-ocr'||data.external!==false||data.automaticImport!==true||data.maxBytes!==2097152)throw new Error();capability.value=data;error.value=''}
  catch{if(!disposed&&!c.signal.aborted&&owner===props.scope){capability.value=null;error.value='本地识别暂不可用，可切换表格导入'}}
  finally{if(capController===c){loading.value=false;capController=null}}
}
function reset(){generation++;controller?.abort();controller=null;busy.value=false;file.value=null;if(imageUrl.value)URL.revokeObjectURL(imageUrl.value);imageUrl.value='';error.value='';notice.value='';emit('pending',false)}
async function choose(event){const selected=takeCourseFile(event.target);if(!selected||props.disabled||busy.value)return;const issue=courseImageFileIssue(selected);if(issue){error.value=issue;return}reset();file.value=selected;imageUrl.value=URL.createObjectURL(selected);await recognize()}
function cancel(){generation++;controller?.abort();controller=null;busy.value=false;notice.value='已停止等待，请重新读取课表确认导入结果'}
async function recognize(){
  if(props.disabled||busy.value||!file.value||!capability.value?.available||!props.scope)return
  const run=++generation,owner=props.scope,revision=props.revision,c=new AbortController();controller=c;busy.value=true;error.value='';notice.value='正在识别并导入…'
  try{const {data}=await importCourseImage(file.value,revision,c.signal);if(disposed||run!==generation||owner!==props.scope||c.signal.aborted)return;if(!data?.schedule||!Number.isInteger(data.importedRows)||data.importedRows<1||data.importedRows>120||!Number.isInteger(data.week)||data.week<1||data.week>30)throw new Error('导入回执不完整，请重新读取课表确认');emit('imported',{...data,owner});notice.value=`已导入${data.importedRows}门课 · 第${data.week}周`}
  catch(e){if(!disposed&&run===generation&&owner===props.scope&&!c.signal.aborted){error.value=e.response?.data?.message||e.response?.data?.detail||e.message||'导入结果尚未确认';notice.value='可重新读取课表查看结果；不会自动重发图片'}}
  finally{if(run===generation){busy.value=false;controller=null}}
}
watch(()=>props.scope,()=>{reset();capController?.abort();if(props.scope)void loadCapability()},{flush:'sync'})
onMounted(loadCapability);onBeforeUnmount(()=>{disposed=true;reset();capController?.abort()})
</script>
<template>
  <section class="course-image-import" aria-label="截图导入">
    <p v-if="loading" role="status">正在准备识别…</p>
    <p v-else-if="capability&&!capability.available" role="status">截图识别暂不可用，可使用表格文件。</p>
    <button v-if="!capability&&!loading" class="work-button" type="button" @click="loadCapability">重新读取识别能力</button>
    <div class="image-method-actions"><label class="image-picker" :class="{'image-picker-compact':file}"><NavigationIcon name="timetable"/><strong>{{file?'换张截图':'上传课表截图'}}</strong><span v-if="!file">自动识别时间并保存 · PNG / JPG · 最大2MB</span><input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" :disabled="disabled||busy||!capability?.available" @change="choose"/></label><button v-if="file&&!busy" class="work-button" type="button" :disabled="disabled" @click="reset">清除</button></div>
    <div v-if="file" class="image-selected"><figure class="image-local-preview"><img :src="imageUrl" alt="本次课表截图，本地预览"/></figure><div><p role="status">{{notice}}</p><button v-if="busy" class="work-button" type="button" @click="cancel">停止等待</button></div></div>
    <p v-if="error" class="image-error" role="alert">{{error}}</p><button v-if="error||notice.includes('停止等待')" class="work-button" type="button" :disabled="disabled||busy" @click="emit('refresh')">重新读取课表</button>
  </section>
</template>
<style scoped>
.course-image-import{margin:12px 0 24px;padding-block:0 8px}
.course-image-import summary{min-height:44px;align-content:center;font-size:14px;cursor:pointer;color:var(--assistant-accent,#0b62db)}
.image-method,.image-destination,.image-notice,.image-local-preview figcaption{color:var(--assistant-muted,#5d6876);font-size:14px;line-height:1.7;overflow-wrap:anywhere}
.image-method-actions{display:flex;flex-wrap:wrap;gap:12px;margin-block:16px}
.image-picker{position:relative;width:100%;min-height:136px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:8px;cursor:pointer;overflow:hidden;border:1px dashed var(--assistant-line,#bccbdd);border-radius:14px;background:var(--assistant-panel,#f2f5fa);padding:20px;color:var(--assistant-accent,#0b62db);box-sizing:border-box}.image-picker:hover{background:var(--assistant-soft,#eaf2ff)}.image-picker strong{font-size:16px;font-weight:500}.image-picker span{font-size:13px;color:var(--assistant-muted,#5d6876)}.image-picker svg{width:28px;height:28px}.image-picker-compact{min-height:80px;flex-direction:row;justify-content:flex-start;flex-wrap:wrap;padding:12px 16px}.image-picker input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}.image-picker:has(input:disabled){opacity:.6;cursor:default}.image-picker:focus-within{outline:2px solid var(--assistant-accent,#0b62db);outline-offset:3px}.image-send-details p{font-size:14px;line-height:1.7;color:var(--assistant-muted,#5d6876);margin:0 0 12px;overflow-wrap:anywhere}
.image-selected{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:24px;align-items:start}.image-local-preview{margin:0}.image-local-preview img{display:block;width:auto;height:auto;max-width:100%;max-height:220px;object-fit:contain;object-position:left;border-radius:8px}.image-local-preview figcaption{margin-top:8px}.image-recognize-controls{min-width:0}.image-recognize-controls>.image-destination{margin-top:0}.image-applied{display:flex;align-items:center;flex-wrap:wrap;gap:10px;min-height:52px;color:var(--assistant-success,#187248);font-size:14px}.image-applied svg{width:20px;height:20px}.image-applied .work-button{margin-left:auto;color:var(--assistant-accent,#0b62db)}
.image-local-preview a{display:inline-flex;align-items:center;min-height:44px;margin-left:12px;color:var(--assistant-accent,#0b62db);text-underline-offset:4px}
.image-consent{display:flex!important;align-items:flex-start;gap:10px;font-size:14px;line-height:1.7;font-weight:400!important;margin-block:16px;min-height:44px;padding-block:8px}.image-consent input{width:18px!important;height:18px!important;flex:none;margin:3px 0 0!important}
.image-error{font-size:14px;line-height:1.7;color:var(--assistant-danger,#bf303d);overflow-wrap:anywhere}
.image-review h3{font-size:18px;font-weight:500;margin:28px 0 12px}.image-rows{list-style:none;padding:0;margin:20px 0}.image-rows li{border-top:1px solid var(--assistant-line,#e2e7ec);padding:16px 0}.image-row-fields{border:0;padding:0;margin:0;min-width:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.image-row-fields label{display:grid;gap:7px;font-size:14px;min-width:0}.image-row-fields input,.image-row-fields select{min-width:0;width:100%;padding:10px;min-height:44px;font:inherit;font-size:16px;color:var(--assistant-ink,#29323c);border:1px solid var(--assistant-line,#e2e7ec);border-radius:10px;background:white}.image-row-fields :focus-visible{outline:2px solid var(--assistant-accent,#0b62db);outline-offset:2px}.image-row-excluded fieldset{opacity:.6}
.image-row-brief{margin:0;color:var(--assistant-muted,#5d6876);font-size:14px;line-height:1.7}.image-rows>li>.image-consent{margin:0;padding-block:4px}.image-rows>li>.image-error{margin:4px 0}.image-rows details{margin-top:6px}
@media(max-width:600px){.image-row-fields{grid-template-columns:repeat(2,minmax(0,1fr))}.image-row-fields label:first-child,.image-row-fields label:nth-last-child(2),.image-row-fields label:last-child{grid-column:1/-1}.image-method-actions .work-button{min-height:44px}}
@media(max-width:700px){.image-selected{grid-template-columns:1fr;gap:16px}.image-local-preview img{max-height:180px}.image-picker-compact{width:auto;min-height:44px;padding:10px 14px}.image-picker-compact svg{width:20px;height:20px}}
</style>
