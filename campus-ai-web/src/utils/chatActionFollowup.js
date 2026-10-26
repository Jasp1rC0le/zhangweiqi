import {parseCourseWeeks} from './courseSchedule.js'

// A bounded draft editor, not a write executor or an identity/target resolver.
const fail=message=>{throw new Error(message)}
const digits={零:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9}
const number=value=>/^\d+$/.test(value)?Number(value):value==='十'?10:value.includes('十')?(digits[value.split('十')[0]]||1)*10+(digits[value.split('十')[1]]||0):digits[value]
const N='(?:\\d{1,2}|[零一二两三四五六七八九十]{1,3})'
const part='(?:上午|早上|早晨|下午|午后|晚上|晚间|中午|凌晨)'
const point=`(?:\\d{1,2}:\\d{2}|${N}点(?:半|一刻|三刻|${N}分?)?)`
const separators=/^[\s，,；;。！？!?、:：]*$/u
export function verifiedBellRange(schoolId,start,end){
  if(schoolId!==1)throw new Error('本校作息尚未核定，请提供明确起止钟点')
  const bells=[['08:30','09:15'],['09:20','10:05'],['10:20','11:05'],['11:10','11:55'],['14:00','14:45'],['14:50','15:35'],['15:50','16:35'],['16:40','17:25']],first=bells[start-1],last=bells[end-1]
  if(!Number.isInteger(start)||!Number.isInteger(end)||end<start||!first||!last)throw new Error('已核定作息仅覆盖第1至8节，其他节次请填写明确钟点')
  return{startTime:first[0],endTime:last[1]}
}
const plain=(value,max)=>{
  // Single-line draft fields must not accept control characters or hidden new operations.
  // oxlint-disable-next-line no-control-regex
  if(typeof value!=='string'||value.length>max||/[\u0000-\u001f\u007f-\u009f]/u.test(value))fail(`字段须为${max}字以内的单行文字`)
  return value.trim()
}
function scanner(text){
  const chars=text.split('')
  return{source:text,rest:()=>chars.join(''),take(start,end){for(let i=start;i<end;i++)chars[i]=' '}}
}
function set(patch,key,value){if(Object.hasOwn(patch,key)&&JSON.stringify(patch[key])!==JSON.stringify(value))fail('同一字段出现多个不同的新值，请只保留一个；原草稿未改变');patch[key]=value}
function labels(scan,mapping){
  const names=Object.keys(mapping).sort((a,b)=>b.length-a.length),pattern=new RegExp(`(?:^|[\\s，,；;。])(${names.join('|')})\\s*(?:改为|改成|改到|换成|换到|设置为|设为|设成|定为|定在|安排在|调整为|调整到|是|在|[:：])?\\s*`,'g')
  const outsideQuotes=scan.rest().replace(/[《“「"]([^》”」"]*)[》”」"]/g,value=>'x'.repeat(value.length)),matches=[...outsideQuotes.matchAll(pattern)]
  const result={}
  for(let i=0;i<matches.length;i++){
    const m=matches[i],start=m.index+m[0].length,open=scan.source[start],close=({'《':'》','“':'”','「':'」','"':'"'})[open]
    let end,value
    if(close){end=scan.source.indexOf(close,start+1);if(end<0)fail('引号没有结束，请补全字段；原草稿未改变');value=scan.source.slice(start+1,end);end++}
    else{const tail=scan.source.slice(start,matches[i+1]?.index||scan.source.length),stop=tail.search(/[，,；;。\n]/);end=start+(stop<0?tail.length:stop);value=scan.source.slice(start,end).trim()
      if(mapping[m[1]].course){const cue=value.search(/\s+(?:(?:周|星期|礼拜)[一二三四五六日天1-7]|第[\d一二三四五六七八九十]+|\d{1,2}:\d{2}|上午|下午|晚上)/);if(cue>=0){value=value.slice(0,cue);end=start+scan.source.slice(start,end).indexOf(value)+value.length}}
    }
    const rule=mapping[m[1]],clean=plain(value,rule.max)
    if(!clean||!close&&/^(?:从|由)|改为|改成|改到|换成/.test(clean))fail('请明确字段的新值，例如“教室改为F2-306”；原草稿未改变')
    set(result,rule.key,clean);scan.take(m.index,end)
  }
  return result
}
const canonicalWeeks=value=>{const clean=value.replace(/[零一二两三四五六七八九十]{1,3}/g,v=>String(number(v))).replace(/到|至|—/g,'-').replace(/\s+/g,'');parseCourseWeeks(clean);return clean}
// Applied only AFTER literal labels/quoted field values have been consumed.
// Conjunction means a set; "or" remains ambiguous and is never chosen for the user.
export function normalizeWeekScopeLanguage(text){
  if(typeof text!=='string'||text.length>1200)return text
  const range=new RegExp(`(?:第)?(${N})周\\s*[-—~到至]\\s*(?:第)?(${N})周`,'g')
  const span=`${N}(?:\\s*[-—~到至]\\s*(?:第)?${N})?`,join='\\s*(?:以及|和|与|、|，|,)\\s*'
  const list=new RegExp(`(?:第${span}周?|${span}周)${join}(?:(?:第)?${span}周?${join})*(?:第)?${span}周`,'g')
  return text.split(/([《“「"][^》”」"]*[》”」"])/g).map((part,index)=>index%2?part:part.replace(range,(_,from,to)=>`${from}-${to}周`).replace(list,value=>value.replace(/\s|第|周/g,'').replace(/以及|和|与|、|，|,/g,';')+'周')).join('')
}
function clock(raw,inherited){
  const m=new RegExp(`^(${part})?\\s*(${N})(?::(\\d{2})|点(半|一刻|三刻|${N}分?)?)$`).exec(raw.trim())
  if(!m)fail('钟点不明确，请用14:00到15:35，或“下午两点到三点半”')
  let hour=number(m[2]),minute=m[3]!=null?Number(m[3]):m[4]==='半'?30:m[4]==='一刻'?15:m[4]==='三刻'?45:m[4]?number(m[4].replace('分','')):0
  const section=m[1]||inherited
  if(!Number.isInteger(hour)||hour<0||hour>23||!Number.isInteger(minute)||minute<0||minute>59)fail('钟点超出有效范围，原草稿未改变')
  if(!section&&m[3]==null&&hour<13)fail('“几点”还缺上午或下午，请注明时段或使用24小时钟点；原草稿未改变')
  if(section){if(/上午|早上|早晨|凌晨/.test(section)){if(hour>=12)fail('上午/凌晨与钟点不一致，请改用明确的24小时钟点')}else if(section==='中午'){if(hour<11||hour>13)fail('中午与钟点不一致，请改用明确的24小时钟点')}else{if(hour===0||hour===12&&/晚上|晚间/.test(section))fail('12点的时段不明确，请使用12:00或00:00');if(hour<12)hour+=12}}
  return`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`
}
function coursePlan(text,context){
  text=text.replace(/^(?:只改|仅改|仅修改|只修改)\s*/,'')
  if(/(?:教师|老师)(?:账号|编号)|任课(?:账号|编号)/.test(text))fail('个人课表只记录任课教师姓名；正式教师账号绑定请到教学配置核对，没有改变授课权限')
  let scan=scanner(text)
  const patch={},metadata={},course=context.form?.course||{}
  for(const m of scan.rest().matchAll(/清空教室|教室(?:留空|不填)/g)){set(patch,'room','');scan.take(m.index,m.index+m[0].length)}
  const values=labels(scan,{'课程名称':{key:'name',max:100,course:true},'课程名':{key:'name',max:100,course:true},'名称':{key:'name',max:100,course:true},'教室':{key:'room',max:100,course:true},'地点':{key:'room',max:100,course:true},'任课教师':{key:'teacher',max:100,course:true},'任课老师':{key:'teacher',max:100,course:true},'教师姓名':{key:'teacher',max:100,course:true},'学期':{key:'semester',max:100,course:true}})
  for(const [key,value]of Object.entries(values)){if(key==='semester')metadata.semester=value;else set(patch,key,value)}
  const firstMonday=/(?:第1周|第一周)(?:的)?周一\s*(?:改为|是|[:：])?\s*(\d{4}-\d{1,2}-\d{1,2})/.exec(scan.rest())
  if(firstMonday){const [y,m,d]=firstMonday[1].split('-').map(Number),iso=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`,date=new Date(iso+'T00:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==iso||date.getUTCDay()!==1)fail('第1周周一必须为真实的周一日期');metadata.firstMonday=iso;scan.take(firstMonday.index,firstMonday.index+firstMonday[0].length)}
  if(context.metadataLocked&&Object.keys(metadata).length)fail('已有课表的学期和第1周日期随原安排保留；如需整体更改，请去课表重新核对导入')
  scan=scanner(normalizeWeekScopeLanguage(scan.rest()))
  const days=[...scan.rest().matchAll(/(?:每(?:个)?)?(?:周|星期|礼拜)([一二三四五六日天1-7])/g)]
  if(days.length){const value=m=>Number(m[1])||'一二三四五六日'.indexOf(m[1].replace('天','日'))+1,unique=new Set(days.map(value));if(unique.size>1){const between=scan.source.slice(days[0].index+days[0][0].length,days.at(-1).index);if(days.length!==2||!/(?:改到|改为|换到|调整到|而是|是)/.test(between))fail('出现多个星期，请明确一个新星期；原草稿未改变');if(course.weekday&&Number(course.weekday)!==value(days[0]))fail('提到的原星期与当前草稿不一致，请只给出新星期')}set(patch,'weekday',value(days.at(-1)));scan.take(days[0].index,days.at(-1).index+days.at(-1)[0].length)}
  const weekFields=[...scan.rest().matchAll(new RegExp(`(?:上课)?周次\\s*(?:改为|改成|是|[:：])?\\s*(?:从)?\\s*(?:第)?(${N}(?:\\s*[-—~到至]\\s*${N})?(?:\\s*[;；、]\\s*${N}(?:\\s*[-—~到至]\\s*${N})?)*[单双]?)周?`,'g'))]
  for(const m of weekFields){set(patch,'weeks',canonicalWeeks(m[1]));scan.take(m.index,m.index+m[0].length)}
  const weeks=[...scan.rest().matchAll(new RegExp(`(?:第)?(${N}(?:\\s*[-—~到至]\\s*${N})?(?:\\s*[;；、]\\s*${N}(?:\\s*[-—~到至]\\s*${N})?)*)(单|双)?周(?:的?(单|双)周)?`,'g'))]
  for(const m of weeks){set(patch,'weeks',canonicalWeeks(m[1]+(m[3]||m[2]||'')));scan.take(m.index,m.index+m[0].length)}
  const parity=[...scan.rest().matchAll(/[单双]周/g)]
  if(parity.length){if(new Set(parity.map(m=>m[0])).size>1)fail('单周和双周需要二选一，原草稿未改变');let base;try{base=parseCourseWeeks(patch.weeks||course.weeks)}catch{fail('先给出上课周次范围，再指定单周或双周')}const selected=base.filter(w=>parity[0][0]==='单周'?w%2===1:w%2===0);if(!selected.length)fail('单双周筛选后没有上课周次');patch.weeks=selected.join(';');parity.forEach(m=>scan.take(m.index,m.index+m[0].length))}
  let mode
  const ranges=[...scan.rest().matchAll(new RegExp(`(${part})?\\s*(${point})\\s*[-—–~到至]\\s*(${part})?\\s*(${point})`,'g'))]
  for(const m of ranges){set(patch,'startTime',clock((m[1]||'')+m[2]));set(patch,'endTime',clock((m[3]||'')+m[4],m[1]));mode=false;scan.take(m.index,m.index+m[0].length)}
  const singles=[...scan.rest().matchAll(new RegExp(`(开始时间|上课时间|开始钟点|结束时间|下课时间|结束钟点)\\s*(?:改为|改成|是|[:：])?\\s*(${part})?\\s*(${point})`,'g'))]
  for(const m of singles){set(patch,/开始|上课/.test(m[1])?'startTime':'endTime',clock((m[2]||'')+m[3]));mode=false;scan.take(m.index,m.index+m[0].length)}
  const periods=[...scan.rest().matchAll(new RegExp(`第?${N}(?:节)?\\s*[-—~到至]\\s*第?${N}节|第?${N}节`,'g'))]
  for(const m of periods){if(mode===false)fail('钟点和节次不能同时填写，请选择一种；原草稿未改变');const numbers=[...m[0].matchAll(new RegExp(N,'g'))].map(v=>number(v[0])),start=numbers[0],end=numbers[1]||start;if(start<1||end>16||end<start)fail('节次须在1至16内，结束不能早于开始');set(patch,'startPeriod',start);set(patch,'endPeriod',end);mode=true;scan.take(m.index,m.index+m[0].length)}
  if(mode===false){patch.startPeriod='';patch.endPeriod='';const start=patch.startTime??course.startTime,end=patch.endTime??course.endTime;if(start&&end&&start>=end)fail('结束钟点须晚于开始；不自动当作跨夜课程')}
  if(mode===true){patch.startTime='';patch.endTime=''}
  const rest=scan.rest().replace(/请|麻烦你?|帮我|我想|我需要|把|将|这门课程|这门课|当前课程|课程|上课时间|时间|钟点|的|改为|改成|改到|换到|换成|调整到|调整为|设置为|设为|安排在|安排为|不是|而是|从|由|在|是|用|每/g,'')
  if(/任课|教师|老师|班级|学院|学号|账号|别人|他人/.test(rest))fail('当前只补本人的课程草稿；班级、教师或他人目标请先取消，再按正式入口核对')
  if(!separators.test(rest))fail('还有未识别的补充内容，请明确课程名称、星期、钟点/节次、周次或教室；原草稿未改变')
  if(!Object.keys(patch).length&&!Object.keys(metadata).length)fail('请补充至少一个明确字段，例如“周三，下午两点到三点半，第1到16周，教室F2-306”')
  const changed=Object.entries(patch).filter(([key,value])=>String(course[key]??'')!==String(value)).map(([key])=>key)
  const metaChanged=Object.entries(metadata).filter(([key,value])=>context.form?.[key]!==value).map(([key])=>key)
  if(!changed.length&&!metaChanged.length&&(mode==null||mode===context.periodMode))return{type:'UNCHANGED',message:'这些字段已经与当前草稿一致，没有重复更改，也没有保存。'}
  return{type:'PATCH',patch:{course:patch,metadata,...(mode!=null?{periodMode:mode}:{})},fields:[...changed,...metaChanged],message:'补充已填入当前课程草稿；旧预览已失效，尚未保存。'}
}
function attendancePlan(text,context){
  if(!context.selectedStudent||!context.canMark)fail('先在授权课程名单里选定具体同学和学号；聊天不会按姓名自动选人')
  const scan=scanner(text),patch={}
  const reason=/(?:更正原因|核对原因|原因)\s*(?:改为|改成|是|[:：])?\s*([\s\S]+)$/.exec(scan.rest())
  if(reason){patch.reason=plain(reason[1],300);if(!patch.reason)fail('更正原因不能空白');scan.take(reason.index,reason.index+reason[0].length)}
  const matches=[...scan.rest().matchAll(/旷课|早退|按时(?:到达|到课)?|正常出勤/g)],status=s=>s.startsWith('按时')||s==='正常出勤'?'ON_TIME':s==='早退'?'EARLY_LEAVE':'ABSENT'
  if(matches.length){const unique=new Set(matches.map(m=>status(m[0])));if(unique.size>1&&!/不是.*(?:而是|是|改为|改成)/.test(scan.rest()))fail('出现多个考勤状态，请明确按时、旷课或早退中的一种');patch.status=status(matches.at(-1)[0]);if(patch.status!=='ON_TIME'&&!context.canRecordAbsence)fail('尚未开课，不能记录旷课或早退');matches.forEach(m=>scan.take(m.index,m.index+m[0].length))}
  let rest=scan.rest().replace(/请|麻烦你?|帮我|把|将|当前(?:选中)?(?:的)?同学|这(?:位|个)同学|这位|当前状态|状态|考勤|设置为|设为|改成|改为|记为|标为|标记为|不是|而是|是|的/g,'')
  for(const literal of [context.selectedStudent.studentNumber,context.selectedStudent.name])if(literal)rest=rest.split(literal).join('')
  if(!separators.test(rest))fail('只补当前已选同学的状态和原因；更换人员或课程请先在授权列表核对，未自动匹配姓名')
  if(!Object.keys(patch).length)fail('可补“改为早退，原因：已核对原始点名记录”；不会直接保存')
  const fields=Object.keys(patch).filter(k=>String(context[k]??'')!==String(patch[k]));if(!fields.length)return{type:'UNCHANGED',message:'当前已选同学的草稿已是这些值，没有重复更改或保存。'}
  return{type:'PATCH',patch,fields,message:'已更新当前选中同学的考勤草稿；旧预览已失效，仍需核对学号和确认保存。'}
}
function knowledgePlan(text,context){
  if(context.userRole!=='ADMIN')fail('只有正常管理员会话可补本校公共资料元数据')
  if(context.revising&&!context.documentReady)fail('先读取并核对具体资料及当前版本，聊天不自动更换资料')
  const scan=scanner(text),patch=labels(scan,{'资料标题':{key:'title',max:200},'标题':{key:'title',max:200},'分类':{key:'category',max:50},'发布部门':{key:'sourceDepartment',max:100},'来源链接':{key:'sourceUrl',max:1000}})
  if(/正文|批量|换一份|另一份|资料编号|文档编号/.test(scan.rest()))fail('正文或资料目标请在原表单核对；不从补充消息发布名单、私人课表或考勤')
  if(patch.sourceUrl){let url;try{url=new URL(patch.sourceUrl)}catch{fail('来源链接须为有效的http或https地址')}if(!['http:','https:'].includes(url.protocol)||url.username||url.password)fail('来源链接不能包含登录凭据，且须使用http或https')}
  const rest=scan.rest().replace(/请|麻烦你?|帮我|把|将|改为|改成|设置为|设为|的/g,'')
  if(!separators.test(rest)||!Object.keys(patch).length)fail('本轮只补标题、分类、发布部门或来源链接；原资料和正文未改变')
  const fields=Object.keys(patch).filter(k=>context.knowledge?.[k]!==patch[k]);if(!fields.length)return{type:'UNCHANGED',message:'这些资料元数据已经一致，没有保存。'}
  return{type:'PATCH',patch,fields,resetPublicConsent:true,message:'已补资料元数据；公开内容确认已取消，须重新核读正文、预览并确认保存。'}
}
function formalPlan(text,context){
  if(context.userRole!=='ADMIN')fail('正式教学草稿仅由正常管理员编辑；不会根据聊天申请或提升身份')
  text=text.replace(/^(?:(?:请|麻烦你?|帮我|帮忙|我想要?|我需要|现在|先|再)\s*)*/,'')
  const recipient=/^(?:给|为)\s*(.{1,100}?)\s*(?:新增|新建|创建|添加|增加)(?:一门)?(?:教学安排|课程|课)\s*/.exec(text)
  if(recipient){const target=recipient[1].trim(),label=/班/.test(target)?'班级':/教师|老师/.test(target)?'任课教师':null;if(!label)fail('目标不是明确班级或任课教师，请先核对目标');text=label+target.replace(/^(?:班级|行政班|任课教师|任课老师)\s*/,'')+'，课程名称'+text.slice(recipient[0].length)}
  else text=text.replace(/^(?:新增|新建|创建|添加|增加|安排)(?:一门)?(?:教学安排|教学课程|课程|课)\s*/,'课程名称')
  const scan=scanner(text),targets=labels(scan,{'主办行政班':{key:'classQuery',max:220,course:true},'课程班级':{key:'classQuery',max:220,course:true},'班级':{key:'classQuery',max:220,course:true},'教师账号编号':{key:'teacherQuery',max:100,course:true},'教师账号':{key:'teacherQuery',max:100,course:true},'任课教师':{key:'teacherQuery',max:100,course:true},'任课老师':{key:'teacherQuery',max:100,course:true},'教师':{key:'teacherQuery',max:100,course:true},'老师':{key:'teacherQuery',max:100,course:true},'教学组名称':{key:'groupName',max:100,course:true},'教学组':{key:'groupName',max:100,course:true},'名单方式':{key:'rosterMode',max:30,course:true}})
  if(targets.rosterMode){const modes={'整行政班':'CLASS','整班':'CLASS','行政班':'CLASS','选修':'SELECTED','合班':'SELECTED','逐人':'SELECTED','逐人勾选':'SELECTED','选修/合班':'SELECTED'};if(!modes[targets.rosterMode])fail('名单方式请选择整行政班或逐人勾选；具体学生仍从授权名单核对');targets.rosterMode=modes[targets.rosterMode]}
  const tail=scan.rest().replace(/请|麻烦你?|帮我|把|将|当前教学草稿|这门课程|这门课|改为|改成|设置为|设为|的/g,'')
  let planned={patch:{course:{},metadata:{}},fields:[]}
  if(!separators.test(tail))planned=coursePlan(scan.rest(),{...context,metadataLocked:false})
  const course={...planned.patch?.course,...planned.patch?.metadata}
  if(planned.patch?.periodMode){
    Object.assign(course,verifiedBellRange(context.schoolId,course.startPeriod,course.endPeriod))
  }
  delete course.startPeriod;delete course.endPeriod
  if(!Object.keys(course).length&&!Object.keys(targets).length)return planned.type==='UNCHANGED'?planned:fail('请明确课程、班级、教师、学期、第1周日期、周次、时间、教室或名单方式')
  return{type:'PATCH',patch:{course,targets},fields:[...Object.keys(course),...Object.keys(targets)],message:'补充已解析；班级和教师须通过本校授权读取核对后才填入，尚未保存。'}
}
export function planActionFollowup(raw,context){
  const blocked=message=>({type:'BLOCKED',message,preserveInput:true})
  if(!context?.active||!context.scope||context.scope!==context.requestScope)return blocked('操作归属已变化，没有修改旧草稿。')
  if(context.busy)return blocked('当前操作仍在读取或保存，补充暂未处理；输入已保留。')
  const text=String(raw||'').normalize('NFKC').trim()
  if(/^(?:请)?(?:取消|取消操作|取消不保存|取消，不保存|不保存|结束本次查询)[。！!？?]?$/.test(text))return{type:'CANCEL',message:'取消本次操作，不提交修改。'}
  if(['uncertain','saving','saved','cancelled'].includes(context.phase))return blocked('保存结果未核对或操作已结束，不能改确认内容或重复提交；请先在原业务页核对。')
  if(!context.loaded)return blocked('先完成当前账号的授权读取，再补字段；输入已保留。')
  if(!['PERSONAL_COURSE','ATTENDANCE','KNOWLEDGE'].includes(context.kind)&&!(context.kind==='TEACHING_COURSE'&&context.userRole==='ADMIN'))return{type:'CLARIFY',message:'这类目标仍需在原表单明确选择；可取消后发起另一项操作，没有自动保存或发给模型。',preserveInput:true}
  if(!text||text.length>1200||/[`{}]/.test(text))return{type:'CLARIFY',message:'请补明确的单行字段，不从JSON、代码或长正文推断变更；原草稿未改变。',preserveInput:true}
  if(/^(?:请|帮我)?(?:预览|生成预览|重新预览|看(?:一下)?预览)[。！!？?]?$/.test(text))return{type:'PREVIEW',message:'先读取当前版本并生成预览，不执行保存。'}
  if(/^(?:请|帮我)?(?:确认|确认保存|保存|提交)[。！!？?]?$/.test(text))return{type:context.phase==='preview'?'CONFIRM_BUTTON':'PREVIEW',message:context.phase==='preview'?'请核对当前预览，再点击面板里的“确认保存”；这条消息没有提交。':'先生成并核对预览，仍需点击面板里的确认保存。'}
  try{
    if(context.kind==='TEACHING_COURSE')return formalPlan(text,context)
    if(context.kind==='PERSONAL_COURSE')return coursePlan(text,context)
    if(context.kind==='ATTENDANCE')return attendancePlan(text,context)
    if(context.kind==='KNOWLEDGE')return knowledgePlan(text,context)
    return{type:'CLARIFY',message:'这类目标仍需在原表单选择课程、班级或账号；没有按聊天姓名填入权限或发给模型。',preserveInput:true}
  }catch(error){return{type:'CLARIFY',message:error.message||'补充不明确，原草稿未改变。',preserveInput:true}}
}
