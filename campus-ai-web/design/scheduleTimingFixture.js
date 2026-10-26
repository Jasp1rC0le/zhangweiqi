// DEV mirror of the server's deterministic timing projection. Never used to
// recalculate a production answer from the user's browser clock.
export function fixtureScheduleTiming(query,rows,asOf,unknownTimes=0) {
  if(!['WAIT_START','WAIT_END','DURATION'].includes(query.detail))return null
  const now=Date.parse(asOf)
  const clock=new Date(now+8*3600000).toISOString().slice(0,19).replace('T',' ')
  const notice=query.detail==='DURATION'?'按起止钟点计算；如有课间一并计入，不等于有效授课分钟或课时。':`按${clock}（北京时间）核算；不会自动刷新。`
  if(!rows.length)return {summary:'',notice}
  const start=row=>Date.parse(`${row.date}T${row.startTime}+08:00`)
  const end=row=>Date.parse(`${row.date}T${row.endTime}+08:00`)
  if(rows.some(row=>!Number.isFinite(start(row))||!Number.isFinite(end(row))||end(row)<=start(row)))
    return {summary:'匹配安排的起止钟点无效，请先核对；没有计算猜测的时长。',notice}
  if(query.detail==='DURATION'&&unknownTimes>0&&query.selection==='ALL')return {summary:`有${unknownTimes}项安排的钟点待核对，暂不计算完整时长。`,notice}
  const span=seconds=>{
    const absolute=Math.abs(seconds)
    if(!absolute)return '0分钟'
    if(absolute<60)return '不到1分钟'
    const minutes=Math.ceil(absolute/60),days=Math.floor(minutes/1440),hours=Math.floor(minutes%1440/60),rest=minutes%60
    return `${days?days+'天':''}${hours?hours+'小时':''}${rest?rest+'分钟':''}`
  }
  if(query.detail==='DURATION'){
    if(new Set(rows.map(row=>`${start(row)}|${end(row)}`)).size>1)
      return {summary:'匹配到不同钟点的安排，请指定一节核对时长；不会把重叠或跨日时段直接相加。',notice}
    return {summary:`${rows.length>1?'这些同时段安排每项的计划起止跨度为':'计划起止跨度为'}${span((end(rows[0])-start(rows[0]))/1000)}。`,notice}
  }
  const begin=query.detail==='WAIT_START',points=[...new Set(rows.map(row=>begin?start(row):end(row)))]
  const label=begin?'开始':'结束'
  if(points.length!==1)return {summary:`匹配到多个不同${label}时间，请先指定一节；不会给出一个猜测的剩余时间。`,notice}
  const seconds=Math.floor((points[0]-now)/1000),prefix=!begin&&rows.every(row=>now<start(row))?'尚未到计划开始时间；':''
  return {summary:prefix+(seconds===0?`已到计划${label}时间。`:seconds>0?`距离计划${label}还有${span(seconds)}。`:`已过计划${label}时间${span(seconds)}。`),notice}
}
