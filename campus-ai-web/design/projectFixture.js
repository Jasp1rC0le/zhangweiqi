// Development-only in-memory adapter. No network requests or persistent writes.
const id = '11111111-1111-4111-8111-111111111111'
const content = {
  title: '市场调查课程报告 · 示例项目', track: 'business', deadline: '2026-10-15',
  brief: '说明问卷样本的来源与范围\n解释样本局限，避免扩大结论',
  manuscript: '课程报告（模拟材料）\n本次问卷来自课程练习中的模拟样本，共30份。\n以下数据仅用于设计验收，不是真实调查结果。',
  requirements: [
    { id: 'source', title: '说明问卷样本的来源与范围', sourceLine: 1, sourceQuote: '说明问卷样本的来源与范围', confirmed: true, done: true, evidence: '本次问卷来自课程练习中的模拟样本，共30份。', note: '' },
    { id: 'limits', title: '解释样本局限，避免扩大结论', sourceLine: 2, sourceQuote: '解释样本局限，避免扩大结论', confirmed: true, done: false, evidence: '', note: '下一步：补充样本偏差说明' },
  ],
}
const clone = value => JSON.parse(JSON.stringify(value))
export function createProjectFixture({reviewDraft=false}={}) {
  const project = { id, revision: 1, archived: false, updatedAt: '2026-09-23T16:00:00', content }
  const projects = new Map([[id, clone(project)]])
  const versions = new Map([[id, [clone(project)]]])
  const reviews = new Map()
  if(reviewDraft)reviews.set('33333333-3333-4333-8333-333333333333',{
    projectId:id,canReview:true,noteConcurrencyVersion:1,content:{...clone(content),manuscript:'',requirements:[]},
    entry:{id:'33333333-3333-4333-8333-333333333333',title:'课程报告 · 草稿验收邀请',revision:1,
      owner:'示例同学',recipient:'design-fixture',includesMaterial:false,includesData:false,reviewNote:'',expiresAt:'2030-01-01T18:00:00',revoked:false,expired:false},
  })
  let nextConflict = false
  return {
    conflictNextSave() { nextConflict = true },
    changeReviewNote(){for(const review of reviews.values())review.entry.reviewNote='另一页面已发送：补充问卷采集日期'},
    async adapter(config) {
      const segments = config.url.split('/').filter(Boolean)
      const current = projects.get(segments[2])
      const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
      const error = (message, status = 404) => { throw { response: { status, data: { message } }, config } }
      let data
      if (segments[1] === 'project-reviews') {
        if (segments.length === 2) data = [...reviews.values()].filter(r=>!r.entry.revoked).map(r=>r.entry)
        else {
          const review=reviews.get(segments[2]);if(!review||review.entry.revoked)error('示例审阅已撤销')
          if(config.method==='put'){
            if(typeof body.baseNote!=='string')error('缺少原意见',400)
            if(review.entry.reviewNote!==body.note.trim()&&review.entry.reviewNote!==body.baseNote)error('审阅意见已在其他页面更新。当前草稿未发送，请核对最新意见后再编辑',409)
            review.entry.reviewNote=body.note.trim();data=null
          }else data=review
        }
      }
      else if (segments[3] === 'reviews') {
        if(!current)error('示例项目不存在')
        if(config.method==='get')data=[...reviews.values()].filter(r=>r.projectId===current.id).map(r=>r.entry)
        else if(config.method==='post') {
          const source=clone(versions.get(current.id).find(v=>v.revision===body.revision)?.content);if(!source)error('示例版本不存在')
          source.requirements=source.requirements.map(r=>({...r,note:'',evidence:body.includeMaterial?r.evidence:''}));source.reviewFeedback=null
          if(!body.includeMaterial)source.manuscript='';if(!body.includeData)source.dataSheet=null
          const entry={id:body.requestId,title:source.title,revision:body.revision,owner:'design-fixture',recipient:body.recipient,includesMaterial:body.includeMaterial,includesData:body.includeData,reviewNote:'',expiresAt:'2026-09-30T18:00:00',revoked:false,expired:false}
          reviews.set(entry.id,{projectId:current.id,entry,content:source,canReview:true,noteConcurrencyVersion:1});data=entry
        } else if(config.method==='delete') { const review=reviews.get(segments[4]);if(!review)error('示例审阅不存在');review.entry.revoked=true;review.entry.reviewNote='';review.content=null;data=null }
      }
      else if (config.method === 'get' && segments[2] === 'capabilities') data = { dataSheetVersion: 1, reviewFeedbackVersion: 1, calculationVersion: 1 }
      else if (config.method === 'get' && segments.length === 2) data = [...projects.values()].map(p => ({ id: p.id, title: p.content.title, track: p.content.track, revision: p.revision, archived: p.archived, updatedAt: p.updatedAt }))
      else if (config.method === 'post') {
        if (projects.has(body.id)) data = projects.get(body.id)
        else { data = { id: body.id, revision: 1, archived: false, updatedAt: new Date().toISOString(), content: body.content }; projects.set(body.id, clone(data)); versions.set(body.id, [clone(data)]) }
      } else if (!current) error('示例项目不存在')
      else if (config.method === 'put') {
        if (nextConflict) { nextConflict = false; error('模拟并发冲突：项目已在另一页面更新。请先导出当前草稿，再重新加载项目', 409) }
        if (body.revision !== current.revision) error('示例版本冲突', 409)
        data = { ...current, ...body, revision: current.revision + 1, updatedAt: new Date().toISOString() }
        projects.set(current.id, clone(data)); versions.get(current.id).unshift(clone(data))
      } else if (config.method === 'delete') { projects.delete(current.id); versions.delete(current.id); data = null }
      else if (segments[3] === 'versions') {
        data = segments[4] ? versions.get(current.id).find(v => v.revision === Number(segments[4]))?.content
          : versions.get(current.id).map(v => ({ revision: v.revision, createdAt: v.updatedAt }))
        if (!data) error('示例版本不存在')
      } else data = current
      return { data: clone(data), status: 200, statusText: 'OK', headers: {}, config }
    },
  }
}
