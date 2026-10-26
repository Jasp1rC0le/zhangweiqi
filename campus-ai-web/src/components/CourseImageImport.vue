<script setup>
import {computed,onBeforeUnmount,onMounted,ref,watch} from 'vue'
import {readCourseImageCapability,recognizeCourseImage} from '@/api/courseSchedule'
import {courseImageFileIssue,prepareCourseImageResult,reviewCourseImageRows,courseImageAdoptionWarnings} from '@/utils/courseImageRecognition'
import {takeCourseFile} from '@/utils/courseFile'
const props=defineProps({scope:String,disabled:Boolean}),emit=defineEmits(['busy','pending','adopt'])
const imageDetails=ref()
const capability=ref(null),loading=ref(false),file=ref(null),imageUrl=ref(''),consent=ref(false),busy=ref(false),error=ref(''),notice=ref(''),candidate=ref(null),reviewed=ref(false),applied=ref('')
let generation=0,disposed=false,controller=null,capController=null
const signature=computed(()=>candidate.value?JSON.stringify(candidate.value):''),pending=computed(()=>!!file.value&&(!applied.value||signature.value!==applied.value))
watch(busy,v=>emit('busy',v),{flush:'sync'});watch(pending,v=>emit('pending',v),{flush:'sync'});watch(signature,()=>{reviewed.value=false},{flush:'sync'})
const rowIssue=computed(()=>{if(!candidate.value)return'';try{reviewCourseImageRows(candidate.value.rows);return''}catch(e){return e.message}})
async function loadCapability(){
  capController?.abort();const c=new AbortController();capController=c;const owner=props.scope;loading.value=true
  try{const {data}=await readCourseImageCapability(c.signal);if(disposed||c.signal.aborted||owner!==props.scope)return;if(data?.version!==1||data.provider!=='kimi'||typeof data.model!=='string'||data.model.length>100||typeof data.destination!=='string'||data.destination.length>253||data.maxBytes!==2097152)throw new Error('图片识别能力响应异常');capability.value=data;error.value=''}
  catch(e){if(!disposed&&!c.signal.aborted&&owner===props.scope){capability.value=null;error.value=e.response?.status===404?'本机后端尚未加载图片识别功能，请更新后重试':'图片识别能力暂不可用，可继续使用本机表格导入'}}
  finally{if(capController===c){loading.value=false;capController=null}}
}
function reset(){generation++;controller?.abort();controller=null;busy.value=false;file.value=null;if(imageUrl.value)URL.revokeObjectURL(imageUrl.value);imageUrl.value='';consent.value=false;candidate.value=null;applied.value='';reviewed.value=false;error.value='';notice.value=''}
function choose(event){const selected=takeCourseFile(event.target);if(!selected||props.disabled||busy.value)return;const issue=courseImageFileIssue(selected);if(issue){error.value=issue;return}reset();file.value=selected;imageUrl.value=URL.createObjectURL(selected);notice.value='仅在本机预览，尚未发送给模型'}
function cancel(){generation++;controller?.abort();controller=null;busy.value=false;notice.value='已停止接收；提供商可能仍在处理并计入额度，请稍后再决定是否重试'}
async function recognize(){
  if(props.disabled||busy.value||!file.value||!consent.value||!capability.value?.available||!props.scope)return
  const run=++generation,owner=props.scope,c=new AbortController();controller=c;busy.value=true;error.value='';notice.value='正在向所示Kimi服务估算用量并识别图片，尚未保存课表'
  try{const {data}=await recognizeCourseImage(file.value,c.signal);if(disposed||run!==generation||owner!==props.scope||c.signal.aborted)return;const next=prepareCourseImageResult(data);candidate.value=next;applied.value='';notice.value=`识别出${next.rows.length}行待核对记录；请与原图逐行比对`}
  catch(e){if(!disposed&&run===generation&&owner===props.scope&&!c.signal.aborted){error.value=e.response?.data?.message||e.message||'图片识别暂未完成';notice.value='此前的填写与已保存课表没有改变；不会自动重试'}}
  finally{if(run===generation){busy.value=false;controller=null}}
}
function adopt(){
  if(props.disabled||busy.value||!candidate.value||rowIssue.value||!reviewed.value)return
  const owner=props.scope,run=generation,result=reviewCourseImageRows(candidate.value.rows),snapshot=signature.value
  emit('adopt',{...result,metadata:{...candidate.value.metadata},warnings:courseImageAdoptionWarnings(candidate.value,result.excluded),source:'Kimi图片识别并经本人核对',owner,onApplied:()=>{if(!disposed&&owner===props.scope&&run===generation&&snapshot===signature.value){applied.value=snapshot;if(imageDetails.value)imageDetails.value.open=false;notice.value='已放入下方差异预览，仍需最终确认保存，现有课表未改变'}}})
}
watch(()=>props.scope,()=>{reset();capController?.abort();if(props.scope)void loadCapability()},{flush:'sync'})
onMounted(loadCapability);onBeforeUnmount(()=>{disposed=true;reset();capController?.abort()})
</script>
<template>
  <details ref="imageDetails" class="course-image-import">
    <summary>用模型识别课表图片</summary>
    <p class="image-method">PNG / JPG · 2MB以内 · 识别后逐行核对，不会直接覆盖课表</p>
    <p v-if="loading" role="status">正在读取图片识别能力…</p>
    <p v-else-if="capability&&!capability.available" role="status">当前Kimi模型暂未配置视觉能力，仍可使用表格文件导入。</p>
    <button v-if="!capability&&!loading" class="work-button" type="button" @click="loadCapability">重新读取识别能力</button>
    <div class="image-method-actions"><label class="work-button image-picker">选择课表图片<input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" :disabled="disabled||busy||!capability?.available" @change="choose" /></label><button v-if="file&&!busy" class="work-button" type="button" :disabled="disabled" @click="reset">清除本次图片</button></div>
    <template v-if="file">
      <figure class="image-local-preview"><img :src="imageUrl" alt="本次待识别课表图片，仅本机预览" /><figcaption>{{file.name}} <a :href="imageUrl" target="_blank" rel="noopener noreferrer">放大原图</a></figcaption></figure>
      <p class="image-destination">识别服务：Kimi / {{capability?.model}} · {{capability?.destination}}。图片会发送至该服务进行用量估算和识别，计入现有AI额度；本站不保存本次识别图片、不写入对话历史。</p>
      <label class="image-consent"><input v-model="consent" type="checkbox" :disabled="disabled||busy" />我已遮去姓名、学号等不必要信息，确认只识别本人有权处理的课表，并同意发送本次图片</label>
      <div class="image-method-actions"><button class="work-button primary" type="button" :disabled="disabled||busy||!consent||!capability?.available" @click="recognize">{{busy?'模型识别中…':'开始图片识别'}}</button><button v-if="busy" class="work-button" type="button" @click="cancel">停止接收</button></div>
    </template>
    <p v-if="error" class="image-error" role="alert">{{error}}</p><p v-if="notice" class="image-notice" role="status">{{notice}}</p>
    <section v-if="candidate" class="image-review" aria-label="图片识别待核对记录">
      <h3>与原图核对，再放入课表</h3><p class="image-notice">识别学期：{{candidate.metadata.semester||'待填写'}} · 第1周周一：{{candidate.metadata.firstMonday||'未识别，下一步需确认'}}</p><p class="image-notice">模型可能看错，请逐行比对原图。采用结果会替换下方未保存预览，不会直接改动已保存课表。</p>
      <ol class="image-rows"><li v-for="(row,index) in candidate.rows" :key="row.id" :class="{'image-row-excluded':!row.include}">
        <label class="image-consent"><input v-model="row.include" type="checkbox" :disabled="disabled||busy" />采用第{{index+1}}行</label>
        <fieldset :disabled="disabled||busy||!row.include" class="image-row-fields"><label>课程名称<input v-model="row.name" maxlength="100" placeholder="补充清晰的课程名称" /></label><label>任课教师<input v-model="row.teacher" maxlength="100" placeholder="只填原图明确的任课教师，未知留空" /></label><label>星期<select v-model="row.weekday"><option value="">待确认</option><option v-for="(day,i) in ['周一','周二','周三','周四','周五','周六','周日']" :key="day" :value="String(i+1)">{{day}}</option></select></label><label>时间类型<select v-model="row.mode" @change="row.start='';row.end='' "><option value="period">第几节</option><option value="clock">钟点</option></select></label><label>开始<input v-model="row.start" :placeholder="row.mode==='period'?'如1':'如08:30'" maxlength="5" /></label><label>结束<input v-model="row.end" :placeholder="row.mode==='period'?'如2':'如10:05'" maxlength="5" /></label><label>上课周次<input v-model="row.weeks" maxlength="160" placeholder="如1-16单，未知请补充" /></label><label>教室<input v-model="row.room" maxlength="100" placeholder="未注明可留空" /></label></fieldset>
      </li></ol>
      <p v-if="rowIssue" class="image-error" role="status">{{rowIssue}}</p>
      <label class="image-consent"><input v-model="reviewed" type="checkbox" :disabled="disabled||busy||!!rowIssue" />我已逐行核对课程、任课教师、星期、时间和周次，明确取消采用的行不会导入</label>
      <button class="work-button primary" type="button" :disabled="disabled||busy||!reviewed||!!rowIssue" @click="adopt">采用识别结果并预览差异</button>
    </section>
  </details>
