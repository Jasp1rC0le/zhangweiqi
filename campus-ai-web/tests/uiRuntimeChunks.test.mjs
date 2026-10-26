import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {uiRuntimeGroup} from '../build/uiRuntimeChunks.js'

test('UI runtime chunk owns component helpers and framework modules on both path styles', () => {
  for (const id of ['/x/node_modules/element-plus/es/_virtual/_plugin-vue_export-helper.mjs', '/x/node_modules/@vue/runtime-core/dist/runtime-core.esm-bundler.js', 'C:\\x\\node_modules\\pinia\\dist\\pinia.mjs', '/x/node_modules/vue-router/dist/vue-router.mjs']) assert.equal(uiRuntimeGroup.test.test(id), true, id)
  assert.equal(uiRuntimeGroup.includeDependenciesRecursively, true)
})
test('application entry and heavy file engines are not forced into the UI runtime', () => {
  for (const id of ['/x/src/main.js', '/x/src/views/ChatView.vue', '/x/node_modules/pdfjs-dist/build/pdf.mjs', '/x/node_modules/tesseract.js/src/index.js']) assert.equal(uiRuntimeGroup.test.test(id), false, id)
})
test('production build uses the runtime group without disabling lazy route splitting', () => {
  const config = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')
  assert.match(config, /codeSplitting:\s*\{ groups: \[uiRuntimeGroup\] \}/)
  assert.doesNotMatch(config, /inlineDynamicImports|codeSplitting:\s*false/)
})
