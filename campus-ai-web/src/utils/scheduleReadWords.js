// Bounded lexical handling for the read task itself, not course data or writes.
const cancelTokens=[
  ['不用查',true],['不要查',true],['不必查',true],['别查',true],['不查',true],['取消',true],['算了',true],
  ['那就',false],['这次',false],['这个',false],['查询',false],['问题',false],['谢谢',false],
  ['我',false],['请',false],['先',false],['想',false],['要',false],['那',false],['就',false],['吧',false],['了',false],
]
export function isScheduleReadCancellation(value){
  if(typeof value!=='string'||!value||value.length>300)return false
  const text=value.replace(/、/g,'')
  let at=0,cancelled=false
  while(at<text.length){
    const token=cancelTokens.find(([word])=>text.startsWith(word,at))
    if(!token)return false
    at+=token[0].length;cancelled ||= token[1]
  }
  return cancelled
}

const modifiers=['现在','马上','立刻','先','只','仅','就']
const commands=[
  ['我想知道',true],['我想了解',true],['我想看',true],['我想查',true],['告诉我',true],
  ['查一下',true],['看一下',true],['问一下',true],['查询',true],['查看',true],['看看',true],['查查',true],
  ['帮我',false],['请问',true],['请',false],['我',false],['查',true],['看',true],['问',true],['要',false],
]
export function stripScheduleReadModifiers(value,{prefixLength=0,scopeStart,literalCourse=false}){
  let head=value.slice(0,prefixLength),tail=value.slice(prefixLength)
  if(tail.startsWith('课表')){head+='课表';tail=tail.slice(2)}
  let at=0,count=0,temporal=false
  for(;count<8;count++){
    const word=modifiers.find(word=>tail.startsWith(word,at))
    if(!word)break
    temporal ||= ['现在','马上','立刻'].includes(word)
    at+=word.length
  }
  if(!count)return value
  let read=false
  for(let i=0;i<8;i++){
    const command=commands.find(([word])=>tail.startsWith(word,at))
    if(!command)break
    read ||= command[1];at+=command[0].length
  }
  const rest=tail.slice(at)
  if(temporal&&!read)return value // “现在上什么课” is a target clock, not a request prefix.
  const explicitObject=read&&/^(?:(?:我(?:本人)?|本人|个人)的?)?(?:课表|课程|课)/.test(rest)
  if(!literalCourse&&!explicitObject&&!scopeStart.test(rest))return value
  return head+rest
}
