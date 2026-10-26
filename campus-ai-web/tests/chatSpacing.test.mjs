import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import postcss from 'postcss'
const options={timeout:3000}
test('chat message spacing has a real column layout and a distinct conversation-turn gap',options,()=>{
  const root=postcss.parse(fs.readFileSync(new URL('../src/styles/chat-assistant.css',import.meta.url),'utf8'))
  const selector='html:root body .workspace.chat-focused .message-list'
  const list=root.nodes.find(n=>n.type==='rule' && n.selector===selector)
  const values=Object.fromEntries(list.nodes.filter(n=>n.type==='decl').map(n=>[n.prop,n.value]))
  assert.equal(values.display,'flex');assert.equal(values['flex-direction'],'column');assert.equal(values.gap,'var(--assistant-message-gap)')
  assert.equal(values['--assistant-message-gap'],'32px');assert.equal(values['--assistant-turn-gap'],'16px')
  let mobile
  root.walkAtRules('media',media=>{if(media.params.includes('760px'))media.walkRules(selector,rule=>{mobile=Object.fromEntries(rule.nodes.filter(n=>n.type==='decl').map(n=>[n.prop,n.value]))})})
  assert.equal(mobile['--assistant-message-gap'],'28px');assert.equal(mobile['--assistant-turn-gap'],'12px')
  const turn=root.nodes.find(n=>n.type==='rule' && n.selector.endsWith('.message-row.assistant + .message-row.user'))
  assert.equal(turn.nodes.find(n=>n.prop==='margin-top').value,'var(--assistant-turn-gap)')
})
