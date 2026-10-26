import {createRequire} from 'node:module'
import {mkdtemp,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url)
const {chromium}=require(require.resolve('playwright',{paths:['/Users/zhangweiqi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']}))
const output=await mkdtemp(path.join(tmpdir(),'campthink-workspace-'))
const browser=await chromium.launch({headless:true,channel:'chrome'})
const errors=[],results=[]
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1})
page.on('pageerror',e=>errors.push(e.message))
page.on('dialog',d=>d.accept())
async function capture(name){await page.screenshot({path:path.join(output,`${name}.png`),fullPage:false});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false,`${name}: horizontal overflow`);results.push(name)}
try{
  await page.goto('http://localhost:5173/design-review.html?page=wall');await page.getByRole('heading',{name:'校园里的事，一起聊'}).waitFor();await page.waitForTimeout(500)
  await page.locator('.sidebar').evaluate(el=>el.dataset.persistenceCheck='stable')
  await capture('wall-desktop')
  await page.getByRole('link',{name:/示例 · 示波器/}).click();await page.getByRole('heading',{name:/示例 · 示波器/}).waitFor()
  await page.getByRole('textbox',{name:'回复这个主题'}).fill('用于验收的回复，不是真实学生发布')
  await page.getByRole('button',{name:'提交回复审核',exact:true}).click();await page.getByText('回复已提交审核，暂时仅自己可见').waitFor()
  await capture('wall-detail-desktop')
  await page.getByRole('button',{name:'发布主题',exact:true}).click();await page.getByRole('textbox',{name:'标题',exact:true}).fill('验收主题：不写入服务器')
  await page.getByRole('textbox',{name:'具体内容',exact:true}).fill('这是只存在当前浏览器内存的测试内容')
  await page.getByRole('button',{name:'提交审核',exact:true}).click();await page.getByRole('heading',{name:'验收主题：不写入服务器'}).waitFor()
  assert.ok(await page.getByText('审核中 · 仅自己可见',{exact:true}).count())
  await page.locator('.sidebar').getByRole('button',{name:'仪器资料',exact:true}).click();await page.getByRole('heading',{name:'先认识设备，再开始实验'}).waitFor();await page.waitForTimeout(350)
  assert.equal(await page.locator('.sidebar').getAttribute('data-persistence-check'),'stable')
  await capture('instruments-desktop')
  await page.getByRole('button',{name:'展开工作区'}).click();assert.equal(await page.locator('.sidebar').isVisible(),false);await capture('instruments-expanded');await page.getByRole('button',{name:'还原侧栏'}).click()
  await page.getByRole('textbox',{name:'实际设备型号'}).fill('MODEL-TEST');await page.getByRole('textbox',{name:'当前现象'}).fill('验收用的现象说明')
  await page.getByRole('button',{name:/数字万用表/}).click();await page.getByRole('button',{name:/数字示波器/}).click();assert.equal(await page.getByRole('textbox',{name:'实际设备型号'}).inputValue(),'MODEL-TEST')
  await page.getByRole('checkbox').check();await page.getByRole('button',{name:'保存为私有项目'}).click();await page.getByRole('button',{name:'仪器与调试',exact:true}).last().waitFor()
  await page.locator('.sidebar').getByRole('button',{name:'实验与作业',exact:true}).click();await page.getByRole('heading',{name:'从卡住的这一步开始'}).waitFor();await page.waitForTimeout(350);assert.equal(await page.locator('.workspace-content').evaluate(el=>el.scrollTop),0);await capture('study-desktop')
  await page.getByRole('textbox',{name:'哪门课'}).fill('大学物理');await page.getByRole('textbox',{name:'题目或实验要求'}).fill('观察并记录周期');await page.getByRole('textbox',{name:'具体卡在哪里'}).fill('不知道单位怎么统一');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'帮我理清下一步'}).click();await page.getByRole('heading',{name:'模拟辅导结果'}).waitFor();await page.getByRole('button',{name:'整理成一个私有项目'}).click();await page.locator('input').filter({visible:true}).first().waitFor();await page.waitForTimeout(350);assert.equal(await page.locator('.workspace-toolbar').innerText().then(t=>t.includes('我的项目')),true)
  await page.locator('.sidebar').getByRole('button',{name:'校园墙',exact:true}).click();await page.getByRole('heading',{name:'校园里的事，一起聊'}).waitFor()
  for(const [label,title] of [['食堂评分',''],['我的项目',''],['收到的审阅',''],['提交意见',''],['Campthink Pro','']]){
    void title;await page.locator('.sidebar').getByRole('button',{name:new RegExp(label)}).click();await page.waitForTimeout(label==='Campthink Pro'?2000:400);await capture(`route-${label}`)
    if(label==='Campthink Pro'){await page.getByRole('button',{name:'关闭 Pro 介绍'}).click();await page.locator('.pro-suite').waitFor({state:'detached'})}
  }
  await page.setViewportSize({width:390,height:844});await page.goto('http://localhost:5173/design-review.html?page=wall');await page.getByRole('heading',{name:'校园里的事，一起聊'}).waitFor();await page.waitForTimeout(350);await capture('wall-mobile')
  await page.locator('.workspace-toolbar').getByRole('button',{name:'打开菜单'}).click();await page.waitForTimeout(650);await capture('navigation-mobile');await page.locator('.sidebar').getByRole('button',{name:'仪器资料',exact:true}).click();await page.getByRole('heading',{name:'先认识设备，再开始实验'}).waitFor();await page.waitForTimeout(350);await capture('instruments-mobile')
  await page.locator('.workspace-toolbar').getByRole('button',{name:'打开菜单'}).click();await page.locator('.sidebar').getByRole('button',{name:'实验与作业',exact:true}).click();await page.getByRole('heading',{name:'从卡住的这一步开始'}).waitFor();await page.waitForTimeout(350);await capture('study-mobile')
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.workspace-reveal').evaluate(el=>getComputedStyle(el).animationName),'none')
  await page.locator('.workspace-toolbar').getByRole('button',{name:'打开菜单'}).click();await page.locator('.sidebar').getByRole('button',{name:'我的项目',exact:true}).click();await page.waitForTimeout(350);await capture('projects-mobile')
  await page.goto('http://localhost:5173/design-review.html?page=workspace-admin');await page.getByRole('combobox',{name:'选择后台模块'}).selectOption('wall');await page.waitForTimeout(500);await capture('admin-mobile')
  await page.setViewportSize({width:1440,height:1000});await capture('admin-desktop')
  await page.getByRole('button',{name:'通过审核',exact:true}).click();await page.getByText('当前没有待审核内容',{exact:true}).waitFor()
  await page.goto('http://localhost:5173/design-review.html?page=instruments&failSave=1');await page.getByRole('textbox',{name:'实际设备型号'}).fill('保留型号 TEST');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'保存为私有项目',exact:true}).click();await page.getByRole('alert').filter({hasText:'模拟保存失败'}).waitFor();assert.equal(await page.getByRole('textbox',{name:'实际设备型号'}).inputValue(),'保留型号 TEST');await page.getByRole('alert').scrollIntoViewIfNeeded();await capture('instrument-save-error-desktop')
  assert.deepEqual(errors,[])
}finally{await writeFile(path.join(output,'results.json'),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({output,results,errors}));await browser.close()}
