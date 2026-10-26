import http from './http'
export const readUnifiedTimetable = (monday, view, classId, signal) =>
  http.get('/api/timetable/unified', { params: { monday, view: view || undefined, classId: classId || undefined }, signal })
export const readUnifiedDay = (date, signal) => http.get('/api/timetable/unified/day', { params: { date }, signal })
export const queryOwnTimetable = (query, signal) => http.get('/api/timetable/unified/query', { params: query, signal })
export const askOwnTimetable = (request, signal) => http.post('/api/timetable/unified/ask', request, { signal, timeout: 120000 })
export const readUnifiedTimetablePage = (monday, view, classId, signal, page = 0) =>
  http.get('/api/timetable/unified/page', { params: { monday, view: view || undefined, classId: classId || undefined, page, size: 50 }, signal })
export const readUnifiedScopesPage = (view, page, search, signal) =>
  http.get('/api/timetable/unified/scopes/page', { params: { view: view || undefined, page, size: 50, search: search || undefined }, signal })
