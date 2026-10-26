const supportedOriginal=/\.(?:pdf|docx|xlsx|txt|md|csv|jpg|jpeg|png|webp|mp4|mov|webm)$/i

// Retention does not certify decodability, recognition or factual correctness.
export function privateOriginalIssue(file) {
  if(!file||!Number.isFinite(file.size)||file.size<=0||file.size>10*1024*1024)
    return '私有原件须为10MiB以内的非空文件。'
  if(typeof file.name!=='string'||!supportedOriginal.test(file.name))
    return '这个格式暂不支持保留原件，请换成页面列出的文件类型。'
  const name=[...file.name.replace(/\\/g,'/').split('/').at(-1)]
    .filter(character=>character.charCodeAt(0)>31&&character.charCodeAt(0)!==127).join('')
  if(!name.trim()||name.length>180)return '原件文件名须为1至180字。'
  return null
}

export function canRetryAttachment({file,failed,busy,storeBusy,disabled,requestId,receipt}) {
  return !!file&&!!failed&&!privateOriginalIssue(file)&&!busy&&!storeBusy&&!disabled&&
    (!requestId||!!receipt)
}
