// State machine shared by the UI and race tests. No storage and no school credentials.
import { mondayOf } from './timetable.js'
import { readTimetableImageBounds } from './timetableImageHeader.js'

export function validatedTimetableSnapshot(snapshot) {
  if (snapshot === null) return null
  if (
    !snapshot ||
    !Number.isInteger(snapshot.revision) ||
    snapshot.revision < 1 ||
    snapshot.revision > 1000000 ||
    typeof snapshot.semester !== 'string' ||
    !snapshot.semester.trim() ||
    snapshot.semester.length > 100 ||
    // oxlint-disable-next-line no-control-regex -- Reject control characters in private schedule metadata.
    /[\u0000-\u001f\u007f]/.test(snapshot.semester) ||
    typeof snapshot.firstMonday !== 'string' ||
    snapshot.firstMonday < '2000-01-01' ||
    snapshot.firstMonday > '2100-12-31' ||
    !Number.isInteger(snapshot.startWeek) ||
    !Number.isInteger(snapshot.endWeek) ||
    snapshot.startWeek < 1 ||
    snapshot.endWeek < snapshot.startWeek ||
    snapshot.endWeek > 30 ||
    !Number.isInteger(snapshot.remindDays) ||
    snapshot.remindDays < 0 ||
    snapshot.remindDays > 30 ||
    typeof snapshot.importedAt !== 'string' ||
    typeof snapshot.checkedAt !== 'string' ||
    !Number.isFinite(Date.parse(snapshot.importedAt)) ||
    !Number.isFinite(Date.parse(snapshot.checkedAt)) ||
    !/^[a-f0-9]{64}$/.test(snapshot.imageSha256 || '')
  )
    throw new Error('课表截图响应不完整，请重新读取核对')
  if (mondayOf(snapshot.firstMonday) !== snapshot.firstMonday)
    throw new Error('课表学期日期异常，请重新读取核对')
  return snapshot
}

async function validatedImage(blob) {
  if (
    !(blob instanceof Blob) ||
    !['image/png', 'image/jpeg'].includes(blob.type) ||
    !blob.size ||
    blob.size > 2 * 1024 * 1024
  )
    throw new Error('课表图片响应异常，请重新读取核对')
  readTimetableImageBounds(await blob.arrayBuffer(), blob.type)
  return blob
}

export function createPrivateTimetable({ owner, state, read, readImage, createUrl, revokeUrl }) {
  let generation = 0,
    controller,
    pending
  function clearImage() {
    if (state.imageUrl) revokeUrl(state.imageUrl)
    state.imageUrl = ''
  }
  function reset() {
    generation++
    controller?.abort()
    pending = null
    clearImage()
    state.timetable = null
    state.loading = false
    state.loaded = false
    state.error = ''
  }
  function adopt(snapshot, expectedOwner) {
    if (!expectedOwner || expectedOwner !== owner()) return false
    const checked = validatedTimetableSnapshot(snapshot)
    generation++
    controller?.abort()
    pending = null
    if (!checked || state.timetable?.imageSha256 !== checked.imageSha256) clearImage()
    state.timetable = checked
    state.loaded = true
    state.loading = false
    state.error = ''
    return true
  }
  async function load(force = false) {
    if (!owner()) return
    if (!force && pending) return pending
    if (!force && state.loaded) return
    controller?.abort()
    controller = new AbortController()
    const signal = controller.signal,
      started = ++generation,
      principal = owner()
    const current = () => generation === started && owner() === principal && !signal.aborted
    state.loading = true
    state.error = ''
    const task = (async () => {
      try {
        const response = await read(signal)
        if (!current()) return
        const snapshot = validatedTimetableSnapshot(response?.data?.timetable)
        const blob = snapshot
          ? await validatedImage((await readImage(snapshot.revision, signal))?.data)
          : null
        if (!current()) return
        const nextUrl = blob ? createUrl(blob) : ''
        clearImage()
        state.imageUrl = nextUrl
        state.timetable = snapshot
        state.loaded = true
      } catch (failure) {
        if (!current()) return
        state.error =
          failure.response?.status === 404
            ? '课表已在其他页面更换，请重新读取'
            : '暂时无法读取课表，请重试；已有课表不会因此删除'
      } finally {
        if (generation === started) {
          state.loading = false
          pending = null
        }
      }
    })()
    pending = task
    return task
  }
  return { reset, load, adopt }
}
