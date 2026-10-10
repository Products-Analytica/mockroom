// Private data that never leaves this browser: the resume, the last JD, and full interview
// reports (scores, questions, answers, feedback) keyed by interview id. Nothing here is sent
// to the database.
const K = { draft: 'mr:draft', reports: 'mr:reports' };
const KEEP = 30;

function read(key, fallback){
  try{ const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }catch{ return fallback; }
}
function write(key, value){ localStorage.setItem(key, JSON.stringify(value)); }

export const getDraft = () => read(K.draft, { resume: '', jd: '' });
export function saveDraft(resume, jd){ try{ write(K.draft, { resume, jd }); }catch(e){ console.warn('Resume not saved locally', e); } }

// Newest first.
export const listReports = () => read(K.reports, []);
export const getReport = id => listReports().find(r => r.id === id) || null;
export function saveReport(report){
  const list = listReports();
  const next = list.some(r => r.id === report.id) ? list.map(r => r.id === report.id ? report : r) : [report, ...list];
  try{ write(K.reports, next.slice(0, KEEP)); }
  catch(e){ console.warn('Full report not saved locally', e); }
}
export function deleteReport(id){ try{ write(K.reports, listReports().filter(r => r.id !== id)); }catch{} }


// GD Topic Bank: bookmarked topic ids and the last "Topics for your JD" result.
const GD = { bookmarks: 'mr:gd-bookmarks', result: 'mr:gd-result' };
export const getBookmarks = () => read(GD.bookmarks, []);
export function saveBookmarks(ids){ try{ write(GD.bookmarks, ids); }catch{} }
export const getGdResult = () => read(GD.result, null);
export function saveGdResult(result){ try{ write(GD.result, result); }catch{} }
