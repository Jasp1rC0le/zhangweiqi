<script setup>
import {computed,nextTick,onBeforeUnmount,onMounted,reactive,ref,watch} from 'vue'
import {useRouter} from 'vue-router'
import {readCourseSchedule,saveCourseSchedule} from '@/api/courseSchedule'
import {useCourseScheduleStore} from '@/stores/courseSchedule'
import {courseKey,courseTimeLabel,normalizeCourse,parseCourseWeeks} from '@/utils/courseSchedule'
import {createPrivateCourseEdit,privateCourseEditForm,privateCourseEditFollowup} from '@/utils/privateCourseEdit'
import {useScopedConfirmation} from '@/utils/useScopedConfirmation'
import '@/styles/teaching-confirmation.css'

const props=defineProps({scope:{type:String,required:true},user:{type:Object,required:true},active:Boolean,seed:{type:Object,default:()=>({})}})
const emit=defineEmits(['state','done']),router=useRouter(),store=useCourseScheduleStore()
let disposed=false
const owner=()=>!disposed&&props.active?props.scope:''
const state=reactive({busy:false,phase:'list',snapshot:null,selected:null,selectedKey:'',preview:null,error:'',notice:'',verified:false})
const resource=createPrivateCourseEdit({owner,state,read:readCourseSchedule,write:saveCourseSchedule,
  adopt:snapshot=>{if(owner()&&store.principal===`${props.user.id}:${props.user.schoolId}`)store.adopt(snapshot,store.principal)},
  clearCache:()=>{if(owner()&&store.principal===`${props.user.id}:${props.user.schoolId}`)store.reset()}})
