import http from './http'
export const readCourseImageCapability = (signal) => http.get('/api/timetable/courses/image-capabilities', { signal })
export const recognizeCourseImage = (file, signal) => http.post('/api/timetable/courses/recognize-image', file, { signal, timeout: 170000, params: { consent: true }, headers: { 'Content-Type': file.type } })
export const readCourseSchedule = (signal) => http.get('/api/timetable/courses', { signal })
export const saveCourseSchedule = (payload,signal) => http.put('/api/timetable/courses', payload,{signal})
export const confirmCourseSchedule = (revision) =>
  http.post('/api/timetable/courses/checked', null, { params: { revision } })
export const deleteCourseSchedule = (revision) =>
  http.delete('/api/timetable/courses', { params: { revision } })
