// Extract a contiguous noun span before the main parser consumes grammar words.
// It is still only a name hint: the existing authorized query resolves exact
// saved names first. No course-name dictionary or database scan is used here.
const location='(?:在|去|到)(?:哪(?:一?[个间])?(?:教室|教学楼|地方|里|儿)?|什么地方)(?:上(?:课)?)?'
const teacher='(?:谁(?:来)?(?:教|上(?:课)?|讲)|(?:任课)?(?:老师|教师)(?:是)?谁)'
const clock='(?:几点(?:钟)?|什么时候|何时)(?:开始|结束|上课|下课|上|下)'
const duration='(?:上多久|上多长时间|起止时间)'
const count='(?:有)?(?:多少(?:门|节|堂)(?:课)?|几(?:门|节|堂)(?:课)?)'
const suffix=new RegExp(`(?:的)?(?:${location}|${teacher}|${clock}|${duration}|${count})(?:呢|吗|呀|啊|来着|吧)?$`)
const genericWords=/所有|全部|一共|总共|课程安排|课程|课表|上课|下课|什么课|哪些课|啥课|有课|有没有|是否|什么|哪些|谁|需要|应该|这门|那门|这节|那节|几门|几节|教室|老师|教师|[我要上有的呢吗么没呀啊课是都还]/g
const nonEntity=/^(?:我(?:需要|应该|要|想)|这(?:一)?[门节堂]|那(?:一)?[门节堂]|什么|哪些|有没有|是否)|怎么|怎样|如何|为何|取消|停课|调课|早八|晚八/

export function protectScheduleCoursePhrase(value,{timeExpression,periodExpressions,selectionExpressions,requestPrefix,hasContext=false}){
  if(typeof value!=='string'||value.length>300)return null
  const calendarStart=new RegExp(`^(?:${timeExpression.source}|${periodExpressions.map(([,r])=>r.source).join('|')})`)
  const calendarEnd=new RegExp(`(?:${timeExpression.source}|${periodExpressions.map(([,r])=>r.source).join('|')})$`)
  let head=value.match(requestPrefix)?.[0]||'',body=value.slice(head.length),dated=false
  for(let i=0;i<12;i++){
    const slot=body.match(calendarStart)?.[0]
    if(!slot)break
    dated=true;head+=slot;body=body.slice(slot.length)
    // A connector is grammar only when it leads straight into another date.
    if(/^[到至—]/.test(body)&&calendarStart.test(body.slice(1))){head+=body[0];body=body.slice(1)}
  }
  if(dated&&body.startsWith('的')){head+='的';body=body.slice(1)}
  const container=body.match(/^(?:我的|本人的|个人的)?课表(?:里面?|中)?(?:有没有|是否有|有|查|看)/)?.[0]
  if(container){head+=container;body=body.slice(container.length)}
  const existence=dated&&body.match(/^(?:有没有|是否有)/)?.[0]
  if(existence){head+=existence;body=body.slice(existence.length)}
  const question=body.match(suffix)?.[0]||''
  if(question)body=body.slice(0,-question.length)
  let trailing=''
  for(let i=0;i<12;i++){
    const slot=body.match(calendarEnd)?.[0]
    if(!slot)break
    dated=true;trailing=slot+trailing;body=body.slice(0,-slot.length)
  }
  const simpleNoun=dated&&/课/.test(body)&&!new RegExp(timeExpression.source).test(body)&&
    !/(?:什么|哪些|哪|谁|需要|应该|(?:不)?用去|上课|下课|多久|多长|之前|以后|之后|以前|现在|还有|剩下|^和|^与)/.test(body)&&
    !selectionExpressions.some(([,r])=>new RegExp(r.source).test(body))&&
    !periodExpressions.some(([,r])=>new RegExp(r.source).test(body))
  if(!(dated||hasContext||container)||!(question||container||existence||simpleNoun))return null
  if(!body||nonEntity.test(body)||!body.replace(genericWords,''))return null
  if(selectionExpressions.some(([,r])=>new RegExp(`^(?:${r.source})$`).test(body)))return null
  if(!/^[\p{L}\p{N}·+#()（）-]{2,100}$/u.test(body))return {ambiguous:true}
  return {name:body,value:head+trailing+question}
}
