// DEV-only stateful simulation. Never installed in the production application.
export function createResponsibilityFixture({enabled,actor,actors,classes,grants,approved,time,audit,fail}){
  const versions=new Map(),receipts=new Map(),key=(user,role)=>`${user}:${role}`
  for(const g of grants)versions.set(key(g.userId,g.viewRole),0)
  const label=(role,scope)=>role==='SECRETARY'?scope:classes.find(c=>c.id===scope)?`${classes.find(c=>c.id===scope).college} · ${classes.find(c=>c.id===scope).name}`:`${scope}（原范围定义已不存在，可撤销）`
  function target(user,role,scope){
    const account=actors.find(a=>a.id===Number(user)&&a.schoolId===actor().schoolId)
    if(!account)fail(404,'模拟账号不存在或不在本校')
    if(!['COUNSELOR','SECRETARY'].includes(role))fail(400,'模拟负责身份无效')
    const base={userId:account.id,account:`${account.username} · ${account.nickname}`,viewRole:role,revision:versions.get(key(account.id,role))||0}
    if(scope===undefined)return base
    const active=grants.some(g=>g.userId===account.id&&g.viewRole===role&&g.scopeKey===scope)
    if(typeof scope!=='string'||!scope||scope.length>100||!active&&!(role==='COUNSELOR'?classes.some(c=>c.id===scope):classes.some(c=>c.college===scope)))fail(404,'模拟范围不存在')
    return{...base,scopeKey:scope,scopeLabel:label(role,scope),active,eligible:approved(account.id,role),baselineNote:'模拟迁移基线；不推断原始授权人和时间。'}
  }
  return(config,data,reply)=>{
    const prefix='/api/admin/teaching/responsibilities'
    if(!config.url.startsWith(prefix))return
    if(actor().role!=='ADMIN')fail(403,'需要本校正常模拟管理员')
    if(config.url===prefix+'/access')return reply({enabled,maxPageSize:100,reasonRequired:true})
    if(!enabled)fail(503,'模拟受控范围尚未启用')
    if(config.method==='get'&&config.url===prefix+'/check'){const q=config.params||{};return reply(target(q.userId,q.viewRole,q.scopeKey))}
    if(config.method==='get'&&config.url===prefix+'/page'){
      const q=config.params||{},t=target(q.userId,q.viewRole),page=Number(q.page||0),size=Number(q.size||25),all=grants.filter(g=>g.userId===t.userId&&g.viewRole===t.viewRole).sort((a,b)=>a.scopeKey.localeCompare(b.scopeKey)),pages=Math.ceil(all.length/size)
      if(!Number.isInteger(page)||page<0||size<1||size>100||!Number.isInteger(size)||page>0&&page>=pages)fail(409,'模拟范围页码已变化')
      return reply({...t,items:all.slice(page*size,(page+1)*size).map(g=>({scopeKey:g.scopeKey,scopeLabel:label(g.viewRole,g.scopeKey),revision:t.revision})),page,size,total:all.length,totalPages:pages})
    }
    if(config.method==='get'&&config.url.startsWith(prefix+'/requests/')){const saved=receipts.get(config.url.slice((prefix+'/requests/').length));if(!saved||saved.value.actorId!==actor().id)fail(404,'模拟回执尚未查到');return reply(structuredClone(saved.value))}
    if(config.url!==prefix+'/change'||config.method!=='post')fail(405,'模拟负责范围入口无效')
    if(!data||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(data.requestId||'')||!Number.isSafeInteger(data.revision)||data.revision<0||data.revision>=2147483647||!['GRANT','REVOKE'].includes(data.action)||typeof data.reason!=='string'||!data.reason.trim()||data.reason.length>300||[...data.reason].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)>=127&&c.charCodeAt(0)<=159))fail(400,'模拟变更原因、版本或请求编号无效')
    const fingerprint=JSON.stringify([actor().id,data.userId,data.viewRole,data.scopeKey,data.revision,data.action,data.reason]),saved=receipts.get(data.requestId)
    if(saved){if(saved.fingerprint!==fingerprint)fail(409,'模拟请求内容已变化');return reply(structuredClone(saved.value))}
    const t=target(data.userId,data.viewRole,data.scopeKey),after=data.action==='GRANT'
    if(t.revision!==data.revision||t.active===after)fail(409,'模拟负责范围已变化，不冒认保存成功')
    if(after&&!t.eligible)fail(403,'先审核通过对应教学身份')
    const entry=grants.findIndex(g=>g.userId===t.userId&&g.viewRole===t.viewRole&&g.scopeKey===t.scopeKey)
    if(after)grants.push({userId:t.userId,viewRole:t.viewRole,scopeKey:t.scopeKey})
    else grants.splice(entry,1)
    versions.set(key(t.userId,t.viewRole),t.revision+1)
    const value={requestId:data.requestId,actorId:actor().id,userId:t.userId,viewRole:t.viewRole,scopeKey:t.scopeKey,scopeLabel:t.scopeLabel,action:data.action,oldActive:t.active,newActive:after,oldRevision:t.revision,revision:t.revision+1,reason:data.reason,recordedAt:new Date(time()).toISOString()}
    receipts.set(data.requestId,{fingerprint,value})
    audit.push({...value,targetLabel:t.account,actorLabel:`${actor().username} · ${actor().nickname}`,at:time()})
    return reply(structuredClone(value))
  }
}
