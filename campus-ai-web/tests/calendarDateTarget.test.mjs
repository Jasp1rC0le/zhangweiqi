import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'
import { calendarDateTarget, CALENDAR_DATE_MIN, CALENDAR_DATE_MAX } from '../src/utils/calendarDateTarget.js'
test('explicit date resolves its own Monday without altering the chosen day',()=>{
  assert.deepEqual(calendarDateTarget('2026-10-13'),{date:'2026-10-13',monday:'2026-10-12'})
  assert.deepEqual(calendarDateTarget('2026-09-08'),{date:'2026-09-08',monday:'2026-09-07'})
})
test('all weekdays including Sunday retain exact selected dates and one common week',()=>{
  for(let day=19;day<=25;day++)assert.deepEqual(calendarDateTarget(`2026-10-${day}`),{date:`2026-10-${day}`,monday:'2026-10-19'})
})
test('supported boundary dates only expose complete existing calendar/export weeks',()=>{
  assert.deepEqual(calendarDateTarget(CALENDAR_DATE_MIN),{date:'2000-01-03',monday:'2000-01-03'})
  assert.deepEqual(calendarDateTarget(CALENDAR_DATE_MAX),{date:'2100-12-26',monday:'2100-12-20'})
  for(const value of['2000-01-01','2000-01-02','2100-12-27','2100-12-31','1999-12-31','2101-01-01'])assert.throws(()=>calendarDateTarget(value),/没有切换课表/)
})
test('valid leap dates work and malformed partial or impossible dates never normalize silently',()=>{
  assert.deepEqual(calendarDateTarget('2028-02-29'),{date:'2028-02-29',monday:'2028-02-28'})
  for(const value of[null,undefined,'','2026-10','10.13','2026-2-01','2026-02-29','2026-02-30','2026-13-01',['2026-10-13'],{},'2026-10-13\n'])assert.throws(()=>calendarDateTarget(value),/完整有效日期/)
})
test('date helper returns a frozen minimal date intention with no role class or owner authority',()=>{
  const target=calendarDateTarget('2026-10-13');assert.ok(Object.isFrozen(target));assert.deepEqual(Object.keys(target),['date','monday']);assert.equal(target.classId,undefined);assert.equal(target.view,undefined)
})
test('calendar date form compiles with a labelled date picker and explicit submit and error status',()=>{
  const filename='src/components/UnifiedWeekCalendar.vue',source=readFileSync(new URL('../'+filename,import.meta.url),'utf8'),{descriptor,errors}=parse(source);assert.deepEqual(errors,[]);compileScript(descriptor,{id:filename});assert.deepEqual(compileTemplate({source:descriptor.template.content,filename,id:filename}).errors,[]);assert.deepEqual(compileStyle({source:descriptor.styles[0].content,filename,id:filename,scoped:true}).errors,[])
  assert.match(source,/<DateField v-model="dateDraft"/);assert.match(source,/@submit.prevent="jumpDate"/);assert.match(source,/:aria-describedby="dateHintId"/);assert.match(source,/:role="dateError \? 'alert' : 'status'"/)
  const picker=readFileSync(new URL('../src/components/DateField.vue',import.meta.url),'utf8')
  assert.match(picker,/type="text" :value="draft" :required="required" :disabled="disabled"/)
  assert.match(picker,/font-size:16px/);assert.match(picker,/setCustomValidity/)
})
test('jump changes only intended day/week and resets page, preserving view and class through protected load',()=>{
  const source=readFileSync(new URL('../src/components/UnifiedWeekCalendar.vue',import.meta.url),'utf8'),handler=source.slice(source.indexOf('async function jumpDate'),source.indexOf("const days ="))
  assert.match(handler,/calendarDateTarget\(dateDraft.value\)/);assert.match(handler,/coursePage.value = 0/);assert.match(handler,/monday.value = target.monday/);assert.match(handler,/selectedDay.value = target.date/);assert.match(handler,/await load\(\)/);assert.doesNotMatch(handler,/classId.value\s*=|view.value\s*=|chinaDate\(|router|askOwnTimetable/)
})
test('draft input and applied scope remain separate and paged statistics never become claimed single-day totals',()=>{
  const source=readFileSync(new URL('../src/components/UnifiedWeekCalendar.vue',import.meta.url),'utf8')
  assert.match(source,/dateDraft.value !== selectedDay.value/);assert.match(source,/日期尚未应用/);assert.match(source,/明细按整周分页/);assert.match(source,/统计仍覆盖整周/);assert.match(source,/watch\(selectedDay/)
  const form=source.slice(source.indexOf('<form class="calendar-date-jump"'),source.indexOf('<form v-if="classFinderVisible"'));assert.doesNotMatch(form,/@change="jumpDate"|v-model="selectedDay"|@input="jumpDate"/)
})
