import http from './http'
export const readCalendarLink = signal => http.get('/api/timetable/calendar-link', { signal })
export const enableCalendarLink = (minutes, signal) => http.post('/api/timetable/calendar-link', { minutes }, { signal })
export const revokeCalendarLink = signal => http.delete('/api/timetable/calendar-link', { signal })
