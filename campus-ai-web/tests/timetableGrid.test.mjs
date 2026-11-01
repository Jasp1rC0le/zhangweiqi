import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc'
import { timetableGrid, courseTone } from '../src/utils/timetableGrid.js'
const event=(id,day,first,last,extra={})=>({id,name:'合成课'+id,weekday:day,date:'2026-11-02',startPeriod:first,endPeriod:last,room:'合成教室',...extra})
test('weekly geometry preserves exact periods and every event without mutating the source',()=>{
 const rows=[event('a',1,1,4),event('b',3,5,6),event('c',5,9,10)],before=JSON.stringify(rows),model=timetableGrid(rows,[{period:1,start:'08:30',end:'09:15'}])
 assert.equal(model.rows.length,10);assert.equal(model.rows[0].start,'08:30');assert.deepEqual(model.groups.map(g=>[g.weekday,g.start,g.end]),[[1,1,4],[3,5,6],[5,9,10]]);assert.equal(JSON.stringify(rows),before)
})
test('overlapping classes are a visible group instead of covering or dropping each other',()=>{
 const model=timetableGrid([event('a',1,1,4),event('b',1,3,4),event('c',1,5,6)])
 assert.equal(model.groups.length,2);assert.equal(model.groups[0].entries.length,2);assert.deepEqual(model.groups.flatMap(g=>g.entries.map(e=>e.id)),['a','b','c'])
})
test('cancelled, unmapped later periods and clock-only lessons all remain inspectable',()=>{
 const all=[event('a',1,1,2,{cancelled:true}),event('b',2,15,16),event('c',4,null,null,{startTime:'10:10',endTime:'10:15'})],model=timetableGrid(all)
 assert.equal(model.rows.length,16);assert.equal(model.rows[14].start,undefined);assert.equal(model.groups[0].entries[0].cancelled,true);assert.equal(model.extras[0].id,'c');assert.equal(model.groups.flatMap(g=>g.entries).length+model.extras.length,all.length)
})
test('adjacent lessons are separate and color identity does not depend on array order',()=>{
 const a=event('a',1,1,2),b=event('b',1,3,4);assert.equal(timetableGrid([b,a]).groups.length,2);assert.equal(courseTone(a.name),timetableGrid([a]).groups[0].tone)
})
test('empty and wholly clock-based weeks do not create a misleading period grid',()=>{assert.deepEqual(timetableGrid().groups,[]);assert.equal(timetableGrid([event('a',1,null,null)]).rows.length,0)})
test('new timetable, teacher linking and account reminder components compile in all their template branches',()=>{
 for(const file of ['VisualTimetable.vue','CourseTeacherLink.vue','ClassReminderPanel.vue']){
  const source=readFileSync(new URL('../src/components/'+file,import.meta.url),'utf8'),{descriptor,errors}=parse(source);assert.deepEqual(errors,[]);compileScript(descriptor,{id:file});assert.deepEqual(compileTemplate({source:descriptor.template.content,filename:file,id:file}).errors,[])
  for(const style of descriptor.styles)assert.deepEqual(compileStyle({source:style.content,filename:file,id:file,scoped:true}).errors,[])
 }
})
