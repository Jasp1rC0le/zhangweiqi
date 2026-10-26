const durationSource='多久|多长(?:时间)?|几分钟|多少分钟|几个小时|几小时|多少小时'
const duration=new RegExp(durationSource)
const waitingPrefix=new RegExp(`(?:还剩(?:下)?|剩余|剩下|还(?:有|要|需(?:要)?|得)?(?:等)?|再等|要等|等)(?=${durationSource})`,'g')

// Read meaning only; no clock arithmetic, identity decisions or model calls.
export function extractScheduleTiming(value,{hasContext=false,previous=null}={}) {
  if(!(duration.test(value)||/时长|跨度/.test(value)) || !(hasContext || /课|放学|下完课|(?:下|上|这|那|第一|最后一)(?:一)?(?:节|堂)/.test(value)))return {value}
  const start=/上课|开课|开讲|开始/.test(value),end=/下课|下完课|结束|放学/.test(value)
  const waiting=/还(?:有|要|需|得|剩)|剩下|剩余|再等|要等|距离|离/.test(value)
  const continuing=new RegExp(`还(?:要|需(?:要)?|得|能)?(?:继续)?(?:上|持续)(?=${durationSource})`,'g')
  const remainingSpan=new RegExp(continuing.source).test(value)
  const origin=previous?.focusOrigin || previous?.selection
  if(remainingSpan && origin!=='CURRENT' && !/现在|此刻|当前|正在/.test(value))
    return {value,clarification:'要查当前这节距离下课多久，还是课程的完整起止时长？请先定位当前课程；不会把全天多门课的剩余授课时间合成一个猜测值。'}
  const fullSpan=!waiting && (new RegExp(`(?:上|持续|时长|跨度)(?:要|了)?(?:${durationSource})`).test(value) ||
    /这(?:一)?(?:门|节|堂)|那(?:一)?(?:门|节|堂)|时长|跨度/.test(value) && !start && !end)
  if(start&&end)return {value,clarification:'要核对距离开课多久，还是距离下课多久？请先指定一个，不会自行丢掉另一项。'}
  let detail=remainingSpan?'WAIT_END':fullSpan?'DURATION':end?'WAIT_END':start?'WAIT_START':''
  if(!detail){
    if(/(?:下|第一)一?(?:节|堂)/.test(value))detail='WAIT_START'
    else if(/(?:最后一)(?:节|堂)/.test(value))detail='WAIT_END'
    else if(['WAIT_START','WAIT_END'].includes(previous?.detail))detail=previous.detail
    else if(!waiting && previous?.detail==='DURATION')detail='DURATION'
    else if(origin==='NEXT')detail='WAIT_START'
    else if(origin==='CURRENT')detail='WAIT_END'
    else return {value,clarification:'“多久”是指距离开始、距离结束，还是这节课的起止时长？请明确一个；不会把它当作课程名称。'}
  }
  const defaultSelection=detail==='WAIT_START'?'NEXT':detail==='WAIT_END'?/放学|下完课/.test(value)?'LAST':'CURRENT':null
  const normalized=value.replace(continuing,'').replace(waitingPrefix,'').replace(new RegExp(durationSource,'g'),'')
    .replace(/(?:距离|离)(?=上课|开课|开始|下课|结束|放学|下一|这(?:门|节))/g,'')
    .replace(/才(?:能)?(?=上课|下课|开课|开始|结束)/g,'')
    .replace(/开课|开讲/g,'上课').replace(/放学|下完课/g,'下课')
    .replace(/(?:持续|时长|跨度)/g,'')
  return {value:normalized,detail,defaultSelection,remainingSpan}
}
