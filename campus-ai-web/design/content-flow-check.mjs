import { createRequire } from 'node:module'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { chromium } = require(require.resolve('playwright', { paths: ['/Users/zhangweiqi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'] }))
const output = await mkdtemp(path.join(tmpdir(), 'campthink-content-flow-'))
const browser = await chromium.launch({headless:true,channel:'chrome'})
const page = await browser.newPage({viewport:{width:1440,height:1000}})
page.setDefaultTimeout(12000)
const errors=[],passed=[],counts={},submitted=[]
const state={listFails:true,historyFails:true,reviewListFails:true,reviewSaveFails:true,postFails:true,replyFails:true,delay:600}
let acceptLeave=false
page.on('pageerror',e=>errors.push(e.message))
page.on('dialog',d=>acceptLeave?d.accept():d.dismiss())
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const entry=(id='topic',category='course')=>({id,category,title:category==='experiment'?'实验主题':'课程主题',body:'隔离浏览器中的测试内容，不会写入真实校园墙',status:'PUBLISHED',createdAt:'2026-10-01T10:00:00',mine:false,likes:0,liked:false,replies:1})
// Intercept all API calls, including writes; never use real accounts or a live database.
await page.route(url=>url.pathname.startsWith('/api/'),async route=>{
  const request=route.request(),url=new URL(request.url()),key=request.method()+' '+url.pathname
  counts[key]=(counts[key]||0)+1
  const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)})
  const fail=()=>json({message:'模拟网络故障，原文仍在'},503)
  if(url.pathname==='/api/auth/refresh')return json({token:'isolated-fixture'})
  if(url.pathname==='/api/auth/me')return json({id:-991,username:'fixture',nickname:'验收同学',schoolId:1,role:'STUDENT'})
  if(url.pathname==='/api/models')return json([{key:'standard',name:'问答',available:true}])
  if(url.pathname==='/api/schools')return json([{id:1,name:'天津中德应用技术大学'}])
  if(url.pathname==='/api/ai/quota')return json({limit:20000,remaining:18000,unit:'tokens'})
  if(url.pathname==='/api/conversations')return state.listFails?fail():json([{id:11,title:'第一次实验',model:'standard'},{id:12,title:'第二次实验',model:'standard'}])
  if(/^\/api\/conversations\/\d+\/messages$/.test(url.pathname)){
    await pause(state.delay)
    if(state.historyFails)return fail()
    return json([{id:100,role:'user',content:'历史问题'},{id:101,role:'assistant',content:'这是已读取的历史回答',sources:[],webSources:[]}])
  }
  if(url.pathname==='/api/project-reviews')return state.reviewListFails?fail():json([{id:'review-fixture',title:'隔离验收报告',owner:'同校伙伴',revision:1,reviewNote:''}])
  if(url.pathname==='/api/project-reviews/review-fixture'){
    if(request.method()==='GET')return json({entry:{id:'review-fixture',title:'隔离验收报告',owner:'同校伙伴',revision:1,expiresAt:'2026-11-01T00:00:00',includesMaterial:false,includesData:false,reviewNote:''},content:{brief:'检查说明是否完整',requirements:[]},canReview:true})
    submitted.push({kind:'review',body:request.postDataJSON()})
    await pause(state.delay)
    return state.reviewSaveFails?fail():json({})
  }
  if(url.pathname==='/api/wall'&&request.method()==='GET'){
    const category=url.searchParams.get('category')||'course'
    await pause(category==='experiment'?850:100)
    return json({items:[entry('topic',category)],more:false,nextOffset:30})
  }
  if(url.pathname==='/api/wall'&&request.method()==='POST'){
    submitted.push({kind:'post',body:request.postDataJSON()})
    await pause(state.delay)
    return state.postFails?fail():json({...entry('created'),...request.postDataJSON(),status:'PENDING',mine:true})
  }
  if(url.pathname.endsWith('/comments')){
    if(request.method()==='GET')return json({items:[{...entry('comment'),'parentId':'topic',title:'',body:'已经核对的做法'}],more:false,nextOffset:30})
    submitted.push({kind:'reply',body:request.postDataJSON()})
    await pause(state.delay)
    return state.replyFails?fail():json({...entry(request.postDataJSON().id),parentId:'topic',body:request.postDataJSON().body,status:'PENDING',mine:true})
  }
  if(url.pathname.endsWith('/report')){submitted.push({kind:'report',id:url.pathname,body:request.postDataJSON()});await pause(state.delay);return json({})}
  if(url.pathname.startsWith('/api/wall/'))return json(entry(url.pathname.split('/').at(-1)))
  return json([])
})
const check=name=>passed.push(name)
async function nav(label){
  if(page.viewportSize().width<760)await page.getByRole('button',{name:'打开菜单',exact:true}).click()
  await page.locator('.sidebar').getByRole('button',{name:label,exact:true}).click()
}
async function capture(name){
  await page.screenshot({path:path.join(output,name+'.png')})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name+' overflow')
}
try{
  await page.goto('http://127.0.0.1:5173/chat')
  await page.getByRole('button',{name:'重新读取列表'}).waitFor()
  assert.equal(await page.getByText('还没有历史对话',{exact:true}).count(),0)
  state.listFails=false
  await page.getByRole('button',{name:'重新读取列表'}).click()
  await page.getByRole('button',{name:'第一次实验',exact:true}).waitFor()
  check('history-list failure is not empty state; retry succeeds')
  await page.getByRole('textbox',{name:'输入消息'}).fill('新对话原草稿')
  await page.getByRole('button',{name:'第一次实验',exact:true}).click()
  assert.equal(await page.getByRole('button',{name:'删除对话：第一次实验'}).isDisabled(),true)
  await page.getByRole('heading',{name:'这段对话还没打开'}).waitFor()
  await page.getByRole('textbox',{name:'输入消息'}).fill('历史对话待发送草稿')
  assert.equal(await page.getByRole('button',{name:'发送',exact:true}).isDisabled(),true)
  await capture('history-recovery-desktop')
  const historyCalls=counts['GET /api/conversations/11/messages']
  await page.getByRole('button',{name:'第一次实验',exact:true}).click()
  await page.getByRole('heading',{name:'这段对话还没打开'}).waitFor()
  assert.equal(counts['GET /api/conversations/11/messages'],historyCalls+1)
  check('failed same conversation can retry; history failure blocks sending, not drafting')
  state.historyFails=false
  await page.getByRole('button',{name:'重新读取对话'}).click()
  await page.getByText('这是已读取的历史回答',{exact:true}).waitFor()
  assert.equal(await page.getByRole('textbox',{name:'输入消息'}).inputValue(),'历史对话待发送草稿')
  assert.equal(await page.getByRole('button',{name:'发送',exact:true}).isEnabled(),true)
  check('successful history retry restores context and retains draft')
  await nav('收到的审阅')
  await page.getByRole('button',{name:'重新加载',exact:true}).waitFor()
  assert.equal(await page.getByText(/暂时没有邀请/).count(),0)
  state.reviewListFails=false
  await page.getByRole('button',{name:'重新加载',exact:true}).click()
  await page.getByRole('link',{name:/隔离验收报告/}).click()
  await page.locator('#review-note').fill('第2项需要补充原始实验数据来源')
  await page.getByRole('button',{name:'发送审阅意见',exact:true}).click()
  await page.locator('.review-content form').evaluate(form=>form.requestSubmit())
  assert.equal(await page.locator('#review-note').isDisabled(),true)
  await page.getByRole('alert').filter({hasText:'模拟网络故障'}).waitFor()
  assert.equal(counts['PUT /api/project-reviews/review-fixture'],1)
  assert.equal(await page.locator('#review-note').inputValue(),'第2项需要补充原始实验数据来源')
  await capture('review-save-error-desktop')
  check('review loading failure differs from no invitations; submission locks inputs and preserves failure draft')
  state.reviewSaveFails=false
  await page.getByRole('button',{name:'发送审阅意见',exact:true}).click()
  await page.getByText('审阅意见已发送给项目所有者，不会修改原项目',{exact:true}).waitFor()
  assert.equal(await page.getByRole('button',{name:'发送审阅意见',exact:true}).isDisabled(),true)
  await page.locator('#review-note').fill('新补充的审阅意见尚未发送')
  assert.equal(await page.getByText('审阅意见已发送给项目所有者，不会修改原项目',{exact:true}).count(),0)
  await nav('校园墙')
  assert.ok(page.url().includes('/reviews/'))
  check('only confirmed review text marked sent; later edits clear success and prevent accidental leave')
  acceptLeave=true
  await nav('校园墙')
  await page.getByRole('heading',{name:'课程主题',exact:true}).waitFor()
  await page.getByRole('button',{name:'实验求助',exact:true}).click()
  await page.getByText('正在读取校园墙…',{exact:true}).waitFor()
  assert.equal(await page.getByRole('heading',{name:'课程主题',exact:true}).count(),0)
  await page.getByRole('button',{name:'专业课',exact:true}).click()
  await page.getByRole('heading',{name:'课程主题',exact:true}).waitFor()
  await pause(900)
  assert.equal(await page.getByRole('heading',{name:'实验主题',exact:true}).count(),0)
  check('rapid category switching cannot relabel old results or apply stale responses')
  await page.getByRole('button',{name:'发布主题',exact:true}).click()
  await page.getByRole('textbox',{name:'标题',exact:true}).fill('   ')
  await page.getByRole('textbox',{name:'具体内容',exact:true}).fill('只有标题为空的测试')
  await page.getByRole('button',{name:'提交审核',exact:true}).click()
  await page.getByRole('alert').filter({hasText:'不能只填空格'}).waitFor()
  assert.equal(counts['POST /api/wall']||0,0)
  await page.getByRole('textbox',{name:'标题',exact:true}).fill('隔离主题不上传')
  await page.getByRole('button',{name:'提交审核',exact:true}).click()
  await page.locator('form').first().evaluate(form=>form.requestSubmit())
  assert.equal(await page.getByRole('textbox',{name:'具体内容',exact:true}).isDisabled(),true)
  assert.equal(await page.getByRole('button',{name:'收起草稿',exact:true}).isDisabled(),true)
  await page.getByRole('alert').filter({hasText:'模拟网络故障'}).waitFor()
  assert.equal(counts['POST /api/wall'],1)
  assert.equal(await page.getByRole('textbox',{name:'标题',exact:true}).inputValue(),'隔离主题不上传')
  check('wall rejects whitespace; pending post locks fields; duplicate submit ignored and failure retains draft')
  await page.getByRole('textbox',{name:'标题',exact:true}).fill('')
  await page.getByRole('textbox',{name:'具体内容',exact:true}).fill('')
  await page.getByRole('button',{name:'收起草稿',exact:true}).click()
  await page.getByRole('link',{name:/课程主题/}).click()
  await page.getByRole('textbox',{name:'回复这个主题'}).fill('测试回复，未写入任何真实数据库')
  await page.getByRole('button',{name:'提交回复审核',exact:true}).click()
  assert.equal(await page.getByRole('textbox',{name:'回复这个主题'}).isDisabled(),true)
  assert.equal(await page.getByRole('button',{name:'返回全部主题',exact:true}).isDisabled(),true)
  await page.getByRole('alert').filter({hasText:'模拟网络故障'}).waitFor()
  state.replyFails=false
  await page.getByRole('button',{name:'提交回复审核',exact:true}).click()
  await page.getByText('回复已提交审核，暂时仅自己可见',{exact:true}).waitFor()
  assert.equal(await page.getByRole('textbox',{name:'回复这个主题'}).inputValue(),'')
  const replySubmissions=submitted.filter(row=>row.kind==='reply')
  assert.equal(replySubmissions[0].body.id,replySubmissions[1].body.id)
  check('failed reply retries with same idempotency key, clears only after confirmed success')
  await page.setViewportSize({width:390,height:844})
  await page.getByRole('button',{name:'举报',exact:true}).first().click()
  await page.getByRole('combobox',{name:'原因',exact:true}).selectOption('内容不实')
  await page.getByRole('button',{name:'提交举报',exact:true}).click()
  assert.equal(await page.getByRole('combobox',{name:'原因',exact:true}).isDisabled(),true)
  assert.equal(await page.getByRole('button',{name:'取消',exact:true}).isDisabled(),true)
  assert.equal(await page.getByRole('button',{name:'举报',exact:true}).last().isDisabled(),true)
  await page.getByText('举报已送交本校管理员处理',{exact:true}).waitFor()
  assert.equal(submitted.find(row=>row.kind==='report').id,'/api/wall/topic/report')
  check('pending report cannot change target or reason')
  await page.getByRole('button',{name:'发布主题',exact:true}).click()
  await page.getByRole('textbox',{name:'标题',exact:true}).fill('手机端标题与草稿验收')
  await page.getByRole('textbox',{name:'具体内容',exact:true}).fill('保持原有设计，检查窄屏输入和按钮')
  await page.getByRole('textbox',{name:'标题',exact:true}).scrollIntoViewIfNeeded()
  await capture('wall-compose-mobile')
  await page.getByRole('button',{name:'收起草稿',exact:true}).click()
  await nav('校园助手')
  state.historyFails=true
  await page.getByRole('button',{name:'打开菜单',exact:true}).click()
  await page.getByRole('button',{name:'第二次实验',exact:true}).click()
  await page.getByRole('heading',{name:'这段对话还没打开'}).waitFor()
  await capture('history-recovery-mobile')
  check('390px wall composer and history recovery have no horizontal overflow')
  assert.deepEqual(errors,[])
}finally{
  await writeFile(path.join(output,'results.json'),JSON.stringify({passed,errors,counts},null,2))
  console.log(JSON.stringify({output,passed,errors,counts},null,2))
  await browser.close()
}
