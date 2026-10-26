import {normalizeCourse,normalizeCourses,parseCourseWeeks,courseConflicts} from './courseSchedule.js'
import {mondayOf} from './timetable.js'
export function courseImageFileIssue(file){
  return !file||!['image/png','image/jpeg'].includes(file.type)||!Number.isSafeInteger(file.size)||file.size<1||file.size>2*1024*1024?'请选择2MB以内的PNG/JPG课表图片；请先裁去姓名、学号等不必要信息':''
}
const single=(value,max)=>value==null?'':typeof value==='string'&&value.length<=max&&!/[\r\n\0]/.test(value)?value:(()=>{throw new Error('图片识别响应异常，未覆盖已有内容')})()
const integer=(value,max)=>value==null?'':Number.isInteger(value)&&value>=1&&value<=max?String(value):(()=>{throw new Error('图片识别数值异常，未覆盖已有内容')})()
export function prepareCourseImageResult(data){
  if(data?.version!==1||data.provider!=='kimi'||!single(data.model,100)||!Array.isArray(data.rows)||!data.rows.length||data.rows.length>120||!Array.isArray(data.warnings)||data.warnings.length>20)throw new Error('图片识别响应不完整，未覆盖已有内容')
  const firstMonday=single(data.firstMonday,10),semester=single(data.semester,100)
  if(firstMonday&&(mondayOf(firstMonday)!==firstMonday||firstMonday<'2000-01-01'||firstMonday>'2100-12-31'))throw new Error('图片中的开学日期不可信，请手工核对')
  return{metadata:{semester,firstMonday},warnings:data.warnings.map(w=>single(w,300)),rows:data.rows.map((row,index)=>{
    if(!row||typeof row!=='object'||Array.isArray(row)||!Array.isArray(row.weeks)||row.weeks.length>30||row.weeks.some(w=>!Number.isInteger(w)||w<1||w>30))throw new Error('识别周次响应异常，未补猜周次')
    const startPeriod=integer(row.startPeriod,16),endPeriod=integer(row.endPeriod,16),startTime=single(row.startTime,5),endTime=single(row.endTime,5)
    if((startPeriod||endPeriod)&&(startTime||endTime))throw new Error('识别的节次和钟点混淆，请重新裁剪核对')
    return{id:index+1,include:true,name:single(row.name,100),weekday:integer(row.weekday,7),mode:startTime||endTime?'clock':'period',start:startTime||startPeriod,end:endTime||endPeriod,weeks:row.weeks.join(';'),room:single(row.room,100),teacher:single(row.teacher,100)}
  })}
}
export function reviewCourseImageRows(rows){
  if(!Array.isArray(rows)||rows.length>120)throw new Error('待核对课程数量异常')
  const selected=[]
  for(let i=0;i<rows.length;i++){
    const r=rows[i];if(!r.include)continue
    try{
      if(!['clock','period'].includes(r.mode)||!/^\d$/.test(r.weekday))throw new Error('请补充星期和时间类型')
      if(r.mode==='period'&&(!/^\d{1,2}$/.test(r.start)||!/^\d{1,2}$/.test(r.end)))throw new Error('请补充明确的开始和结束节次')
      selected.push(normalizeCourse({name:r.name,weekday:Number(r.weekday),...(r.mode==='period'?{startPeriod:Number(r.start),endPeriod:Number(r.end)}:{startTime:r.start,endTime:r.end}),weeks:parseCourseWeeks(r.weeks),room:r.room,teacher:r.teacher}))
    }catch(e){throw new Error(`第${i+1}行：${e.message}；也可明确取消采用此行`,{cause:e})}
  }
  const courses=normalizeCourses(selected)
  return{courses,duplicates:selected.length-courses.length,conflicts:courseConflicts(courses),excluded:rows.length-selected.length}
}
export function courseImageAdoptionWarnings(candidate,excluded){
  const notes=[]
  if(!candidate.metadata.firstMonday)notes.push('图片未明确第1周周一日期，请核对导入区当前填写的日期')
  if(!candidate.metadata.semester)notes.push('图片未明确学期，请核对导入区当前填写的学期')
  if(excluded>0)notes.push(`本人明确排除${excluded}行，不会保存这些行`)
  return notes.length?[notes.join('；')]:[]
}
