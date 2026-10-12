import http from './http'
export const readCourseSchedule = (signal) => http.get('/api/timetable/courses', { signal })
export const saveCourseSchedule = (payload) => http.put('/api/timetable/courses', payload)
export const confirmCourseSchedule = (revision) =>
  http.post('/api/timetable/courses/checked', null, { params: { revision } })
export const deleteCourseSchedule = (revision) =>
  http.delete('/api/timetable/courses', { params: { revision } })