</template>
<style scoped>
.course-image-import{margin:20px 0 28px;border-block:1px solid var(--assistant-line,#e2e7ec);padding-block:8px 18px}
.course-image-import summary{min-height:44px;align-content:center;font-size:16px;font-weight:500;cursor:pointer}
.image-method,.image-destination,.image-notice,.image-local-preview figcaption{color:var(--assistant-muted,#5d6876);font-size:14px;line-height:1.7;overflow-wrap:anywhere}
.image-method-actions{display:flex;flex-wrap:wrap;gap:12px;margin-block:16px}
.image-picker{position:relative;display:inline-flex;align-items:center;cursor:pointer;overflow:hidden}.image-picker input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}.image-picker:focus-within{outline:2px solid var(--assistant-accent,#0b62db);outline-offset:3px}
.image-local-preview{margin:20px 0}.image-local-preview img{display:block;max-width:100%;max-height:280px;object-fit:contain;object-position:left;border-radius:8px}.image-local-preview figcaption{margin-top:8px}
.image-local-preview a{display:inline-flex;align-items:center;min-height:44px;margin-left:12px;color:var(--assistant-accent,#0b62db);text-underline-offset:4px}
.image-consent{display:flex!important;align-items:flex-start;gap:10px;font-size:14px;line-height:1.7;font-weight:400!important;margin-block:16px;min-height:44px;padding-block:8px}.image-consent input{width:18px!important;height:18px!important;flex:none;margin:3px 0 0!important}
.image-error{font-size:14px;line-height:1.7;color:var(--assistant-danger,#bf303d);overflow-wrap:anywhere}
.image-review h3{font-size:18px;font-weight:500;margin:28px 0 12px}.image-rows{list-style:none;padding:0;margin:20px 0}.image-rows li{border-top:1px solid var(--assistant-line,#e2e7ec);padding:16px 0}.image-row-fields{border:0;padding:0;margin:0;min-width:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.image-row-fields label{display:grid;gap:7px;font-size:14px;min-width:0}.image-row-fields input,.image-row-fields select{min-width:0;width:100%;padding:10px;min-height:44px;font:inherit;font-size:16px;color:var(--assistant-ink,#29323c);border:1px solid var(--assistant-line,#e2e7ec);border-radius:10px;background:white}.image-row-fields :focus-visible{outline:2px solid var(--assistant-accent,#0b62db);outline-offset:2px}.image-row-excluded fieldset{opacity:.6}
@media(max-width:600px){.image-row-fields{grid-template-columns:repeat(2,minmax(0,1fr))}.image-row-fields label:first-child,.image-row-fields label:nth-last-child(2),.image-row-fields label:last-child{grid-column:1/-1}.image-method-actions .work-button{min-height:44px}}
</style>
