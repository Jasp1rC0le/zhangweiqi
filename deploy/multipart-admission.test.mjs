import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
const root = new URL('../', import.meta.url)
test('multipart parsing is lazy so existing JWT/admission interceptors run before body spooling', async () => {
  const yaml = await readFile(new URL('campus-ai-server/src/main/resources/application.yml', root), 'utf8')
  assert.match(yaml, /multipart:\s*\n\s*resolve-lazily: true/)
  assert.match(yaml, /max-file-size: 10MB/)
  assert.match(yaml, /max-request-size: 40MB/)
  const web = await readFile(new URL('campus-ai-server/src/main/java/com/campusai/config/WebConfig.java', root), 'utf8')
  assert.ok(web.indexOf('addInterceptor(jwtInterceptor)') < web.indexOf('addInterceptor(teachingGate)'))
  assert.match(web, /"\/api\/private-materials","\/api\/private-materials\/\*\*"/)
})
