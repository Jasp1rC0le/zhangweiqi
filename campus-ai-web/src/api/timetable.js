import http from './http'
export const readTimetable = (signal) => http.get('/api/timetable', { signal })
export const readTimetableImage = (revision, signal) =>
  http.get('/api/timetable/image', { params: { revision }, responseType: 'blob', signal })
export function saveTimetable(metadata, image) {
  const body = new FormData()
  body.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' }),
    'metadata.json',
  )
  body.append('image', image, 'timetable.jpg')
  return http.put('/api/timetable', body)
}
export const confirmTimetable = (revision) =>
  http.post('/api/timetable/checked', null, { params: { revision } })
export const deleteTimetable = (revision) => http.delete('/api/timetable', { params: { revision } })
