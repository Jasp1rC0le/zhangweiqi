// Allow incomplete form values, but never arbitrary objects, credentials or server permissions.
const text = (value, max) => {
  if (typeof value !== 'string' || value.length > max || value.includes('\0')) throw new Error('text')
  return value
}
const bool = value => { if (typeof value !== 'boolean') throw new Error('boolean'); return value }
const integer = (value, min, max) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error('integer')
  return value
}
const decimal = value => {
  if (value !== '' && (typeof value !== 'number' || !Number.isFinite(value))) throw new Error('number')
  return value
}
const uuid = value => {
  if (typeof value !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value)) throw new Error('id')
  return value
}
const choice = (value, values) => { if (!values.includes(value)) throw new Error('choice'); return value }
const list = (value, max, clean) => {
  if (!Array.isArray(value) || value.length > max) throw new Error('list')
  return value.map(clean)
}
const active = value => { if (value !== null) throw new Error('active'); return null }
export function cleanProjectDraft(value) {
  const sheet = value.dataSheet
  const calculation = sheet?.calculation
  const content = {
    title:text(value.title,100), track:choice(value.track,['business','engineering','general']),
    deadline:text(value.deadline ?? '',10), brief:text(value.brief,20000), manuscript:text(value.manuscript,50000),
    requirements:list(value.requirements,80,r => ({id:text(r.id,80), title:text(r.title,300),
      sourceLine:integer(r.sourceLine,0,20001), sourceQuote:text(r.sourceQuote,1000),
      confirmed:bool(r.confirmed), done:bool(r.done), evidence:text(r.evidence,2000), note:text(r.note,1000)})),
    dataSheet:sheet ? {csv:text(sheet.csv,50000), source:text(sheet.source,300), unit:text(sheet.unit,40),
      measuredColumn:integer(sheet.measuredColumn,-1,29), referenceColumn:integer(sheet.referenceColumn,-1,29),
      sameUnitConfirmed:bool(sheet.sameUnitConfirmed), tolerancePercent:decimal(sheet.tolerancePercent),
      ...(calculation ? {calculation:{expression:text(calculation.expression,200),
        xColumn:integer(calculation.xColumn,-1,29), yColumn:integer(calculation.yColumn,-1,29), resultColumn:integer(calculation.resultColumn,-1,29),
        xUnit:text(calculation.xUnit,40), yUnit:text(calculation.yUnit,40), outputUnit:text(calculation.outputUnit,40),
        confirmed:bool(calculation.confirmed), tolerance:decimal(calculation.tolerance)}} : {}),
    } : null,
    reviewFeedback:list(value.reviewFeedback ?? [],100,r => ({issueKey:text(r.issueKey,80),title:text(r.title,300),
      fingerprint:text(r.fingerprint,64),reason:text(r.reason,500)})),
  }
  if (JSON.stringify(content).length > 600000) throw new Error('size')
  return content
}
export const projectDraftSchema = {
  maxRecordChars:610000, active,
  entries: values => list(values,1,v => ({id:uuid(v.id), projectId:v.projectId === null ? null : uuid(v.projectId),
    baseRevision:v.projectId === null ? null : integer(v.baseRevision,1,Number.MAX_SAFE_INTEGER),
    archived:bool(v.archived), content:cleanProjectDraft(v.content)})),
}
export const wallDraftSchema = {
  maxRecordChars:45000, active,
  entries: values => list(values,1,v => ({
    post:v.post === null ? null : {id:uuid(v.post.id),category:choice(v.post.category,['course','experiment','campus','team']),
      title:text(v.post.title,100),body:text(v.post.body,5000)},
    reply:v.reply === null ? null : {id:uuid(v.reply.id),postId:uuid(v.reply.postId),body:text(v.reply.body,2000)},
  })),
}
export const feedbackDraftSchema = {
  maxRecordChars:32000, active,
  entries:values => list(values,1,v => ({id:uuid(v.id),subject:text(v.subject,120),message:text(v.message,5000)})),
}
export const reviewDraftSchema = {
  maxRecordChars:26000, active,
  entries:values => list(values,1,v => ({id:uuid(v.id),revision:integer(v.revision,1,Number.MAX_SAFE_INTEGER),
    note:text(v.note,2000),baseNote:text(v.baseNote,2000)})),
}
export function reviewRecoveryConflict(entry, detail) {
  return !detail?.canReview || detail.entry?.id !== entry.id || detail.entry?.revision !== entry.revision
    || (detail.entry?.reviewNote || '') !== entry.baseNote
}

// Recovery never silently upgrades a cached revision to the server's newer version.
export function projectRecoveryConflict(entry, serverProject) {
  return entry.projectId !== null && (serverProject?.id !== entry.projectId || serverProject?.revision !== entry.baseRevision)
}
