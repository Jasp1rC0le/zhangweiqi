import { courseKey, normalizeCourses } from './courseSchedule.js'
const text=value=>String(value||'').normalize('NFKC').replace(/\s+/g,'')
function identity(course){return JSON.stringify([text(course.name),course.weekday,course.startTime||'',course.endTime||'',course.startPeriod||'',course.endPeriod||'',text(course.room)])}
export function mergeWeeklyImage(schedule,incoming,metadata){
  const week=metadata?.week
  if(!schedule||!Number.isInteger(week)||!metadata.firstMonday||schedule.firstMonday!==metadata.firstMonday||incoming.some(c=>c.weeks.some(w=>w!==week)))return{courses:incoming,metadata,warnings:[]}
  const warnings=[`只更新第${week}周，其他周沿用已保存安排`]
  let retainedTeacher=false
  const courses=incoming.map(c=>{
    if(c.teacher)return c
    const matching=schedule.courses.filter(old=>old.weeks.includes(week)&&identity(old)===identity(c))
    const teachers=new Set(matching.map(c=>c.teacher).filter(Boolean))
    if(matching.length===1&&teachers.size===1){retainedTeacher=true;return{...c,teacher:[...teachers][0]}}
    return c
  })
  if(retainedTeacher)warnings.push('同一课程未显示教师的，沿用你原先填写的姓名；请核对')
  const otherWeeks=schedule.courses.map(c=>({...c,weeks:c.weeks.filter(w=>w!==week)})).filter(c=>c.weeks.length)
  const merged=new Map()
  for(const c of [...otherWeeks,...courses]){
    const key=courseKey({...c,weeks:[1]})
    if(merged.has(key))merged.get(key).weeks=[...new Set([...merged.get(key).weeks,...c.weeks])].sort((a,b)=>a-b)
    else merged.set(key,{...c,weeks:[...c.weeks]})
  }
  return{courses:normalizeCourses([...merged.values()]),metadata:{...metadata,semester:schedule.semester},warnings}
}
