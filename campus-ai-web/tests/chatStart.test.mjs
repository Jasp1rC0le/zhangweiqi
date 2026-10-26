import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parse,compileScript,compileTemplate,compileStyle} from '@vue/compiler-sfc'

test('expressive chat start compiles as navigation and existing draft actions, never auto-send',()=>{
  const filename='src/components/ChatStart.vue'
  const source=readFileSync(new URL('../'+filename,import.meta.url),'utf8')
  const {descriptor,errors}=parse(source)
  assert.deepEqual(errors,[])
  compileScript(descriptor,{id:filename})
  assert.deepEqual(compileTemplate({source:descriptor.template.content,filename,id:filename}).errors,[])
  assert.match(source,/route: '\/timetable'/)
  assert.match(source,/emit\('activate', item\)/)
  assert.match(source,/:disabled="disabled"/)
  assert.match(source,/prefers-reduced-motion/)
  assert.doesNotMatch(source,/fetch\(|axios|sendMessage|onMounted|localStorage|Math.random|gradient|backdrop-filter/)
  const css=compileStyle({source:descriptor.styles[0].content,filename,id:'data-v-check',scoped:true})
  assert.deepEqual(css.errors,[])
  const broad=[]
  css.rawResult.root.walkRules(rule=>{
    if(rule.selectors?.some(selector=>selector.trim()==='html:root body .workspace.chat-focused'))broad.push(rule.selector)
  })
  assert.deepEqual(broad,[],'global scoping must not drop the title selector and restyle the whole workspace')
  assert.match(css.code,/\.welcome--expressive \.chat-start-title/)
})
test('the new composition is limited to the standard empty chat and retains existing action handling',()=>{
  const source=readFileSync(new URL('../src/views/ChatView.vue',import.meta.url),'utf8')
  assert.match(source,/<ChatStart v-if="selectedModelKey === 'standard'"/)
  assert.match(source,/@activate="activateQuickAction"/)
  assert.match(source,/v-else-if="messages.length === 0"/)
  const activate=source.slice(source.indexOf('function activateQuickAction('),source.indexOf('function questionForAnswer('))
  assert.match(activate,/workspaceDrafts.save/)
  assert.match(activate,/router.push\(item.route\)/)
  assert.match(activate,/chooseSuggestion\(item.prompt\)/)
  assert.doesNotMatch(activate,/sendMessageStream|submitPrompt/)
})