const form=reactive({name:'',weekday:'',weeks:'',room:'',teacher:'',periodMode:false,startTime:'',endTime:'',startPeriod:'',endPeriod:''})
const search=ref(/[《“「"]([^》”」"]{1,100})[》”」"]/.exec(props.seed.instructions||'')?.[1]||''),page=ref(0),baseline=ref(''),followup=ref(''),feedback=ref(),confirmButton=ref(),editHeading=ref()
const {confirm,confirming}=useScopedConfirmation(()=>`${owner()}:${state.selectedKey}:${state.preview?.fingerprint||''}`,()=>!!owner())
const busy=computed(()=>state.busy||confirming.value),locked=computed(()=>busy.value||!owner()||['preview','uncertain','saved'].includes(state.phase))
const dirty=computed(()=>!!state.selected&&JSON.stringify(form)!==baseline.value)
const matches=computed(()=>state.snapshot?.courses.filter(c=>`${c.name} ${c.room} ${c.teacher||''}`.includes(search.value.trim()))||[])
const rows=computed(()=>matches.value.slice(page.value*25,(page.value+1)*25)),pages=computed(()=>Math.ceil(matches.value.length/25))
const day=value=>'周'+'一二三四五六日'[value-1]
watch(search,()=>{page.value=0})
watch(form,()=>resource.invalidate(),{deep:true,flush:'sync'})
watch([busy,()=>state.phase],()=>emit('state',{busy:busy.value,phase:state.phase}),{immediate:true})
watch(()=>props.scope,()=>{resource.reset();search.value='';page.value=0;followup.value='';baseline.value='';Object.assign(form,{name:'',weekday:'',weeks:'',room:'',teacher:'',periodMode:false,startTime:'',endTime:'',startPeriod:'',endPeriod:''})},{flush:'sync'})
async function locate(target=()=>feedback.value){const scope=owner();await nextTick();const element=typeof target==='function'?target():target;if(scope&&owner()===scope&&element){element.focus?.({preventScroll:true});element.scrollIntoView({block:'nearest',behavior:'auto'})}}
async function choose(course){if(locked.value)return;if(!resource.select(courseKey(course)))return;Object.assign(form,privateCourseEditForm(state.selected));baseline.value=JSON.stringify(form);followup.value='已选准本人原安排。可继续发“教室改为…”“第2到3周…”等新值；原始请求仅用于核对，不按同名自动执行。';await locate(()=>editHeading.value)}
async function reselect(){
  if(busy.value||['uncertain','saved'].includes(state.phase))return
  if(dirty.value||state.preview)if(!await confirm('返回课程清单会放弃当前未保存字段和预览，不修改原课表。',{title:'重新选择原安排？',confirmText:'放弃草稿并返回',className:'ct-teaching-change-confirm'}))return
  await resource.load();baseline.value='';followup.value='';await locate()
}
async function prepare(){await resource.prepare({...form});await locate()}
async function save(){
  if(busy.value||!state.preview)return
  const scope=owner(),fingerprint=state.preview.fingerprint
  if(!await confirm(state.preview.lines.join('\n'),{title:'确认修改本人课表副本？',confirmText:'确认保存副本',cancelText:'返回继续核对',className:'ct-teaching-change-confirm'}))return
  if(owner()!==scope||state.preview?.fingerprint!==fingerprint)return
  if(await resource.execute())emit('done',{message:state.notice,saved:true,verified:state.verified});else await locate()
}
async function reconcile(){if(await resource.reconcile())emit('done',{message:state.notice,saved:true,verified:state.verified});else await locate()}
async function openManagement(){if(busy.value)return;const principal=store.principal;emit('done',state.phase==='uncertain'?'操作已收起，原保存结果仍需在本人课表核对；没有重发。':'本次编辑已取消，没有保存。');await nextTick();if(principal&&store.principal===principal)router.push({path:'/timetable',query:{tool:'personal-manage'}})}
async function handleFollowup(text,requestScope){
  const scope=owner(),current=()=>!!scope&&owner()===scope&&requestScope===scope
  const plan=privateCourseEditFollowup(text,{scope,requestScope,active:current(),loaded:!!state.snapshot,selected:!!state.selected,phase:state.phase,busy:busy.value,form:{...form},periodMode:form.periodMode})
  if(plan.type==='CANCEL'){emit('done',state.phase==='uncertain'?'操作已收起，原保存结果仍需核对，没有重发。':'本次私人课表草稿已取消，没有保存。');return{accepted:true,closed:true,message:'已收起本次操作。'}}
  followup.value=plan.message
  if(['BLOCKED','CLARIFY'].includes(plan.type))return{accepted:false,preserveInput:true,message:plan.message}
  if(plan.type==='PATCH'){
    try{
      const next={...form,...plan.patch.course,...(Object.hasOwn(plan.patch,'periodMode')?{periodMode:plan.patch.periodMode}:{})},weeks=parseCourseWeeks(next.weeks)
      if(weeks.some(w=>!state.selected.weeks.includes(w)))throw new Error('修改范围只可选择原安排已有周次；其他周次保持原样，新增周次请另加课程。')
      normalizeCourse({name:next.name,weekday:Number(next.weekday),room:next.room,teacher:next.teacher,weeks,...(next.periodMode?{startPeriod:Number(next.startPeriod),endPeriod:Number(next.endPeriod)}:{startTime:next.startTime,endTime:next.endTime})})
      if(!current())return{accepted:false,preserveInput:true,message:'归属已变化，没有修改旧字段。'}
      resource.invalidate();Object.assign(form,next);followup.value='新值已填入所选个人安排，旧预览失效。只修改指定周次，其他周次保留；仍需预览和人工确认。'
    }catch(e){followup.value=e.message;return{accepted:false,preserveInput:true,message:e.message}}
  }
  if(plan.type==='PREVIEW'){await resource.prepare({...form});if(!current())return{accepted:false,preserveInput:true,message:'归属已变化，没有显示旧预览。'};if(!state.preview)return{accepted:false,preserveInput:true,message:state.error||'还未生成预览，没有保存。'};followup.value='当前来源与版本已核对，预览已生成；尚未保存，仍需人工确认。'}
  if(plan.type==='CONFIRM_BUTTON'){followup.value='请核读预览，再点击“确认保存个人课表”；这条聊天消息没有保存。';await locate(()=>confirmButton.value)}else await locate()
  return{accepted:true,message:followup.value||plan.message}
}
defineExpose({handleFollowup})
onMounted(()=>resource.load())
onBeforeUnmount(()=>{disposed=true;resource.dispose()})
</script>
<template>
  <section class="private-course-edit" aria-label="个人副本编辑工具" :aria-busy="busy">
    <p>只修改本人导入副本。先选准确安排；部分周次会拆分保留，不改正式教学、名单、考勤或原图片。</p>
    <p v-if="state.busy" role="status">正在核对本人课表与版本…</p>
    <p v-if="state.error" class="failure" role="alert">{{state.error}}</p>
    <p v-if="followup" ref="feedback" tabindex="-1" class="feedback" role="status">{{followup}}</p>
    <template v-if="state.phase==='uncertain'"><p>保存结果尚未核对，原目标与内容已冻结；不会自动重发或按新字段再保存。</p><button type="button" class="primary" :disabled="busy" @click="reconcile">读取本人课表核对原结果</button></template>
    <template v-else-if="state.snapshot&&!state.selected">
      <h3>选择本人保存的具体安排</h3>
      <p class="source">{{state.snapshot.semester}} · 第1周周一{{state.snapshot.firstMonday}} · 完整{{state.snapshot.courses.length}}项 · 版本{{state.snapshot.revision}}</p>
      <label>查找个人课程<input v-model="search" type="search" maxlength="100" :disabled="locked" placeholder="按课程或教室查找" /></label>
      <p v-if="!matches.length">没有匹配项，请换关键词；不会改用学校正式课程冒充个人副本。</p>
      <ul class="course-choices"><li v-for="course in rows" :key="courseKey(course)"><button type="button" :disabled="locked" @click="choose(course)"><strong>{{course.name}}</strong><span>{{day(course.weekday)}} · {{courseTimeLabel(course)}} · {{course.room||'教室未填写'}}</span><small>第{{course.weeks.join('、')}}周 · 选择这项</small></button></li></ul>
      <nav v-if="pages>1" aria-label="本人课程分页"><span>{{matches.length}}项 · {{page+1}}/{{pages}}</span><button type="button" :disabled="locked||page===0" @click="page--">上一页</button><button type="button" :disabled="locked||page+1>=pages" @click="page++">下一页</button></nav>
    </template>
    <template v-else-if="state.selected">
      <h3 ref="editHeading" tabindex="-1">{{state.selected.name}}</h3>
      <p class="source">原：{{day(state.selected.weekday)}} {{courseTimeLabel(state.selected)}} · {{state.selected.room||'教室未填写'}} · 第{{state.selected.weeks.join('、')}}周</p>
      <button type="button" :disabled="locked" @click="reselect">重新选择原安排</button>
      <form v-if="state.phase!=='preview'" @submit.prevent="prepare">
        <label class="wide">课程名称<input v-model="form.name" required maxlength="100" :disabled="locked" /></label>
        <label>新星期<select v-model="form.weekday" required :disabled="locked"><option v-for="(d,i) in ['一','二','三','四','五','六','日']" :key="d" :value="i+1">周{{d}}</option></select></label>
        <label>仅修改这些周次<input v-model="form.weeks" required maxlength="160" :disabled="locked" placeholder="例如2;4，其他周保留" /></label>
        <label class="wide">时间填写方式<select v-model="form.periodMode" :disabled="locked"><option :value="false">起止钟点</option><option :value="true">开始和结束节次</option></select></label>
        <template v-if="form.periodMode"><label>开始节次<input v-model="form.startPeriod" required type="number" min="1" max="16" :disabled="locked" /></label><label>结束节次<input v-model="form.endPeriod" required type="number" min="1" max="16" :disabled="locked" /></label></template>
        <template v-else><label>开始钟点<input v-model="form.startTime" required type="time" :disabled="locked" /></label><label>结束钟点<input v-model="form.endTime" required type="time" :disabled="locked" /></label></template>
        <label>新任课教师<input v-model="form.teacher" maxlength="100" :disabled="locked" placeholder="未录入可留空" /></label>
        <label>新教室<input v-model="form.room" maxlength="100" :disabled="locked" /></label>
        <p class="source wide">仅支持原有周次中的明确范围；某一天不自动替换全部周次。钟点与节次不混填，跨单位重叠仍需人工核对。</p>
        <button class="primary wide" :disabled="locked">核对来源并预览修改</button>
      </form>
      <section v-else class="edit-preview" aria-label="个人课程修改预览">
        <h3>核对原安排与新安排</h3><ul><li v-for="line in state.preview.lines" :key="line">{{line}}</li></ul>
        <details><summary>查看版本和校验值</summary><p>原版本{{state.preview.revision}} · 5分钟内有效，保存前再次读取核验。</p><code>{{state.preview.fingerprint}}</code></details>
        <div class="buttons"><button ref="confirmButton" type="button" class="primary" :disabled="busy" @click="save">确认保存个人课表</button><button type="button" :disabled="busy" @click="resource.invalidate">返回修改</button></div>
      </section>
    </template>
    <div class="buttons"><button v-if="!state.snapshot||state.error&&state.phase!=='uncertain'" type="button" :disabled="busy" @click="reselect">重新读取原课表</button><button type="button" :disabled="busy" @click="openManagement">取消并打开个人课表</button></div>
    <details v-if="seed.instructions"><summary>核对原始请求</summary><p>{{seed.instructions}}</p></details>
  </section>
</template>
<style scoped>
.private-course-edit{max-width:65ch;min-width:0;font-size:16px;line-height:1.75;color:var(--assistant-ink,#29323c);overflow-wrap:anywhere}.private-course-edit p{margin:12px 0}.private-course-edit h3{font-size:18px;font-weight:600;margin:24px 0 12px;scroll-margin-top:100px}.private-course-edit .source{font-size:14px;color:var(--assistant-muted,#5d6876)}.private-course-edit label{display:grid;gap:8px;min-width:0;font-size:16px}.private-course-edit form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-block:20px}.wide{grid-column:1/-1}.private-course-edit :is(input,select,button){box-sizing:border-box;min-height:48px;min-width:0;max-width:100%;font:inherit;font-size:16px;padding:10px 12px;border:1px solid var(--assistant-line,#e2e7ec);border-radius:12px;background:var(--assistant-surface,#fff);color:inherit;caret-color:var(--assistant-accent,#0b62db)}.private-course-edit button{cursor:pointer;white-space:normal}.private-course-edit button:hover{background:var(--assistant-soft,#eaf2ff)}.private-course-edit button.primary{background:var(--assistant-accent,#0b62db);color:#fff;border-color:transparent}.private-course-edit button.primary:hover{background:var(--assistant-accent-hover,#084db0)}.private-course-edit :disabled{opacity:.6;cursor:not-allowed}.private-course-edit :focus-visible{outline:2px solid var(--assistant-accent,#0b62db);outline-offset:3px}.course-choices{list-style:none;padding:0;margin:16px 0}.course-choices li{border-bottom:1px solid var(--assistant-line,#e2e7ec)}.course-choices button{width:100%;text-align:left;border:0;border-radius:0;padding:16px 0}.course-choices :is(strong,span,small){display:block}.course-choices small{font-size:14px;color:var(--assistant-muted,#5d6876)}.buttons,.private-course-edit nav{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-block:16px}.failure{color:var(--assistant-danger,#bf303d)}.feedback{color:var(--assistant-muted,#5d6876);scroll-margin-top:100px}.edit-preview{margin-top:24px;padding-top:4px;border-top:1px solid var(--assistant-line,#e2e7ec)}.edit-preview ul{padding-inline-start:24px}.edit-preview li{margin:10px 0}.edit-preview code{display:block;max-width:100%;overflow-wrap:anywhere;white-space:normal}.private-course-edit summary{cursor:pointer;min-height:44px;display:flex;align-items:center}.private-course-edit ::selection{background:var(--assistant-soft,#eaf2ff)}@media(max-width:600px){.private-course-edit form{grid-template-columns:1fr}.buttons{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.buttons>button{width:100%}.buttons>button:only-child{grid-column:1/-1}}
</style>
