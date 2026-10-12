// Isolated development data. Not imported by the production application.
export function createWallFixture(){
  const entries=new Map([
    ['22222222-2222-4222-8222-222222222222',{id:'22222222-2222-4222-8222-222222222222',parentId:null,category:'experiment',title:'示例 · 示波器波形不稳，怎样理解触发？',body:'这是界面验收用的虚构主题，不是本校学生真实发言。已经记录了设备型号和设置，想弄懂触发这一节的原理。',status:'PUBLISHED',revision:1,mine:false,likes:4,liked:false,replies:0,reviewNote:'',createdAt:'2026-09-24T08:00:00'}],
    ['33333333-3333-4333-8333-333333333333',{id:'33333333-3333-4333-8333-333333333333',parentId:null,category:'team',title:'示例 · 数学建模练习，找一起复盘的同学',body:'仅用于检查列表长短文排版，不是招募信息。希望先一起复盘一道往年赛题。',status:'PUBLISHED',revision:1,mine:false,likes:2,liked:false,replies:0,reviewNote:'',createdAt:'2026-09-23T19:00:00'}],
    ['44444444-4444-4444-8444-444444444444',{id:'44444444-4444-4444-8444-444444444444',parentId:null,category:'course',title:'待审核示例 · 如何记录实验中的异常读数',body:'仅用于验证审核流程的虚构主题，不是真实学生发言。希望先记录现象，再对照教师材料核查。',status:'PENDING',revision:1,mine:true,likes:0,liked:false,replies:0,reviewNote:'',createdAt:'2026-09-24T09:00:00'}],
  ])
  const reports=[]
  return {async adapter(config){
    const body=typeof config.data==='string'?JSON.parse(config.data):config.data, s=config.url.split('/').filter(Boolean),admin=s[1]==='admin',id=s[admin?3:2],entry=entries.get(id), params=config.params||{}
    const error=(message,status=404)=>{throw{response:{status,data:{message}},config}}
    const page=items=>({items:items.slice(params.offset||0,(params.offset||0)+30),more:false,nextOffset:(params.offset||0)+30})
    let data
    if(admin){if(id==='reports')data=reports;else if(config.method==='get')data=id?entry:[...entries.values()].filter(e=>e.status==='PENDING'||reports.some(r=>r.entryId===e.id));else{if(!entry)error('示例不存在');if(body.revision!==entry.revision)error('审核状态已变化',409);Object.assign(entry,{status:body.status,reviewNote:body.note,revision:entry.revision+1});data=null}}
    else if(!id && config.method==='get')data=page([...entries.values()].filter(e=>!e.parentId&&(params.mine?e.mine:e.status==='PUBLISHED')&&(!params.category||params.category===e.category)))
    else if(!id && config.method==='post'){data={...body,parentId:null,status:'PENDING',mine:true,likes:0,liked:false,replies:0,revision:1,createdAt:new Date().toISOString()};entries.set(data.id,data)}
    else {if(!entry)error('示例不存在');if(s[3]==='comments'){if(config.method==='get')data=page([...entries.values()].filter(e=>e.parentId===id));else{data={...body,parentId:id,title:'回复',category:'campus',status:'PENDING',mine:true,likes:0,liked:false,revision:1,createdAt:new Date().toISOString()};entries.set(data.id,data)}}else if(s[3]==='like'){entry.likes+=body.liked&&!entry.liked?1:!body.liked&&entry.liked?-1:0;entry.liked=body.liked;data=null}else if(s[3]==='report'){reports.push({entryId:id,reason:body.reason,count:1});data=null}else if(config.method==='delete'){entries.delete(id);for(const [key,e] of entries)if(e.parentId===id)entries.delete(key);data=null}else data=entry}
    return{data:structuredClone(data),status:200,statusText:'OK',headers:{},config}
  }}
}
