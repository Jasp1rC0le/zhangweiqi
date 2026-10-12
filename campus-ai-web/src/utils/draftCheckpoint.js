// In-memory only: no personal fields or passwords in browser storage.
export function createDraftCheckpoint(read) {
  let saved = JSON.stringify(read())
  return {
    isDirty: () => JSON.stringify(read()) !== saved,
    accept: () => { saved = JSON.stringify(read()) },
  }
}
