import { parseRosterFile } from './rosterImport.js'
self.onmessage = ({ data }) => {
  try { self.postMessage({ result: parseRosterFile(new Uint8Array(data.buffer), data.extension) }) }
  catch (failure) { self.postMessage({ error: failure.message || '名单读取失败，没有保存任何人员' }) }
}
