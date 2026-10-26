import { writeFile } from 'node:fs/promises'
const text='无关合成填充材料，仅用于测试长文件读取。\n'.repeat(2600)+'\n图书续借窗口：合成示例A101；续借上限15天。不是学校真实规定。\n'+'另一段无关测试文字。\n'.repeat(2400)
await writeFile(new URL('../.local/runtime/media-private-tools-2026-10-19/synthetic-long.txt',import.meta.url),text,{flag:'wx'})
console.log(JSON.stringify({characters:text.length,bytes:Buffer.byteLength(text)}))
