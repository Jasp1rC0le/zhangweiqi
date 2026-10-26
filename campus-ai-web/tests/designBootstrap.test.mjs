import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createApp} from 'vue'
import {createPinia,defineStore,setActivePinia} from 'pinia'
import {createTeachingFlowFixture} from '../design/teachingFlowFixture.js'
import {chinaDate,addDays} from '../src/utils/timetable.js'

test('DEV fixture bootstrap passes the installed Pinia explicitly instead of borrowing global or hot-reload state',{timeout:3000},()=>{
  const source=readFileSync(new URL('../design/review.js',import.meta.url),'utf8')
  assert.match(source,/app\.use\(pinia\)[\s\S]*const fixtureAuth = useAuthStore\(pinia\)/)
  assert.match(source,/const admin = useAdminAuthStore\(pinia\)/)
  assert.doesNotMatch(source,/use(?:Auth|AdminAuth)Store\(\)/)
  const store=defineStore('synthetic-fixture-isolation',{state:()=>({principal:'initial'})})
  const a=createPinia(),b=createPinia();createApp({render:()=>null}).use(a);createApp({render:()=>null}).use(b)
  setActivePinia(undefined);store(a).principal='synthetic-a';assert.equal(store(b).principal,'initial');assert.equal(store(a).principal,'synthetic-a')
  store(a).$dispose();store(b).$dispose();setActivePinia(undefined)
})
test('bookmarked teaching view uses current actor-scoped paging rather than a null legacy response',{timeout:6000},async()=>{
  const source=readFileSync(new URL('../design/review.js',import.meta.url),'utf8');assert.match(source,/const teachingFlowRequested=.*requested==='teaching'/);assert.match(source,/const teachingFlow = teachingFlowRequested/)
  assert.match(source,/select\.value=String\(teachingFlow\.principal\(\)\.id\)/)
  const f=createTeachingFlowFixture();f.setActor(4);const access=(await f.adapter({url:'/api/teaching/access',method:'get'})).data;assert.deepEqual(access.views,['TEACHER'])
  const from=chinaDate(),page=(await f.adapter({url:'/api/teaching/lessons/page',method:'get',params:{view:'TEACHER',from,to:addDays(from,6),page:0,size:50,search:''}})).data
  assert.ok(page.total>0);assert.ok(Array.isArray(page.items));assert.equal(page.page,0);assert.equal(page.size,50);assert.equal(page.total,page.items.length)
})
