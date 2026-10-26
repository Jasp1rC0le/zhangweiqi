// Development-only memory backend, never sends requests to a real API.
export function createAdminFixture({schoolId=-1}={}) {
  let failRead = false, failPublish = false, failReadAfterPublish = false
  let id = 120
  const documents = [
    { id:111, title:'图书馆开放时间（验收示例）', category:'校园事务', sourceDepartment:'示例资料', status:'PUBLISHED', versionNumber:1, rawContent:'这是一份虚构的资料，仅供编辑流程验收。\n实际开放时间须以学校通知为准。', sourceUrl:'https://example.invalid/library', publishedAt:'2026-10-09T09:00:00' },
    { id:112, title:'实验室使用流程（验收示例）', category:'实验教学', sourceDepartment:'示例学院', status:'PUBLISHED', versionNumber:2, rawContent:'验收用虚构正文，不构成仪器操作规程。', sourceUrl:'', expiresAt:'2026-12-31T23:59:00' },
    { id:113, title:'图书馆历史通知（验收示例）', category:'校园事务', sourceDepartment:'示例资料', status:'ARCHIVED', versionNumber:1, rawContent:'已下架的模拟历史通知', hasSuccessor:true },
  ]
  for(const doc of documents)Object.assign(doc,{schoolId,effectiveAt:null,expiresAt:null,hasSuccessor:false,...doc,revisionTag:doc.id.toString(16).padStart(64,'0')})
  const clone = value => structuredClone(value)
  function error(message, status = 503) { throw { response: { status, data: { message } } } }
  return {
    failPublication: () => { failPublish = true },
    failNextList: () => { failReadAfterPublish = true },
    restore: () => { failRead = false; failPublish = false; failReadAfterPublish = false },
    async adapter(config) {
      const root = '/api/admin/knowledge/documents'
      if (!config.url.startsWith(root)) return null
      const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
      const segments = config.url.slice(root.length).split('/').filter(Boolean)
      let data
      if(config.method==='get'&&segments[0]==='page') {
        const {page=0,size=25,search=''}=config.params||{},filtered=documents.filter(d=>d.status==='PUBLISHED'&&!d.hasSuccessor&&(d.title.includes(search)||d.category.includes(search))),total=filtered.length,totalPages=Math.ceil(total/size)
        if(!Number.isInteger(page)||page<0||size!==25||(page>0&&page>=totalPages))error('模拟知识页码无效',400)
        data={items:filtered.slice(page*size,(page+1)*size).map(d=>({id:d.id,title:d.title,category:d.category})),page,size,total,totalPages,search}
      } else if(config.method==='get'&&segments[0]==='scan'){
        data=clone(documents.filter(d=>!config.params?.beforeId||d.id<config.params.beforeId).sort((a,b)=>b.id-a.id).slice(0,100))
      } else if (config.method === 'get' && !segments.length) {
        if (failRead) error('模拟资料列表读取失败')
        data = clone(documents)
      } else if (config.method === 'get') {
        const doc = documents.find(item => item.id === Number(segments[0]))
        if (!doc) error('模拟资料不存在', 404)
        data = segments[1] === 'versions' ? [clone(doc)] : clone(doc)
      } else if (config.method === 'post' && (!segments.length || segments[1] === 'revisions')) {
        if (failPublish) error('模拟发布失败，编辑内容已保留')
        const old = documents.find(item => item.id === Number(segments[0]))
        if (segments.length && (!old || old.status !== 'PUBLISHED')) error('资料已变化，请核对最新版本', 409)
        if(old&&body.expectedRevisionTag&&body.expectedRevisionTag!==old.revisionTag)error('预览版本已变化',409)
        if (old) { old.status = 'ARCHIVED'; old.hasSuccessor = true }
        const next = { ...body, schoolId,id:++id, status:'PUBLISHED',hasSuccessor:false,revisionTag:id.toString(16).padStart(64,'0'), rawContent:body.content, versionNumber:old ? old.versionNumber + 1 : 1 }
        documents.unshift(next)
        data = { documentId:next.id, chunkCount:1, duplicate:false }
        if (failReadAfterPublish) failRead = true
      } else return null
      return { data, status:200, statusText:'OK', headers:{}, config }
    },
  }
}
